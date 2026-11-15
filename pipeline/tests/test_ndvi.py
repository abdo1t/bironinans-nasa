"""Offline tests for fetch_ndvi.py: scale/fill/reliability masking, per-composite and
over-time aggregation, STAC item selection. No network access."""
import math

import numpy as np
import pytest

import fetch_ndvi as fn


# ---------------------------------------------------------------- good_ndvi: scale, fill, reliability

def test_scale_factor_applied():
    out = fn.good_ndvi(np.array([1000, 10000, -2000, 0], "int16"), np.zeros(4, "int8"))
    assert out == pytest.approx([0.1, 1.0, -0.2, 0.0])


def test_fill_value_is_masked_even_with_good_reliability():
    out = fn.good_ndvi(np.array([-3000, 500], "int16"), np.array([0, 0], "int8"))
    assert math.isnan(out[0]) and out[1] == pytest.approx(0.05)


def test_out_of_valid_range_is_masked():
    out = fn.good_ndvi(np.array([-2001, 10001, -2000, 10000], "int16"), np.zeros(4, "int8"))
    assert np.isnan(out[:2]).all() and out[2:] == pytest.approx([-0.2, 1.0])


def test_reliability_keeps_only_good_and_marginal():
    raw = np.full(5, 800, "int16")
    rel = np.array([0, 1, 2, 3, -1], "int8")
    out = fn.good_ndvi(raw, rel)
    assert out[:2] == pytest.approx([0.08, 0.08])
    assert np.isnan(out[2:]).all()


# ---------------------------------------------------------------- composite_stat

def test_composite_median_of_good_pixels_only():
    raw = np.array([500, 700, 900, 9000, -3000], "int16")
    rel = np.array([0, 1, 0, 3, 0], "int8")  # 9000 is cloudy, -3000 is fill -> 3 of 5 good
    s = fn.composite_stat(raw, rel)
    assert s["median"] == pytest.approx(0.07)
    assert (s["n_pix"], s["n_good"]) == (5, 3)
    assert s["classes"]["good"] == 3 and s["classes"]["marginal"] == 1 and s["classes"]["cloudy"] == 1


def test_composite_unusable_below_good_fraction():
    raw = np.array([500, 600, 700, 800], "int16")
    rel = np.array([0, 3, 3, 2], "int8")  # 25 % good < 50 %
    s = fn.composite_stat(raw, rel)
    assert s["median"] is None and s["n_good"] == 1


def test_composite_empty_window():
    s = fn.composite_stat(np.zeros(0, "int16"), np.zeros(0, "int8"))
    assert s["median"] is None and s["n_pix"] == 0


# ---------------------------------------------------------------- aggregate over composites

def _stat(median, n_pix=100, n_good=100):
    return {"median": median, "n_pix": n_pix, "n_good": n_good, "classes": {"good": n_good}}


def test_aggregate_median_and_percentiles():
    meds = [0.10, 0.12, 0.08, 0.09, 0.11, 0.30, 0.07]
    ndvi, p10, p90, n, vf, reason = fn.aggregate([_stat(m) for m in meds])
    exp10, exp50, exp90 = np.percentile(meds, [10, 50, 90])
    assert ndvi == pytest.approx(round(exp50, 4)) == pytest.approx(0.10)
    assert p10 == pytest.approx(round(exp10, 4)) and p90 == pytest.approx(round(exp90, 4))
    assert n == 7 and vf == 1.0 and reason == ""


def test_aggregate_ignores_unusable_composites_but_counts_them_in_valid_frac():
    stats = [_stat(0.1)] * 6 + [_stat(None, n_pix=100, n_good=10)] * 2
    ndvi, _, _, n, vf, reason = fn.aggregate(stats)
    assert ndvi == pytest.approx(0.1) and n == 6
    assert vf == pytest.approx(round(620 / 800, 4))
    assert reason == ""


def test_aggregate_too_few_composites_gives_empty_with_reason():
    stats = [_stat(0.1)] * 5 + [_stat(None, n_good=0)] * 10
    ndvi, p10, p90, n, vf, reason = fn.aggregate(stats)
    assert ndvi is None and p10 is None and p90 is None and n == 5
    assert "only 5 of 15" in reason and "need 6" in reason


def test_aggregate_no_composites():
    ndvi, _, _, n, vf, reason = fn.aggregate([])
    assert ndvi is None and n == 0 and vf is None and "no MOD13Q1" in reason


# ---------------------------------------------------------------- STAC item selection

def _feat(fid, platform="terra", start="2022-01-01", h=11, v=11):
    return {"id": fid, "properties": {"platform": platform, "start_datetime": f"{start}T00:00:00Z",
                                      "modis:horizontal-tile": h, "modis:vertical-tile": v}}


def test_select_items_terra_only_in_period_dedup_latest():
    feats = [
        _feat("MOD13Q1.A2022001.h11v11.061.2022020000000"),
        _feat("MOD13Q1.A2022001.h11v11.061.2022030000000"),          # reprocessed: keep this
        _feat("MYD13Q1.A2022009.h11v11.061.x", platform="aqua"),       # Aqua: dropped
        _feat("MOD13Q1.A2021353.h11v11.061.x", start="2021-12-19"),    # before period: dropped
        _feat("MOD13Q1.A2024001.h11v11.061.x", start="2024-01-01"),    # after period: dropped
        _feat("MOD13Q1.A2022001.h12v11.061.x", h=12),                  # second tile, same date: kept
    ]
    out = [f["id"] for f in fn.select_items(feats)]
    assert out == ["MOD13Q1.A2022001.h11v11.061.2022030000000", "MOD13Q1.A2022001.h12v11.061.x"]


def test_tile_label():
    assert fn.tile_label(_feat("x", h=9, v=5)) == "h09v05"


def test_output_columns_exact():
    assert fn.FIELDS == ["id", "ndvi", "ndvi_p10", "ndvi_p90", "n_composites", "valid_frac", "period",
                         "product", "product_label", "citation", "tiles", "note", "retrieved_at"]
