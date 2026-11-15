"""Offline terrain preview images for the planetary reference targets.

One-off script: NOT part of build_bundle.py and it never touches web/public/data or
web/public-mock. It reads the SAME cached rasters the relief score was measured on
(fetch_planetary_terrain.py), so the picture and the score cite one dataset, and writes

  web/public/previews/<target>-terrain.webp   shaded-relief image (target <= 200 KB)
  web/src/data/terrainPreviews.json           caption metadata, keyed by target id
                                              (imported statically by TerrainPreview.jsx)

Coordinates are planetary, never Earth WGS84 / Web Mercator:
  moon-south-pole  LOLA LDEM_875S_20M, south polar stereographic on the 1737.4 km
                   sphere, true scale at the pole, lon_0 = 0 (the dataset's own grid;
                   fetch_planetary_terrain.polar_stereo_south_forward). Height =
                   DN x 0.5 m above the sphere, label OFFSET not added, nodata -32768.
  mars-jezero      USGS Mars 2020 TRN CTX DTM, equirectangular lat_ts = 0, lon_0 = 0 on
                   the 3396.19 km sphere, MOLA-areoid heights. Map x is stretched by
                   1/cos(lat), so columns are resampled to square ground pixels.

Image: a window centred on the target (50 km where the raster allows; scaled by the
local projection scale factor like the scoring window), block-mean x3 from 20 m to
60 m per pixel, elevation tint (cividis-like, colour-blind-safe) blended with a
numpy hillshade (light from the upper left, 45 deg, no vertical exaggeration), then a
ring at the target, the 10 km x 10 km scoring window as a square outline and a 10 km
scale bar. No text is drawn; all wording lives in the JSON / HTML caption.

Usage (cwd = pipeline/):  python make_target_preview.py [--target ID ...]
Needs the cached rasters in data/downloads/planetary/ (python fetch_planetary_terrain.py).
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import sys
import warnings

import config
import fetch_planetary_terrain as fpt
import terrain_common as tc

WEB_DIR = config.ROOT.parent / "web"
PREVIEW_DIR = WEB_DIR / "public" / "previews"
META_JSON = WEB_DIR / "src" / "data" / "terrainPreviews.json"
SCRIPT_NAME = "pipeline/make_target_preview.py"
FETCH_SCRIPT = "pipeline/fetch_planetary_terrain.py"

PREVIEW_KM = 50.0                         # requested window width
BLOCK = 3                                 # 20 m -> 60 m per pixel
SCORING_KM = 2.0 * tc.WINDOW_HALF_KM      # the relief window (10 km)
SCALE_BAR_KM = 10.0
AZIMUTH_DEG = 315.0                       # light from the upper left of the image
ALTITUDE_DEG = 45.0
VERT_EXAG = 1.0
WEBP_QUALITY = 80
MAX_BYTES = 200_000

# LDEM_875S_20M grid (checked against the file when it is opened).
LOLA20_GRID = {"origin_x": -75840.0, "origin_y": 75840.0, "res_m": 20.0, "width": 7584, "height": 7584}
MOON_PROJ4 = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
MARS_PROJ4 = "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"

# Sequential, colour-blind-safe elevation ramp (low -> high). The ten stops follow the
# cividis colormap (Nunez, Anderton & Renslow 2018, PLoS ONE 13, e0199239); lightness
# increases monotonically, so the ramp also reads in greyscale.
RAMP_HEX = ["#00204d", "#00336f", "#39486b", "#575c6d", "#707173",
            "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#ffea46"]
NODATA_RGB = (0.82, 0.82, 0.82)           # neutral light grey, not on the ramp
STROKE_RGB = (1.0, 1.0, 1.0)
HALO_RGB = (0.0, 0.0, 0.0)
HALO_ALPHA = 0.8
AMBIENT = 0.35                            # brightness of a fully shadowed slope
HIGHLIGHT = 0.7                           # how far a sun-facing slope moves toward white

PGDA_CROSS_CHECK = (
    "Independent cross-check, not the scored source: NASA GSFC PGDA 'A New View of the Lunar South "
    "Pole from LOLA' (LDEM_80S_20MPP_ADJ; Barker et al. 2023, Planet. Sci. J. 4, 183, "
    "doi:10.3847/PSJ/acf3e1; https://pgda.gsfc.nasa.gov/products/90) uses the same projection, sphere "
    "and frame; in the 10 km scoring window its relief at ~200 m is 1106.8 m against 1106.9 m here "
    "(pixel differences: mean +0.40 m, RMS 1.34 m). Measured once by remote window reads during the "
    "source review; this script does not download or re-measure it."
)

RELIEF_NOTE = (
    "Copied from pipeline/data/planetary_terrain.csv, not recomputed: relief = 99th minus 1st percentile "
    "of elevation in the 10 km x 10 km window at a ~200 m posting; the range spans block alignment and "
    "the cross-check products."
)

TARGETS = {
    "moon-south-pole": {
        "kind": "moon_lola20",
        "raster": "ldem_875s_20m.lbl",
        "needs": ["ldem_875s_20m.lbl", "ldem_875s_20m.img"],
        "product": fpt.LOLA20,
        "image": "previews/moon-south-pole-terrain.webp",
        "title": "Terrain around the lunar south pole reference point",
        "short_name": "NASA LRO LOLA laser-altimeter elevations",
        # Checked in read_moon: Shackleton's gazetteer centre is a deep low right of the marker and
        # the pole is one crater radius (10 km) from that centre.
        "description": "The deep crater to the right of the marker is Shackleton; the south pole lies on its rim.",
        "orientation": (
            "Up is toward 0° E (the Moon's near side, facing Earth) and right is toward 90° E. The south "
            "pole is inside the frame, so every direction away from it is north and there is no single "
            "north arrow."
        ),
        "hillshade_note": (
            "synthetic illumination, not real lighting — at the pole the Sun is always near the horizon "
            "and crater floors shown lit here are permanently shadowed"
        ),
        "height_reference": (
            "height above the 1737.4 km reference sphere (DN x 0.5 m; the label OFFSET, the sphere "
            "radius, is not added)"
        ),
        "cross_check": PGDA_CROSS_CHECK,
    },
    "mars-jezero": {
        "kind": "mars_ctx_eqc",
        "raster": fpt.CTX["url"].rsplit("/", 1)[1],
        "needs": [fpt.CTX["url"].rsplit("/", 1)[1]],
        "product": fpt.CTX,
        "image": "previews/mars-jezero-terrain.webp",
        "title": "Terrain around the Jezero Crater reference point",
        "short_name": "the USGS Mars 2020 CTX stereo terrain model",
        "description": "The reference point is on the low crater floor; the ground rises to the west (left).",
        "orientation": (
            "North is up and east is right. The source grid is equirectangular with true scale at the "
            "equator, so its columns were resampled to make pixels square on the ground at the target "
            "latitude."
        ),
        "hillshade_note": (
            "synthetic illumination, not real lighting — the shading only shows which way slopes face; "
            "it is not the Sun direction of any image of Jezero"
        ),
        "height_reference": "height above the MOLA areoid, as supplied by the product",
        "cross_check": None,
    },
}


# --------------------------------------------------------------------------------------
# Pure geometry (unit-tested, no I/O)
# --------------------------------------------------------------------------------------
def polar_stereo_south_inverse(x, y, radius_m):
    """Inverse of fetch_planetary_terrain.polar_stereo_south_forward -> (lat, lon) degrees."""
    rho = math.hypot(x, y)
    lat = -90.0 + 2.0 * math.degrees(math.atan(rho / (2.0 * radius_m)))
    lon = math.degrees(math.atan2(x, y)) if rho > 0 else 0.0
    return lat, lon


def eqc_forward(lat, lon, radius_m):
    """Equirectangular, lat_ts = 0, lon_0 = 0 on a sphere -> (x, y) m."""
    return radius_m * math.radians(lon), radius_m * math.radians(lat)


def eqc_inverse(x, y, radius_m):
    return math.degrees(y / radius_m), math.degrees(x / radius_m)


def map_to_px(x, y, bounds, width, height):
    """Map metres -> continuous pixel (col, row) measured from the image's top-left corner.

    bounds = (xmin, ymin, xmax, ymax). Row 0 is the TOP edge (y = ymax): the row index
    increases toward -Y, the column index toward +X.
    """
    xmin, ymin, xmax, ymax = bounds
    return (x - xmin) / (xmax - xmin) * width, (ymax - y) / (ymax - ymin) * height


def px_to_map(col, row, bounds, width, height):
    xmin, ymin, xmax, ymax = bounds
    return xmin + col / width * (xmax - xmin), ymax - row / height * (ymax - ymin)


def scale_bar_px(km, metres_per_pixel):
    return km * 1000.0 / metres_per_pixel


def moon_geometry(lat, lon, preview_km=PREVIEW_KM, block=BLOCK, grid=None):
    """Preview window on the LDEM_875S_20M grid around (lat, lon). No raster needed.

    The half-width is preview_km / 2 x k (k = stereographic scale factor at the target),
    exactly as the scoring window is 5 km x k; the window is then trimmed to a whole
    number of `block`-pixel cells.
    """
    grid = grid or LOLA20_GRID
    ox, oy, res = grid["origin_x"], grid["origin_y"], grid["res_m"]
    x, y = fpt.polar_stereo_south_forward(lat, lon, fpt.R_MOON_M)
    k = fpt.polar_stereo_scale(lat)
    r0, r1, c0, c1 = fpt.stereo_window_rowcol(x, y, preview_km * 500.0 * k, ox, oy, res)
    if r0 < 0 or c0 < 0 or r1 > grid["height"] or c1 > grid["width"]:
        raise ValueError(f"preview window rows {r0}-{r1}, cols {c0}-{c1} is outside the LOLA grid")
    n = min(r1 - r0, c1 - c0) // block
    r1, c1 = r0 + n * block, c0 + n * block
    s0, s1, t0, t1 = fpt.stereo_window_rowcol(x, y, tc.WINDOW_HALF_KM * 1000.0 * k, ox, oy, res)
    return {
        "x": x, "y": y, "k": k, "rows": (r0, r1), "cols": (c0, c1), "src_cols": n * block,
        "width": n, "height": n, "mpp": res * block, "mpp_x": res * block,
        "bounds": (ox + c0 * res, oy - r1 * res, ox + c1 * res, oy - r0 * res),
        "scoring_bounds": (ox + t0 * res, oy - s1 * res, ox + t1 * res, oy - s0 * res),
        "scoring_rowcol": (s0, s1, t0, t1),
        "requested_km": preview_km, "fits": True,
    }


def mars_geometry(lat, lon, origin_x, origin_y, res, width, height, preview_km=PREVIEW_KM, block=BLOCK):
    """Largest square (on the ground) centred on (lat, lon) that fits an eqc lat_ts=0 raster.

    Rows are `res` m on the ground; columns are res x cos(lat) m, so the source window is
    wider in pixels than it is tall and is later resampled to `n` square output pixels.
    """
    x, y = eqc_forward(lat, lon, fpt.R_MARS_M)
    coslat = math.cos(math.radians(lat))
    col_t, row_t = (x - origin_x) / res, (origin_y - y) / res
    if not (0 <= col_t <= width and 0 <= row_t <= height):
        raise ValueError("target is outside the raster")
    fit_rows = min(row_t, height - row_t)                 # 1 row  = res m N-S
    fit_cols = min(col_t, width - col_t) * coslat         # 1 col  = res x cos(lat) m E-W
    half_rows = int(min(preview_km * 500.0 / res, fit_rows, fit_cols)) - block   # one-cell margin
    n = (2 * half_rows) // block
    r0 = int(round(row_t - n * block / 2.0))
    r1 = r0 + n * block
    m = int(round(n / coslat))                            # source cells across the same ground width
    c0 = int(round(col_t - m * block / 2.0))
    c1 = c0 + m * block
    if r0 < 0 or c0 < 0 or r1 > height or c1 > width:
        raise ValueError(f"preview window rows {r0}-{r1}, cols {c0}-{c1} is outside the raster")
    west, south, east, north = tc.window_bounds_deg(lat, lon, body="mars")
    xw, ys = eqc_forward(south, west, fpt.R_MARS_M)
    xe, yn = eqc_forward(north, east, fpt.R_MARS_M)
    return {
        "x": x, "y": y, "k": 1.0 / coslat, "rows": (r0, r1), "cols": (c0, c1), "src_cols": m * block,
        "width": n, "height": n, "mpp": res * block, "mpp_x": m * block * res * coslat / n,
        "bounds": (origin_x + c0 * res, origin_y - r1 * res, origin_x + c1 * res, origin_y - r0 * res),
        "scoring_bounds": (xw, ys, xe, yn),
        "requested_km": preview_km, "fits": n * block * res >= preview_km * 1000.0 - block * res,
    }


def overlay_geometry(geom):
    """Pixel positions of the marker, scoring square and scale bar for a geometry dict."""
    w, h, b = geom["width"], geom["height"], geom["bounds"]
    marker = map_to_px(geom["x"], geom["y"], b, w, h)
    sx0, sy0, sx1, sy1 = geom["scoring_bounds"]
    left, bottom = map_to_px(sx0, sy0, b, w, h)
    right, top = map_to_px(sx1, sy1, b, w, h)
    return {"marker": marker, "square": (left, top, right, bottom),
            "bar_px": scale_bar_px(SCALE_BAR_KM, geom["mpp_x"])}


# --------------------------------------------------------------------------------------
# Rendering (numpy only, unit-tested on synthetic arrays)
# --------------------------------------------------------------------------------------
def resample_columns(a, new_width):
    """Linear resample along columns to `new_width` (pixel-centre aligned)."""
    import numpy as np

    a = np.asarray(a, dtype="float64")
    src = a.shape[1]
    if src == new_width:
        return a
    pos = np.clip((np.arange(new_width) + 0.5) * (src / new_width) - 0.5, 0.0, src - 1.0)
    j0 = np.minimum(np.floor(pos).astype(int), src - 2)
    f = pos - j0
    return a[:, j0] * (1.0 - f) + a[:, j0 + 1] * f


def hillshade(z, cell_y_m, cell_x_m=None, azimuth_deg=AZIMUTH_DEG, altitude_deg=ALTITUDE_DEG, z_factor=VERT_EXAG):
    """Lambertian shade in [0, 1] of heights z[row, col]; flat ground = sin(altitude).

    Image convention: column index increases toward +X (right) but ROW index increases
    toward -Y (down), so dz/dy = -dz/drow. Azimuth is measured clockwise from image-up
    (+Y); 315 deg puts the light at the upper left. shade = n . L with the surface normal
    n = (-dz/dx, -dz/dy, 1) / |.| and L the unit vector toward the light, so a slope
    that faces the light is bright and a hollow is dark on its light-side wall.
    """
    import numpy as np

    z = np.asarray(z, dtype="float64")
    dz_drow, dz_dcol = np.gradient(z, float(cell_y_m), float(cell_x_m or cell_y_m))
    dzdx = dz_dcol * z_factor
    dzdy = -dz_drow * z_factor            # row index increases toward -Y
    az, alt = math.radians(azimuth_deg), math.radians(altitude_deg)
    lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
    shade = (-dzdx * lx - dzdy * ly + lz) / np.sqrt(1.0 + dzdx ** 2 + dzdy ** 2)
    return np.clip(shade, 0.0, 1.0)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def ramp_colours(values, vmin, vmax, ramp_hex=None):
    """Elevation -> RGB float array [..., 3] by linear interpolation between the ramp stops."""
    import numpy as np

    stops = np.array([hex_to_rgb(h) for h in (ramp_hex or RAMP_HEX)])
    t = np.clip((np.asarray(values, dtype="float64") - vmin) / max(vmax - vmin, 1e-9), 0.0, 1.0)
    pos = t * (len(stops) - 1)
    i0 = np.minimum(np.floor(pos).astype(int), len(stops) - 2)
    f = (pos - i0)[..., None]
    return stops[i0] * (1.0 - f) + stops[i0 + 1] * f


def ramp_legend(vmin, vmax, ramp_hex=None):
    """[[value_m, '#hex'], ...] for an HTML legend: the stops at evenly spaced elevations."""
    ramp = ramp_hex or RAMP_HEX
    n = len(ramp) - 1
    return [[round(vmin + (vmax - vmin) * i / n, 1), h] for i, h in enumerate(ramp)]


def relative_luminance(rgb):
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def apply_shade(rgb, shade, altitude_deg=ALTITUDE_DEG):
    """Blend tint and hillshade: flat ground keeps the legend colour exactly, slopes facing
    away darken to AMBIENT x colour, slopes facing the light move toward white."""
    import numpy as np

    m = shade / math.sin(math.radians(altitude_deg))          # 1.0 on flat ground
    out = rgb * (AMBIENT + (1.0 - AMBIENT) * np.clip(m, 0.0, 1.0))[..., None]
    hi = (np.clip(m - 1.0, 0.0, None) * HIGHLIGHT)[..., None]
    return np.clip(out + (1.0 - out) * hi, 0.0, 1.0)


def _pixel_centres(shape):
    import numpy as np

    rr, cc = np.mgrid[0:shape[0], 0:shape[1]]
    return rr + 0.5, cc + 0.5


def _blend(img, alpha, colour):
    import numpy as np

    img[:] = img * (1.0 - alpha[..., None]) + np.asarray(colour) * alpha[..., None]


def _stroke(dist, width):
    """Anti-aliased coverage of a stroke of `width` px around the zero line of `dist`."""
    import numpy as np

    return np.clip(width / 2.0 + 0.5 - np.abs(dist), 0.0, 1.0)


def _box(rr, cc, x0, y0, x1, y1):
    """Anti-aliased coverage of the filled box [x0, x1] x [y0, y1] (px from the top-left corner)."""
    import numpy as np

    return (np.clip(np.minimum(cc - x0, x1 - cc) + 0.5, 0.0, 1.0)
            * np.clip(np.minimum(rr - y0, y1 - rr) + 0.5, 0.0, 1.0))


def scale_bar_layout(height, bar_px, margin=16.0, pad=10.0, tick_h=13.0, thick=3.0):
    """Boxes of the scale bar in the bottom-left corner: backing, bar, two inward end ticks.

    The outer ends of the ticks are exactly bar_px apart."""
    back = (margin, height - margin - tick_h - 2 * pad, margin + bar_px + 2 * pad, height - margin)
    x0, x1 = margin + pad, margin + pad + bar_px
    yc = height - margin - pad - tick_h / 2.0
    return {
        "backing": back,
        "bar": (x0, yc - thick / 2.0, x1, yc + thick / 2.0),
        "ticks": [(x0, yc - tick_h / 2.0, x0 + thick, yc + tick_h / 2.0),
                  (x1 - thick, yc - tick_h / 2.0, x1, yc + tick_h / 2.0)],
    }


def draw_overlays(img, marker, square, bar_px, ring_radius=11.0, ring_width=3.0, square_width=2.0, halo=2.0):
    """Draw ring marker, scoring-window outline and scale bar onto float RGB img in place.

    Light strokes over a dark halo so they read on any background. Returns the scale-bar
    layout (pixel boxes)."""
    import numpy as np

    rr, cc = _pixel_centres(img.shape[:2])
    left, top, right, bottom = square
    # signed distance to the rectangle's edge (negative inside)
    d_sq = np.maximum(np.abs(cc - (left + right) / 2.0) - (right - left) / 2.0,
                      np.abs(rr - (top + bottom) / 2.0) - (bottom - top) / 2.0)
    d_centre = np.hypot(cc - marker[0], rr - marker[1])
    d_ring = d_centre - ring_radius
    # halos first, then strokes
    _blend(img, _stroke(d_sq, square_width + 2 * halo) * HALO_ALPHA, HALO_RGB)
    _blend(img, _stroke(d_ring, ring_width + 2 * halo) * HALO_ALPHA, HALO_RGB)
    _blend(img, np.clip(2.0 + halo + 0.5 - d_centre, 0.0, 1.0) * HALO_ALPHA, HALO_RGB)
    _blend(img, _stroke(d_sq, square_width), STROKE_RGB)
    _blend(img, _stroke(d_ring, ring_width), STROKE_RGB)
    _blend(img, np.clip(2.0 + 0.5 - d_centre, 0.0, 1.0), STROKE_RGB)          # centre dot
    lay = scale_bar_layout(img.shape[0], bar_px)
    _blend(img, _box(rr, cc, *lay["backing"]) * HALO_ALPHA, HALO_RGB)
    cover = _box(rr, cc, *lay["bar"])
    for t in lay["ticks"]:
        cover = np.maximum(cover, _box(rr, cc, *t))
    _blend(img, cover, STROKE_RGB)
    return lay


def render(z, cell_y_m, cell_x_m, marker, square, bar_px):
    """Heights (NaN = nodata) -> (uint8 RGB [H, W, 3], info dict)."""
    import numpy as np

    z = np.asarray(z, dtype="float64")
    valid = np.isfinite(z)
    if not valid.any():
        raise ValueError("no valid elevations in the preview window")
    zmin, zmax = float(z[valid].min()), float(z[valid].max())
    filled = np.where(valid, z, float(z[valid].mean()))
    shade = hillshade(filled, cell_y_m, cell_x_m)
    img = apply_shade(ramp_colours(filled, zmin, zmax), shade)
    img[~valid] = NODATA_RGB
    draw_overlays(img, marker, square, bar_px)
    rgb = np.floor(np.clip(img, 0.0, 1.0) * 255.0 + 0.5).astype("uint8")
    return rgb, {"min": zmin, "max": zmax, "nodata": int((~valid).sum())}


# --------------------------------------------------------------------------------------
# I/O
# --------------------------------------------------------------------------------------
def encode_webp(rgb, quality=WEBP_QUALITY):
    """uint8 RGB [H, W, 3] -> WebP bytes through rasterio's GDAL WEBP driver (in memory)."""
    import numpy as np
    from rasterio.io import MemoryFile

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")           # NotGeoreferencedWarning: it is a picture
        with MemoryFile() as mem:
            with mem.open(driver="WEBP", width=rgb.shape[1], height=rgb.shape[0], count=3,
                          dtype="uint8", QUALITY=str(quality)) as dst:
                dst.write(np.moveaxis(rgb, -1, 0))
            return mem.read()


def load_targets():
    with open(config.SEED_DIR / "targets_real.json", encoding="utf-8") as f:
        return {t["id"]: t for t in json.load(f)["targets"]}


def load_relief(target_id, expected_dem):
    """relief value/range copied from planetary_terrain.csv (never recomputed here)."""
    with open(config.PLANETARY_TERRAIN_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["target_id"] == target_id:
                if row["dem"] != expected_dem:
                    raise SystemExit(f"{target_id}: planetary_terrain.csv scores {row['dem']}, "
                                     f"but this preview reads {expected_dem}")
                return {"valueM": float(row["relief_m"]),
                        "rangeM": [float(row["relief_min_m"]), float(row["relief_max_m"])],
                        "note": RELIEF_NOTE}
    raise SystemExit(f"{target_id}: no row in planetary_terrain.csv (run {FETCH_SCRIPT})")


def read_moon(cfg, target):
    """(60 m heights, geometry, projection dict, source extras, landmarks) for the LOLA target."""
    import numpy as np
    import rasterio
    from rasterio.warp import transform as wtransform

    lat, lon = target["lat"], target["lon"]
    dl = fpt.DL_DIR
    with rasterio.open(dl / cfg["raster"]) as ds:
        crs, t = ds.crs.to_dict(), ds.transform
        # the same georeferencing checks as the scoring code (fetch_planetary_terrain.moon_rows)
        assert crs.get("proj") == "stere" and float(crs.get("lat_0")) == -90.0 \
            and float(crs.get("lat_ts", -90.0)) == -90.0 and float(crs.get("lon_0", 0.0)) == 0.0 \
            and float(crs.get("R")) == fpt.R_MOON_M, crs
        g = LOLA20_GRID
        assert (t.a, t.e, t.c, t.f, ds.width, ds.height) == \
            (g["res_m"], -g["res_m"], g["origin_x"], g["origin_y"], g["width"], g["height"]), t
        assert float(ds.scales[0]) == 0.5 and float(ds.offsets[0]) == fpt.R_MOON_M, (ds.scales, ds.offsets)
        geom = moon_geometry(lat, lon)
        (px_,), (py_,) = wtransform(f"+proj=longlat +R={fpt.R_MOON_M} +no_defs", ds.crs, [lon], [lat])
        assert abs(px_ - geom["x"]) < 0.01 and abs(py_ - geom["y"]) < 0.01, (px_, py_, geom["x"], geom["y"])
        dn = ds.read(1, window=(geom["rows"], geom["cols"]), masked=True)
        h = dn.astype("float64").filled(np.nan) * float(ds.scales[0])     # HEIGHT = DN x 0.5, no OFFSET
    lbl = fpt.parse_pds_label((dl / cfg["raster"]).read_text(encoding="ascii", errors="replace"))
    frame = lbl["COORDINATE_SYSTEM_NAME"]
    z = tc.block_mean(h, BLOCK, BLOCK)
    projection = {
        "proj4": MOON_PROJ4,
        "frame": f"{frame} (Moon mean-Earth / polar-axis body-fixed frame)",
        "note": (f"South polar stereographic on the 1737.4 km sphere, true scale at the pole, central "
                 f"longitude 0, read from the dataset's own label. Lunar latitude/longitude were projected "
                 f"with this projection (never as Earth WGS84). Scale factor at the target {geom['k']:.6f}, "
                 f"so map metres equal ground metres to within 0.03 % across the image."),
    }
    extras = {
        "release": f"PDS {lbl['DATA_SET_ID']}, product {lbl['PRODUCT_VERSION_ID']} ({lbl['PRODUCT_CREATION_TIME']})",
        "dataset": "LRO LOLA LDEM_875S_20M (Lunar Orbiter Laser Altimeter gridded elevation, 87.5° S to the pole)",
    }
    w, hh, b = geom["width"], geom["height"], geom["bounds"]
    sx, sy = fpt.polar_stereo_south_forward(fpt.SHACKLETON[0], fpt.SHACKLETON[1], fpt.R_MOON_M)
    landmarks = [
        {"name": "Shackleton crater (centre)", "lat": fpt.SHACKLETON[0], "lon": fpt.SHACKLETON[1],
         "px": [round(v, 1) for v in map_to_px(sx, sy, b, w, hh)],
         "source": "USGS Gazetteer of Planetary Nomenclature, Feature 5450 (diameter 20.92 km)"},
        {"name": "South pole", "lat": -90.0, "lon": 0.0,
         "px": [round(v, 1) for v in map_to_px(0.0, 0.0, b, w, hh)], "source": "projection origin"},
    ]
    (scol, srow), (pcol, prow) = landmarks[0]["px"], landmarks[1]["px"]
    mcol, mrow = map_to_px(geom["x"], geom["y"], b, w, hh)
    assert scol > mcol and z[int(srow), int(scol)] < -2000.0 < 0.0 < z[int(mrow), int(mcol)],         "Shackleton is not a deep low right of the marker: orientation is wrong"
    rim_km = math.hypot(scol - pcol, srow - prow) * geom["mpp"] / 1000.0
    assert abs(rim_km - 20.92 / 2.0) < 1.5, rim_km          # pole on Shackleton's rim
    return z, geom, projection, extras, landmarks


def read_mars(cfg, target):
    """(60 m heights with square ground pixels, geometry, projection, extras, landmarks) for Jezero."""
    import numpy as np
    import rasterio
    from rasterio.warp import transform as wtransform

    lat, lon = target["lat"], target["lon"]
    with rasterio.open(fpt.DL_DIR / cfg["raster"]) as ds:
        crs, t = ds.crs.to_dict(), ds.transform
        assert crs.get("proj") == "eqc" and float(crs.get("lat_ts", 0.0)) == 0.0 \
            and float(crs.get("lon_0", 0.0)) == 0.0 and float(crs.get("R")) == fpt.R_MARS_M, crs
        assert abs(t.a + t.e) < 1e-9 and t.b == 0.0 and t.d == 0.0, t
        geom = mars_geometry(lat, lon, t.c, t.f, t.a, ds.width, ds.height)
        (px_,), (py_,) = wtransform(f"+proj=longlat +R={fpt.R_MARS_M} +no_defs", ds.crs, [lon], [lat])
        assert abs(px_ - geom["x"]) < 0.01 and abs(py_ - geom["y"]) < 0.01, (px_, py_, geom["x"], geom["y"])
        h = ds.read(1, window=(geom["rows"], geom["cols"]), masked=True).astype("float64").filled(np.nan)
        raster_km = (ds.width * t.a / 1000.0, ds.height * t.a / 1000.0)
        frame = ds.crs.to_wkt().split('GEOGCS["', 1)[1].split('"', 1)[0]
        assert frame == "GCS_Mars_2000_Sphere", frame
        res = t.a
    z = resample_columns(tc.block_mean(h, BLOCK, BLOCK), geom["width"])
    # backs the caption sentence: the western (left) edge is higher than the target
    mcol, mrow = map_to_px(geom["x"], geom["y"], geom["bounds"], geom["width"], geom["height"])
    assert np.nanmedian(z[:, :20]) > z[int(mrow), int(mcol)] + 200.0 > np.nanmedian(z[:, -20:]),         "ground does not rise to the west of the target"
    coslat = math.cos(math.radians(lat))
    projection = {
        "proj4": MARS_PROJ4,
        "frame": f"{frame} (IAU Mars 2000 body-fixed frame on a 3396.19 km sphere, as named in the file's CRS)",
        "note": (f"Equirectangular with true scale at the equator, read from the GeoTIFF's own CRS. Martian "
                 f"latitude/longitude were projected with it (never as Earth WGS84). At the target latitude a "
                 f"{res:.0f} m map pixel is {res:.0f} m north–south but {res * coslat:.2f} m east–west, so "
                 f"columns were linearly resampled by cos(latitude) = {coslat:.4f} to square "
                 f"{geom['mpp']:.0f} m ground pixels ({geom['mpp_x']:.2f} m east–west after rounding)."),
    }
    extras = {
        "release": "Mars 2020 Terrain Relative Navigation CTX DTM mosaic, USGS Astrogeology (file JEZ_ctx_B_soc_008)",
        "dataset": "USGS Mars 2020 TRN CTX DTM mosaic JEZ_ctx_B_soc_008 (stereo-derived elevation of Jezero Crater)",
        "window_note": (f"The DTM covers only about {raster_km[0]:.0f} x {raster_km[1]:.0f} km in map units, "
                        f"so the view is the largest square centred on the target that fits "
                        f"({geom['width'] * geom['mpp'] / 1000.0:.1f} km), not 50 km."),
    }
    return z, geom, projection, extras, []


READERS = {"moon_lola20": read_moon, "mars_ctx_eqc": read_mars}


def build_entry(target_id, write=True):
    """Render one target. Returns (metadata entry without generatedAt, webp bytes, summary dict)."""
    cfg = TARGETS[target_id]
    missing = [n for n in cfg["needs"] if not (fpt.DL_DIR / n).exists()]
    if missing:
        raise SystemExit(f"{target_id}: cached raster missing ({', '.join(missing)}). "
                         f"Run {FETCH_SCRIPT} first; this script never downloads.")
    target = load_targets()[target_id]
    prod = cfg["product"]
    relief = load_relief(target_id, prod["dem"])
    z, geom, projection, extras, landmarks = READERS[cfg["kind"]](cfg, target)
    assert z.shape == (geom["height"], geom["width"]), (z.shape, geom["height"], geom["width"])
    ov = overlay_geometry(geom)
    rgb, info = render(z, geom["mpp"], geom["mpp_x"], ov["marker"], ov["square"], ov["bar_px"])
    data = encode_webp(rgb)
    if len(data) > MAX_BYTES:
        raise SystemExit(f"{target_id}: image is {len(data)} bytes, over the {MAX_BYTES} byte budget")
    if write:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        (WEB_DIR / "public" / cfg["image"]).write_bytes(data)
    width_km = geom["width"] * geom["mpp_x"] / 1000.0
    lon_e = target["lon"] % 360.0
    entry = {
        "targetId": target_id,
        "title": cfg["title"],
        "description": cfg["description"],
        "image": cfg["image"],
        "widthPx": geom["width"],
        "heightPx": geom["height"],
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "windowKm": round(width_km, 2),
        "requestedWindowKm": geom["requested_km"],
        "windowNote": extras.get("window_note"),
        "metresPerPixel": round(geom["mpp"], 3),
        "pixelGroundM": [round(geom["mpp"], 3), round(geom["mpp_x"], 3)],     # [north-south or Y, east-west or X]
        "mapBoundsM": [round(v, 3) for v in geom["bounds"]],
        "markerPx": [round(v, 2) for v in ov["marker"]],
        "scoringWindowKm": SCORING_KM,
        "scoringWindowPx": [round(v, 2) for v in ov["square"]],
        "scaleBarKm": SCALE_BAR_KM,
        "scaleBarPx": round(ov["bar_px"], 2),
        "pixelOrigin": "markerPx, scoringWindowPx [left, top, right, bottom] and landmark px are measured "
                       "in image pixels from the top-left corner",
        "target": {
            "name": target["name"], "lat": target["lat"], "lon": target["lon"],
            "lonEast360": round(lon_e, 3), "mapXM": round(geom["x"], 1), "mapYM": round(geom["y"], 1),
            "coordSource": target["coord"]["source"],
        },
        "projection": projection,
        "orientation": cfg["orientation"],
        "source": {
            "shortName": cfg["short_name"],
            "dataset": extras["dataset"],
            "release": extras["release"],
            "url": prod["url"],
            "landingUrl": prod["url"].rsplit("/", 1)[0] + "/",
            "nativePostingM": 20.0,
            "aggregation": (f"box mean {BLOCK} x {BLOCK} from 20 m to {geom['mpp']:.0f} m per pixel"
                            + (", then columns resampled to square ground pixels"
                               if geom["src_cols"] != geom["width"] * BLOCK else "")),
            "heightReference": cfg["height_reference"],
            "citation": prod["citation"],
        },
        "elevation": {
            "minM": round(info["min"], 1),
            "maxM": round(info["max"], 1),
            "ramp": ramp_legend(info["min"], info["max"]),
            "rampName": "cividis (colour-blind-safe, lightness increases with elevation)",
            "note": f"range of the {geom['mpp']:.0f} m block means shown in the image",
            "nodataPixels": info["nodata"],
        },
        "hillshade": {"azimuthDeg": AZIMUTH_DEG, "altitudeDeg": ALTITUDE_DEG, "vertExag": VERT_EXAG,
                      "note": cfg["hillshade_note"]},
        "relief": relief,
        "landmarks": landmarks,
        "crossCheck": cfg["cross_check"],
        "script": SCRIPT_NAME,
    }
    summary = {"z": z, "geom": geom, "overlay": ov, "info": info, "rgb": rgb}
    return entry, data, summary


def merge_metadata(entries, path=None, now=None):
    """Write the metadata file, keeping other targets and an unchanged entry's generatedAt."""
    path = path or META_JSON
    old = {}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    now = now or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    out = dict(old)
    for tid, entry in entries.items():
        prev = old.get(tid)
        same = prev is not None and {k: v for k, v in prev.items() if k != "generatedAt"} == \
            json.loads(json.dumps(entry))
        out[tid] = {**entry, "generatedAt": prev["generatedAt"] if same else now}
    out = {tid: out[tid] for tid in sorted(out)}
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--target", action="append", choices=sorted(TARGETS),
                    help="target id (repeatable); default: every configured target")
    args = ap.parse_args(argv)
    entries = {}
    for tid in args.target or sorted(TARGETS):
        entry, data, s = build_entry(tid)
        entries[tid] = entry
        g, ov = s["geom"], s["overlay"]
        print(f"{tid}: {entry['widthPx']}x{entry['heightPx']} px, {entry['metresPerPixel']} m/px, "
              f"{entry['windowKm']} km, {entry['bytes']} bytes WebP q{WEBP_QUALITY}")
        print(f"   target map x={g['x']:.1f} m, y={g['y']:.1f} m; rows {g['rows'][0]}-{g['rows'][1]}, "
              f"cols {g['cols'][0]}-{g['cols'][1]}; marker px ({ov['marker'][0]:.2f}, {ov['marker'][1]:.2f})")
        print(f"   scoring square px {[round(v, 1) for v in ov['square']]}; scale bar {ov['bar_px']:.2f} px")
        print(f"   elevation {entry['elevation']['minM']} to {entry['elevation']['maxM']} m; "
              f"nodata pixels {entry['elevation']['nodataPixels']}; relief (from CSV) "
              f"{entry['relief']['valueM']} m, range {entry['relief']['rangeM']}")
        for lm in entry["landmarks"]:
            col, row = lm["px"]
            inside = 0 <= col < entry["widthPx"] and 0 <= row < entry["heightPx"]
            elev = f"{s['z'][int(row), int(col)]:.0f} m" if inside else "outside the image"
            print(f"   landmark {lm['name']}: px ({col}, {row}), elevation {elev}")
        print(f"   wrote web/public/{entry['image']}")
    merge_metadata(entries)
    print("wrote web/src/data/terrainPreviews.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
