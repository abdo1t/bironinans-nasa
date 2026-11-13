"""Shared raster helpers for Earth and planetary terrain / NDVI fetchers.

Terrain metric (identical for every body, CLAUDE.md §4.1):
  relief = P99 − P1 of elevation in a 10 km × 10 km window centred on the point,
  computed at a COMMON posting of ~200 m (box-mean aggregation of the native
  DEM) so Earth (~30 m), Mars CTX (20 m) and Moon LOLA (20 m) are compared at
  the same scale. Native-resolution relief is stored alongside for transparency.
"""
import math
import os
import sys

COMMON_POSTING_M = 200.0
WINDOW_HALF_KM = 5.0
MIN_VALID_FRAC = 0.95

# Mean radii (km) used to convert the 10 km window into degrees.
RADIUS_KM = {"earth": 6371.0088, "mars": 3396.19, "moon": 1737.4}


def deg_per_km(lat, body="earth"):
    """(degrees latitude per km, degrees longitude per km) at `lat` on `body` (sphere)."""
    km_per_deg = math.pi * RADIUS_KM[body] / 180.0
    return 1.0 / km_per_deg, 1.0 / (km_per_deg * max(math.cos(math.radians(lat)), 1e-6))


def window_bounds_deg(lat, lon, half_km=WINDOW_HALF_KM, body="earth"):
    """(west, south, east, north) in degrees for a ±half_km square on a sphere."""
    dlat, dlon = deg_per_km(lat, body)
    return (lon - half_km * dlon, lat - half_km * dlat, lon + half_km * dlon, lat + half_km * dlat)


def _valid_mask(arr, nodata):
    import numpy as np

    valid = np.isfinite(arr)
    if nodata is not None and not (isinstance(nodata, float) and math.isnan(nodata)):
        valid &= arr != nodata
    return valid


def relief_stats(values, nodata=None, min_valid_frac=MIN_VALID_FRAC):
    """(relief = P99 − P1, median, valid_frac) of an elevation array.

    Only `nodata` and non-finite values are excluded — no elevation range filter,
    so negative Martian/lunar heights and below-sea-level basins are valid.
    relief/median are None when fewer than `min_valid_frac` of pixels are valid.
    """
    import numpy as np

    arr = np.asarray(values, dtype="float64")
    valid = _valid_mask(arr, nodata)
    frac = float(valid.mean()) if arr.size else 0.0
    if frac < min_valid_frac or not valid.any():
        return None, None, round(frac, 4)
    p1, p50, p99 = np.percentile(arr[valid], [1, 50, 99])
    return round(float(p99 - p1), 1), round(float(p50), 1), round(frac, 4)


def block_mean(values, fy, fx, nodata=None, min_block_valid=0.5):
    """Box-mean aggregate a 2-D array by integer factors (fy rows, fx cols).

    Edge rows/cols that do not fill a whole block are dropped. A block with less
    than `min_block_valid` valid pixels becomes NaN. Returns float64 array.
    """
    import numpy as np

    arr = np.asarray(values, dtype="float64")
    fy, fx = max(int(fy), 1), max(int(fx), 1)
    ny, nx = arr.shape[0] // fy, arr.shape[1] // fx
    if ny == 0 or nx == 0:
        return np.full((0, 0), np.nan)
    arr = arr[: ny * fy, : nx * fx]
    valid = _valid_mask(arr, nodata)
    data = np.where(valid, arr, 0.0).reshape(ny, fy, nx, fx)
    count = valid.reshape(ny, fy, nx, fx).sum(axis=(1, 3))
    total = data.sum(axis=(1, 3))
    with np.errstate(invalid="ignore", divide="ignore"):
        out = total / count
    out[count < min_block_valid * fy * fx] = np.nan
    return out


def aggregation_factors(pixel_y_m, pixel_x_m, target_m=COMMON_POSTING_M):
    """Integer box-mean factors (fy, fx) that bring a pixel size closest to target_m."""
    return max(1, round(target_m / pixel_y_m)), max(1, round(target_m / pixel_x_m))


def common_scale_relief(values, pixel_y_m, pixel_x_m, nodata=None, target_m=COMMON_POSTING_M):
    """Relief at ~target_m posting. Returns (relief, median, valid_frac, (eff_y_m, eff_x_m))."""
    fy, fx = aggregation_factors(pixel_y_m, pixel_x_m, target_m)
    agg = block_mean(values, fy, fx, nodata=nodata)
    relief, median, frac = relief_stats(agg)
    return relief, median, frac, (round(pixel_y_m * fy, 1), round(pixel_x_m * fx, 1))


def configure_gdal_ssl():
    """Point GDAL's curl at certifi's CA bundle via an ASCII-safe path.

    On this machine the venv path contains a non-ASCII character, which GDAL's
    curl cannot open; the Windows 8.3 short path avoids that. No-op elsewhere.
    """
    if os.environ.get("GDAL_CURL_CA_BUNDLE"):
        return os.environ["GDAL_CURL_CA_BUNDLE"]
    try:
        import certifi
    except ImportError:
        return None
    path = certifi.where()
    if sys.platform == "win32":
        try:
            import ctypes

            buf = ctypes.create_unicode_buffer(1024)
            if ctypes.windll.kernel32.GetShortPathNameW(path, buf, 1024):
                path = buf.value
        except Exception:  # noqa: BLE001 - fall back to the long path
            pass
    os.environ["GDAL_CURL_CA_BUNDLE"] = path
    os.environ.setdefault("CURL_CA_BUNDLE", path)
    return path
