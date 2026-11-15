"""Extract per-site features from the raw data in ../Raw Data.

Writes ../Processed/features_earth.csv and ../Processed/features_moon.csv
(raw physical units, not normalised). Run with:  python data-tools/extract_features.py

Every feature is computed over a ~10 km x 10 km window around the site so Earth
and Moon values are comparable. Earth DEMs are block-averaged 3x3 (30 m -> ~90 m)
to match the 80 m lunar DEM before slope/roughness are computed.
Needs: numpy, scipy, pandas, tifffile, h5py.  (No -I flag: tifffile/h5py live in
the user site-packages.)
"""
import csv
import glob
import math
import os
import re
import sys

import h5py
import numpy as np
import pandas as pd
import tifffile
from scipy.ndimage import uniform_filter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "Raw Data")
OUT = os.path.join(ROOT, "Processed")
HALF_KM = 5.0          # half-width of the analysis window
MOON_R = 1737.4e3      # m

# Lunar south-pole candidate regions. Coordinates are approximate (planetocentric).
MOON_SITES = [
    ("shackleton_crater", "Shackleton crater (rim and floor)", -89.9, 0.0),
    ("malapert_massif", "Malapert massif", -85.99, 0.0),
    ("haworth_crater", "Haworth crater", -87.5, -5.0),
]


# ---------------------------------------------------------------- helpers
def read_tiff(path):
    with tifffile.TiffFile(path) as tf:
        page = tf.pages[0]
        arr = page.asarray()
        tags = {page.tags[k].name: page.tags[k].value for k in page.tags.keys()}
    return arr, tags


def geotransform(tags):
    sx, sy, _ = tags["ModelPixelScaleTag"]
    _, _, _, x0, y0, _ = tags["ModelTiepointTag"]
    return x0, y0, sx, sy          # top-left corner of the top-left pixel


def slope_roughness(dem, dx, dy):
    """Return per-pixel slope (deg) and local RMS height (m, 5x5 window) arrays."""
    gy, gx = np.gradient(dem, dy, dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    m = uniform_filter(dem, 5)
    m2 = uniform_filter(dem * dem, 5)
    rough = np.sqrt(np.clip(m2 - m * m, 0, None))
    # trim the 2-pixel border where the 5x5 filter is edge-biased
    return slope[2:-2, 2:-2], rough[2:-2, 2:-2]


def dem_stats(dem, dx, dy, prefix):
    slope, rough = slope_roughness(dem, dx, dy)
    return {
        f"{prefix}relief_m": float(np.nanmax(dem) - np.nanmin(dem)),
        f"{prefix}slope_mean_deg": float(np.nanmean(slope)),
        f"{prefix}slope_p95_deg": float(np.nanpercentile(slope, 95)),
        f"{prefix}rough_rms_m": float(np.nanmean(rough)),
    }


def block_mean(a, k):
    h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
    return a[:h, :w].reshape(h // k, k, w // k, k).mean(axis=(1, 3))


# ---------------------------------------------------------------- Earth
def earth_dem(site_id, lat, lon):
    f = glob.glob(os.path.join(RAW, "Earth", "Copernicus_DEM_GLO30", site_id, "*.tif"))[0]
    dem, tags = read_tiff(f)
    dem = dem.astype("float64")
    x0, y0, sx, sy = geotransform(tags)
    col = (lon - x0) / sx
    row = (y0 - lat) / sy
    half_r = HALF_KM * 1000 / 111320 / sy
    half_c = HALF_KM * 1000 / (111320 * math.cos(math.radians(lat))) / sx
    r0, r1 = int(max(row - half_r, 0)), int(min(row + half_r, dem.shape[0]))
    c0, c1 = int(max(col - half_c, 0)), int(min(col + half_c, dem.shape[1]))
    win = dem[r0:r1, c0:c1]
    win[win < -1000] = np.nan
    k = 3
    win = block_mean(win, k)
    dy = 111320 * sy * k
    dx = 111320 * math.cos(math.radians(lat)) * sx * k
    out = dem_stats(win, dx, dy, "")
    out["elev_mean_m"] = float(np.nanmean(win))
    out["dem_window_km"] = round(win.shape[0] * dy / 1000, 1)
    return out


def earth_s1(site_id):
    out = {"s1_copol_db_mean": np.nan, "s1_copol_db_std": np.nan, "s1_cross_db_mean": np.nan}
    for f in glob.glob(os.path.join(RAW, "Earth", "Sentinel1_RTC", site_id, "*.tif")):
        m = re.search(r"_rtc_([a-z]{2})\.tif$", f)
        if not m:
            continue
        pol = m.group(1)
        arr, _ = read_tiff(f)
        sig = arr[..., 0].astype("float64")
        ok = np.isfinite(sig) & (sig > 0)
        if arr.shape[-1] > 1:
            ok &= arr[..., 1] > 0
        if ok.sum() < 100:
            continue
        db = 10 * np.log10(sig[ok])
        if pol in ("vv", "hh"):
            out["s1_copol_db_mean"] = float(db.mean())
            out["s1_copol_db_std"] = float(db.std())
        else:
            out["s1_cross_db_mean"] = float(db.mean())
    return out


def earth_modis(site_id):
    files = sorted(glob.glob(os.path.join(RAW, "Earth", "MODIS_LST_8day", site_id, "*.tif")))
    day, night = [], []
    for f in files:
        arr, _ = read_tiff(f)
        d = arr[..., 0].astype("float64") * 0.02
        n = arr[..., 1].astype("float64") * 0.02
        d = d[d > 0]
        n = n[n > 0]
        day.append(np.median(d) if d.size else np.nan)
        night.append(np.median(n) if n.size else np.nan)
    day, night = np.array(day), np.array(night)
    if np.all(np.isnan(day)) or np.all(np.isnan(night)):
        return {}
    return {
        "lst_day_max_K": float(np.nanmax(day)),
        "lst_night_min_K": float(np.nanmin(night)),
        "lst_annual_range_K": float(np.nanmax(day) - np.nanmin(night)),
        "lst_diurnal_range_K": float(np.nanmean(day - night)),
        "lst_mean_K": float(np.nanmean(np.r_[day, night])),
        "lst_months": int(np.sum(~np.isnan(day))),
    }


def earth_ndvi(site_id):
    """Annual mean / max NDVI from MOD13A1 (DN * 0.0001). Central 10 km of the 50 km cut-out."""
    files = sorted(glob.glob(os.path.join(RAW, "Earth", "MODIS_NDVI_16day", site_id, "*.tif")))
    vals = []
    for f in files:
        arr, _ = read_tiff(f)
        band = arr[..., 0] if arr.ndim == 3 else arr
        c = band.shape[0] // 2
        win = band[c - 5:c + 5, c - 5:c + 5].astype("float64")
        ok = (win >= -2000) & (win <= 10000)
        if arr.ndim == 3 and arr.shape[-1] > 1:
            ok &= arr[c - 5:c + 5, c - 5:c + 5, -1] > 0
        if ok.any():
            vals.append(np.median(win[ok]) * 1e-4)
    if not vals:
        return {"ndvi_mean": np.nan, "ndvi_max": np.nan, "ndvi_months": 0}
    return {"ndvi_mean": float(np.mean(vals)), "ndvi_max": float(np.max(vals)), "ndvi_months": len(vals)}


def earth_emit(site_id, lat, lon):
    files = glob.glob(os.path.join(RAW, "Earth", "EMIT_L2B_Minerals", site_id, "EMIT_L2B_MIN_*.nc"))
    if not files:
        return {"emit_valid_frac": np.nan, "emit_top_minerals": ""}
    with h5py.File(files[0], "r") as h:
        la, lo = h["location/lat"][:], h["location/lon"][:]
        mid = h["group_1_mineral_id"][:]
        names = [n.decode() if isinstance(n, bytes) else str(n) for n in h["mineral_metadata/name"][:]]
    half = HALF_KM * 1000 / 111320
    sel = (np.abs(la - lat) < half) & (np.abs(lo - lon) < half / math.cos(math.radians(lat)))
    if sel.sum() < 50:
        return {"emit_valid_frac": np.nan, "emit_top_minerals": "no-pixels-in-window"}
    ids = mid[sel]
    valid = ids > 0
    out = {"emit_valid_frac": float(valid.mean())}
    if valid.any():
        vals, cnt = np.unique(ids[valid], return_counts=True)
        top = np.argsort(cnt)[::-1][:3]
        out["emit_top_minerals"] = "; ".join(
            f"{names[vals[i]] if vals[i] < len(names) else vals[i]}:{cnt[i] / valid.sum():.2f}"
            for i in top
        )
    else:
        out["emit_top_minerals"] = ""
    return out


# ---------------------------------------------------------------- Moon
def polar_xy(lat, lon):
    """Spherical south-polar stereographic (PDS convention), metres."""
    r = 2 * MOON_R * math.tan(math.radians(90 + lat) / 2)
    return r * math.sin(math.radians(lon)), r * math.cos(math.radians(lon))


def polar_xy_arr(lat, lon):
    r = 2 * MOON_R * np.tan(np.radians(90 + lat) / 2)
    return r * np.sin(np.radians(lon)), r * np.cos(np.radians(lon))


def moon_dem(lat, lon):
    path = os.path.join(RAW, "Moon", "LOLA_DEM_80S_80m", "ldem_80s_80m_float.img")
    dem = np.memmap(path, dtype="<f4", mode="r", shape=(7600, 7600))
    x, y = polar_xy(lat, lon)
    col, row = 3799.5 + x / 80, 3799.5 - y / 80
    h = int(HALF_KM * 1000 / 80)
    r0, r1 = int(max(row - h, 0)), int(min(row + h, 7600))
    c0, c1 = int(max(col - h, 0)), int(min(col + h, 7600))
    win = np.array(dem[r0:r1, c0:c1], dtype="float64") * 1000   # km -> m, vs 1737.4 km sphere
    out = dem_stats(win, 80.0, 80.0, "")
    out["elev_mean_m"] = float(win.mean())
    out["dem_window_km"] = round(win.shape[0] * 0.08, 1)
    return out


def moon_illum(lat, lon):
    path = os.path.join(RAW, "Moon", "LOLA_Illumination_South", "AVGVISIB_85S_060M_201608.TIF")
    arr, tags = read_tiff(path)
    x0, y0, sx, sy = geotransform(tags)
    x, y = polar_xy(lat, lon)
    col, row = (x - x0) / sx, (y0 - y) / sy
    h = int(HALF_KM * 1000 / sx)
    r0, r1 = int(max(row - h, 0)), int(min(row + h, arr.shape[0]))
    c0, c1 = int(max(col - h, 0)), int(min(col + h, arr.shape[1]))
    if r1 <= r0 or c1 <= c0:
        return {"illum_frac_mean": np.nan}
    win = arr[r0:r1, c0:c1].astype("float64")
    ok = win != -32768
    if not ok.any():
        return {"illum_frac_mean": np.nan}
    frac = win[ok] * 4e-5           # GDAL SCALE: DN -> fraction of time sunlit
    return {"illum_frac_mean": float(frac.mean()), "illum_frac_p95": float(np.percentile(frac, 95))}


def moon_cpr(lat, lon):
    path = os.path.join(RAW, "Moon", "MiniRF_CPR_Global_32ppd", "global_cpr_32ppd_simp_0c.img")
    img = np.memmap(path, dtype="<f4", mode="r", shape=(5760, 11520))
    half_lat = HALF_KM * 1000 / (MOON_R * math.pi / 180)
    half_lon = min(half_lat / max(math.cos(math.radians(lat)), 1e-3), 180)
    rows = slice(int(2879.5 - (lat + half_lat) * 32), int(2879.5 - (lat - half_lat) * 32) + 1)
    c_lo, c_hi = 5759.5 + (lon - half_lon) * 32, 5759.5 + (lon + half_lon) * 32
    cols = np.arange(int(max(c_lo, 0)), int(min(c_hi, 11519)) + 1)
    win = np.array(img[rows][:, cols], dtype="float64")
    win = win[(win > -1e300) & np.isfinite(win) & (win >= 0)]
    return {"cpr_mean": float(win.mean()) if win.size else np.nan}


_DIV = None


def moon_diviner(lat, lon):
    global _DIV
    if _DIV is None:
        path = os.path.join(RAW, "Moon", "Diviner_PolarResource_South", "dlre_prp_south.tab")
        _DIV = pd.read_csv(path, usecols=[9, 10, 12, 13, 14], skiprows=1, header=None,
                           names=["clon", "clat", "tavg", "tmax", "ice"])
    d = _DIV
    x, y = polar_xy(lat, lon)
    xs, ys = polar_xy_arr(d.clat.values, d.clon.values)
    sel = (np.abs(xs - x) < HALF_KM * 1000) & (np.abs(ys - y) < HALF_KM * 1000)
    w = d[sel]
    if w.empty:
        return {"div_tavg_K": np.nan, "div_tmax_K": np.nan, "div_ice_frac": np.nan}
    return {
        "div_tavg_K": float(w.tavg.mean()),
        "div_tmax_K": float(w.tmax.mean()),
        "div_tmin_est_K": float(w.tavg.min()),
        "div_ice_frac": float((w.ice > -900).mean()),
        "div_n_facets": int(len(w)),
    }


# ---------------------------------------------------------------- main
def main():
    os.makedirs(OUT, exist_ok=True)
    sites = list(csv.DictReader(open(os.path.join(RAW, "sites.csv"), encoding="utf-8")))
    rows = []
    for s in sites:
        sid, lat, lon = s["site_id"], float(s["lat"]), float(s["lon"])
        print("Earth:", sid, flush=True)
        row = {"site_id": sid, "name": s["name"], "role": s["role"], "lat": lat, "lon": lon}
        for fn, args in ((earth_dem, (sid, lat, lon)), (earth_s1, (sid,)),
                         (earth_modis, (sid,)), (earth_ndvi, (sid,)),
                         (earth_emit, (sid, lat, lon))):
            try:
                row.update(fn(*args))
            except Exception as e:                      # keep going, record the gap
                print(f"  !! {fn.__name__} failed: {e!r}", file=sys.stderr)
        rows.append(row)
    pd.DataFrame(rows).to_csv(os.path.join(OUT, "features_earth.csv"), index=False)

    rows = []
    for sid, name, lat, lon in MOON_SITES:
        print("Moon:", sid, flush=True)
        row = {"site_id": sid, "name": name, "role": "lunar target", "lat": lat, "lon": lon}
        for fn in (moon_dem, moon_illum, moon_cpr, moon_diviner):
            try:
                row.update(fn(lat, lon))
            except Exception as e:
                print(f"  !! {fn.__name__} failed: {e!r}", file=sys.stderr)
        rows.append(row)
    pd.DataFrame(rows).to_csv(os.path.join(OUT, "features_moon.csv"), index=False)
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
