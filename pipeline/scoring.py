"""SOURCE OF TRUTH for normalize + score + explain (CLAUDE.md §5).

web/src/lib/scoring.js is an exact port of score_site / rank_sites and must give
identical output for pipeline/tests/fixture.json. Parity rules:
  * Criteria are always processed in the order of the `features` list.
  * Rounding is explicit half-up (floor(x + 0.5)), never Python's round()
    (banker's rounding) — JS Math.round would disagree on x.5.
  * Names are compared by code point (plain `<`), never locale-aware.
normalize() and novelty helpers are Python-only (the browser never normalizes).
"""
import math

WHY_MIN_SIM = 0.7
WHY_MAX_ITEMS = 3
MUCH_DIFF = 0.5  # |site - target| at or above this reads as "Much ..."

# Direction words for the `gap` sentence: (site higher than target, site lower).
GAP_WORDS = {
    "terrain": ("rougher", "smoother"),
    "aridity": ("drier", "wetter"),
    "temp": ("warmer", "colder"),
    "temp_range": ("larger temperature swing", "smaller temperature swing"),
    "veg": ("barer", "more vegetated"),
}
DEFAULT_GAP_WORDS = ("higher", "lower")

NO_DATA_GAP = "No usable data for the weighted criteria"
NO_GAP = "No gaps on the weighted criteria"


def is_missing(v):
    return v is None or v == ""


def round_half_up(x):
    return math.floor(x + 0.5)


def round_to(x, digits):
    f = 10 ** digits
    return math.floor(x * f + 0.5) / f


def _cap(text):
    return text[:1].upper() + text[1:]


# ---------------------------------------------------------------- normalize (Python only)

def normalize(raw, feature):
    """Map a raw Earth value to [0, 1] using the FIXED bounds of `feature` (§5.1)."""
    if is_missing(raw) or (isinstance(raw, float) and math.isnan(raw)):
        return None
    lo, hi = feature["earthMin"], feature["earthMax"]
    x = (float(raw) - lo) / (hi - lo)
    x = min(1.0, max(0.0, x))
    if feature.get("invert"):
        x = 1.0 - x
    return round_to(x, 4)


# ---------------------------------------------------------------- novelty (Python only)

def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def novelty_km(lat, lon, known_points):
    """Great-circle km to the nearest known analog (§5.7), rounded to whole km."""
    return round_half_up(min(haversine_km(lat, lon, klat, klon) for klat, klon in known_points))


# ---------------------------------------------------------------- similarity + score

def similarity(feature, site_val, target_val):
    """Per-criterion similarity in [0, 1], or None if either side is missing (§5.3)."""
    if is_missing(site_val) or is_missing(target_val):
        return None
    if feature["kind"] == "numeric":
        return 1 - abs(site_val - target_val)
    if site_val == target_val:
        return 1.0
    related = feature.get("related") or {}
    if site_val in related.get(target_val, []) or target_val in related.get(site_val, []):
        return 0.5
    return 0.0


def _why_phrase(feature, site_val, first):
    label = feature["label"]
    if feature["kind"] == "numeric":
        return f"Strongest match: {label.lower()}" if first else f"{label} close to target"
    if first:
        return f"Strongest match: {label.lower()} ({site_val})"
    return f"{label}: {site_val}"


def _gap_phrase(feature, s, site_val, target_val):
    if s >= 1:
        return NO_GAP
    label = feature["label"]
    if feature["kind"] == "numeric":
        d = site_val - target_val
        higher, lower = GAP_WORDS.get(feature["id"], DEFAULT_GAP_WORDS)
        word = higher if d > 0 else lower
        text = f"Much {word}" if abs(d) >= MUCH_DIFF else _cap(word)
        return f"{text} than the target"
    if s > 0:
        return f"{label}: {site_val} is only related to the target's {target_val}"
    return f"{label}: {site_val} vs the target's {target_val}"


def score_site(target, site, weights, features):
    """Score one site against one target (§5.3–5.6).

    Returns {score, contrib, why, gap, sims}. `sims` (per-criterion similarity of
    usable weighted criteria) is for the UI and is not exported to scores.json.
    """
    tnorm, snorm = target["norm"], site["norm"]
    rows = []  # (feature, weight, similarity) for usable criteria with w > 0
    num = 0.0
    den = 0
    for f in features:
        w = weights.get(f["id"]) or 0
        if w <= 0:
            continue
        s = similarity(f, snorm.get(f["id"]), tnorm.get(f["id"]))
        if s is None:
            continue
        rows.append((f, w, s))
        num += w * s
        den += w

    if den == 0:
        return {"score": 0, "contrib": {}, "why": [], "gap": NO_DATA_GAP, "sims": {}}

    score = round_half_up(100 * num / den)
    contrib = {f["id"]: round_to(w * s / den, 4) for f, w, s in rows}
    sims = {f["id"]: s for f, w, s in rows}

    strong = sorted((r for r in rows if r[2] >= WHY_MIN_SIM), key=lambda r: -(r[1] * r[2]))
    why = [
        _why_phrase(f, snorm.get(f["id"]), i == 0)
        for i, (f, w, s) in enumerate(strong[:WHY_MAX_ITEMS])
    ]

    worst = rows[0]
    for r in rows[1:]:
        if r[2] < worst[2]:
            worst = r
    wf = worst[0]
    gap = _gap_phrase(wf, worst[2], snorm.get(wf["id"]), tnorm.get(wf["id"]))

    return {"score": score, "contrib": contrib, "why": why, "gap": gap, "sims": sims}


def rank_sites(target, sites, weights, features):
    """Rank site property dicts for one target (§5.8): score desc, then name asc."""
    scored = []
    for site in sites:
        r = score_site(target, site, weights, features)
        scored.append((site["name"], site["id"], {
            "site": site["id"],
            "score": r["score"],
            "contrib": r["contrib"],
            "why": r["why"],
            "gap": r["gap"],
        }))
    scored.sort(key=lambda t: (-t[2]["score"], t[0], t[1]))
    return [t[2] for t in scored]
