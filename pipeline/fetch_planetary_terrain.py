"""Terrain relief for the real planetary targets -> data/planetary_terrain.csv.

Same metric as the Earth sites (terrain_common): relief = P99 - P1 of elevation
in a 10 km x 10 km window centred on the target, reported
  * at native posting (relief_native_m), and
  * at the COMMON ~200 m posting (relief_m), via terrain_common.common_scale_relief
    (box-mean aggregation by integer factors of the native ground pixel size).

Products (public, no login):
  mars-jezero      primary  USGS Mars 2020 TRN CTX DTM mosaic, 20 m, equirectangular
                   cross    HRSC-MOLA Blended DEM v2, 200 m (remote window read)
                   cross    MOLA MEGDR 128 ppd (463 m) -- too coarse for 200 m; reported,
                            not used in the relief_min/max product range
  moon-south-pole  primary  LOLA LDEM_875S_20M, 20 m, south polar stereographic
                   cross    LOLA LDEM_875S_5M, 5 m (HTTP byte-range read of window rows)

Window definitions
  Mars (equirectangular products): degrees from terrain_common.window_bounds_deg(body='mars'),
  i.e. +/-5 km on a 3396.19 km sphere, transformed to each product's CRS.
  Moon (polar stereographic): +/-5000 m x k in map coordinates around the target's
  map x/y, where k = 2 / (1 + sin|lat|) is the stereographic scale factor (true scale
  at the pole); k ~ 1.00002 at the target.

Heights: Mars heights are relative to the MOLA areoid (all three products); Moon
heights are DN x SCALING_FACTOR (0.5 m) relative to the 1737.4 km reference sphere
(the label's OFFSET is the sphere radius and is NOT added). No elevation range filter
is applied, so negative heights are valid (only nodata/non-finite are excluded).

Usage (cwd = pipeline/):  python fetch_planetary_terrain.py [--skip-megdr] [--skip-5m]
Downloads go to data/downloads/planetary/ (gitignored); existing files whose size
matches the server's Content-Length are reused.
"""
import argparse
import csv
import datetime as dt
import json
import math
import re
import sys
import time
from pathlib import Path

import config
import terrain_common as tc

DL_DIR = config.DATA_DIR / "downloads" / "planetary"
OUT_CSV = config.PLANETARY_TERRAIN_CSV
TARGETS_JSON = config.SEED_DIR / "targets_real.json"

OUT_COLUMNS = ["target_id", "dem", "dem_label", "citation", "url", "posting_native_m",
               "relief_native_m", "relief_m", "median_elev_m", "cross_checks",
               "relief_min_m", "relief_max_m", "note", "retrieved_at"]

R_MARS_M = tc.RADIUS_KM["mars"] * 1000.0   # 3396190 m, = CTX / HRSC CRS radius
R_MOON_M = tc.RADIUS_KM["moon"] * 1000.0   # 1737400 m, = LOLA polar CRS radius

# Products ---------------------------------------------------------------------------
CTX = {
    "dem": "M2020_TRN_CTX_DTM_JEZ_B_soc_008",
    "label": "USGS Mars 2020 TRN CTX DTM mosaic (JEZ_ctx_B_soc_008, 20 m, MOLA-areoid heights)",
    "url": "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/"
           "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
    "citation": "Fergason, R.L., Hare, T.M., Mayer, D.P., et al. 2020, Mars 2020 Terrain Relative "
                "Navigation Flight Product Generation: Digital Terrain Model and Orthorectified Image "
                "Mosaics, 51st LPSC, abstract #2020 (ADS 2020LPI....51.2020F)",
}
HRSC = {
    "dem": "HRSC_MOLA_Blend_v2_200m",
    "label": "HRSC-MOLA Blended DEM Global 200 m v2",
    "url": "https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/"
           "Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif",
    "citation": "Fergason, R.L., Hare, T.M., & Laura, J. 2018, HRSC and MOLA Blended Digital Elevation "
                "Model at 200m v2, Astrogeology PDS Annex, USGS",
}
HRSC_S3 = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/HRSC_MOLA_Blend/"
           "Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif")
MEGDR_BASE = "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/"
MEGDR = {
    "dem": "MOLA_MEGDR_128ppd_megt44n000hb",
    "label": "MOLA MEGDR 128 pix/deg (~463 m), megt44n000hb",
    "url": MEGDR_BASE + "megt44n000hb.img",
    "citation": "Smith, D.E., et al. 2001, JGR 106(E10), 23689, doi:10.1029/2000JE001364 (MOLA); "
                "PDS MGS-M-MOLA-5-MEGDR-L3-V1.0",
}
LOLA_BASE = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
             "data/lola_gdr/polar/img/")
LOLA20 = {
    "dem": "LOLA_LDEM_875S_20M",
    "label": "LRO LOLA LDEM_875S_20M (20 m, south polar stereographic, product V2.0 2017-06-15)",
    "url": LOLA_BASE + "ldem_875s_20m.img",
    "citation": "Smith, D.E., et al. 2010, Initial observations from the Lunar Orbiter Laser Altimeter "
                "(LOLA), GRL 37, L18204, doi:10.1029/2010GL043751; PDS LRO-L-LOLA-4-GDR-V1.0",
}
LOLA5 = {
    "dem": "LOLA_LDEM_875S_5M",
    "label": "LRO LOLA LDEM_875S_5M (5 m, same release)",
    "url": LOLA_BASE + "ldem_875s_5m.img",
}

# Orientation check for the polar grid: USGS Gazetteer of Planetary Nomenclature,
# Feature 5450 (Shackleton): centre 89.67 S, 129.78 E, diameter 20.92 km.
SHACKLETON = (-89.67, 129.78)


# --------------------------------------------------------------------------------------
# Pure geometry (unit-tested, no I/O)
# --------------------------------------------------------------------------------------
def polar_stereo_south_forward(lat, lon, radius_m):
    """South-polar stereographic (sphere, true scale at the pole, lon_0 = 0) -> (x, y) m.

    PDS / PROJ convention: rho = 2R tan(pi/4 + lat/2) (lat < 0), x = rho sin(lon), y = rho cos(lon).
    """
    rho = 2.0 * radius_m * math.tan(math.pi / 4.0 + math.radians(lat) / 2.0)
    lam = math.radians(lon)
    return rho * math.sin(lam), rho * math.cos(lam)


def polar_stereo_scale(lat):
    """Point scale factor of a polar stereographic projection true at the pole."""
    return 2.0 / (1.0 + math.sin(math.radians(abs(lat))))


def stereo_window_rowcol(x, y, half_m, origin_x, origin_y, res_m):
    """(row0, row1, col0, col1) half-open pixel window covering x +/- half, y +/- half.

    Grid: north-up, col = (X - origin_x) / res, row = (origin_y - Y) / res.
    """
    c0 = int(round((x - half_m - origin_x) / res_m))
    c1 = int(round((x + half_m - origin_x) / res_m))
    r0 = int(round((origin_y - (y + half_m)) / res_m))
    r1 = int(round((origin_y - (y - half_m)) / res_m))
    return r0, r1, c0, c1


def ground_pixel_m(res_x, res_y, lat, crs_kind, radius_m):
    """(pixel_y_m, pixel_x_m) ground size of a pixel at latitude `lat`.

    crs_kind 'geographic': res in degrees on a sphere of radius_m.
    crs_kind 'eqc':        equirectangular with lat_ts = 0 (map metres true at the equator).
    """
    coslat = math.cos(math.radians(lat))
    if crs_kind == "geographic":
        m_per_deg = math.pi * radius_m / 180.0
        return abs(res_y) * m_per_deg, abs(res_x) * m_per_deg * coslat
    if crs_kind == "eqc":
        return abs(res_y), abs(res_x) * coslat
    raise ValueError(f"unsupported crs kind {crs_kind!r}")


def window_relief(heights, pixel_y_m, pixel_x_m, nodata=None):
    """Native and ~200 m relief of a height window (negative heights are valid data).

    Returns dict(native, median, frac, common, common_median, common_frac, posting).
    """
    native, median, frac = tc.relief_stats(heights, nodata=nodata)
    d = tc.common_scale_relief_detail(heights, pixel_y_m, pixel_x_m, nodata=nodata)
    return {"native": native, "median": median, "frac": frac,
            "common": d["relief"], "common_median": d["median"], "common_frac": d["valid_frac"],
            "common_min": d["relief_min"], "common_max": d["relief_max"], "posting": d["posting"]}


def parse_pds_label(text):
    """Minimal PDS3 keyword reader: {KEY: first value string} for top-level `KEY = value` lines."""
    out = {}
    for m in re.finditer(r"^\s*([A-Z_^]+)\s*=\s*\"?([^\"\r\n]*?)\"?\s*(?:<[^>]*>)?\s*$", text, re.M):
        out.setdefault(m.group(1), m.group(2).strip())
    return out


# --------------------------------------------------------------------------------------
# I/O helpers
# --------------------------------------------------------------------------------------
def _session():
    import requests

    s = requests.Session()
    s.headers["User-Agent"] = "earth-analog-finder-pipeline/1.0"
    return s


def download(url, dest, session=None):
    """Download url -> dest unless dest exists with the server's Content-Length. Returns status."""
    s = session or _session()
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    expected = None
    try:
        h = s.head(url, allow_redirects=True, timeout=60)
        if h.ok and h.headers.get("Content-Length"):
            expected = int(h.headers["Content-Length"])
    except Exception:  # noqa: BLE001 - HEAD is only a size check
        pass
    if dest.exists() and dest.stat().st_size > 0 and (expected is None or dest.stat().st_size == expected):
        return "cached" + ("" if expected else " (size unverified)")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with s.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    if expected is not None and tmp.stat().st_size != expected:
        raise IOError(f"{url}: got {tmp.stat().st_size} bytes, expected {expected}")
    tmp.replace(dest)
    return "downloaded"


def download_range(url, dest, start, length, session=None):
    """HTTP byte-range read of [start, start+length) -> dest (cached by exact size)."""
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size == length:
        return "cached"
    s = session or _session()
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    hdr = {"Range": f"bytes={start}-{start + length - 1}"}
    with s.get(url, headers=hdr, stream=True, timeout=600) as r:
        if r.status_code != 206:
            raise IOError(f"{url}: range request returned HTTP {r.status_code}, not 206")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    if tmp.stat().st_size != length:
        raise IOError(f"{url}: got {tmp.stat().st_size} bytes, expected {length}")
    tmp.replace(dest)
    return "downloaded"


def _crs_kind_and_radius(crs):
    d = crs.to_dict()
    radius = d.get("R") or d.get("a")
    if crs.is_geographic:
        return "geographic", radius
    if d.get("proj") == "eqc" and float(d.get("lat_ts", 0)) == 0.0:
        return "eqc", radius
    raise ValueError(f"unsupported CRS {crs.to_proj4()}")


def read_geo_window(path, lat, lon, body, band=1):
    """Read the 10 km window around (lat, lon) from a geographic/eqc raster.

    Returns (heights float64 with NaN for nodata, pixel_y_m, pixel_x_m, info dict).
    """
    import numpy as np
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds

    body_r = tc.RADIUS_KM[body] * 1000.0
    with rasterio.open(path) as ds:
        kind, crs_r = _crs_kind_and_radius(ds.crs)
        geo = CRS.from_proj4(f"+proj=longlat +R={crs_r or body_r} +no_defs")
        west, south, east, north = tc.window_bounds_deg(lat, lon, body=body)
        b = transform_bounds(geo, ds.crs, west, south, east, north, densify_pts=21)
        win = from_bounds(*b, transform=ds.transform).round_offsets().round_lengths()
        if win.col_off < 0 or win.row_off < 0 or win.col_off + win.width > ds.width \
                or win.row_off + win.height > ds.height:
            raise ValueError(f"window {win} outside raster {ds.width}x{ds.height}")
        a = ds.read(band, window=win, masked=True).astype("float64").filled(np.nan)
        py, px = ground_pixel_m(ds.transform.a, ds.transform.e, lat, kind, body_r)
        info = {"crs": ds.crs.to_proj4(), "window": (int(win.row_off), int(win.col_off),
                int(win.height), int(win.width)), "res": (ds.transform.a, ds.transform.e)}
    return a, py, px, info


def _fmt(v, nd=1):
    return "" if v is None else f"{v:.{nd}f}"


# --------------------------------------------------------------------------------------
# Mars: Jezero
# --------------------------------------------------------------------------------------
def mars_rows(target, skip_megdr=False, session=None):
    import numpy as np
    import rasterio

    lat, lon = target["lat"], target["lon"]
    notes, cross, common_vals = [], [], []

    # Primary: CTX TRN DTM (local download, ~9.7 MB)
    ctx_path = DL_DIR / CTX["url"].rsplit("/", 1)[1]
    primary = None
    try:
        st = download(CTX["url"], ctx_path, session)
        a, py, px, info = read_geo_window(ctx_path, lat, lon, "mars")
        primary = window_relief(a, py, px)
        primary["shape"] = a.shape
        notes.append(f"CTX {st}; window {a.shape[0]}x{a.shape[1]} px, ground pixel "
                     f"{py:.2f} m N-S x {px:.2f} m E-W (eqc lat_ts=0, R=3396190 m); "
                     f"~200 m posting = block-mean to {primary['posting'][0]} x {primary['posting'][1]} m; "
                     f"valid {primary['frac']:.1%}")
        if primary["common"] is not None:
            common_vals.append(primary["common"])
    except Exception as e:  # noqa: BLE001
        notes.append(f"CTX primary failed: {e}")

    # Cross-check 1: HRSC-MOLA blend v2 (remote window read of an 11 GB GeoTIFF)
    # The file is stored as one-row strips, so the read is ~50 row-sized HTTP ranges; it
    # occasionally fails mid-way, hence a few whole-read retries (also via the S3 origin
    # that planetarymaps.usgs.gov redirects to).
    try:
        ca = tc.configure_gdal_ssl()
        a, errors = None, []
        for attempt, src in enumerate([HRSC["url"], HRSC_S3, HRSC["url"], HRSC_S3]):
            try:
                with rasterio.Env(GDAL_CURL_CA_BUNDLE=ca, CURL_CA_BUNDLE=ca,
                                  GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="120",
                                  GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3",
                                  CPL_VSIL_CURL_CHUNK_SIZE=str(1 << 20)):
                    a, py, px, info = read_geo_window("/vsicurl/" + src, lat, lon, "mars")
                break
            except Exception as e:  # noqa: BLE001
                errors.append(f"attempt {attempt + 1}: {e}")
                time.sleep(5)
        if a is None:
            raise IOError("; ".join(errors))
        h = window_relief(a, py, px)
        cross.append(f"{HRSC['label']} [{HRSC['citation']}; {HRSC['url']}] at "
                     f"{h['posting'][0]}x{h['posting'][1]} m: relief {_fmt(h['common'])} m, "
                     f"median {_fmt(h['median'])} m, {a.shape[0]}x{a.shape[1]} px")
        if h["common"] is not None:
            common_vals.append(h["common"])
    except Exception as e:  # noqa: BLE001
        cross.append(f"{HRSC['label']}: FAILED ({e})")

    # Cross-check 2: MOLA MEGDR 128 ppd (local download ~130 MB + 65 MB counts)
    if skip_megdr:
        cross.append(f"{MEGDR['label']}: skipped (--skip-megdr)")
    else:
        try:
            for name in ("megt44n000hb.img", "megt44n000hb.lbl", "megc44n000hb.img", "megc44n000hb.lbl"):
                download(MEGDR_BASE + name, DL_DIR / name, session)
            a, py, px, info = read_geo_window(DL_DIR / "megt44n000hb.lbl", lat, lon, "mars")
            m = window_relief(a, py, px)
            with rasterio.open(DL_DIR / "megc44n000hb.lbl") as ds:
                r0, c0, hh, ww = info["window"]
                cnt = ds.read(1, window=((r0, r0 + hh), (c0, c0 + ww)))
            shot_frac = float((np.asarray(cnt) > 0).mean())
            cross.append(f"{MEGDR['label']} [{MEGDR['citation']}; {MEGDR['url']}] at native "
                         f"{py:.0f}x{px:.0f} m (cannot be refined to 200 m; excluded from min/max): "
                         f"relief {_fmt(m['native'])} m, median {_fmt(m['median'])} m, "
                         f"{a.shape[0]}x{a.shape[1]} px, {shot_frac:.0%} of pixels contain >=1 MOLA shot "
                         f"(rest interpolated, per megc44n000hb)")
        except Exception as e:  # noqa: BLE001
            cross.append(f"{MEGDR['label']}: FAILED ({e})")

    notes.append("heights relative to the MOLA areoid in all products; relief comes mostly from "
                 "km-scale slopes (crater floor / delta front), so 20 m vs 200 m posting differs little; "
                 "product-to-product differences (source data, interpolation) dominate")
    return _row(target, CTX, primary, 20.0, cross, common_vals, notes)


# --------------------------------------------------------------------------------------
# Moon: south pole C1
# --------------------------------------------------------------------------------------
def _lola20_window(ds, lat, lon, half_m):
    """(heights m, (r0, r1, c0, c1), x, y) from an open LDEM_875S_20M dataset."""
    import numpy as np

    t = ds.transform
    x, y = polar_stereo_south_forward(lat, lon, R_MOON_M)
    r0, r1, c0, c1 = stereo_window_rowcol(x, y, half_m, t.c, t.f, t.a)
    dn = ds.read(1, window=((r0, r1), (c0, c1)), masked=True)
    h = dn.astype("float64").filled(np.nan) * float(ds.scales[0])  # HEIGHT = DN * 0.5 (no OFFSET)
    return h, (r0, r1, c0, c1), x, y


def moon_rows(target, skip_5m=False, session=None):
    import numpy as np
    import rasterio
    from rasterio.warp import transform as wtransform

    lat, lon = target["lat"], target["lon"]
    notes, cross, common_vals = [], [], []
    primary = None
    k = polar_stereo_scale(lat)
    half = tc.WINDOW_HALF_KM * 1000.0 * k
    win20 = None
    a20 = None
    try:
        sts = [download(LOLA20["url"], DL_DIR / "ldem_875s_20m.img", session),
               download(LOLA20["url"].replace(".img", ".lbl"), DL_DIR / "ldem_875s_20m.lbl", session)]
        with rasterio.open(DL_DIR / "ldem_875s_20m.lbl") as ds:
            crs = ds.crs.to_dict()
            t = ds.transform
            # Georeferencing checks: GDAL's reading of the PDS label vs the label definition
            assert crs.get("proj") == "stere" and float(crs.get("lat_0")) == -90.0 \
                and float(crs.get("R")) == R_MOON_M, crs
            assert (t.a, t.e, t.c, t.f) == (20.0, -20.0, -75840.0, 75840.0), t
            assert float(ds.scales[0]) == 0.5 and float(ds.offsets[0]) == R_MOON_M, (ds.scales, ds.offsets)
            # Our closed-form projection vs PROJ through rasterio
            (px_,), (py_,) = wtransform(f"+proj=longlat +R={R_MOON_M} +no_defs", ds.crs, [lon], [lat])
            x, y = polar_stereo_south_forward(lat, lon, R_MOON_M)
            assert abs(px_ - x) < 0.01 and abs(py_ - y) < 0.01, (px_, py_, x, y)
            a20, win20, x, y = _lola20_window(ds, lat, lon, half)
            primary = window_relief(a20, 20.0, 20.0)
            # Orientation check: Shackleton floor must be a deep low at its gazetteer centre and
            # NOT at the longitude-mirrored point.
            sh, _, _, _ = _lola20_window(ds, SHACKLETON[0], SHACKLETON[1], 2000.0)
            mi, _, _, _ = _lola20_window(ds, SHACKLETON[0], -SHACKLETON[1], 2000.0)
        sh_med, mi_med = float(np.nanmedian(sh)), float(np.nanmedian(mi))
        orient_ok = sh_med < mi_med - 1000.0
        notes.append(f"LOLA 20 m {'/'.join(sts)}; target map x={x:.1f} m, y={y:.1f} m (checked against "
                     f"PROJ); scale factor k={k:.6f}, window +/-{half:.1f} m = rows {win20[0]}-{win20[1]}, "
                     f"cols {win20[2]}-{win20[3]} ({a20.shape[0]}x{a20.shape[1]} px), valid {primary['frac']:.1%}; "
                     f"heights = DN x 0.5 m relative to the 1737.4 km sphere; window min/max "
                     f"{np.nanmin(a20):.0f}/{np.nanmax(a20):.0f} m")
        notes.append(f"orientation check {'PASSED' if orient_ok else 'FAILED'}: 4 km window at Shackleton "
                     f"centre (USGS Gazetteer 89.67 S 129.78 E) median {sh_med:.0f} m vs lon-mirrored point "
                     f"{mi_med:.0f} m")
        if not orient_ok:
            primary = None
            notes.append("primary withheld because the orientation check failed")
        elif primary["common"] is not None:
            common_vals.append(primary["common"])
    except Exception as e:  # noqa: BLE001
        notes.append(f"LOLA 20 m primary failed: {e!r}")

    # Cross-check: LDEM_875S_5M over exactly the same extent (20 m window x 4)
    if skip_5m:
        cross.append(f"{LOLA5['label']}: skipped (--skip-5m)")
    elif win20 is None:
        cross.append(f"{LOLA5['label']}: not attempted (20 m window unavailable)")
    else:
        try:
            lbl_path = DL_DIR / "ldem_875s_5m.lbl"
            download(LOLA5["url"].replace(".img", ".lbl"), lbl_path, session)
            lbl = parse_pds_label(lbl_path.read_text(encoding="ascii", errors="replace"))
            n_lines, n_samp = int(lbl["LINES"]), int(lbl["LINE_SAMPLES"])
            scale, mscale = float(lbl["SCALING_FACTOR"]), float(lbl["MAP_SCALE"])
            assert lbl["SAMPLE_TYPE"] == "LSB_INTEGER" and lbl["SAMPLE_BITS"] == "16", lbl
            assert mscale == 5.0 and n_lines * mscale / 2 == 75840.0, (n_lines, mscale)
            f = int(round(20.0 / mscale))
            r0, r1, c0, c1 = (v * f for v in win20)
            rows_path = DL_DIR / f"ldem_875s_5m_rows{r0}-{r1 - 1}.bin"
            st = download_range(LOLA5["url"], rows_path, r0 * n_samp * 2, (r1 - r0) * n_samp * 2, session)
            rows = np.fromfile(rows_path, dtype="<i2").reshape(r1 - r0, n_samp)
            a5 = rows[:, c0:c1].astype("float64") * scale
            r5 = window_relief(a5, mscale, mscale)
            diff = tc.block_mean(a5, f, f) - a20
            cross.append(f"{LOLA5['label']} [{LOLA20['citation']}; {LOLA5['url']}, byte-range rows {r0}-{r1 - 1}, "
                         f"{st}] at {r5['posting'][0]}x{r5['posting'][1]} m: relief {_fmt(r5['common'])} m "
                         f"(native 5 m: {_fmt(r5['native'])} m), median {_fmt(r5['median'])} m; "
                         f"5 m block-mean to 20 m minus 20 m product: mean {np.nanmean(diff):.1f} m, "
                         f"RMS {math.sqrt(np.nanmean(diff ** 2)):.1f} m")
            if r5["common"] is not None:
                common_vals.append(r5["common"])
        except Exception as e:  # noqa: BLE001
            cross.append(f"{LOLA5['label']}: FAILED ({e!r})")

    notes.append("LOLA grids are interpolated between laser tracks (GMT blockmedian/surface), so true "
                 "resolution is coarser than the pixel size; the window spans ridge crest and the steep "
                 "Shackleton / de Gerlache flank slopes (which side the low end is was not checked), so "
                 "relief is not ridge-top roughness")
    return _row(target, LOLA20, primary, 20.0, cross, common_vals, notes)


# --------------------------------------------------------------------------------------
def _row(target, prod, primary, posting, cross, common_vals, notes):
    if primary is None or primary["common"] is None:
        notes.insert(0, "relief left empty: primary product could not be computed")
    else:
        # Uncertainty range = product-to-product spread AND block-alignment spread of the primary
        # (relief_m is the mean over all ~200 m block offsets; review finding).
        common_vals = list(common_vals) + [v for v in (primary.get("common_min"), primary.get("common_max"))
                                           if v is not None]
        notes.insert(0, f"relief_m = mean over all ~200 m block offsets (offset range "
                        f"{_fmt(primary.get('common_min'))}–{_fmt(primary.get('common_max'))} m); "
                        f"relief_min_m/relief_max_m span offsets and products")
    return {
        "target_id": target["id"], "dem": prod["dem"], "dem_label": prod["label"],
        "citation": prod["citation"], "url": prod["url"], "posting_native_m": _fmt(posting),
        "relief_native_m": _fmt(primary and primary["native"]),
        "relief_m": _fmt(primary and primary["common"]),
        "median_elev_m": _fmt(primary and primary["median"]),
        "cross_checks": " | ".join(cross),
        "relief_min_m": _fmt(min(common_vals)) if common_vals else "",
        "relief_max_m": _fmt(max(common_vals)) if common_vals else "",
        "note": "; ".join(notes),
        "retrieved_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
    }


def load_targets():
    with open(TARGETS_JSON, encoding="utf-8") as f:
        return {t["id"]: t for t in json.load(f)["targets"]}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--skip-megdr", action="store_true", help="skip the MOLA MEGDR cross-check (~195 MB)")
    ap.add_argument("--skip-5m", action="store_true", help="skip the LOLA 5 m cross-check (~121 MB range read)")
    args = ap.parse_args(argv)
    tc.configure_gdal_ssl()  # before any /vsicurl/ read (non-ASCII venv path)
    targets = load_targets()
    s = _session()
    rows = [mars_rows(targets["mars-jezero"], args.skip_megdr, s),
            moon_rows(targets["moon-south-pole"], args.skip_5m, s)]
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    for r in rows:
        print(f"{r['target_id']}: relief_m={r['relief_m'] or 'EMPTY'} native={r['relief_native_m'] or '-'} "
              f"range=[{r['relief_min_m']}, {r['relief_max_m']}] median={r['median_elev_m']}")
        for c in r["cross_checks"].split(" | "):
            print("   cross:", c[:400])
        print("   note:", r["note"])
    print(f"wrote {OUT_CSV.relative_to(config.ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
