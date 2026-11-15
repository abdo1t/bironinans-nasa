"""Download the raw datasets named in the brief's Data plan into "Raw Data/".

Usage:  python -I data-tools/download_raw_data.py [--only moon|earth] [--site <site_id>]

Re-running is safe: files already present with the expected size are skipped.
Writes Raw Data/sites.csv, Raw Data/manifest.csv and Raw Data/download_log.txt.
Standard library only.
"""
import csv, datetime as dt, hashlib, json, math, os, sys, time, urllib.request, urllib.error

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Raw Data")
UA = {"User-Agent": "analog-portfolio-planner-downloader/1.0"}
PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
PC_DATA = "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox"
PDS = "https://pds-geosciences.wustl.edu/lro"
YEAR = 2025          # Sentinel-1 scene year
MODIS_YEAR = 2024    # Planetary Computer's 2025 MODIS archive has a Jul-Oct gap; 2024 is complete
S1_HALF_KM, S1_PX = 5, 1000        # 10 km box on a fixed 1000 x 1000 grid (~10 m pixels)
MODIS_HALF_KM, MODIS_PX = 25, 50   # 50 km box on a fixed 50 x 50 grid (~1 km pixels)

# Earth candidate sites: brief (known analogs), team candidates PDF, prototype JSON, plus a negative control.
SITES = [
    ("devon_haughton", "Haughton Crater, Devon Island, Canada", 75.383, -89.667, "known analog", "polar; low sun"),
    ("atacama_yungay", "Atacama Desert (Yungay), Chile", -24.100, -70.020, "known analog", "hyperarid"),
    ("meteor_crater", "Meteor Crater, Arizona, USA", 35.027, -111.022, "known analog", "impact crater"),
    ("mcmurdo_dry_valleys", "McMurdo Dry Valleys (Wright Valley), Antarctica", -77.530, 161.700, "known analog", "polar; cold-dry"),
    ("death_valley_ubehebe", "Death Valley (Ubehebe Crater), USA", 37.010, -117.450, "known analog", "prototype JSON lists Badwater/Ubehebe"),
    ("iceland_holuhraun", "Holuhraun lava field, Iceland", 64.850, -16.833, "known analog", "basaltic terrain"),
    ("lanzarote_cueva_verdes", "Cueva de los Verdes lava tubes, Lanzarote, Spain", 29.159, -13.438, "candidate", "lava tubes"),
    ("egypt_western_desert", "Kharga Depression yardangs (mud lions), Western Desert, Egypt", 25.580, 30.620, "discovery case", "depression-floor yardang field N of Kharga (Breed & McCauley); point picked on DEM floor - confirm on imagery"),
    ("dallol_ethiopia", "Dallol, Ethiopia", 14.240, 40.300, "candidate", "acid-saline hydrothermal"),
    ("mistastin_crater", "Mistastin Lake crater, Canada", 55.880, -63.310, "candidate", "anorthositic impact melt"),
    ("pilbara_strelley_pool", "Strelley Pool, Pilbara, Australia", -21.11094, 119.13709, "candidate", "locality coordinates from Retallack et al. 2023"),
    ("amazon_negative_control", "Amazon rainforest near Manaus, Brazil", -3.000, -60.000, "negative control", "should score near zero"),
]

MOON = [  # (subfolder, url, source)
    ("Moon/LOLA_DEM_80S_80m", f"{PDS}/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ldem_80s_80m_float.img", "LRO LOLA (PDS Geosciences)"),
    ("Moon/LOLA_DEM_80S_80m", f"{PDS}/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ldem_80s_80m_float.lbl", "LRO LOLA (PDS Geosciences)"),
    ("Moon/LOLA_DEM_80S_80m", f"{PDS}/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ldem_80s_80m_float.xml", "LRO LOLA (PDS Geosciences)"),
    ("Moon/LOLA_Illumination_South", "https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608.TIF", "LOLA-derived illumination (NASA GSFC PGDA)"),
    ("Moon/LOLA_Illumination_South", "https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608.TIF", "LOLA-derived illumination (NASA GSFC PGDA)"),
    ("Moon/Diviner_PolarResource_South", f"{PDS}/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab", "LRO Diviner (PDS Geosciences)"),
    ("Moon/Diviner_PolarResource_South", f"{PDS}/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.lbl", "LRO Diviner (PDS Geosciences)"),
    ("Moon/Diviner_PolarResource_South", f"{PDS}/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.xml", "LRO Diviner (PDS Geosciences)"),
    ("Moon/Diviner_PolarResource_South", f"{PDS}/urn-nasa-pds-lro_diviner_derived1/label/dlre_prp.fmt", "LRO Diviner (PDS Geosciences)"),
    ("Moon/MiniRF_CPR_Global_32ppd", f"{PDS}/lro-l-mrflro-5-global-mosaic-v1/lromrf_1001/data/32ppd/global_cpr_32ppd_simp_0c.img", "LRO Mini-RF (PDS Geosciences)"),
    ("Moon/MiniRF_CPR_Global_32ppd", f"{PDS}/lro-l-mrflro-5-global-mosaic-v1/lromrf_1001/data/32ppd/global_cpr_32ppd_simp_0c.lbl", "LRO Mini-RF (PDS Geosciences)"),
    ("Moon/MiniRF_CPR_Global_32ppd", f"{PDS}/lro-l-mrflro-5-global-mosaic-v1/lromrf_1001/data/32ppd/global_cpr_32ppd_simp_0c.xml", "LRO Mini-RF (PDS Geosciences)"),
]

manifest, failures = [], []


def log(msg):
    line = f"{dt.datetime.now(dt.timezone.utc):%Y-%m-%dT%H:%M:%SZ} {msg}"
    print(line, flush=True)
    with open(os.path.join(ROOT, "download_log.txt"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


def http(url, data=None, headers=None, timeout=300):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    return urllib.request.urlopen(req, timeout=timeout)


def post_json(url, body):
    for attempt in range(4):
        try:
            with http(url, json.dumps(body).encode(), {"Content-Type": "application/json"}, 120) as r:
                return json.load(r)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, rel_path, source):
    dest = os.path.join(ROOT, rel_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(4):
        try:
            with http(url) as r:
                expected = r.headers.get("Content-Length")
                expected = int(expected) if expected else None
                if os.path.exists(dest) and expected and os.path.getsize(dest) == expected:
                    log(f"skip (present) {rel_path}")
                    break
                tmp = dest + ".part"
                with open(tmp, "wb") as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
                if expected and os.path.getsize(tmp) != expected:
                    raise IOError(f"size mismatch {os.path.getsize(tmp)} != {expected}")
                os.replace(tmp, dest)
                log(f"ok {rel_path} ({os.path.getsize(dest):,} bytes)")
                break
        except Exception as e:
            log(f"retry {attempt + 1} {rel_path}: {e}")
            if attempt == 3:
                failures.append((rel_path, url, str(e)))
                return False
            time.sleep(5 * (attempt + 1))
    manifest.append({
        "path": rel_path.replace("\\", "/"), "source": source, "url": url,
        "bytes": os.path.getsize(dest), "sha256": sha256(dest),
        "downloaded_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    })
    return True


def box(lat, lon, half_km):
    dlat = half_km / 111.32
    dlon = half_km / (111.32 * max(math.cos(math.radians(lat)), 0.05))
    return [round(lon - dlon, 5), round(lat - dlat, 5), round(lon + dlon, 5), round(lat + dlat, 5)]


def cop_dem_tile(lat, lon):
    la, lo = math.floor(lat), math.floor(lon)
    name = f"Copernicus_DSM_COG_10_{'N' if la >= 0 else 'S'}{abs(la):02d}_00_{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00_DEM"
    return name, f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


def modis_tile(lat, lon):
    """MODIS sinusoidal tile (h, v) that actually contains the point. STAC footprints overlap
    at high latitude, so filtering by tile avoids picking a neighbour that has no data here."""
    r, size = 6371007.181, 1111950.5197
    x = r * math.radians(lon) * math.cos(math.radians(lat))
    y = r * math.radians(lat)
    return int((x + 20015109.354) // size), int((10007554.677 - y) // size)


def bbox_url(collection, item, assets, bb, px):
    # Fixed output size: without it the service picks a very coarse grid at high latitude.
    a = "&".join(f"assets={x}" for x in assets)
    return f"{PC_DATA}/{bb[0]},{bb[1]},{bb[2]},{bb[3]}/{px}x{px}.tif?collection={collection}&item={item}&{a}"


def earth(site=None):
    for sid, name, lat, lon, role, note in SITES:
        if site and sid != site:
            continue
        log(f"--- {sid}")
        # 1. Copernicus DEM GLO-30, full 1x1 degree tile
        tname, url = cop_dem_tile(lat, lon)
        download(url, f"Earth/Copernicus_DEM_GLO30/{sid}/{tname}.tif", "Copernicus DEM GLO-30 (AWS open data)")

        # 2. Sentinel-1 RTC, latest 2025 scene, 10 km x 10 km cut-out, VV and VH
        try:
            res = post_json(PC_STAC, {"collections": ["sentinel-1-rtc"],
                                      "intersects": {"type": "Point", "coordinates": [lon, lat]},
                                      "datetime": f"{YEAR}-01-01/{YEAR}-12-31", "limit": 1})
            feats = res.get("features", [])
            if not feats:
                failures.append((f"Earth/Sentinel1_RTC/{sid}", "-", f"no Sentinel-1 RTC scene in {YEAR}"))
                log(f"no Sentinel-1 RTC scene for {sid}")
            else:
                item = feats[0]["id"]
                bb = box(lat, lon, S1_HALF_KM)
                pols = [p for p in ("vv", "vh", "hh", "hv") if p in feats[0]["assets"]]  # polar scenes are HH/HV
                if not pols:
                    failures.append((f"Earth/Sentinel1_RTC/{sid}", item, "no polarization assets"))
                for pol in pols:
                        download(bbox_url("sentinel-1-rtc", item, [pol], bb, S1_PX),
                                 f"Earth/Sentinel1_RTC/{sid}/{item}_{pol}.tif",
                                 "Sentinel-1 RTC (Microsoft Planetary Computer; ESA Copernicus data)")
        except Exception as e:
            failures.append((f"Earth/Sentinel1_RTC/{sid}", "-", str(e)))
            log(f"Sentinel-1 search failed for {sid}: {e}")

        # 3. MODIS Terra LST 8-day (MOD11A2), first composite of each month, day+night, 50 km x 50 km
        try:
            h, v = modis_tile(lat, lon)
            tile_tag = f".h{h:02d}v{v:02d}."
            # The catalog has gaps for some tiles; fall back to earlier years until one has all 12 months.
            for year in (MODIS_YEAR, MODIS_YEAR - 1, MODIS_YEAR - 2):
                res = post_json(PC_STAC, {"collections": ["modis-11A2-061"],
                                          "intersects": {"type": "Point", "coordinates": [lon, lat]},
                                          "datetime": f"{year}-01-01/{year}-12-31", "limit": 500})
                by_month = {}
                for f in sorted(res.get("features", []), key=lambda f: f["properties"].get("start_datetime") or f["properties"]["datetime"]):
                    if not f["id"].startswith("MOD11A2") or tile_tag not in f["id"]:
                        continue
                    d = (f["properties"].get("start_datetime") or f["properties"]["datetime"])[:10]
                    by_month.setdefault(d[:7], (d, f["id"]))
                if len(by_month) == 12:
                    break
                log(f"{sid}: tile {tile_tag.strip('.')} has {len(by_month)} of 12 months in {year}, trying earlier year")
            if year != MODIS_YEAR:
                log(f"{sid}: using MODIS year {year}")
            if not by_month:
                failures.append((f"Earth/MODIS_LST_8day/{sid}", "-", f"no MOD11A2 items for tile {tile_tag.strip('.')}"))
            elif len(by_month) < 12:
                failures.append((f"Earth/MODIS_LST_8day/{sid}", "-", f"only {len(by_month)} of 12 months in {year}"))
            bb = box(lat, lon, MODIS_HALF_KM)
            for month, (d, item) in sorted(by_month.items()):
                download(bbox_url("modis-11A2-061", item, ["LST_Day_1km", "LST_Night_1km"], bb, MODIS_PX),
                         f"Earth/MODIS_LST_8day/{sid}/MOD11A2_{d}_LST_day_night.tif",
                         "MODIS MOD11A2 v061 LST (Microsoft Planetary Computer; NASA LP DAAC data)")
        except Exception as e:
            failures.append((f"Earth/MODIS_LST_8day/{sid}", "-", str(e)))
            log(f"MODIS search failed for {sid}: {e}")


def moon():
    for sub, url, source in MOON:
        download(url, f"{sub}/{url.rsplit('/', 1)[1]}", source)


def write_tables():
    with open(os.path.join(ROOT, "sites.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["site_id", "name", "lat", "lon", "role", "note"])
        w.writerows(SITES)
    path = os.path.join(ROOT, "manifest.csv")
    old = {}
    if os.path.exists(path):
        with open(path, newline="", encoding="utf-8") as f:
            old = {r["path"]: r for r in csv.DictReader(f)}
    for r in manifest:
        old[r["path"]] = r
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "source", "url", "bytes", "sha256", "downloaded_utc"])
        w.writeheader()
        for k in sorted(old):
            if os.path.exists(os.path.join(ROOT, k)):  # drop rows for files that were removed
                w.writerow(old[k])


if __name__ == "__main__":
    os.makedirs(ROOT, exist_ok=True)
    try:  # fail now, not after the downloads, if something (usually Excel) has the manifest open
        open(os.path.join(ROOT, "manifest.csv"), "a").close()
    except PermissionError:
        sys.exit("Raw Data/manifest.csv is locked. Close Excel (or any program that has it open) and run again.")
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    site = sys.argv[sys.argv.index("--site") + 1] if "--site" in sys.argv else None
    log(f"start (only={only}, site={site})")
    try:
        if only in (None, "earth"):
            earth(site)
        if only in (None, "moon"):
            moon()
    finally:
        write_tables()
        for p, u, e in failures:
            log(f"FAILED {p}: {e}")
        log(f"done: {len(manifest)} files recorded, {len(failures)} failures")
