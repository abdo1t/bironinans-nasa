"""Validate a data bundle directory against the contract (CLAUDE.md §4, eaf-bundle/2).

Checks: manifest kind + SHA-256 hashes; no NaN/Infinity; valid coordinates and
unique ids; norm values in [0, 1] or null; categorical values in the allowed
classes; every non-null norm value has a source (sites) / ref (targets) and, in
a real bundle, a provenance record; no "MOCK" text anywhere in a real bundle;
scores.json equals a fresh recomputation with scoring.py.

Usage:  python pipeline/validate_bundle.py [real|mock]
"""
import hashlib
import json
import math
import sys

import config
from bundle_io import BUNDLE_FILES, CONTRACT
from scoring import rank_sites

PROVENANCE_STATUSES = {"measurement", "reanalysis", "orbital", "in-situ", "model", "literature",
                       "definitional", "unavailable"}


def _reject_constant(name):
    raise ValueError(f"non-finite number {name} in JSON")


def _load(path):
    text = path.read_text(encoding="utf-8")
    return text, json.loads(text, parse_constant=_reject_constant)


def _check_norm(where, feature_by_id, norm, label_map, problems, need_label=True):
    for fid, f in feature_by_id.items():
        v = norm.get(fid)
        if v is None:
            continue
        if f["kind"] == "numeric":
            if not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1:
                problems.append(f"{where}: norm.{fid}={v!r} not a number in [0, 1]")
        else:
            allowed = config.GEOLOGY_CLASSES if fid == "geology" else config.ICE_CLASSES
            if v not in allowed:
                problems.append(f"{where}: norm.{fid}={v!r} not in {allowed}")
        if need_label and not (label_map or {}).get(fid):
            problems.append(f"{where}: norm.{fid} is set but has no source/ref")


def validate(bundle_dir, expected_kind):
    problems = []
    try:
        manifest = json.loads((bundle_dir / "manifest.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"{bundle_dir}: manifest.json missing"]
    if manifest.get("contract") != CONTRACT:
        problems.append(f"manifest contract {manifest.get('contract')!r} != {CONTRACT!r}")
    if manifest.get("kind") != expected_kind:
        problems.append(f"manifest kind {manifest.get('kind')!r} != expected {expected_kind!r}")

    data, texts = {}, {}
    for name in BUNDLE_FILES:
        path = bundle_dir / name
        try:
            texts[name], data[name] = _load(path)
        except (FileNotFoundError, ValueError) as exc:
            problems.append(f"{name}: {exc}")
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if manifest.get("files", {}).get(name) != digest:
            problems.append(f"{name}: SHA-256 does not match manifest.json")
    if problems:
        return problems

    real = expected_kind == "real"
    if real:
        for name, text in texts.items():
            if "MOCK" in text:
                problems.append(f"{name}: contains the text MOCK in a real bundle")

    features = data["features.json"]
    feature_by_id = {f["id"]: f for f in features}
    if [f["id"] for f in features] != config.FEATURE_IDS:
        problems.append("features.json ids/order differ from config.FEATURE_IDS")

    targets = data["targets.json"]
    if len({t["id"] for t in targets}) != len(targets):
        problems.append("targets.json: duplicate ids")
    for t in targets:
        where = f"target {t['id']}"
        if not (-90 <= t["lat"] <= 90 and -180 <= t["lon"] <= 180):
            problems.append(f"{where}: invalid coordinates")
        _check_norm(where, feature_by_id, t["norm"], t.get("refs"), problems)
        if real:
            prov = t.get("provenance") or {}
            for fid in feature_by_id:
                p = prov.get(fid)
                if not p or p.get("status") not in PROVENANCE_STATUSES:
                    problems.append(f"{where}: provenance.{fid} missing or bad status")
                elif (p["status"] == "unavailable") != (t["norm"].get(fid) is None):
                    problems.append(f"{where}: {fid} status {p['status']!r} inconsistent with norm {t['norm'].get(fid)!r}")
                elif p["status"] != "unavailable" and not p.get("citation"):
                    problems.append(f"{where}: provenance.{fid} has no citation")

    sites_fc = data["sites.geojson"]
    sites = [f["properties"] for f in sites_fc["features"]]
    if len({s["id"] for s in sites}) != len(sites):
        problems.append("sites.geojson: duplicate ids")
    for feat in sites_fc["features"]:
        s = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"][:2]
        where = f"site {s['id']}"
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            problems.append(f"{where}: invalid coordinates")
        _check_norm(where, feature_by_id, s["norm"], s.get("sources"), problems)
        if not isinstance(s.get("novelKm"), (int, float)) or s["novelKm"] < 0:
            problems.append(f"{where}: novelKm missing/invalid")
        for k, v in (s.get("raw") or {}).items():
            if v is not None and (not isinstance(v, (int, float)) or not math.isfinite(v)):
                problems.append(f"{where}: raw.{k}={v!r} not finite")
        if real:
            prov = s.get("provenance") or {}
            for fid, v in s["norm"].items():
                if v is not None and not (prov.get(fid) or {}).get("dataset"):
                    problems.append(f"{where}: provenance.{fid} missing for a non-null value")
            if not (s.get("coord") or {}).get("source"):
                problems.append(f"{where}: coordinate source missing")

    scores = data["scores.json"]
    weights = config.PRESETS.get(scores.get("defaultPreset"))
    if weights is None:
        problems.append(f"scores.json: unknown defaultPreset {scores.get('defaultPreset')!r}")
    else:
        for t in targets:
            expected = rank_sites(t, sites, weights, features, scores.get("minCriteria", 1))
            if scores["byTarget"].get(t["id"]) != expected:
                problems.append(f"scores.json: ranking for {t['id']} differs from recomputation")
    if real and scores.get("generatedAt") == "MOCK":
        problems.append("scores.json: generatedAt is MOCK in a real bundle")
    return problems


def main(argv):
    kind = argv[1] if len(argv) > 1 else "real"
    bundle_dir = config.BUNDLE_DIR if kind == "real" else config.MOCK_BUNDLE_DIR
    problems = validate(bundle_dir, kind)
    for p in problems:
        print("FAIL", p)
    print(f"{kind} bundle: {'OK' if not problems else f'{len(problems)} problem(s)'}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
