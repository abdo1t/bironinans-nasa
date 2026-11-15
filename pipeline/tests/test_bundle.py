"""Schema/provenance validation of the committed bundles (real and mock)."""
import json

import pytest

import config
from validate_bundle import validate


@pytest.mark.parametrize("kind, bundle_dir", [("real", config.BUNDLE_DIR), ("mock", config.MOCK_BUNDLE_DIR)])
def test_bundle_is_valid(kind, bundle_dir):
    assert validate(bundle_dir, kind) == []


def test_real_bundle_has_no_synthetic_values_and_honest_targets():
    targets = json.loads((config.BUNDLE_DIR / "targets.json").read_text(encoding="utf-8"))
    scores = json.loads((config.BUNDLE_DIR / "scores.json").read_text(encoding="utf-8"))
    sites = json.loads((config.BUNDLE_DIR / "sites.geojson").read_text(encoding="utf-8"))["features"]
    for t in targets:
        for fid, p in t["provenance"].items():
            # unavailable <=> excluded from similarity (null), never a guessed number
            assert (p["status"] == "unavailable") == (t["norm"][fid] is None), (t["id"], fid)
    # thin matches never get a score in the real bundle
    assert scores["minCriteria"] >= 3
    for rows in scores["byTarget"].values():
        for r in rows:
            if r["coverage"]["used"] < scores["minCriteria"]:
                assert r["score"] is None and r["gap"].startswith("Insufficient data")
    # a POWER value judged unrepresentative is shown (raw) but never scored
    for f in sites:
        p = f["properties"]
        for fid in ("aridity", "temp", "temp_range"):
            if p["provenance"][fid].get("excluded"):
                assert p["norm"][fid] is None and p["raw"] is not None


def test_mock_bundle_is_clearly_mock():
    manifest = json.loads((config.MOCK_BUNDLE_DIR / "manifest.json").read_text(encoding="utf-8"))
    scores = json.loads((config.MOCK_BUNDLE_DIR / "scores.json").read_text(encoding="utf-8"))
    assert manifest["kind"] == "mock" and scores["generatedAt"] == "MOCK"
