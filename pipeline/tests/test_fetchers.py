"""Unit tests for the data fetchers (no network). Responses below are minimal
hand-made test inputs shaped like the real POWER v2.10 climatology response."""
import math

import pytest

from fetch_power import PARAMETERS, PowerError, parse_response
from fetch_terrain import (COP_ATTRIBUTION, NODATA_FILL, build_row, choose_dem, crop_to_bounds, cross_dem_for,
                           measure, pixel_size_m, tile_names, tile_url)


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


# --------------------------------------------------------------------------- terrain (offline)

SITE_ATACAMA = {"id": "atacama", "lat": -24.10169, "lon": -70.01828}
SITE_HAUGHTON = {"id": "haughton", "lat": 75.4333, "lon": -89.8667}


def test_dem_choice_follows_whole_window_coverage():
    assert choose_dem(-24.1)["id"] == "NASADEM_HGT.001"       # Atacama: inside NASADEM (56S..60N)
    assert choose_dem(64.85)["id"] == "COP-DEM_GLO-30"        # Holuhraun: north of 60N
    assert choose_dem(75.43)["id"] == "COP-DEM_GLO-30"        # Haughton
    assert choose_dem(-77.87)["id"] == "COP-DEM_GLO-30"       # McMurdo: south of 56S
    assert choose_dem(59.99)["id"] == "COP-DEM_GLO-30"        # window would cross 60N -> not mixed
    assert choose_dem(-55.99)["id"] == "COP-DEM_GLO-30"       # window would cross 56S
    assert choose_dem(59.9)["id"] == "NASADEM_HGT.001"        # whole window still below 60N
    assert choose_dem(-24.1)["quality"] == "primary" and choose_dem(75.4)["quality"] == "partner-fill"


def test_cross_check_dem_is_independent_or_coarser():
    assert cross_dem_for(choose_dem(-24.1))["id"] == "COP-DEM_GLO-30"
    assert cross_dem_for(choose_dem(75.4))["id"] == "COP-DEM_GLO-90"
    assert cross_dem_for(None) is None


def test_tile_names_mosaic_across_tile_edges():
    import terrain_common as tc

    # Atacama window crosses 70 W -> two tiles, named by SW corner
    names = tile_names("NASADEM_HGT.001", tc.window_bounds_deg(-24.10169, -70.01828))
    assert names == ["NASADEM_HGT_s25w071", "NASADEM_HGT_s25w070"]
    cop = tile_names("COP-DEM_GLO-30", tc.window_bounds_deg(-77.86617, 160.73238))
    assert cop == ["Copernicus_DSM_COG_10_S78_00_E160_00_DEM"]
    assert tile_names("COP-DEM_GLO-90", (10.2, 5.1, 10.4, 5.3)) == ["Copernicus_DSM_COG_30_N05_00_E010_00_DEM"]


def test_tile_urls_and_sas_requirement():
    nasadem, cop = choose_dem(-24.1), choose_dem(75.4)
    assert tile_url(nasadem, "NASADEM_HGT_s25w071", "se=x&sig=y") == (
        "https://nasademeuwest.blob.core.windows.net/nasadem-cog/v001/NASADEM_HGT_s25w071.tif?se=x&sig=y")
    with pytest.raises(RuntimeError, match="SAS"):
        tile_url(nasadem, "NASADEM_HGT_s25w071", None)
    name = "Copernicus_DSM_COG_10_N75_00_W090_00_DEM"
    assert tile_url(cop, name) == f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


def test_pixel_size_shrinks_east_west_with_latitude():
    one = 1 / 3600
    py0, px0 = pixel_size_m(one, one, 0.0)
    assert py0 == pytest.approx(30.9, abs=0.1) and px0 == pytest.approx(30.9, abs=0.1)
    py75, px75 = pixel_size_m(3 * one, one, 75.4333)        # Copernicus 3" x 1" band (70-80 deg)
    assert py75 == pytest.approx(py0) and px75 == pytest.approx(3 * 30.9 * math.cos(math.radians(75.4333)), rel=1e-3)


def test_crop_to_bounds_trims_padding():
    from affine import Affine
    import numpy as np

    arr = np.arange(100).reshape(10, 10)
    tr = Affine(1.0, 0, 0.0, 0, -1.0, 10.0)                   # x 0..10, y 10..0
    out = crop_to_bounds(arr, tr, (2.0, 3.0, 7.0, 8.0))
    assert out.shape == (5, 5) and out[0, 0] == arr[2, 2]


def test_measure_ramp_native_and_common_scale():
    import numpy as np

    one = 1 / 3600
    grid = np.tile(np.linspace(0.0, 1000.0, 360), (320, 1))  # 10 km E-W ramp, 0..1000 m
    m = measure(grid, one, one, 0.0)
    assert m["relief_native_m"] == pytest.approx(980.0, abs=5)   # ~P99 - P1 of a linear ramp
    assert m["relief_m"] == pytest.approx(980.0, abs=30)         # same at ~200 m posting
    assert m["elev_m"] == pytest.approx(500.0, abs=2) and m["valid_frac"] == 1.0
    assert m["common_posting_m"] == (pytest.approx(185.5, abs=1), pytest.approx(185.5, abs=1))
    assert m["posting_native"].startswith("1x1 arcsec")


def test_measure_nulls_relief_when_mosaic_has_gaps():
    import numpy as np

    one = 1 / 3600
    grid = np.full((100, 100), 50.0)
    grid[:, :10] = NODATA_FILL                                # 10 % uncovered by any tile
    m = measure(grid, one, one, 0.0)
    assert m["valid_frac"] == pytest.approx(0.9)
    assert m["relief_native_m"] is None and m["relief_m"] is None   # never guessed


def test_measure_flags_sea_surface_in_coastal_window():
    import numpy as np

    grid = np.tile(np.linspace(0.0, 400.0, 200), (200, 1))
    grid[:, :40] = 0.0                                        # 20 % sea at 0 m
    assert measure(grid, 1 / 3600, 1 / 3600, 29.0)["near_zero_frac"] == pytest.approx(0.2, abs=0.01)


def _fake_reader(values_by_dem):
    def reader(dem, bounds, sas_token=None):
        v = values_by_dem[dem["id"]]
        if isinstance(v, Exception):
            raise v
        import numpy as np
        return np.asarray(v, dtype=float), 1 / 3600, 1 / 3600, [f"{dem['id']}_tile"], []
    return reader


def test_build_row_success_fills_every_column_from_measurements():
    import numpy as np

    ramp = np.tile(np.linspace(100.0, 300.0, 120), (120, 1))
    reader = _fake_reader({"NASADEM_HGT.001": ramp, "COP-DEM_GLO-30": ramp + 1})
    row = build_row(SITE_ATACAMA, "T", sas_token="tok", reader=reader)
    assert row["dem"] == "NASADEM_HGT.001" and row["quality"] == "primary"
    assert row["relief_native_m"] == pytest.approx(196.0, abs=2) and row["relief_m"] is not None
    assert row["cross_dem"] == "COP-DEM_GLO-30" and row["cross_relief_m"] is not None
    assert "doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001" in row["dem_citation"]
    assert COP_ATTRIBUTION in row["attribution"]                 # cross-check source credited too


def test_build_row_network_failure_leaves_relief_empty_with_reason():
    reader = _fake_reader({"COP-DEM_GLO-30": RuntimeError("HTTP 503"), "COP-DEM_GLO-90": RuntimeError("HTTP 503")})
    row = build_row(SITE_HAUGHTON, "T", reader=reader)
    assert row["dem"] == "COP-DEM_GLO-30" and row["quality"] == "partner-fill"
    assert "relief_m" not in row and "cross_relief_m" not in row
    assert "failed (COP-DEM_GLO-30): HTTP 503" in row["note"] and "cross-check COP-DEM_GLO-90 failed" in row["note"]
    assert row["attribution"] == COP_ATTRIBUTION


def test_build_row_without_sas_token_explains_why():
    reader = _fake_reader({"COP-DEM_GLO-30": RuntimeError("offline")})
    row = build_row(SITE_ATACAMA, "T", sas_token=None, token_error="ConnectionError", reader=reader)
    assert "relief_m" not in row
    assert "SAS token unavailable (ConnectionError)" in row["note"]
