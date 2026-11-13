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

MIN_CRITERIA_FOR_SCORE = 3  # used by the real bundle + app (score_site defaults to 1)
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

NO_CRITERIA_GAP = "No criteria selected"
NO_DATA_GAP = "No usable data for the selected criteria"
NO_GAP = "No gaps on the selected criteria"
CLIPPED_NOTE = "target is beyond Earth's range"


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


def _why_phrase(feature, site_val, first, clipped=False):
    label = feature["label"]
    if feature["kind"] == "numeric":
        if clipped:  # target lies beyond Earth's bounds: a match means "near Earth's extreme"
            if first:
                return f"Strongest match: {label.lower()} (near Earth's extreme; {CLIPPED_NOTE})"
            return f"{label} near Earth's extreme ({CLIPPED_NOTE})"
        return f"Strongest match: {label.lower()}" if first else f"{label} close to target"
    if first:
        return f"Strongest match: {label.lower()} ({site_val})"
    return f"{label}: {site_val}"


def _gap_phrase(feature, s, site_val, target_val, clipped=False):
    if s >= 1:
        return NO_GAP
    label = feature["label"]
    if feature["kind"] == "numeric":
        d = site_val - target_val
        higher, lower = GAP_WORDS.get(feature["id"], DEFAULT_GAP_WORDS)
        word = higher if d > 0 else lower
        text = f"Much {word}" if abs(d) >= MUCH_DIFF else _cap(word)
        return f"{text} than the target" + (f" ({CLIPPED_NOTE})" if clipped else "")
    if s > 0:
        return f"{label}: {site_val} is only related to the target's {target_val}"
    return f"{label}: {site_val} vs the target's {target_val}"


def insufficient_gap(used, selected, min_used):
    return f"Insufficient data: {used} of {selected} selected criteria have data (minimum {min_used})"


def score_site(target, site, weights, features, min_used=1):
    """Score one site against one target (§5.3–5.6).

    Returns {score, scoreRange, contrib, coverage, why, gap, sims}.
      * scoreRange = [lo, hi]: the score if every selected criterion that is
        missing ON THE SITE SIDE (target value known) were a total mismatch
        (s = 0) or a perfect match (s = 1). Equal to [score, score] when the site
        has no such gaps; None when score is None. Shows how much missing data
        could move the score — a narrow range means the score is data-backed.
      * why lists criteria with s >= WHY_MIN_SIM; criteria whose target value lies
        beyond Earth's bounds (target["clipped"]) are worded "near Earth's extreme".
      * gap = the selected usable criterion that loses the most points,
        max w * (1 - s), among criteria with s < WHY_MIN_SIM (so it never
        contradicts `why`); ties -> first in feature order; none -> NO_GAP.
      * Only selected criteria (weight > 0) appear in contrib / sims.
      * A selected criterion with a missing value on either side is `None` in
        contrib / sims — never 0. A 0 always means "measured, and no match".
      * score is `None` when no selected criterion is usable (not 0).
      * coverage = {"used": usable selected criteria, "selected": criteria with w > 0}.
      * min_used: fewer usable criteria than this -> score None ("insufficient
        data"); sims are still returned. The real bundle and app use
        MIN_CRITERIA_FOR_SCORE = 3 so a 1–2 criterion match never ranks.
    `sims` is for the UI and is not exported to scores.json.
    """
    tnorm, snorm = target["norm"], site["norm"]
    clipped = target.get("clipped") or {}
    selected = []  # (feature, weight, similarity-or-None) in feature order, w > 0
    num = 0.0
    den = 0
    for f in features:
        w = weights.get(f["id"]) or 0
        if w <= 0:
            continue
        s = similarity(f, snorm.get(f["id"]), tnorm.get(f["id"]))
        selected.append((f, w, s))
        if s is not None:
            num += w * s
            den += w

    rows = [r for r in selected if r[2] is not None]
    coverage = {"used": len(rows), "selected": len(selected)}
    sims = {f["id"]: s for f, w, s in selected}

    if den == 0 or len(rows) < min_used:
        if not selected:
            gap = NO_CRITERIA_GAP
        elif den == 0:
            gap = NO_DATA_GAP
        else:
            gap = insufficient_gap(len(rows), len(selected), min_used)
        return {
            "score": None,
            "scoreRange": None,
            "contrib": {f["id"]: None for f, w, s in selected},
            "coverage": coverage,
            "why": [],
            "gap": gap,
            "sims": sims,
        }

    score = round_half_up(100 * num / den)
    contrib = {f["id"]: (None if s is None else round_to(w * s / den, 4)) for f, w, s in selected}

    # Missing on the site side only (target value known): bound what the gap could do.
    w_missing = 0
    for f, w, s in selected:
        if s is None and not is_missing(tnorm.get(f["id"])) and is_missing(snorm.get(f["id"])):
            w_missing += w
    score_range = [
        round_half_up(100 * num / (den + w_missing)),
        round_half_up(100 * (num + w_missing) / (den + w_missing)),
    ]

    strong = sorted((r for r in rows if r[2] >= WHY_MIN_SIM), key=lambda r: -(r[1] * r[2]))
    why = [
        _why_phrase(f, snorm.get(f["id"]), i == 0, f["id"] in clipped)
        for i, (f, w, s) in enumerate(strong[:WHY_MAX_ITEMS])
    ]

    worst = None
    for r in rows:
        if r[2] < WHY_MIN_SIM and (worst is None or r[1] * (1 - r[2]) > worst[1] * (1 - worst[2])):
            worst = r
    if worst is None:
        gap = NO_GAP
    else:
        wf = worst[0]
        gap = _gap_phrase(wf, worst[2], snorm.get(wf["id"]), tnorm.get(wf["id"]), wf["id"] in clipped)

    return {"score": score, "scoreRange": score_range, "contrib": contrib, "coverage": coverage,
            "why": why, "gap": gap, "sims": sims}


def rank_sites(target, sites, weights, features, min_used=1):
    """Rank site property dicts for one target (§5.8).

    Score desc, then name asc (code point), then id. Sites with score None
    (no usable data) sort after every scored site.
    """
    scored = []
    for site in sites:
        r = score_site(target, site, weights, features, min_used)
        scored.append((site["name"], site["id"], {
            "site": site["id"],
            "score": r["score"],
            "scoreRange": r["scoreRange"],
            "contrib": r["contrib"],
            "coverage": r["coverage"],
            "why": r["why"],
            "gap": r["gap"],
        }))
    scored.sort(key=lambda t: (t[2]["score"] is None, -(t[2]["score"] or 0), t[0], t[1]))
    return [t[2] for t in scored]
