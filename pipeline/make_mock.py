"""Write a deterministic MOCK data bundle to web/public/data/.

Same shapes as the real bundle (CLAUDE.md §4). All numeric `norm` values are
random (seeded) and NOT measurements. `generatedAt` is "MOCK" so the UI can flag it.

Uses only the standard library so it runs before the pipeline env is installed:
    python pipeline/make_mock.py
"""
import csv
import json
import random

import config
from scoring import novelty_km, rank_sites

SEED = 42
NULL_RATE = 0.1  # share of optional numeric values left null, to exercise "data pending"
OPTIONAL_NUMERIC = {"temp_range", "veg"}
RAW_KEYS = ["precip_mm", "tmean_c", "trange_c", "relief_m", "ndvi"]


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def mock_norm(rng, row, allow_null):
    norm = {}
    for f in config.FEATURES:
        fid = f["id"]
        if f["kind"] == "numeric":
            if allow_null and fid in OPTIONAL_NUMERIC and rng.random() < NULL_RATE:
                norm[fid] = None
            else:
                norm[fid] = round(rng.random(), 2)
        else:
            seeded = (row.get(fid) or "").strip()
            choices = config.GEOLOGY_CLASSES if fid == "geology" else config.ICE_CLASSES
            norm[fid] = seeded or rng.choice(choices)
    return norm


def build_features():
    keys = ["id", "label", "kind", "unit", "earthMin", "earthMax", "invert", "related", "description", "source"]
    return [{k: f[k] for k in keys if k in f} for f in config.FEATURES]


def build_targets(rng):
    out = []
    for row in read_csv(config.TARGETS_SEED):
        out.append({
            "id": row["id"],
            "body": row["body"],
            "name": row["name"],
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
            "summary": row["summary"],
            "norm": mock_norm(rng, row, allow_null=False),
            "refs": {fid: "MOCK — TODO citation" for fid in config.FEATURE_IDS},
            "trekUrl": row["trekUrl"],
        })
    return out


def build_sites(rng):
    known = [(float(k["lat"]), float(k["lon"])) for k in read_csv(config.KNOWN_ANALOGS)]
    features = []
    for row in read_csv(config.SITES_SEED):
        lat, lon = float(row["lat"]), float(row["lon"])
        novel_km = novelty_km(lat, lon, known)
        norm = mock_norm(rng, row, allow_null=True)
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
                "sources": {fid: "MOCK" for fid, v in norm.items() if v is not None},
            },
        })
    return {"type": "FeatureCollection", "features": features}


def build_scores(targets, sites, features):
    weights = config.PRESETS[config.DEFAULT_PRESET]
    site_props = [f["properties"] for f in sites["features"]]
    return {t["id"]: rank_sites(t, site_props, weights, features) for t in targets}


def write_json(name, obj):
    config.BUNDLE_DIR.mkdir(parents=True, exist_ok=True)
    path = config.BUNDLE_DIR / name
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {path.relative_to(config.ROOT.parent).as_posix()}")


def main():
    rng = random.Random(SEED)
    targets = build_targets(rng)
    sites = build_sites(rng)
    features = build_features()
    write_json("features.json", features)
    write_json("targets.json", targets)
    write_json("sites.geojson", sites)
    write_json("scores.json", {
        "generatedAt": "MOCK",
        "defaultPreset": config.DEFAULT_PRESET,
        "byTarget": build_scores(targets, sites, features),
    })


if __name__ == "__main__":
    main()
