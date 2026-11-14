"""Offline tests for fetch_planetary_terrain (no network, synthetic arrays only)."""
import math

import numpy as np
import pytest

import fetch_planetary_terrain as fpt
from terrain_common import window_bounds_deg

R_MOON = 1737400.0


# --- polar stereographic (LOLA LDEM_875S_*) -------------------------------------------
def test_polar_stereo_known_point():
    # 89 S, 90 E: rho = 2R tan(0.5 deg) = 30324.12 m, on the +x axis.
    x, y = fpt.polar_stereo_south_forward(-89.0, 90.0, R_MOON)
    assert x == pytest.approx(30324.12, abs=0.01)
    assert y == pytest.approx(0.0, abs=1e-6)
    # lon 0 lies on +y, lon 180 on -y (south-pole convention, PDS DSMAP_POLAR / PROJ)
    assert fpt.polar_stereo_south_forward(-89.0, 0.0, R_MOON)[1] == pytest.approx(30324.12, abs=0.01)
    assert fpt.polar_stereo_south_forward(-89.0, 180.0, R_MOON)[1] == pytest.approx(-30324.12, abs=0.01)
    assert fpt.polar_stereo_south_forward(-90.0, 123.0, R_MOON) == pytest.approx((0.0, 0.0), abs=1e-6)


def test_polar_stereo_matches_proj():
    from rasterio.warp import transform

    stere = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
    geo = "+proj=longlat +R=1737400 +no_defs"
    for lat, lon in [(-89.468, -137.4), (-89.67, 129.78), (-88.0, 45.0), (-87.6, -170.0)]:
        (px,), (py,) = transform(geo, stere, [lon], [lat])
        x, y = fpt.polar_stereo_south_forward(lat, lon, R_MOON)
        assert (x, y) == pytest.approx((px, py), abs=0.01)


def test_c1_target_map_xy_and_window():
    # C1 = 89.468 S, 222.6 E (= -137.4) -> third quadrant (x < 0, y < 0)
    x, y = fpt.polar_stereo_south_forward(-89.468, -137.4, R_MOON)
    assert (x, y) == pytest.approx((-10919.5, -11874.8), abs=0.1)
    k = fpt.polar_stereo_scale(-89.468)
    assert fpt.polar_stereo_scale(-90.0) == 1.0
    assert k == pytest.approx(1.0000216, abs=1e-6)
    # 20 m grid, origin (-75840, 75840): 500 x 500 px window
    r0, r1, c0, c1 = fpt.stereo_window_rowcol(x, y, 5000.0 * k, -75840.0, 75840.0, 20.0)
    assert (r0, r1, c0, c1) == (4136, 4636, 2996, 3496)


# --- Mars km -> degrees, pixel ground sizes -------------------------------------------
def test_mars_window_degrees():
    w, s, e, n = window_bounds_deg(18.44, 77.45, body="mars")
    half_lat = 5.0 / (math.pi * 3396.19 / 180.0)            # 0.084353 deg
    assert (n - s) / 2 == pytest.approx(half_lat, abs=1e-9)
    assert half_lat == pytest.approx(0.084353, abs=1e-6)
    assert (e - w) / 2 == pytest.approx(half_lat / math.cos(math.radians(18.44)), abs=1e-9)
    assert (e - w) / 2 == pytest.approx(0.088919, abs=1e-6)


def test_ground_pixel_sizes():
    py, px = fpt.ground_pixel_m(20.0, -20.0, 18.44, "eqc", 3396190.0)        # CTX TRN
    assert py == 20.0 and px == pytest.approx(18.973, abs=1e-3)
    py, px = fpt.ground_pixel_m(0.003374, -0.003374, 0.0, "geographic", 3396190.0)  # HRSC blend
    assert py == pytest.approx(199.99, abs=0.01) and px == pytest.approx(py)
    with pytest.raises(ValueError):
        fpt.ground_pixel_m(1, 1, 0, "stere", 1.0)


# --- relief fed negative heights ------------------------------------------------------
def test_window_relief_negative_heights():
    heights = np.repeat((-3000.0 + 5.0 * np.arange(100))[:, None], 100, axis=1)  # -3000 .. -2505
    r = fpt.window_relief(heights, 20.0, 20.0)
    assert r["native"] == pytest.approx(485.1, abs=0.05)          # P99 - P1, not clipped
    assert r["median"] == pytest.approx(-2752.5, abs=0.05)
    assert r["frac"] == 1.0
    assert r["posting"] == (200.0, 200.0)
    shifted = fpt.window_relief(heights + 3000.0, 20.0, 20.0)     # relief is shift-invariant
    assert shifted["native"] == r["native"] and shifted["common"] == r["common"]


def test_window_relief_nodata_vs_negative():
    heights = np.full((50, 50), -1200.0)
    heights[:, 25:] = -1100.0
    heights[0, 0] = -32768.0                                      # LOLA/MEGDR nodata sentinel
    r = fpt.window_relief(heights, 20.0, 20.0, nodata=-32768.0)
    assert r["native"] == pytest.approx(100.0) and r["frac"] == pytest.approx(1 - 1 / 2500)


class _FakeLola:
    """Minimal stand-in for an open LDEM_875S_20M dataset (raw DN, scale 0.5, offset = radius)."""

    def __init__(self, dn):
        from rasterio.transform import Affine

        self.transform = Affine(20.0, 0.0, -75840.0, 0.0, -20.0, 75840.0)
        self.scales, self.offsets = (0.5,), (1737400.0,)
        self.dn = dn

    def read(self, band, window, masked):
        (r0, r1), (c0, c1) = window
        return np.ma.masked_equal(self.dn[r0:r1, c0:c1], -32768)


def test_lola_dn_scaled_without_offset():
    dn = np.full((4700, 3600), -2000, dtype="<i2")      # -1000 m below the 1737.4 km sphere (window corner only)
    dn[4300:, :] = 2000                                  # +1000 m in the southern part of the window
    h, (r0, r1, c0, c1), _, _ = fpt._lola20_window(_FakeLola(dn), -89.468, -137.4, 5000.0)
    assert (r0, r1, c0, c1) == (4136, 4636, 2996, 3496)
    assert np.nanmin(h) == -1000.0 and np.nanmax(h) == 1000.0   # DN x 0.5, OFFSET not added
    r = fpt.window_relief(h, 20.0, 20.0)
    assert r["native"] == 2000.0


def test_parse_pds_label():
    text = ('    LINES                 = 30336\n    SAMPLE_TYPE           = LSB_INTEGER\n'
            '    SCALING_FACTOR        = 0.5\n MAP_SCALE                    = 5 <m/pix>\n'
            ' MAP_PROJECTION_TYPE          = "POLAR STEREOGRAPHIC"\n')
    lbl = fpt.parse_pds_label(text)
    assert lbl["LINES"] == "30336" and lbl["SCALING_FACTOR"] == "0.5"
    assert lbl["MAP_SCALE"] == "5" and lbl["MAP_PROJECTION_TYPE"] == "POLAR STEREOGRAPHIC"
