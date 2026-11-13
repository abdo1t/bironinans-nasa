"""Scoring tests. The fixture is shared with web/src/lib/scoring.test.js (parity)."""
import json
from pathlib import Path

import pytest

import config
from scoring import normalize, novelty_km, rank_sites, round_half_up, score_site, similarity

FIXTURE = json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))
FEATURES = FIXTURE["features"]
FEAT = {f["id"]: f for f in FEATURES}
TARGETS = {t["id"]: t for t in FIXTURE["targets"]}
SITES = {s["id"]: s for s in FIXTURE["sites"]}


# ------------------------------------------------------------------ parity fixture

@pytest.mark.parametrize("weight_set", list(FIXTURE["weightSets"]))
@pytest.mark.parametrize("target_id", list(TARGETS))
def test_fixture_rankings(weight_set, target_id):
    weights = FIXTURE["weightSets"][weight_set]
    got = rank_sites(TARGETS[target_id], FIXTURE["sites"], weights, FEATURES)
    assert got == FIXTURE["expected"][weight_set][target_id]


def test_fixture_matches_config():
    assert FIXTURE["weightSets"]["balanced"] == config.PRESETS["balanced"]
    assert [f["id"] for f in FEATURES] == config.FEATURE_IDS


# ------------------------------------------------------------------ hand-checked values

def test_half_up_rounding_not_bankers():
    # (1*1.0 + 3*0.5) / 4 = 62.5 -> 63 (Python round() would give 62)
    r = score_site(TARGETS["t-moon"], SITES["charlie"], FIXTURE["weightSets"]["edge"], FEATURES)
    assert r["score"] == 63
    assert round_half_up(62.5) == 63
    assert round_half_up(0.5) == 1


def test_balanced_hand_computed():
    # sims 1, .75, .75, (temp_range missing), .75, 1, 1 with weights 3,3,3,-,3,3,1
    # (3 + 2.25*3 + 3 + 1) / 16 = 85.9375 -> 86
    r = score_site(TARGETS["t-mars"], SITES["bravo"], config.PRESETS["balanced"], FEATURES)
    assert r["score"] == 86
    assert "temp_range" not in r["contrib"]
    assert sum(r["contrib"].values()) == pytest.approx(0.859375, abs=1e-3)


def test_tie_breaks_by_name_not_input_order():
    ranked = rank_sites(TARGETS["t-mars"], FIXTURE["sites"], config.PRESETS["balanced"], FEATURES)
    ids = [r["site"] for r in ranked]
    assert ids.index("bravo") < ids.index("echo")
    assert ranked[0]["score"] == ranked[1]["score"]


def test_categorical_similarity():
    geo = FEAT["geology"]
    assert similarity(geo, "clay", "clay") == 1.0
    assert similarity(geo, "sedimentary", "clay") == 0.5   # related, listed under clay
    assert similarity(geo, "clay", "sedimentary") == 0.5   # either direction
    assert similarity(geo, "basalt", "clay") == 0.0
    assert similarity(geo, None, "clay") is None
    assert similarity(geo, "", "clay") is None


def test_zero_weight_and_missing_are_skipped():
    w = {"terrain": 5}
    r = score_site(TARGETS["t-mars"], SITES["delta"], w, FEATURES)  # delta terrain is null
    assert r["score"] == 0
    assert r["contrib"] == {}
    assert r["why"] == []


def test_why_requires_high_similarity():
    r = score_site(TARGETS["t-moon"], SITES["delta"], config.PRESETS["balanced"], FEATURES)
    assert r["why"] == []


def test_gap_is_lowest_similarity_first_in_order():
    # alpha vs t-mars: terrain, temp, temp_range, geology all at s=0.5; terrain comes first
    r = score_site(TARGETS["t-mars"], SITES["alpha"], config.PRESETS["balanced"], FEATURES)
    assert r["gap"] == "Much smoother than the target"


# ------------------------------------------------------------------ normalize + novelty

def test_normalize_fixed_bounds_clip_and_invert():
    arid = {"earthMin": 0, "earthMax": 2000, "invert": True}
    assert normalize(0, arid) == 1.0
    assert normalize(500, arid) == 0.75
    assert normalize(5000, arid) == 0.0          # clipped
    temp = {"earthMin": -30, "earthMax": 30, "invert": False}
    assert normalize(-60, temp) == 0.0           # beyond Earth range clips to 0
    assert normalize(0, temp) == 0.5
    assert normalize(None, temp) is None
    assert normalize(float("nan"), temp) is None


def test_novelty_km():
    assert novelty_km(0.0, 0.0, [(0.0, 0.0)]) == 0
    # 1 degree of latitude ~ 111.2 km
    assert novelty_km(1.0, 0.0, [(0.0, 0.0), (50.0, 50.0)]) == 111
