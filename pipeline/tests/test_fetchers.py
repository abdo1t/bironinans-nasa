"""Unit tests for the data fetchers (no network). Responses below are minimal
hand-made test inputs shaped like the real POWER v2.10 climatology response."""
import math

import pytest

from fetch_power import PARAMETERS, PowerError, parse_response
from fetch_terrain import choose_dem, robust_relief, window_bounds


def power_payload(**overrides):
    values = {"PRECTOTCORR": 0.02, "TS": 18.95, "TS_RANGE": 28.59, "T2M": 17.07, "T2M_RANGE": 14.74}
    values.update(overrides)
    units = {"PRECTOTCORR": "mm/day", "TS": "C", "TS_RANGE": "C", "T2M": "C", "T2M_RANGE": "C"}
    return {
        "geometry": {"type": "Point", "coordinates": [-70.0, -24.1, 1261.0]},
        "header": {"fill_value": -999.0, "range": "25-year ... (January 2001 - December 2025)",
                   "api": {"version": "v2.10.1"}, "sources": ["MERRA2", "POWER"]},
        "parameters": {p: {"units": units[p], "longname": p} for p in PARAMETERS},
        "properties": {"parameter": {p: {"JAN": 0, "ANN": values[p]} for p in PARAMETERS}},
    }


def test_precip_converted_from_mm_per_day_to_mm_per_year():
    out = parse_response(power_payload(PRECTOTCORR=1.0))
    assert out["precip_mm_day"] == 1.0
    assert out["precip_mm_yr"] == 365.2            # 1 mm/day * 365.25, rounded to 0.1


def test_annual_values_and_metadata():
    out = parse_response(power_payload())
    assert out["ts_mean_c"] == 18.95 and out["ts_range_c"] == 28.59
    assert out["cell_elev_m"] == 1261.0
    assert "2001" in out["period"] and out["api_version"] == "v2.10.1"


def test_fill_value_becomes_none_not_a_number():
    out = parse_response(power_payload(TS=-999.0, PRECTOTCORR=-999.0))
    assert out["ts_mean_c"] is None
    assert out["precip_mm_day"] is None and out["precip_mm_yr"] is None


def test_unexpected_units_are_rejected():
    p = power_payload()
    p["parameters"]["PRECTOTCORR"]["units"] = "mm/hr"
    with pytest.raises(PowerError, match="units"):
        parse_response(p)


def test_missing_parameter_is_rejected():
    p = power_payload()
    del p["properties"]["parameter"]["TS_RANGE"]
    with pytest.raises(PowerError, match="TS_RANGE"):
        parse_response(p)


# --------------------------------------------------------------------------- terrain

def test_dem_choice_follows_coverage():
    assert choose_dem(-24.1)["id"] == "SRTMGL1.003"       # Atacama: inside SRTM
    assert choose_dem(64.9)["id"] == "ASTGTM.003"         # Holuhraun: north of 60N -> ASTER
    assert choose_dem(-77.5)["id"] == "ASTGTM.003"        # Dry Valleys: south of 56S -> ASTER
    assert choose_dem(59.99)["id"] == "ASTGTM.003"        # window would cross 60N -> ASTER
    assert choose_dem(85.0) is None                       # beyond ASTER -> null, no substitute


def test_window_is_10_km_at_any_latitude():
    for lat in (0.0, 45.0, -77.5):
        w, s, e, n = window_bounds(lat, 10.0)
        ns_km = (n - s) * 111.32
        ew_km = (e - w) * 111.32 * math.cos(math.radians(lat))
        assert ns_km == pytest.approx(10.0) and ew_km == pytest.approx(10.0)


def test_robust_relief_ignores_spikes_and_nodata():
    import numpy as np

    grid = np.tile(np.linspace(100.0, 300.0, 100), (100, 1))  # smooth 100..300 m ramp
    grid[0, 0] = 8000.0                                        # single spike
    relief, median, frac = robust_relief(grid)
    assert 190 < relief < 200                                  # ~P99-P1 of the ramp, spike ignored
    assert median == pytest.approx(200.0, abs=1.5)
    assert frac == 1.0

    holes = grid.copy()
    holes[:10, :] = -32768                                     # SRTM void value
    relief2, _, frac2 = robust_relief(holes, nodata=-32768)
    assert frac2 == pytest.approx(0.9) and relief2 is None     # < 95 % valid -> null, not guessed
