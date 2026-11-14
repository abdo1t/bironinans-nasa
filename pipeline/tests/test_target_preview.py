"""Tests for make_target_preview: geometry, hillshade sign, ramp, overlays, committed outputs.

Synthetic arrays only; the two tests that open the cached rasters skip when they are absent.
"""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pytest

import fetch_planetary_terrain as fpt
import make_target_preview as mtp

R_MOON = 1737400.0
R_MARS = 3396190.0
C1 = (-89.468, -137.4)          # moon-south-pole reference point (pipeline/seed/targets_real.json)
JEZERO = (18.44, 77.45)
# JEZ_ctx_B_soc_008 grid as read from the GeoTIFF (origin x, origin y, res, width, height)
CTX_GRID = (4573663.250853, 1109693.140188, 20.0, 1596, 1512)

REPO = Path(__file__).resolve().parents[2]
META = REPO / "web" / "src" / "data" / "terrainPreviews.json"
PUBLIC = REPO / "web" / "public"


def ground_distance_m(lat1, lon1, lat2, lon2, radius_m):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * radius_m * math.asin(math.sqrt(a))


# --- projections ----------------------------------------------------------------------
def test_polar_stereo_inverse_round_trip():
    for lat, lon in [C1, fpt.SHACKLETON, (-88.0, 45.0), (-87.6, -170.0), (-89.0, 90.0)]:
        x, y = fpt.polar_stereo_south_forward(lat, lon, R_MOON)
        lat2, lon2 = mtp.polar_stereo_south_inverse(x, y, R_MOON)
        assert lat2 == pytest.approx(lat, abs=1e-9)
        assert lon2 == pytest.approx(lon, abs=1e-7)
    assert mtp.polar_stereo_south_inverse(0.0, 0.0, R_MOON) == (-90.0, 0.0)
    # lon 0 is +Y (image up), lon 90 E is +X (image right)
    assert mtp.polar_stereo_south_inverse(0.0, 1000.0, R_MOON)[1] == pytest.approx(0.0)
    assert mtp.polar_stereo_south_inverse(1000.0, 0.0, R_MOON)[1] == pytest.approx(90.0)


def test_polar_stereo_inverse_matches_proj():
    from rasterio.warp import transform

    for x, y in [(-10919.5, -11874.8), (7690.0, -6403.0), (-30000.0, 14000.0)]:
        (lon,), (lat,) = transform(mtp.MOON_PROJ4, "+proj=longlat +R=1737400 +no_defs", [x], [y])
        lat2, lon2 = mtp.polar_stereo_south_inverse(x, y, R_MOON)
        assert (lat2, lon2) == pytest.approx((lat, lon), abs=1e-7)


def test_eqc_matches_proj_and_round_trips():
    from rasterio.warp import transform

    (px,), (py,) = transform("+proj=longlat +R=3396190 +no_defs", mtp.MARS_PROJ4, [JEZERO[1]], [JEZERO[0]])
    x, y = mtp.eqc_forward(*JEZERO, R_MARS)
    assert (x, y) == pytest.approx((px, py), abs=0.01)
    assert mtp.eqc_inverse(x, y, R_MARS) == pytest.approx(JEZERO, abs=1e-9)


def test_pixel_mapping_orientation():
    bounds = (-100.0, -50.0, 100.0, 50.0)
    # top-left corner of the image is (xmin, ymax); rows grow toward -Y, columns toward +X
    assert mtp.map_to_px(-100.0, 50.0, bounds, 200, 100) == (0.0, 0.0)
    assert mtp.map_to_px(100.0, -50.0, bounds, 200, 100) == (200.0, 100.0)
    col, row = mtp.map_to_px(10.0, 20.0, bounds, 200, 100)
    assert (col, row) == pytest.approx((110.0, 30.0))
    assert mtp.px_to_map(col, row, bounds, 200, 100) == pytest.approx((10.0, 20.0))


# --- Moon geometry --------------------------------------------------------------------
def test_moon_window_and_marker():
    g = mtp.moon_geometry(*C1)
    assert (g["x"], g["y"]) == pytest.approx((-10919.5, -11874.8), abs=0.1)
    assert g["width"] == g["height"] == 833 and g["mpp"] == 60.0
    # 50 km x k around the target = rows 3136-5636, cols 1996-4496, trimmed to whole 3-px cells
    assert g["rows"] == (3136, 5635) and g["cols"] == (1996, 4495)
    xmin, ymin, xmax, ymax = g["bounds"]
    assert (xmax - xmin, ymax - ymin) == (833 * 60.0, 833 * 60.0)
    assert xmin < g["x"] < xmax and ymin < g["y"] < ymax          # contains the target
    assert xmin < 0.0 < xmax and ymin < 0.0 < ymax                # contains the pole (0, 0)
    sx, sy = fpt.polar_stereo_south_forward(*fpt.SHACKLETON, R_MOON)
    assert xmin < sx < xmax and ymin < sy < ymax                  # and Shackleton's centre
    assert sx > g["x"]                                            # Shackleton is right of the marker


def test_moon_marker_pixel_inverse_projects_to_target():
    g = mtp.moon_geometry(*C1)
    ov = mtp.overlay_geometry(g)
    col, row = ov["marker"]
    assert abs(col - 833 / 2) < 1.0 and abs(row - 833 / 2) < 1.0   # centred to within a pixel
    # continuous marker position -> map -> lat/lon: the target itself
    lat, lon = mtp.polar_stereo_south_inverse(*mtp.px_to_map(col, row, g["bounds"], 833, 833), R_MOON)
    assert ground_distance_m(lat, lon, *C1, R_MOON) < 0.01
    # centre of the pixel that holds the marker: within one 60 m pixel of the target
    cx, cy = math.floor(col) + 0.5, math.floor(row) + 0.5
    lat, lon = mtp.polar_stereo_south_inverse(*mtp.px_to_map(cx, cy, g["bounds"], 833, 833), R_MOON)
    assert ground_distance_m(lat, lon, *C1, R_MOON) < 60.0
    # treating the lunar coordinates as anything else moves it: the lon-mirrored point is far away
    mx, my = fpt.polar_stereo_south_forward(C1[0], -C1[1], R_MOON)
    mcol, _ = mtp.map_to_px(mx, my, g["bounds"], 833, 833)
    assert abs(mcol - col) > 300


def test_moon_scoring_square_is_the_scored_window():
    g = mtp.moon_geometry(*C1)
    # the window the relief value was measured in (test_planetary_terrain: rows 4136-4636, cols 2996-3496)
    assert g["scoring_rowcol"] == (4136, 4636, 2996, 3496)
    left, top, right, bottom = mtp.overlay_geometry(g)["square"]
    assert (right - left, bottom - top) == pytest.approx((10000.0 / 60.0, 10000.0 / 60.0))
    assert left == pytest.approx((2996 - 1996) / 3) and top == pytest.approx((4136 - 3136) / 3)
    col, row = mtp.overlay_geometry(g)["marker"]
    assert left < col < right and top < row < bottom


def test_scale_bar_length():
    assert mtp.scale_bar_px(10.0, 60.0) == pytest.approx(10000.0 / 60.0)
    g = mtp.moon_geometry(*C1)
    assert mtp.overlay_geometry(g)["bar_px"] == pytest.approx(mtp.SCALE_BAR_KM * 1000.0 / g["mpp"])
    lay = mtp.scale_bar_layout(833, 10000.0 / 60.0)
    assert lay["ticks"][1][2] - lay["ticks"][0][0] == pytest.approx(10000.0 / 60.0)   # tick outer ends
    bx0, by0, bx1, by1 = lay["backing"]
    assert 0 <= bx0 and bx1 < 833 / 2 and 833 / 2 < by0 and by1 <= 833                 # bottom-left corner


def test_drawn_scale_bar_and_marker():
    img = np.full((300, 400, 3), 0.5)
    lay = mtp.draw_overlays(img, marker=(250.25, 120.75), square=(200.0, 70.0, 300.0, 170.0), bar_px=166.67)
    white = img.min(axis=2)                       # 1.0 only where a light stroke fully covers
    # the bar: along its centre row the backing is 0.1 (0.5 darkened by the 0.8 halo) and the
    # bar 1.0, so the summed coverage inside the backing equals the bar length in pixels
    row = int((lay["bar"][1] + lay["bar"][3]) / 2)
    inside = white[row, 16:202]
    assert inside.min() == pytest.approx(0.1) and inside.max() == pytest.approx(1.0)
    assert ((inside - 0.1) / 0.9).sum() == pytest.approx(166.67, abs=0.01)
    # backing is dark (contrast for the light bar)
    assert img[int(lay["backing"][1]) + 3, int(lay["backing"][0]) + 3].max() < 0.2
    # ring centred on the marker: the light pixels' centroid is the marker position
    ys, xs = np.mgrid[100:142, 229:271]
    w = np.clip(white[100:142, 229:271] - 0.5, 0, None)
    assert (xs * w).sum() / w.sum() + 0.5 == pytest.approx(250.25, abs=0.3)
    assert (ys * w).sum() / w.sum() + 0.5 == pytest.approx(120.75, abs=0.3)
    # square outline: light on the edge, untouched well inside and outside (away from the ring)
    assert white[100, 200] > 0.9 and white[70, 250] > 0.9
    assert img[90, 215].tolist() == [0.5, 0.5, 0.5] and img[30, 30].tolist() == [0.5, 0.5, 0.5]


# --- hillshade: row-axis sign, craters must read as hollows --------------------------
def _surfaces(n=101, cell=60.0, depth=1200.0):
    rr, cc = np.mgrid[0:n, 0:n]
    r2 = ((rr - n // 2) ** 2 + (cc - n // 2) ** 2) * cell ** 2
    bump = depth * np.exp(-r2 / (2 * (12 * cell) ** 2))
    return -bump, bump, cell                      # bowl (hollow), dome


def test_hillshade_flat_and_range():
    flat = mtp.hillshade(np.zeros((20, 20)), 60.0)
    assert flat == pytest.approx(math.sin(math.radians(45.0)))
    bowl, dome, cell = _surfaces()
    for z in (bowl, dome):
        s = mtp.hillshade(z, cell)
        assert s.min() >= 0.0 and s.max() <= 1.0


def test_hillshade_bowl_is_dark_on_the_light_side_dome_is_lit():
    bowl, dome, cell = _surfaces()
    n = bowl.shape[0]
    c = n // 2
    d = 8                                         # a point on the wall, 8 px along each axis
    near = (c - d, c - d)                         # upper left = toward the light (azimuth 315)
    far = (c + d, c + d)                          # lower right = away from the light
    sb, sd = mtp.hillshade(bowl, cell), mtp.hillshade(dome, cell)
    flat = math.sin(math.radians(45.0))
    # hollow: the wall nearest the light faces away from it (dark); the far wall faces it (lit)
    assert sb[near] < flat - 0.1 < flat + 0.1 < sb[far]
    # dome: the opposite
    assert sd[near] > flat + 0.1 > flat - 0.1 > sd[far]
    # the two are mirror images, so a sign error in either axis would swap them
    assert sb[near] == pytest.approx(sd[far]) and sb[far] == pytest.approx(sd[near])


def test_hillshade_row_axis_sign():
    # A 45 deg plane that rises toward the TOP of the image (row 0 = +Y), so its surface faces
    # the bottom (-Y): square-on to a light at azimuth 180, edge-on to a light at azimuth 0.
    # With the row axis taken as +Y these two results would be swapped.
    rows = np.arange(50, dtype="float64")[:, None]
    up_slope = np.repeat((49 - rows) * 60.0, 50, axis=1)
    assert mtp.hillshade(up_slope, 60.0, azimuth_deg=180.0)[25, 25] == pytest.approx(1.0)   # faces -Y
    assert mtp.hillshade(up_slope, 60.0, azimuth_deg=0.0)[25, 25] == pytest.approx(0.0)
    # A plane rising toward the right faces left: lit from azimuth 270, dark from 90.
    right_slope = up_slope.T[:, ::-1]
    assert mtp.hillshade(right_slope, 60.0, azimuth_deg=270.0)[25, 25] == pytest.approx(1.0)
    assert mtp.hillshade(right_slope, 60.0, azimuth_deg=90.0)[25, 25] == pytest.approx(0.0)


def test_rendered_bowl_reads_as_hollow():
    bowl, dome, cell = _surfaces()
    n = bowl.shape[0]
    c, d = n // 2, 8
    far_off = (-50.0, -50.0)                       # keep the overlays away from the test pixels
    square = (-60.0, -60.0, -55.0, -55.0)
    lum = {}
    for name, z in (("bowl", bowl), ("dome", dome)):
        flat_colour = np.zeros_like(z)             # constant elevation tint: isolate the shading
        img = mtp.apply_shade(mtp.ramp_colours(flat_colour + 0.5, 0.0, 1.0), mtp.hillshade(z, cell))
        mtp.draw_overlays(img, far_off, square, 10.0)
        lum[name] = img.sum(axis=2)
    assert lum["bowl"][c - d, c - d] < lum["bowl"][c + d, c + d]
    assert lum["dome"][c - d, c - d] > lum["dome"][c + d, c + d]


# --- colour ramp ----------------------------------------------------------------------
def test_ramp_is_monotonic_in_lightness_and_covers_the_range():
    lum = [mtp.relative_luminance(mtp.hex_to_rgb(h)) for h in mtp.RAMP_HEX]
    assert all(b > a for a, b in zip(lum, lum[1:]))
    assert lum[-1] / lum[0] > 20                   # wide lightness span: readable without hue
    col = mtp.ramp_colours(np.array([-3000.0, -2981.0, 1958.0, 5000.0]), -2981.0, 1958.0)
    assert col[0].tolist() == col[1].tolist() == pytest.approx(mtp.hex_to_rgb(mtp.RAMP_HEX[0]))
    assert col[2].tolist() == col[3].tolist() == pytest.approx(mtp.hex_to_rgb(mtp.RAMP_HEX[-1]))
    leg = mtp.ramp_legend(-2981.0, 1958.0)
    assert leg[0] == [-2981.0, mtp.RAMP_HEX[0]] and leg[-1] == [1958.0, mtp.RAMP_HEX[-1]]
    assert [v for v, _ in leg] == sorted(v for v, _ in leg) and len(leg) == len(mtp.RAMP_HEX)
    # a legend stop's colour is what the ramp returns at that elevation
    mid = mtp.ramp_colours(np.array([leg[4][0]]), -2981.0, 1958.0)[0]
    assert mid.tolist() == pytest.approx(mtp.hex_to_rgb(leg[4][1]), abs=2e-3)


def test_flat_ground_keeps_the_legend_colour():
    rgb = mtp.ramp_colours(np.full((4, 4), 0.3), 0.0, 1.0)
    out = mtp.apply_shade(rgb, mtp.hillshade(np.zeros((4, 4)), 60.0))
    assert out == pytest.approx(rgb)


def test_render_counts_nodata_and_uses_neutral_colour():
    z = np.tile(np.linspace(0.0, 100.0, 60), (60, 1))
    z[5:8, 40:44] = np.nan
    rgb, info = mtp.render(z, 60.0, 60.0, marker=(10.0, 10.0), square=(2.0, 2.0, 20.0, 20.0), bar_px=10.0)
    assert rgb.shape == (60, 60, 3) and rgb.dtype == np.uint8
    assert info["nodata"] == 12 and (info["min"], info["max"]) == (0.0, 100.0)
    grey = [int(v * 255 + 0.5) for v in mtp.NODATA_RGB]
    assert rgb[6, 42].tolist() == grey


def test_resample_columns():
    a = np.tile(np.arange(10, dtype="float64"), (3, 1))           # value = source column index
    out = mtp.resample_columns(a, 5)
    assert out.shape == (3, 5)
    assert out[0].tolist() == pytest.approx([0.5, 2.5, 4.5, 6.5, 8.5])   # pixel-centre aligned
    assert mtp.resample_columns(a, 10).tolist() == a.tolist()


# --- Mars geometry (equirectangular, lat_ts = 0) --------------------------------------
def test_mars_geometry_square_on_the_ground():
    g = mtp.mars_geometry(*JEZERO, *CTX_GRID)
    coslat = math.cos(math.radians(JEZERO[0]))
    assert g["width"] == g["height"] and g["mpp"] == 60.0
    assert g["mpp_x"] == pytest.approx(60.0, rel=2e-3)            # square to 0.2 % after resampling
    # the source window is wider in map pixels than tall, by 1 / cos(lat)
    rows, cols = g["rows"][1] - g["rows"][0], g["cols"][1] - g["cols"][0]
    assert cols / rows == pytest.approx(1.0 / coslat, rel=2e-3)
    assert 0 <= g["rows"][0] and g["rows"][1] <= CTX_GRID[4] and 0 <= g["cols"][0] and g["cols"][1] <= CTX_GRID[3]
    assert not g["fits"] and g["width"] * 60.0 < 50000.0          # raster is smaller than 50 km
    ov = mtp.overlay_geometry(g)
    col, row = ov["marker"]
    assert abs(col - g["width"] / 2) < 1.0 and abs(row - g["height"] / 2) < 1.0
    lat, lon = mtp.eqc_inverse(*mtp.px_to_map(col, row, g["bounds"], g["width"], g["height"]), R_MARS)
    assert ground_distance_m(lat, lon, *JEZERO, R_MARS) < 0.01
    left, top, right, bottom = ov["square"]
    assert bottom - top == pytest.approx(10000.0 / 60.0, abs=0.01)                 # 10 km north-south
    assert (right - left) * g["mpp_x"] == pytest.approx(10000.0, abs=1.0)          # 10 km east-west
    assert ov["bar_px"] * g["mpp_x"] == pytest.approx(10000.0)


def test_mars_target_outside_raster_is_rejected():
    with pytest.raises(ValueError):
        mtp.mars_geometry(18.44, 78.5, *CTX_GRID)


# --- committed outputs ----------------------------------------------------------------
REQUIRED = ["targetId", "title", "image", "widthPx", "heightPx", "bytes", "sha256", "windowKm",
            "metresPerPixel", "mapBoundsM", "markerPx", "scoringWindowKm", "scaleBarKm", "projection",
            "orientation", "source", "elevation", "hillshade", "relief", "generatedAt", "script"]


def _entries():
    with open(META, encoding="utf-8") as f:
        return json.load(f)


def test_metadata_file_has_the_lunar_target():
    meta = _entries()
    assert "moon-south-pole" in meta
    assert set(meta) <= set(mtp.TARGETS)


@pytest.mark.parametrize("tid", sorted(mtp.TARGETS))
def test_metadata_entry_and_image(tid):
    meta = _entries()
    if tid not in meta:
        pytest.skip(f"no preview generated for {tid}")
    e = meta[tid]
    for key in REQUIRED:
        assert key in e, key
    assert e["targetId"] == tid and e["script"] == "pipeline/make_target_preview.py"
    # image: exists under web/public (never in the data bundle), size and hash match
    assert e["image"].startswith("previews/") and e["image"].endswith(".webp")
    data = (PUBLIC / e["image"]).read_bytes()
    assert len(data) == e["bytes"] <= 200_000
    assert hashlib.sha256(data).hexdigest() == e["sha256"]
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    # geometry is self-consistent
    w, h, mpp = e["widthPx"], e["heightPx"], e["metresPerPixel"]
    xmin, ymin, xmax, ymax = e["mapBoundsM"]
    assert e["windowKm"] == pytest.approx(w * e["pixelGroundM"][1] / 1000.0, abs=0.01)
    assert (ymax - ymin) / h == pytest.approx(mpp)
    assert e["scaleBarKm"] == 10 and e["scoringWindowKm"] == 10
    assert e["scaleBarPx"] == pytest.approx(10000.0 / mpp, abs=0.5)
    col, row = e["markerPx"]
    assert 0 < col < w and 0 < row < h
    left, top, right, bottom = e["scoringWindowPx"]
    assert left < col < right and top < row < bottom
    assert bottom - top == pytest.approx(10000.0 / mpp, abs=0.05)
    # marker pixel inverse-projects to the target (within one pixel) with the dataset's projection
    t = e["target"]
    x, y = mtp.px_to_map(col, row, e["mapBoundsM"], w, h)
    if tid == "moon-south-pole":
        assert "+proj=stere" in e["projection"]["proj4"] and "+R=1737400" in e["projection"]["proj4"]
        lat, lon = mtp.polar_stereo_south_inverse(x, y, R_MOON)
        assert ground_distance_m(lat, lon, t["lat"], t["lon"], R_MOON) < mpp
        assert xmin < 0.0 < xmax and ymin < 0.0 < ymax            # the pole is in the frame
        assert e["windowKm"] == pytest.approx(50.0, abs=0.1)
        assert e["relief"]["valueM"] == 1106.9 and e["relief"]["rangeM"] == [1093.4, 1125.0]
        assert "not the scored source" in e["crossCheck"]
        assert "synthetic illumination" in e["hillshade"]["note"]
    else:
        assert "+proj=eqc" in e["projection"]["proj4"] and "+R=3396190" in e["projection"]["proj4"]
        lat, lon = mtp.eqc_inverse(x, y, R_MARS)
        assert ground_distance_m(lat, lon, t["lat"], t["lon"], R_MARS) < mpp
        assert e["relief"]["valueM"] == 231.1 and e["relief"]["rangeM"] == [229.1, 252.0]
        assert e["windowNote"] and e["windowKm"] < 50.0
    assert (e["hillshade"]["azimuthDeg"], e["hillshade"]["altitudeDeg"], e["hillshade"]["vertExag"]) == (315.0, 45.0, 1.0)
    ramp = e["elevation"]["ramp"]
    assert ramp[0][0] == e["elevation"]["minM"] and ramp[-1][0] == e["elevation"]["maxM"]
    assert all(b[0] > a[0] for a, b in zip(ramp, ramp[1:]))
    assert e["elevation"]["nodataPixels"] == 0


def test_relief_is_copied_from_the_scoring_csv():
    import csv

    import config

    with open(config.PLANETARY_TERRAIN_CSV, newline="", encoding="utf-8") as f:
        rows = {r["target_id"]: r for r in csv.DictReader(f)}
    for tid, e in _entries().items():
        r = rows[tid]
        assert r["dem"] == mtp.TARGETS[tid]["product"]["dem"]     # image and score cite one dataset
        assert e["source"]["url"] == r["url"] and e["source"]["citation"] == r["citation"]
        assert e["relief"]["valueM"] == float(r["relief_m"])
        assert e["relief"]["rangeM"] == [float(r["relief_min_m"]), float(r["relief_max_m"])]


def test_script_never_writes_into_the_data_bundle():
    import config

    for p in (mtp.PREVIEW_DIR, mtp.META_JSON):
        assert config.BUNDLE_DIR not in p.parents and p != config.BUNDLE_DIR
        assert "public-mock" not in p.parts
    for cfg in mtp.TARGETS.values():
        assert cfg["image"].startswith("previews/")


# --- need the cached rasters (gitignored): skipped when absent ------------------------
def _cached(tid):
    return all((fpt.DL_DIR / n).exists() for n in mtp.TARGETS[tid]["needs"])


@pytest.mark.skipif(not _cached("moon-south-pole"), reason="cached LDEM_875S_20M not present")
def test_moon_render_from_raster_shows_shackleton_as_a_deep_hollow():
    entry, data, s = mtp.build_entry("moon-south-pole", write=False)
    z = s["z"]
    assert z.shape == (833, 833) and s["info"]["nodata"] == 0
    col, row = s["overlay"]["marker"]
    sh = next(lm for lm in entry["landmarks"] if lm["name"].startswith("Shackleton"))
    floor = z[int(sh["px"][1]), int(sh["px"][0])]
    ridge = z[int(row), int(col)]
    assert floor < -2500.0 and ridge > 1000.0                      # crater floor vs connecting ridge
    assert sh["px"][0] > col                                       # Shackleton right of the marker
    # same bytes as the committed image when it was made by this GDAL/libwebp build
    committed = _entries().get("moon-south-pole")
    assert committed and committed["widthPx"] == entry["widthPx"] and committed["markerPx"] == entry["markerPx"]
    assert len(data) <= 200_000


@pytest.mark.skipif(not _cached("mars-jezero"), reason="cached CTX DTM not present")
def test_mars_raster_grid_matches_the_test_constants():
    import rasterio

    with rasterio.open(fpt.DL_DIR / mtp.TARGETS["mars-jezero"]["raster"]) as ds:
        t = ds.transform
        assert (t.c, t.f, t.a, ds.width, ds.height) == pytest.approx(CTX_GRID, abs=1e-3)
