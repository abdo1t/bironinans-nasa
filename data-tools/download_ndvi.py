"""Download MODIS NDVI (MOD13A1, 500 m, 16-day) cut-outs for the 12 Earth sites.

Used to replace the hand-written aridity numbers and to mask vegetated sites out of
the radar-based geology axis. One composite per month of 2024 (falls back to 2023 / 2022
if the catalog is incomplete), 50 km x 50 km on a 50 x 50 grid, NDVI = DN * 0.0001.

Usage:  python data-tools/download_ndvi.py        (safe to re-run; present files are skipped)
Reuses the helpers in download_raw_data.py. Appends to Raw Data/manifest.csv.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import download_raw_data as d   # noqa: E402

COLLECTION = "modis-13A1-061"
ASSET = "500m_16_days_NDVI"


def main():
    for sid, name, lat, lon, role, note in d.SITES:
        d.log(f"--- NDVI {sid}")
        try:
            h, v = d.modis_tile(lat, lon)
            tile_tag = f".h{h:02d}v{v:02d}."
            for year in (d.MODIS_YEAR, d.MODIS_YEAR - 1, d.MODIS_YEAR - 2):
                res = d.post_json(d.PC_STAC, {"collections": [COLLECTION],
                                              "intersects": {"type": "Point", "coordinates": [lon, lat]},
                                              "datetime": f"{year}-01-01/{year}-12-31", "limit": 500})
                by_month = {}
                for f in sorted(res.get("features", []),
                                key=lambda f: f["properties"].get("start_datetime") or f["properties"]["datetime"]):
                    if not f["id"].startswith("MOD13A1") or tile_tag not in f["id"]:
                        continue
                    day = (f["properties"].get("start_datetime") or f["properties"]["datetime"])[:10]
                    if not day.startswith(str(year)):      # 16-day composites straddle year ends
                        continue
                    by_month.setdefault(day[:7], (day, f["id"]))
                if len(by_month) == 12:
                    break
                d.log(f"{sid}: {len(by_month)} of 12 months in {year}, trying earlier year")
            if not by_month:
                d.failures.append((f"Earth/MODIS_NDVI_16day/{sid}", "-", "no MOD13A1 items"))
                continue
            bb = d.box(lat, lon, d.MODIS_HALF_KM)
            for month, (day, item) in sorted(by_month.items()):
                d.download(d.bbox_url(COLLECTION, item, [ASSET], bb, d.MODIS_PX),
                           f"Earth/MODIS_NDVI_16day/{sid}/MOD13A1_{day}_NDVI.tif",
                           "MODIS MOD13A1 v061 NDVI (Microsoft Planetary Computer; NASA LP DAAC data)")
        except Exception as e:
            d.failures.append((f"Earth/MODIS_NDVI_16day/{sid}", "-", str(e)))
            d.log(f"NDVI failed for {sid}: {e}")

    # append to the existing manifest instead of rewriting it
    path = os.path.join(d.ROOT, "manifest.csv")
    if d.manifest and os.path.exists(path):
        try:
            with open(path, newline="", encoding="utf-8") as f:
                existing = list(csv.DictReader(f))
            seen = {r["path"] for r in existing}
            fields = list(existing[0].keys()) if existing else list(d.manifest[0].keys())
            with open(path, "a", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fields)
                for r in d.manifest:
                    if r["path"] not in seen:
                        w.writerow({k: r.get(k, "") for k in fields})
        except PermissionError:      # e.g. manifest.csv is open in Excel
            side = os.path.join(d.ROOT, "manifest_ndvi.csv")
            with open(side, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=list(d.manifest[0].keys()))
                w.writeheader()
                w.writerows(d.manifest)
            print(f"manifest.csv is locked; wrote {side} instead")
    print(f"{len(d.manifest)} files recorded, {len(d.failures)} failures")
    for fl in d.failures:
        print("FAILED:", fl)


if __name__ == "__main__":
    main()
