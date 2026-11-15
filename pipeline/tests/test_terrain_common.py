"""Tests for shared raster helpers (synthetic arrays only)."""
import math

import numpy as np
import pytest

from terrain_common import (
    aggregation_factors,
    block_mean,
    common_scale_relief,
    deg_per_km,
    relief_stats,
    window_bounds_deg,
)


def test_relief_accepts_negative_planetary_heights():
    grid = np.tile(np.linspace(-2700.0, -2400.0, 100), (100, 1))   # Jezero-like, below datum
    relief, median, frac = relief_stats(grid)
    assert 290 < relief < 300 and median == pytest.approx(-2550.0, abs=2) and frac == 1.0


def test_relief_null_when_too_many_voids():
    grid = np.ones((10, 10))
    grid[:2, :] = -32768
    assert relief_stats(grid, nodata=-32768)[0] is None
    grid2 = np.ones((10, 10))
    grid2[0, 0] = np.nan
    assert relief_stats(grid2)[0] == 0.0     # 99 % valid -> fine


def test_block_mean_averages_and_drops_sparse_blocks():
    a = np.arange(16, dtype=float).reshape(4, 4)
    out = block_mean(a, 2, 2)
    assert out.tolist() == [[2.5, 4.5], [10.5, 12.5]]
    a[0, 0] = a[0, 1] = a[1, 0] = -9999
    out2 = block_mean(a, 2, 2, nodata=-9999)
    assert math.isnan(out2[0, 0]) and out2[1, 1] == 12.5


def test_common_scale_relief_ramp_is_scale_invariant():
    ramp = np.tile(np.linspace(0, 500, 500), (500, 1))   # 500 px at 20 m = 10 km
    native = relief_stats(ramp)[0]
    agg, _, _, eff = common_scale_relief(ramp, 20.0, 20.0)
    assert eff == (200.0, 200.0)
    assert abs(agg - native) / native < 0.02            # a smooth ramp barely changes


def test_aggregation_factors_and_window_size():
    assert aggregation_factors(30.9, 30.9) == (6, 6)
    assert aggregation_factors(30.9, 92.7) == (6, 2)     # Copernicus 3" lon posting at high latitude
    for body, lat in (("earth", 0.0), ("mars", 18.44), ("moon", -10.0)):
        w, s, e, n = window_bounds_deg(lat, 0.0, 5.0, body)
        dlat, dlon = deg_per_km(lat, body)
        assert (n - s) / dlat == pytest.approx(10.0) and (e - w) / dlon == pytest.approx(10.0)
