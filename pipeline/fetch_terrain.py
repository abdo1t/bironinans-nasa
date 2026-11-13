"""Coverage-aware terrain relief for every real-bundle site -> data/terrain.csv.

DEM choice per site (recorded in the output, never mixed within a site):
  1. SRTMGL1 v003 (NASA SRTM, 1 arc-second)  — coverage 56 S .. 60 N
  2. ASTGTM v003  (ASTER GDEM v3, 1 arc-second) — coverage 83 S .. 83 N, used only
     where SRTM has no coverage. Lower effective resolution and known artefacts
     (cloud/void infill, poor quality over ice/snow) -> quality = "fallback".
  3. Anything else (e.g. > 83 deg) -> relief left null. No other DEM is
     substituted unless its source and quality are documented first.

Metric (identical for every site, so values are comparable):
  window      10 km x 10 km square centred on the site (+/-5 km, converted to
              degrees with the local cos(latitude) for longitude)
  relief_m    robust relief = 99th - 1st percentile of valid elevations in the
              window (percentiles suppress single-pixel spikes/pits)
  elev_m      median elevation in the window
  valid_frac  share of valid pixels; below MIN_VALID_FRAC -> relief null
Both DEMs are posted at 1 arc-second, so the window holds comparable pixel
counts; ASTER's coarser *effective* resolution is noted as a caveat.

Requires a NASA Earthdata login (https://urs.earthdata.nasa.gov) available to
earthaccess non-interactively: a _netrc / .netrc entry for urs.earthdata.nasa.gov
or EARTHDATA_USERNAME / EARTHDATA_PASSWORD environment variables. Without it the
script writes null relief with reason "no Earthdata credentials" and exits 0.

Usage:  python pipeline/fetch_terrain.py
"""
import csv
import math
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import config

WINDOW_HALF_KM = 5.0
KM_PER_DEG_LAT = 111.32
MIN_VALID_FRAC = 0.95
DOWNLOAD_DIR = config.DATA_DIR / "downloads"   # gitignored
OUT_CSV = config.DATA_DIR / "terrain.csv"

DEMS = [
    {"id": "SRTMGL1.003", "short_name": "SRTMGL1", "version": "003", "lat_min": -56.0, "lat_max": 60.0,
     "label": "NASA SRTM v3 1 arc-second (SRTMGL1 v003)", "quality": "primary"},
    {"id": "ASTGTM.003", "short_name": "ASTGTM", "version": "003", "lat_min": -83.0, "lat_max": 83.0,
     "label": "ASTER GDEM v3 1 arc-second (ASTGTM v003)", "quality": "fallback"},
]

OUT_COLUMNS = ["id", "lat", "lon", "dem", "dem_label", "quality", "window_km", "relief_m", "elev_m",
               "valid_frac", "granules", "note", "retrieved_at"]


def window_bounds(lat, lon, half_km=WINDOW_HALF_KM):
    """(west, south, east, north) of a square window of +/-half_km around the point."""
    dlat = half_km / KM_PER_DEG_LAT
    dlon = half_km / (KM_PER_DEG_LAT * max(math.cos(math.radians(lat)), 1e-6))
    return (lon - dlon, lat - dlat, lon + dlon, lat + dlat)


def choose_dem(lat, half_km=WINDOW_HALF_KM):
    """First DEM whose latitude coverage contains the whole window, else None."""
    dlat = half_km / KM_PER_DEG_LAT
    for dem in DEMS:
        if dem["lat_min"] <= lat - dlat and lat + dlat < dem["lat_max"]:
            return dem
    return None


def robust_relief(values, nodata=None, min_valid_frac=MIN_VALID_FRAC):
    """Return (relief_m, median_m, valid_frac) from an elevation array; relief None if too sparse."""
    import numpy as np

    arr = np.asarray(values, dtype="float64").ravel()
    valid = np.isfinite(arr) & (arr > -1000) & (arr < 9000)
    if nodata is not None:
        valid &= arr != nodata
    frac = float(valid.mean()) if arr.size else 0.0
    if frac < min_valid_frac or not valid.any():
        return None, None, round(frac, 4)
    good = arr[valid]
    p1, p50, p99 = np.percentile(good, [1, 50, 99])
    return round(float(p99 - p1), 1), round(float(p50), 1), round(frac, 4)


def _dem_member(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if name.endswith(".hgt") or name.endswith("_dem.tif"):
                return name
    raise RuntimeError(f"no DEM raster inside {zip_path.name}")


def _relief_for(site, dem, earthaccess):
    import rasterio
    from rasterio.merge import merge

    w, s, e, n = window_bounds(site["lat"], site["lon"])
    results = earthaccess.search_data(short_name=dem["short_name"], version=dem["version"], bounding_box=(w, s, e, n))
    if not results:
        return {"note": f"no {dem['id']} granules intersect the window"}
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    paths = earthaccess.download(results, local_path=str(DOWNLOAD_DIR))
    sources = [rasterio.open(f"/vsizip/{p}/{_dem_member(Path(p))}") for p in paths]
    try:
        nodata = sources[0].nodata
        mosaic, _ = merge(sources, bounds=(w, s, e, n))
    finally:
        for src in sources:
            src.close()
    relief, elev, frac = robust_relief(mosaic[0], nodata=nodata)
    note = "" if relief is not None else f"only {frac:.0%} valid pixels (< {MIN_VALID_FRAC:.0%})"
    return {"relief_m": relief, "elev_m": elev, "valid_frac": frac, "note": note,
            "granules": ";".join(sorted(r["umm"]["GranuleUR"] for r in results))}


def read_sites():
    with open(config.SITES_REAL, newline="", encoding="utf-8") as f:
        return [dict(r, lat=float(r["lat"]), lon=float(r["lon"])) for r in csv.DictReader(f)]


def login():
    try:
        import earthaccess
    except ImportError:
        return None, "earthaccess not installed"
    for strategy in ("environment", "netrc"):
        try:
            auth = earthaccess.login(strategy=strategy)
            if auth is not None and getattr(auth, "authenticated", False):
                return earthaccess, ""
        except Exception:  # noqa: BLE001 - try the next strategy
            continue
    return None, "no Earthdata credentials"


def main():
    sites = read_sites()
    earthaccess, why = login()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = []
    for site in sites:
        dem = choose_dem(site["lat"])
        row = {"id": site["id"], "lat": site["lat"], "lon": site["lon"], "window_km": WINDOW_HALF_KM * 2,
               "dem": dem["id"] if dem else "", "dem_label": dem["label"] if dem else "",
               "quality": dem["quality"] if dem else "", "retrieved_at": now}
        if dem is None:
            row["note"] = "outside SRTMGL1 and ASTER GDEM coverage; relief left null"
        elif earthaccess is None:
            row["note"] = f"{why}; relief left null"
        else:
            try:
                row.update(_relief_for(site, dem, earthaccess))
            except Exception as exc:  # keep going; failed sites stay null
                row["note"] = f"failed: {exc}"
        rows.append(row)

    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=OUT_COLUMNS, lineterminator="\n")
        wr.writeheader()
        for r in rows:
            wr.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in OUT_COLUMNS})

    done = sum(1 for r in rows if r.get("relief_m") not in (None, ""))
    print(f"terrain: {done}/{len(rows)} sites with relief -> {OUT_CSV.relative_to(config.ROOT.parent).as_posix()}")
    if earthaccess is None:
        print(f"  NOTE: {why}. Log in once with `python -c \"import earthaccess; earthaccess.login(persist=True)\"` "
              "and rerun.")
    for r in rows:
        print(f"  {r['id']:14} {r['dem'] or '-':12} {r.get('relief_m', '') or 'null':>8}  {r.get('note', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
