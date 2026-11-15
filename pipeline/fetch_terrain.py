"""Credential-free terrain relief for every real-bundle site -> data/terrain.csv.

Why not SRTMGL1 / ASTGTM: both LP DAAC collections live under `lp-prod-protected`
and need a NASA Earthdata login (verified 2026-11-13: an anonymous GET of
.../SRTMGL1.003/S25W071.SRTMGL1.hgt.zip and .../ASTGTM.003/ASTGTMV003_S25W071_dem.tif
returns 302 to urs.earthdata.nasa.gov and ends in 401). This script therefore
reads public Cloud-Optimized GeoTIFFs over HTTPS (window reads, no full downloads):

DEM per site (chosen by latitude coverage of the WHOLE window, never mixed):
  1. NASADEM_HGT v001 (NASA JPL MEaSUREs reprocessing of SRTM, 1 arc-second,
     doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001), COGs on Microsoft Planetary
     Computer (anonymous SAS token). Coverage 56 S .. 60 N  -> quality "primary".
  2. Copernicus DEM GLO-30 Public (ESA / DLR / Airbus, 2021 release,
     doi:10.5270/ESA-c5d3d65), AWS Open Data, global -> used only where the window
     leaves NASADEM coverage (Haughton, McMurdo, Holuhraun) -> "partner-fill".
     Longitude posting grows with latitude (1" < 50 deg, 1.5" 50-60, 2" 60-70,
     3" 70-80, 5" 80-85, 10" > 85); the real posting is recorded per site.
Cross-check (stored, never used for scoring): Copernicus GLO-30 for NASADEM sites,
Copernicus GLO-90 (3" base) for the Copernicus-only sites (resolution check).

Metric (terrain_common, identical for every site and body):
  window          10 km x 10 km square centred on the site (window_bounds_deg)
  relief_native_m P99 - P1 of valid elevations at native posting
  relief_m        P99 - P1 after box-mean aggregation to ~200 m (common_scale_relief)
                  -> this is the value used for scoring
  elev_m          native median elevation in the window
  valid_frac      share of valid native pixels; < MIN_VALID_FRAC -> relief null
Both DEMs are surface models (DSM): vegetation/buildings are included (negligible
at these barren sites). Network or read failure -> relief left empty + note.

Usage:  python fetch_terrain.py [--force]      (cwd = pipeline/)
Rows that already hold relief from the same DEM are reused unless --force.
"""
import csv
import math
import sys
from datetime import datetime, timezone

import config
import terrain_common as tc

OUT_CSV = config.DATA_DIR / "terrain.csv"
NODATA_FILL = -32768.0     # value merge() writes where no tile covers the window
NEAR_ZERO_M = 1.0          # |elev| below this flags possible sea surface in coastal windows
NEAR_ZERO_NOTE_FRAC = 0.02
PAD_PX = 4                 # mosaic padding (pixels) before cropping to the exact window

COP_ATTRIBUTION = ("© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under "
                   "COPERNICUS by the European Union and ESA; all rights reserved")
NASADEM_ATTRIBUTION = "NASA JPL (NASADEM_HGT v001), via Microsoft Planetary Computer"
COP_CITATION_BASE = ("European Space Agency, Sinergise (2021). Copernicus Global Digital Elevation Model "
                     "(COP-DEM), doi:10.5270/ESA-c5d3d65; AWS Open Data registry 'copernicus-dem'")

PC_SAS_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token/nasademeuwest/nasadem-cog"

DEMS = {
    "NASADEM_HGT.001": {
        "id": "NASADEM_HGT.001", "lat_min": -56.0, "lat_max": 60.0, "quality": "primary",
        "label": "NASADEM_HGT v001 (NASA JPL, SRTM reprocessing), 1 arc-second",
        "citation": ("NASA JPL (2020). NASADEM Merged DEM Global 1 arc second V001. NASA EOSDIS Land Processes "
                     "DAAC. doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001"),
        "attribution": NASADEM_ATTRIBUTION,
        "url": "https://nasademeuwest.blob.core.windows.net/nasadem-cog/v001/{name}.tif",
        "needs_sas": True,
    },
    "COP-DEM_GLO-30": {
        "id": "COP-DEM_GLO-30", "lat_min": -90.0, "lat_max": 90.0, "quality": "partner-fill",
        "label": "Copernicus DEM GLO-30 Public (2021 release), 1 arc-second base posting",
        "citation": COP_CITATION_BASE + ", s3://copernicus-dem-30m",
        "attribution": COP_ATTRIBUTION,
        "url": "https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif",
        "needs_sas": False,
    },
    "COP-DEM_GLO-90": {
        "id": "COP-DEM_GLO-90", "lat_min": -90.0, "lat_max": 90.0, "quality": "cross-check",
        "label": "Copernicus DEM GLO-90 Public (2021 release), 3 arc-second base posting",
        "citation": COP_CITATION_BASE + ", s3://copernicus-dem-90m",
        "attribution": COP_ATTRIBUTION,
        "url": "https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif",
        "needs_sas": False,
    },
}
PRIMARY_ORDER = ("NASADEM_HGT.001", "COP-DEM_GLO-30")
CROSS_FOR = {"NASADEM_HGT.001": "COP-DEM_GLO-30", "COP-DEM_GLO-30": "COP-DEM_GLO-90"}

OUT_COLUMNS = ["id", "lat", "lon", "dem", "dem_label", "dem_citation", "quality", "posting_native",
               "relief_native_m", "relief_m", "relief_m_min", "relief_m_max", "elev_m", "valid_frac",
               "cross_dem", "cross_relief_m", "tiles", "attribution", "note", "retrieved_at"]


# --------------------------------------------------------------------------- pure helpers (tested offline)

def choose_dem(lat, lon=0.0, half_km=tc.WINDOW_HALF_KM):
    """First DEM in PRIMARY_ORDER whose latitude coverage contains the whole window."""
    _, s, _, n = tc.window_bounds_deg(lat, lon, half_km)
    for dem_id in PRIMARY_ORDER:
        dem = DEMS[dem_id]
        if dem["lat_min"] <= s and n < dem["lat_max"]:
            return dem
    return None


def cross_dem_for(dem):
    """Independent DEM used only as a cross-check for `dem` (or None)."""
    other = CROSS_FOR.get(dem["id"]) if dem else None
    return DEMS[other] if other else None


def _tile_name(dem_id, lat0, lon0):
    if dem_id == "NASADEM_HGT.001":
        return f"NASADEM_HGT_{'n' if lat0 >= 0 else 's'}{abs(lat0):02d}{'e' if lon0 >= 0 else 'w'}{abs(lon0):03d}"
    res = {"COP-DEM_GLO-30": "10", "COP-DEM_GLO-90": "30"}[dem_id]
    return (f"Copernicus_DSM_COG_{res}_{'N' if lat0 >= 0 else 'S'}{abs(lat0):02d}_00_"
            f"{'E' if lon0 >= 0 else 'W'}{abs(lon0):03d}_00_DEM")


def tile_names(dem_id, bounds):
    """All 1x1 degree tiles (named by their SW corner) intersecting (w, s, e, n)."""
    w, s, e, n = bounds
    eps = 1e-9
    lats = range(math.floor(s), math.floor(n - eps) + 1)
    lons = range(math.floor(w), math.floor(e - eps) + 1)
    return [_tile_name(dem_id, la, lo) for la in lats for lo in lons]


def tile_url(dem, name, sas_token=None):
    url = dem["url"].format(name=name)
    if dem["needs_sas"]:
        if not sas_token:
            raise RuntimeError("no Planetary Computer SAS token")
        url = f"{url}?{sas_token}"
    return url


def pixel_size_m(res_x_deg, res_y_deg, lat):
    """Pixel size (north-south m, east-west m) for a geographic grid at `lat`."""
    dlat_per_km, dlon_per_km = tc.deg_per_km(lat)
    return res_y_deg / dlat_per_km * 1000.0, res_x_deg / dlon_per_km * 1000.0


def posting_label(res_x_deg, res_y_deg, lat):
    py, px = pixel_size_m(res_x_deg, res_y_deg, lat)
    return f"{res_x_deg * 3600:g}x{res_y_deg * 3600:g} arcsec (lon x lat) = {px:.0f} m E-W x {py:.0f} m N-S"


def measure(values, res_x_deg, res_y_deg, lat, nodata=NODATA_FILL):
    """All terrain statistics for one window array. Pure function (no I/O)."""
    import numpy as np

    arr = np.asarray(values, dtype="float64")
    relief_native, elev, frac = tc.relief_stats(arr, nodata=nodata)
    py, px = pixel_size_m(res_x_deg, res_y_deg, lat)
    detail = tc.common_scale_relief_detail(arr, py, px, nodata=nodata)
    relief_common, eff = detail["relief"], detail["posting"]
    rmin, rmax = detail["relief_min"], detail["relief_max"]
    if relief_native is None:
        relief_common = rmin = rmax = None
    valid = np.isfinite(arr) & (arr != nodata)
    near_zero = float((np.abs(arr[valid]) < NEAR_ZERO_M).mean()) if valid.any() else 0.0
    return {"relief_native_m": relief_native, "relief_m": relief_common, "relief_m_min": rmin, "relief_m_max": rmax,
            "elev_m": elev, "valid_frac": frac,
            "posting_native": posting_label(res_x_deg, res_y_deg, lat), "common_posting_m": eff,
            "near_zero_frac": round(near_zero, 4)}


# --------------------------------------------------------------------------- network

def ensure_gdal_ssl():
    """configure_gdal_ssl(), but also after `import rasterio`, which sets
    GDAL_CURL_CA_BUNDLE to certifi's long (non-ASCII here) path itself."""
    import os

    import rasterio  # noqa: F401 - import first so its env default is replaced, not kept

    if not os.environ.get("GDAL_CURL_CA_BUNDLE", "").isascii():
        os.environ.pop("GDAL_CURL_CA_BUNDLE")
        if not os.environ.get("CURL_CA_BUNDLE", "").isascii():
            os.environ.pop("CURL_CA_BUNDLE")
    return tc.configure_gdal_ssl()


GDAL_ENV = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_MAX_RETRY": "3", "GDAL_HTTP_RETRY_DELAY": "2",
            "VSI_CACHE": "TRUE"}


def get_sas_token(session=None):
    import requests

    r = (session or requests).get(PC_SAS_URL, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def read_window(dem, bounds, sas_token=None):
    """Mosaic the DEM tiles over `bounds` via /vsicurl/. Returns (array, res_x, res_y, tiles, missing)."""
    import rasterio
    from rasterio.errors import RasterioIOError
    from rasterio.merge import merge

    names = tile_names(dem["id"], bounds)
    sources, used, missing = [], [], []
    for name in names:
        try:
            sources.append(rasterio.open("/vsicurl/" + tile_url(dem, name, sas_token)))
            used.append(name)
        except RasterioIOError as exc:
            msg = str(exc)
            if "404" in msg or "does not exist" in msg or "No such file" in msg:
                missing.append(name)   # e.g. open-ocean tile that does not exist in the tiling
                continue
            for src in sources:
                src.close()
            raise RuntimeError(f"{name}: {msg.replace(sas_token or '<none>', '<sas>')}") from None
    if not sources:
        raise RuntimeError(f"none of the tiles {names} could be opened")
    try:
        res_x = min(src.res[0] for src in sources)
        res_y = min(src.res[1] for src in sources)
        # merge() with the exact bounds can leave its last row/column unfilled (seen at Atacama:
        # one all-nodata column). Mosaic a window padded by PAD_PX pixels, then crop to `bounds`.
        w, s, e, n = bounds
        # Snap the padded mosaic bounds to the first tile's pixel grid. Without this, merge()
        # builds an output grid offset by a fraction of a pixel, and at a seam between tiles
        # that share an edge column (NASADEM) one native column was dropped (review finding).
        t0 = sources[0].transform
        x0, y0 = t0.c, t0.f

        def snap(v, origin, res, up):
            k = (v - origin) / res
            return origin + (math.ceil(k - 1e-9) if up else math.floor(k + 1e-9)) * res

        padded = (snap(w - PAD_PX * res_x, x0, res_x, False), snap(s - PAD_PX * res_y, y0, res_y, False),
                  snap(e + PAD_PX * res_x, x0, res_x, True), snap(n + PAD_PX * res_y, y0, res_y, True))
        mosaic, transform = merge(sources, bounds=padded, res=(res_x, res_y), nodata=NODATA_FILL)
    finally:
        for src in sources:
            src.close()
    return crop_to_bounds(mosaic[0], transform, bounds), res_x, res_y, used, missing


def crop_to_bounds(arr, transform, bounds):
    """Rows/cols of `arr` (north-up grid with `transform`) whose pixels fall inside `bounds`."""
    w, s, e, n = bounds
    col0 = round((w - transform.c) / transform.a)
    col1 = round((e - transform.c) / transform.a)
    row0 = round((n - transform.f) / transform.e)
    row1 = round((s - transform.f) / transform.e)
    return arr[max(row0, 0):row1, max(col0, 0):col1]


def relief_for(site, dem, sas_token=None, reader=read_window):
    bounds = tc.window_bounds_deg(site["lat"], site["lon"])
    arr, res_x, res_y, used, missing = reader(dem, bounds, sas_token)
    out = measure(arr, res_x, res_y, site["lat"])
    out["tiles"] = ";".join(used)
    out["missing"] = missing
    return out


# --------------------------------------------------------------------------- driver

def read_sites():
    with open(config.SITES_REAL, newline="", encoding="utf-8") as f:
        return [dict(r, lat=float(r["lat"]), lon=float(r["lon"])) for r in csv.DictReader(f)]


def read_existing():
    if not OUT_CSV.exists():
        return {}
    with open(OUT_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows or set(OUT_COLUMNS) - set(rows[0]):
        return {}   # old layout -> recompute everything
    return {r["id"]: r for r in rows}


def build_row(site, now, sas_token=None, token_error="", reader=read_window):
    dem = choose_dem(site["lat"], site["lon"])
    row = {"id": site["id"], "lat": site["lat"], "lon": site["lon"], "retrieved_at": now}
    if dem is None:
        row["note"] = "outside NASADEM and Copernicus DEM coverage; relief left null"
        return row
    row.update(dem=dem["id"], dem_label=dem["label"], dem_citation=dem["citation"], quality=dem["quality"],
               attribution=dem["attribution"])
    notes = []
    try:
        if dem["needs_sas"] and not sas_token:
            raise RuntimeError(f"Planetary Computer SAS token unavailable ({token_error or 'unknown error'})")
        m = relief_for(site, dem, sas_token, reader)
        row.update({k: m[k] for k in ("relief_native_m", "relief_m", "relief_m_min", "relief_m_max", "elev_m",
                                      "valid_frac", "posting_native", "tiles")})
        eff_y, eff_x = m["common_posting_m"]
        notes.append(f"relief_m = mean over all block offsets at {eff_x:.0f} m E-W x {eff_y:.0f} m N-S box-mean "
                     f"posting (offset range {m['relief_m_min']}–{m['relief_m_max']} m)")
        if m["relief_native_m"] is None:
            notes.append(f"only {m['valid_frac']:.0%} valid pixels (< {tc.MIN_VALID_FRAC:.0%}); relief left null")
        if m["missing"]:
            notes.append(f"tiles not found: {';'.join(m['missing'])}")
        if m["near_zero_frac"] >= NEAR_ZERO_NOTE_FRAC:
            notes.append(f"{m['near_zero_frac']:.0%} of window pixels within ±{NEAR_ZERO_M:g} m of 0 "
                         "(likely sea surface: coastal window, P1 may be sea level)")
    except Exception as exc:  # noqa: BLE001 - keep going; failed sites stay null
        notes.append(f"failed ({dem['id']}): {exc}; relief left null")

    cross = cross_dem_for(dem)
    if cross is not None:
        row["cross_dem"] = cross["id"]
        try:
            if cross["needs_sas"] and not sas_token:
                raise RuntimeError("Planetary Computer SAS token unavailable")
            c = relief_for(site, cross, sas_token, reader)
            row["cross_relief_m"] = c["relief_m"]
            notes.append(f"cross {cross['id']}: native relief {c['relief_native_m']} m at "
                         f"{c['posting_native'].split(' = ')[0]}, median {c['elev_m']} m")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"cross-check {cross['id']} failed: {exc}")
    if cross is not None and cross["attribution"] != dem["attribution"]:
        row["attribution"] = f"{dem['attribution']} | cross-check: {cross['attribution']}"
    row["note"] = "; ".join(notes)
    return row


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    force = "--force" in argv
    ensure_gdal_ssl()
    sites = read_sites()
    existing = {} if force else read_existing()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    sas_token, token_error = None, ""
    try:
        sas_token = get_sas_token()
    except Exception as exc:  # noqa: BLE001 - NASADEM sites will carry the reason
        token_error = str(exc)

    import rasterio

    rows = []
    with rasterio.Env(**GDAL_ENV):
        for site in sites:
            old = existing.get(site["id"])
            dem = choose_dem(site["lat"], site["lon"])
            if (old and old.get("relief_m") and dem and old.get("dem") == dem["id"]
                    and old.get("cross_relief_m") and float(old["lat"]) == site["lat"]
                    and float(old["lon"]) == site["lon"]):
                rows.append(old)
                continue
            rows.append(build_row(site, now, sas_token, token_error))
            print(f"  {site['id']:14} {rows[-1].get('dem', '-'):16} relief_m={rows[-1].get('relief_m')}", flush=True)

    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=OUT_COLUMNS, lineterminator="\n")
        wr.writeheader()
        for r in rows:
            wr.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in OUT_COLUMNS})

    done = sum(1 for r in rows if r.get("relief_m") not in (None, ""))
    print(f"terrain: {done}/{len(rows)} sites with relief -> {OUT_CSV.relative_to(config.ROOT.parent).as_posix()}")
    print(f"  {'id':14} {'dem':16} {'relief_m':>9} {'native':>8} {'cross':>8} {'elev':>8}  note")
    for r in rows:
        print(f"  {r['id']:14} {r.get('dem') or '-':16} {str(r.get('relief_m') or 'null'):>9} "
              f"{str(r.get('relief_native_m') or ''):>8} {str(r.get('cross_relief_m') or ''):>8} "
              f"{str(r.get('elev_m') or ''):>8}  {r.get('note', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
