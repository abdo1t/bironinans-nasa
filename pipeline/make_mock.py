"""Write a deterministic MOCK data bundle to web/public-mock/data/.

Same shapes as the real bundle (CLAUDE.md §4). All numeric `norm` values are
random (seeded) and NOT measurements. manifest.json says kind "mock" and
`generatedAt` is "MOCK", so the app can only show it in mock mode
(`npm run dev:mock`), always under a MOCK banner.

Uses only the standard library so it runs before the pipeline env is installed:
    python pipeline/make_mock.py
"""
import csv
import random

import config
from bundle_io import export_features, write_bundle
from scoring import novelty_km, rank_sites

SEED = 42
NULL_RATE = 0.1  # share of optional numeric values left null, to exercise "data pending"
OPTIONAL_NUMERIC = {"temp_range", "veg"}
RAW_KEYS = [f["raw"] for f in config.FEATURES if "raw" in f]


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def mock_norm(rng, row, allow_null):
    """Return (norm, sources). Every non-null value gets a source label:
    synthetic values -> config.MOCK_SOURCE; categorical classes copied from the
    seed CSV -> config.SEED_CLASS_SOURCE (unverified literature class, not NASA data).
    """
    norm, sources = {}, {}
    for f in config.FEATURES:
        fid = f["id"]
        if f["kind"] == "numeric":
            if allow_null and fid in OPTIONAL_NUMERIC and rng.random() < NULL_RATE:
                norm[fid] = None
            else:
                norm[fid] = round(rng.random(), 2)
                sources[fid] = config.MOCK_SOURCE
        else:
            seeded = (row.get(fid) or "").strip()
            choices = config.GEOLOGY_CLASSES if fid == "geology" else config.ICE_CLASSES
            norm[fid] = seeded or rng.choice(choices)
            sources[fid] = config.SEED_CLASS_SOURCE if seeded else config.MOCK_SOURCE
    return norm, sources


def build_features():
    return export_features(config.FEATURES)


def build_targets(rng):
    out = []
    for row in read_csv(config.TARGETS_SEED):
        norm, refs = mock_norm(rng, row, allow_null=False)
        out.append({
            "id": row["id"],
            "body": row["body"],
            "name": row["name"],
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
            "summary": row["summary"],
            "norm": norm,
            "refs": refs,
            "trekUrl": row["trekUrl"],
        })
    return out


def build_sites(rng):
    known = [(float(k["lat"]), float(k["lon"])) for k in read_csv(config.KNOWN_ANALOGS)]
    features = []
    for row in read_csv(config.SITES_SEED):
        lat, lon = float(row["lat"]), float(row["lon"])
        novel_km = novelty_km(lat, lon, known)
        norm, sources = mock_norm(rng, row, allow_null=True)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": row["id"],
                "name": row["name"],
                "country": row["country"],
                "knownAnalog": row["knownAnalog"].strip().lower() == "true",
                "raw": {k: None for k in RAW_KEYS},
                "norm": norm,
                "novelKm": novel_km,
                "isNewCandidate": novel_km > config.NOVELTY_KM,
                "sources": sources,
            },
        })
    return {"type": "FeatureCollection", "features": features}


def build_scores(targets, sites, features):
    weights = config.PRESETS[config.DEFAULT_PRESET]
    site_props = [f["properties"] for f in sites["features"]]
    return {t["id"]: rank_sites(t, site_props, weights, features) for t in targets}


def main():
    rng = random.Random(SEED)
    targets = build_targets(rng)
    sites = build_sites(rng)
    features = build_features()
    # Mock goes to its OWN public dir (web/public-mock/data), never next to real data.
    write_bundle(config.MOCK_BUNDLE_DIR, "mock", {
        "features.json": features,
        "targets.json": targets,
        "sites.geojson": sites,
        "scores.json": {
            "generatedAt": "MOCK",
            "defaultPreset": config.DEFAULT_PRESET,
            "byTarget": build_scores(targets, sites, features),
        },
    }, root_for_log=config.ROOT.parent)


if __name__ == "__main__":
    main()
