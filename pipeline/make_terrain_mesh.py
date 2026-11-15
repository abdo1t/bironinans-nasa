"""Elevation grids for the Planetary Mirror "3D terrain" view.

One-off script, like make_target_preview.py / make_site_preview.py. NOT part of build_bundle.py:
it never touches web/public/data and changes no score. It re-reads the SAME 450 x 450, 60 m
height grids those two scripts shade into the preview images, and writes them coarsened so the
browser can build a mesh from real heights instead of from the coloured picture:

  web/public/previews/<key>-dem.i16   heights, int16 little-endian, metres (rounded), row-major,
                                      north/up row first; NODATA = -32768
  web/src/data/terrainMeshes.json     size, cell size, min/max, scoring-window cells, sha256,
                                      source and height reference, keyed "target:<id>" / "site:<id>"

Coarsening: mean of 3 x 3 blocks of the 60 m grid (NaN-aware) -> 150 x 150 cells of 180 m. The
window, orientation, height reference and source are those of the matching preview image.
Targets read the cached planetary rasters (no download); Earth sites read the scored DEM through
fetch_terrain's public window reader (network, as make_site_preview.py).

Usage (cwd = pipeline/):  python make_terrain_mesh.py [--only target:mars-jezero ...]
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import sys

import config
import fetch_terrain as ft
import make_site_preview as msp
import make_target_preview as mtp
import terrain_common as tc

WEB_DIR = config.ROOT.parent / "web"
META_JSON = WEB_DIR / "src" / "data" / "terrainMeshes.json"
SITE_PREVIEWS = WEB_DIR / "src" / "data" / "sitePreviews.json"
TARGET_PREVIEWS = WEB_DIR / "src" / "data" / "terrainPreviews.json"
FACTOR = 3                     # 450 px of 60 m -> 150 cells of 180 m
NODATA = -32768


def coarsen(z, factor=FACTOR):
    """NaN-aware block mean; a block with under half valid pixels is NaN. Ragged edges are dropped."""
    import numpy as np

    z = np.asarray(z, dtype="float64")
    h, w = (z.shape[0] // factor) * factor, (z.shape[1] // factor) * factor
    blocks = z[:h, :w].reshape(h // factor, factor, w // factor, factor)
    valid = np.isfinite(blocks).sum(axis=(1, 3))
    total = np.nansum(blocks, axis=(1, 3))
    mean = total / np.maximum(valid, 1)
    return np.where(valid * 2 >= factor * factor, mean, np.nan)


def encode(zc):
    """Coarse heights -> (int16 LE bytes, info)."""
    import numpy as np

    valid = np.isfinite(zc)
    if not valid.any():
        raise ValueError("no valid heights")
    q = np.where(valid, np.rint(zc), NODATA)
    if q[valid].min() <= NODATA or q[valid].max() > 32767:
        raise ValueError("heights do not fit int16")
    data = q.astype("<i2").tobytes()
    return data, {"minM": float(zc[valid].min()), "maxM": float(zc[valid].max()), "nodataCells": int((~valid).sum())}


def entry_for(key, z, preview, mpp_y, mpp_x, source, height_ref, orientation):
    zc = coarsen(z)
    data, info = encode(zc)
    name = f"previews/{key.replace(':', '-')}-dem.i16"
    (WEB_DIR / "public" / name).write_bytes(data)
    return {
        "file": name,
        "rows": int(zc.shape[0]),
        "cols": int(zc.shape[1]),
        "cellM": [round(mpp_y * FACTOR, 3), round(mpp_x * FACTOR, 3)],   # [north-south/Y, east-west/X]
        "widthKm": round(zc.shape[1] * mpp_x * FACTOR / 1000.0, 2),
        "minM": round(info["minM"], 1),
        "maxM": round(info["maxM"], 1),
        "nodata": NODATA,
        "nodataCells": info["nodataCells"],
        # the 10 km relief window and the reference point, in cell units [left, top, right, bottom] / [x, y]
        "scoringWindowCells": [round(v / FACTOR, 2) for v in preview["scoringWindowPx"]],
        "markerCells": [round(v / FACTOR, 2) for v in preview["markerPx"]],
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "source": source,
        "heightReference": height_ref,
        "orientation": orientation,
        "method": f"mean of {FACTOR} x {FACTOR} blocks of the {mpp_x:g} m preview grid (the same heights the "
                  "preview image shades); heights rounded to whole metres",
        "image": preview["image"],
    }


def target_entries(only):
    previews = json.loads(TARGET_PREVIEWS.read_text(encoding="utf-8"))
    out = {}
    for tid in sorted(mtp.TARGETS):
        key = f"target:{tid}"
        if only and key not in only:
            continue
        cfg = mtp.TARGETS[tid]
        _entry, _data, s = mtp.build_entry(tid, write=False)
        g = s["geom"]
        p = previews[tid]
        src = p.get("source", {})
        out[key] = entry_for(key, s["z"], p, g["mpp"], g["mpp_x"], src.get("shortName") or cfg["short_name"],
                             cfg["height_reference"], cfg["orientation"])
        print(f"{key}: {out[key]['rows']}x{out[key]['cols']}, {out[key]['minM']}..{out[key]['maxM']} m")
    return out


def site_entries(only):
    previews = json.loads(SITE_PREVIEWS.read_text(encoding="utf-8"))
    keys = [f"site:{sid}" for sid in sorted(previews) if not only or f"site:{sid}" in only]
    if not keys:
        return {}
    ft.ensure_gdal_ssl()
    import rasterio

    sites = {s["id"]: s for s in ft.read_sites()}
    with open(ft.OUT_CSV, newline="", encoding="utf-8") as f:
        rows = {r["id"]: r for r in csv.DictReader(f)}
    sas = ft.get_sas_token()
    out = {}
    with rasterio.Env(**ft.GDAL_ENV):
        for key in keys:
            sid = key.split(":", 1)[1]
            site, row, p = sites[sid], rows[sid], previews[sid]
            dem = ft.DEMS[row["dem"]]
            bounds = tc.window_bounds_deg(site["lat"], site["lon"], half_km=msp.PREVIEW_KM / 2.0)
            arr, res_x, res_y, _tiles, _missing = ft.read_window(dem, bounds, sas if dem["needs_sas"] else None)
            z, _grid = msp.site_grid(arr, res_x, res_y, site["lat"])
            out[key] = entry_for(key, z, p, msp.MPP, msp.MPP, p["source"]["dataset"],
                                 p["projection"]["heightReference"], "North is up and east is right.")
            print(f"{key}: {out[key]['rows']}x{out[key]['cols']}, {out[key]['minM']}..{out[key]['maxM']} m")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", action="append", help="key such as target:mars-jezero or site:atacama")
    args = ap.parse_args(argv)
    only = set(args.only or [])
    old = json.loads(META_JSON.read_text(encoding="utf-8")) if META_JSON.exists() else {}
    new = {**target_entries(only), **site_entries(only)}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    for k, v in new.items():
        old[k] = {**v, "generatedAt": now, "script": "pipeline/make_terrain_mesh.py"}
    with open(META_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump({k: old[k] for k in sorted(old)}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("wrote web/src/data/terrainMeshes.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
