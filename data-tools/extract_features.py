"""Extract per-site features from the raw data in ../Raw Data.

Writes ../Processed/features_earth.csv and ../Processed/features_moon.csv
(raw physical units, not normalised). Run with:  python data-tools/extract_features.py

Earth features use a ~10 km x 10 km window around the site. Earth DEMs are
block-averaged 3x3 (30 m -> ~90 m) to match the 80 m lunar DEM before slope and
roughness are computed. Lunar targets are operational zones with their own window.
A layer that is missing or fails stays empty (NaN) so it becomes "unknown" later.
Needs: numpy, scipy, pandas, tifffile, imagecodecs, h5py.
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
HALF_KM = 5.0          # half-width of the Earth analysis window
MOON_R = 1737.4e3      # m

# Lunar south-pole operational zones: (id, name, lat, lon, window half-width km).
# Crater centres are IAU values; the ridge point is the best-lit site near Shackleton
# (Mazarico et al. 2011). Checked against the data: floors are dark and ~3 km deep,
# the ridge peaks at 88% illumination.
MOON_SITES = [
    ("shackleton_ridge", "Shackleton connecting ridge (sunlit work area)", -89.45, -137.31, 2.5),
    ("shackleton_floor", "Shackleton crater floor (permanent shadow)", -89.67, 129.78, 2.0),
    ("malapert_massif", "Malapert massif", -85.99, 2.93, 5.0),
    ("haworth_floor", "Haworth crater floor (permanent shadow)", -87.45, -5.17, 5.0),
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


def dem_stats(dem, dx, dy):
    slope, rough = slope_roughness(dem, dx, dy)
    ok = np.isfinite(slope)
    s = slope[ok]
    out = {
        "relief_m": float(np.nanmax(dem) - np.nanmin(dem)),
        "slope_mean_deg": float(s.mean()),
        "slope_p95_deg": float(np.percentile(s, 95)),
        "rough_rms_m": float(np.nanmean(rough)),
    }
    for lim in (10, 15, 20):                 # share of the area a vehicle limited to `lim` deg can use
        out[f"slope_le{lim}_frac"] = float((s <= lim).mean())
    return out


def block_mean(a, k):
    h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
    return np.nanmean(a[:h, :w].reshape(h // k, k, w // k, k), axis=(1, 3))


# ---------------------------------------------------------------- Earth
def earth_dem(site_id, lat, lon):
    f = glob.glob(os.path.join(RAW, "Earth", "Copernicus_DEM_GLO30", site_id, "*.tif"))[0]
    dem, tags = read_tiff(f)
    x0, y0, sx, sy = geotransform(tags)
    col = (lon - x0) / sx
    row = (y0 - lat) / sy
    half_r = HALF_KM * 1000 / 111320 / sy
    half_c = HALF_KM * 1000 / (111320 * math.cos(math.radians(lat))) / sx
    r0, r1 = int(max(row - half_r, 0)), int(min(row + half_r, dem.shape[0]))
    c0, c1 = int(max(col - half_c, 0)), int(min(col + half_c, dem.shape[1]))
    win = dem[r0:r1, c0:c1].astype("float64")
    win[win < -1000] = np.nan
    sea = win == 0                      # GLO-30 sets open water to exactly 0 m
    sea_frac = float(sea.mean())
    if sea_frac > 0.01:
        win[sea] = np.nan
    k = 3
    with np.errstate(invalid="ignore"), __import__("warnings").catch_warnings():
        __import__("warnings").simplefilter("ignore")
        small = block_mean(win, k)
    dy = 111320 * sy * k
    dx = 111320 * math.cos(math.radians(lat)) * sx * k
    out = dem_stats(small, dx, dy)
    out["elev_mean_m"] = float(np.nanmean(small))
    out["sea_frac"] = sea_frac
    out["dem_window_km"] = round(small.shape[0] * dy / 1000, 1)
    out["_land"] = ~sea if sea_frac > 0.01 else None      # private: reused to mask the radar
    return out


def earth_light(lat):
    """Sun geometry from latitude only: days per year when the noon sun is up but below 10 deg."""
    noon = [90 - abs(lat - 23.44 * math.sin(2 * math.pi * (d - 81) / 365)) for d in range(365)]
    return {
        "low_sun_days": int(sum(0 < e < 10 for e in noon)),
        "noon_sun_min_deg": float(min(noon)),
        "noon_sun_max_deg": float(max(noon)),
    }


def earth_s1(site_id, land=None):
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
        if land is not None:            # same 10 km box as the DEM window: drop open water
            ri = (np.arange(sig.shape[0]) * land.shape[0] / sig.shape[0]).astype(int)
            ci = (np.arange(sig.shape[1]) * land.shape[1] / sig.shape[1]).astype(int)
            ok &= land[np.ix_(ri, ci)]
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
    """Spherical south-polar stereographic (PDS convention), metres. Works on scalars or arrays."""
    r = 2 * MOON_R * np.tan(np.radians(90 + lat) / 2)
    return r * np.sin(np.radians(lon)), r * np.cos(np.radians(lon))


def moon_dem(lat, lon, half_km):
    path = os.path.join(RAW, "Moon", "LOLA_DEM_80S_80m", "ldem_80s_80m_float.img")
    dem = np.memmap(path, dtype="<f4", mode="r", shape=(7600, 7600))
    x, y = polar_xy(lat, lon)
    col, row = 3799.5 + x / 80, 3799.5 - y / 80
    h = int(half_km * 1000 / 80)
    r0, r1 = int(max(row - h, 0)), int(min(row + h, 7600))
    c0, c1 = int(max(col - h, 0)), int(min(col + h, 7600))
    win = np.array(dem[r0:r1, c0:c1], dtype="float64") * 1000   # km -> m, vs 1737.4 km sphere
    out = dem_stats(win, 80.0, 80.0)
    out["elev_mean_m"] = float(win.mean())
    out["dem_window_km"] = round(win.shape[0] * 0.08, 1)
    return out


def moon_illum(lat, lon, half_km):
    path = os.path.join(RAW, "Moon", "LOLA_Illumination_South", "AVGVISIB_85S_060M_201608.TIF")
    arr, tags = read_tiff(path)
    x0, y0, sx, sy = geotransform(tags)
    x, y = polar_xy(lat, lon)
    col, row = (x - x0) / sx, (y0 - y) / sy
    h = int(half_km * 1000 / sx)
    r0, r1 = int(max(row - h, 0)), int(min(row + h, arr.shape[0]))
    c0, c1 = int(max(col - h, 0)), int(min(col + h, arr.shape[1]))
    if r1 <= r0 or c1 <= c0:
        return {"illum_frac_mean": np.nan}
    win = arr[r0:r1, c0:c1].astype("float64")
    ok = win != -32768
    if not ok.any():
        return {"illum_frac_mean": np.nan}
    frac = win[ok] * 4e-5           # GDAL SCALE: DN -> fraction of time sunlit
    return {"illum_frac_mean": float(frac.mean()), "illum_frac_p95": float(np.percentile(frac, 95)),
            "illum_frac_max": float(frac.max())}


def moon_cpr(lat, lon, half_km):
    path = os.path.join(RAW, "Moon", "MiniRF_CPR_Global_32ppd", "global_cpr_32ppd_simp_0c.img")
    img = np.memmap(path, dtype="<f4", mode="r", shape=(5760, 11520))
    half_lat = max(half_km, 5.0) * 1000 / (MOON_R * math.pi / 180)   # CPR pixels are ~1 km: keep >= 10 km
    half_lon = min(half_lat / max(math.cos(math.radians(lat)), 1e-3), 180)
    rows = slice(int(2879.5 - (lat + half_lat) * 32), int(2879.5 - (lat - half_lat) * 32) + 1)
    c_lo, c_hi = 5759.5 + (lon - half_lon) * 32, 5759.5 + (lon + half_lon) * 32
    cols = np.arange(int(max(c_lo, 0)), int(min(c_hi, 11519)) + 1)
    win = np.array(img[rows][:, cols], dtype="float64")
    win = win[(win > -1e300) & np.isfinite(win) & (win >= 0)]
    return {"cpr_mean": float(win.mean()) if win.size else np.nan}


_DIV = None


def moon_diviner(lat, lon, half_km):
    global _DIV
    if _DIV is None:
        path = os.path.join(RAW, "Moon", "Diviner_PolarResource_South", "dlre_prp_south.tab")
        _DIV = pd.read_csv(path, usecols=[9, 10, 12, 13, 14], skiprows=1, header=None,
                           names=["clon", "clat", "tavg", "tmax", "ice"])
        _DIV["x"], _DIV["y"] = polar_xy(_DIV.clat.values, _DIV.clon.values)
    d = _DIV
    x, y = polar_xy(lat, lon)
    w = d[(np.abs(d.x - x) < half_km * 1000) & (np.abs(d.y - y) < half_km * 1000)]
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
        land = None
        steps = (
            ("dem", lambda: earth_dem(sid, lat, lon)),
            ("light", lambda: earth_light(lat)),
            ("s1", lambda: earth_s1(sid, land)),
            ("modis", lambda: earth_modis(sid)),
            ("ndvi", lambda: earth_ndvi(sid)),
            ("emit", lambda: earth_emit(sid, lat, lon)),
        )
        for label, fn in steps:
            try:
                res = fn()
                if label == "dem":
                    land = res.pop("_land")
                row.update(res)
            except Exception as e:                      # keep going, record the gap
                print(f"  !! {label} failed: {e!r}", file=sys.stderr)
        rows.append(row)
    pd.DataFrame(rows).to_csv(os.path.join(OUT, "features_earth.csv"), index=False)

    rows = []
    for sid, name, lat, lon, half in MOON_SITES:
        print("Moon:", sid, flush=True)
        row = {"site_id": sid, "name": name, "role": "lunar target", "lat": lat, "lon": lon,
               "window_half_km": half}
        for fn in (moon_dem, moon_illum, moon_cpr, moon_diviner):
            try:
                row.update(fn(lat, lon, half))
            except Exception as e:
                print(f"  !! {fn.__name__} failed: {e!r}", file=sys.stderr)
        rows.append(row)
    pd.DataFrame(rows).to_csv(os.path.join(OUT, "features_moon.csv"), index=False)
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
