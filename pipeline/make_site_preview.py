"""Offline terrain preview images for the Earth candidate sites (Planetary Mirror).

One-off script, the Earth twin of make_target_preview.py. NOT part of build_bundle.py; it
never touches web/public/data or web/public-mock and changes no score. It reads the SAME
DEM each site's relief was scored on (data/terrain.csv `dem`: NASADEM_HGT v001, or
Copernicus GLO-30 where the window leaves NASADEM coverage) through fetch_terrain's public,
credential-free window reader, and writes

  web/public/previews/site-<id>-terrain.webp   shaded-relief image
  web/src/data/sitePreviews.json              caption + provenance metadata, keyed by site id

The rendering matches the Jezero target preview so the two can sit side by side honestly:
  window   26.98 km x 26.98 km on the ground, centred on the site (the Jezero preview window)
  pixels   60 m square ground pixels, 450 x 450 (Jezero: 60 m, 450 x 450)
  colour   the same cividis ramp, stretched to THIS image's own min..max (stated in the JSON)
  shading  the same numpy hillshade, light from the upper left at 45 deg, NO vertical exaggeration
  marks    ring at the site, 10 km x 10 km scoring-window square, 10 km scale bar, no text
Geographic grid: WGS84 lat/lon, heights above the EGM96 (NASADEM) / EGM2008 (Copernicus)
geoid. The window half-width is converted to degrees on the 6371 km sphere, as for the
scoring window (terrain_common.window_bounds_deg); the native grid is box-mean aggregated by
integer factors toward 60 m, then linearly resampled on both axes to the square 450 x 450
grid. North is up, east is right.

Usage (cwd = pipeline/):  python make_site_preview.py [--site ID ...]
Needs network access (public COG window reads; NASADEM uses an anonymous Planetary
Computer SAS token).
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import sys

import config
import fetch_terrain as ft
import make_target_preview as mtp
import terrain_common as tc

WEB_DIR = config.ROOT.parent / "web"
PREVIEW_DIR = WEB_DIR / "public" / "previews"
META_JSON = WEB_DIR / "src" / "data" / "sitePreviews.json"
SCRIPT_NAME = "pipeline/make_site_preview.py"

PREVIEW_KM = 26.98            # the Jezero preview window, so both images share one ground scale
MPP = 60.0                    # metres per output pixel (both previews)
SIZE_PX = round(PREVIEW_KM * 1000.0 / MPP)    # 450
SCORING_KM = 2.0 * tc.WINDOW_HALF_KM          # 10 km relief window
SCALE_BAR_KM = 10.0


def resample_rows(a, new_height):
    """Linear resample along rows (pixel-centre aligned); the row twin of mtp.resample_columns."""
    return mtp.resample_columns(a.T, new_height).T


def site_grid(arr, res_x_deg, res_y_deg, lat):
    """Native geographic window -> (heights [SIZE_PX, SIZE_PX] in m with NaN nodata, info)."""
    import numpy as np

    a = np.asarray(arr, dtype="float64")
    a = np.where(a == ft.NODATA_FILL, np.nan, a)
    py, px = ft.pixel_size_m(res_x_deg, res_y_deg, lat)
    fy, fx = max(1, round(MPP / py)), max(1, round(MPP / px))
    agg = tc.block_mean(a, fy, fx, nodata=None)
    z = resample_rows(mtp.resample_columns(agg, SIZE_PX), SIZE_PX)
    return z, {"nativeM": [round(py, 2), round(px, 2)], "blockFactors": [fy, fx],
               "aggregatedShape": list(agg.shape), "nativeShape": list(a.shape)}


def overlays():
    c = SIZE_PX / 2.0
    half = SCORING_KM * 1000.0 / MPP / 2.0
    return {"marker": (c, c), "square": (c - half, c - half, c + half, c + half),
            "bar_px": mtp.scale_bar_px(SCALE_BAR_KM, MPP)}


def load_terrain_rows():
    with open(ft.OUT_CSV, newline="", encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def _num(row, key):
    v = row.get(key)
    return float(v) if v not in (None, "") else None


def build_entry(site, row, sas_token):
    dem = ft.DEMS[row["dem"]]          # the scored DEM, never re-chosen
    bounds = tc.window_bounds_deg(site["lat"], site["lon"], half_km=PREVIEW_KM / 2.0)
    arr, res_x, res_y, tiles, missing = ft.read_window(dem, bounds, sas_token if dem["needs_sas"] else None)
    z, grid = site_grid(arr, res_x, res_y, site["lat"])
    ov = overlays()
    rgb, info = mtp.render(z, MPP, MPP, ov["marker"], ov["square"], ov["bar_px"])
    data = mtp.encode_webp(rgb)
    if len(data) > mtp.MAX_BYTES:
        raise SystemExit(f"{site['id']}: image is {len(data)} bytes, over the budget")
    image = f"previews/site-{site['id']}-terrain.webp"
    (WEB_DIR / "public" / image).write_bytes(data)
    return {
        "siteId": site["id"],
        "image": image,
        "widthPx": SIZE_PX,
        "heightPx": SIZE_PX,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "windowKm": PREVIEW_KM,
        "metresPerPixel": MPP,
        "markerPx": [round(v, 2) for v in ov["marker"]],
        "scoringWindowKm": SCORING_KM,
        "scoringWindowPx": [round(v, 2) for v in ov["square"]],
        "scaleBarKm": SCALE_BAR_KM,
        "scaleBarPx": round(ov["bar_px"], 2),
        "site": {"lat": site["lat"], "lon": site["lon"]},
        "projection": {
            "frame": "WGS84 geographic latitude/longitude (EPSG:4326)",
            "heightReference": "EGM96 geoid" if dem["id"].startswith("NASADEM") else "EGM2008 geoid",
            "note": (f"Native grid {res_x * 3600:g}\" x {res_y * 3600:g}\" (lon x lat) = {grid['nativeM'][1]:.0f} m "
                     f"E-W x {grid['nativeM'][0]:.0f} m N-S here; box mean {grid['blockFactors'][0]} x "
                     f"{grid['blockFactors'][1]} (rows x cols), then linear resampling to square {MPP:.0f} m "
                     f"ground pixels. North is up, east is right."),
        },
        "source": {
            "dataset": dem["label"],
            "citation": dem["citation"],
            "attribution": dem["attribution"],
            "quality": row.get("quality"),
            "tiles": tiles,
            "missingTiles": missing,
            "sameAsScored": True,
        },
        "elevation": {
            "minM": round(info["min"], 1),
            "maxM": round(info["max"], 1),
            "ramp": mtp.ramp_legend(info["min"], info["max"]),
            "rampName": "cividis (colour-blind-safe, lightness increases with elevation)",
            "note": "colours stretch to this image's own elevation range",
            "nodataPixels": info["nodata"],
            # coastal windows: DEM sea surface is ~0 m and must not be read as land
            "nearSeaLevelFrac": round(float((abs(z) < ft.NEAR_ZERO_M).mean()), 4),
        },
        "hillshade": {"azimuthDeg": mtp.AZIMUTH_DEG, "altitudeDeg": mtp.ALTITUDE_DEG, "vertExag": mtp.VERT_EXAG},
        "relief": {"scoredReliefM": _num(row, "relief_m"),
                   "reliefRangeM": [_num(row, "relief_m_min"), _num(row, "relief_m_max")],
                   "windowKm": SCORING_KM, "postingM": tc.COMMON_POSTING_M, "dem": dem["id"]},
        "script": SCRIPT_NAME,
    }


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--site", action="append", help="site id (default: every site in terrain.csv)")
    args = p.parse_args(argv)
    ft.ensure_gdal_ssl()
    import rasterio

    sites = {s["id"]: s for s in ft.read_sites()}
    rows = load_terrain_rows()
    ids = args.site or [i for i in sites if rows.get(i, {}).get("dem")]
    sas = ft.get_sas_token() if any(rows[i]["dem"].startswith("NASADEM") for i in ids) else None
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    old = json.loads(META_JSON.read_text(encoding="utf-8")) if META_JSON.exists() else {}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    with rasterio.Env(**ft.GDAL_ENV):
        for sid in ids:
            entry = build_entry(sites[sid], rows[sid], sas)
            old[sid] = {**entry, "generatedAt": now}
            print(f"{sid}: {entry['bytes']} B, elev {entry['elevation']['minM']}..{entry['elevation']['maxM']} m, "
                  f"nodata {entry['elevation']['nodataPixels']}, {entry['source']['dataset'][:24]}")
    out = {k: old[k] for k in sorted(old)}
    with open(META_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
