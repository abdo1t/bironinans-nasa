"""Credential-free bare-ground evidence (MODIS NDVI) for every real-bundle site -> data/ndvi.csv.

Product
  MOD13Q1 v061: MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m SIN Grid
  (Didan 2021, NASA EOSDIS LP DAAC, doi:10.5067/MODIS/MOD13Q1.061). Read as
  Cloud-Optimized GeoTIFFs from the Microsoft Planetary Computer mirror (STAC
  collection "modis-13Q1-061", which holds BOTH Terra MOD13Q1 and Aqua MYD13Q1;
  only platform == "terra" items are used). Anonymous SAS token from
  https://planetarycomputer.microsoft.com/api/sas/v1/token/modiseuwest/modis-061-cogs
  (no account). LP DAAC's own copy needs an Earthdata login.

Assets
  250m_16_days_NDVI               int16, scale 0.0001, fill -3000, valid -2000..10000
  250m_16_days_pixel_reliability  0 good, 1 marginal, 2 snow/ice, 3 cloudy, -1 fill
  A pixel is "good" when reliability is 0 or 1 AND NDVI is not fill / out of range.

Method (fixed, documented)
  period      all Terra composites whose start date lies in 2022-01-01 .. 2023-12-31
              (23 per year -> 46 nominal per tile; Planetary Computer lacks Terra A2023049, so max 45)
  window      10 km x 10 km square on the sphere (terrain_common.window_bounds_deg).
              Pixels are selected by their CENTRE's lon/lat (inverse sinusoidal via
              rasterio.warp.transform), so the window is exact even where the
              sinusoidal grid is strongly sheared (high latitude). Windows that
              straddle tiles pool the pixels of every tile (tiles are disjoint).
  composite   usable when >= MIN_COMPOSITE_GOOD_FRAC of window pixels are good;
              its value = median NDVI of the good pixels
  ndvi        median over usable composites; ndvi_p10/p90 = 10th/90th percentile
              over usable composites (linear interpolation, numpy default)
  valid_frac  good pixel-observations / all window pixel-observations, over every
              composite read (usable or not)
  < MIN_COMPOSITES usable composites, no MODIS item, or read failure -> ndvi empty + reason.

Usage:  python fetch_ndvi.py [--force] [--only id1,id2]      (cwd = pipeline/)
Per-composite results are cached in data/downloads/ndvi_cache.json so reruns
never re-read a composite already measured (unless --force).
"""
import csv
import json
import math
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import config
import terrain_common as tc

OUT_CSV = config.NDVI_CSV
CACHE_JSON = config.DATA_DIR / "downloads" / "ndvi_cache.json"
SITES_CSV = config.ROOT / "seed" / "sites_real.csv"

STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
COLLECTION = "modis-13Q1-061"
SAS_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token/modiseuwest/modis-061-cogs"
PLATFORM = "terra"

PERIOD_START = "2022-01-01"
PERIOD_END = "2023-12-31"
PERIOD = f"{PERIOD_START}/{PERIOD_END}"

NDVI_ASSET = "250m_16_days_NDVI"
REL_ASSET = "250m_16_days_pixel_reliability"
NDVI_SCALE = 0.0001
NDVI_FILL = -3000
NDVI_VALID_MIN, NDVI_VALID_MAX = -2000, 10000
GOOD_RELIABILITY = (0, 1)
# Pixel reliability: 0 good, 1 marginal, 2 snow/ice, 3 cloudy; fill is -1 in the HDF but
# 255 in the uint8 COGs on Planetary Computer (review finding) — both count as fill.
REL_CLASSES = {0: "good", 1: "marginal", 2: "snow/ice", 3: "cloudy"}
REL_FILL_CODES = (-1, 255)

# MODIS sinusoidal grid (to find covering tiles independently of STAC footprints,
# some of which are malformed near the poles — e.g. h15v01 never matched a bbox search).
MODIS_R = 6371007.181
MODIS_TILE_M = 1111950.5197665
MODIS_X0, MODIS_Y0 = -20015109.354, 10007554.677

MIN_COMPOSITE_GOOD_FRAC = 0.5
MIN_COMPOSITES = 6
WORKERS = 8

PRODUCT = "MOD13Q1.061"
PRODUCT_LABEL = ("MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m SIN Grid V061, "
                 "250m_16_days_NDVI with pixel reliability 0-1")
CITATION = ("Didan, K. (2021). MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061. "
            "NASA EOSDIS Land Processes DAAC. doi:10.5067/MODIS/MOD13Q1.061; read from the Microsoft "
            "Planetary Computer STAC collection 'modis-13Q1-061'")

FIELDS = ["id", "ndvi", "ndvi_p10", "ndvi_p90", "n_composites", "valid_frac", "period", "product",
          "product_label", "citation", "tiles", "note", "retrieved_at"]


# ---------------------------------------------------------------- pure logic (unit-tested)

def good_ndvi(raw_ndvi, reliability):
    """Scaled NDVI (float64) where the pixel is good, NaN elsewhere.

    Good = reliability in GOOD_RELIABILITY and raw NDVI not fill and inside the valid range.
    """
    import numpy as np

    raw = np.asarray(raw_ndvi)
    rel = np.asarray(reliability)
    ok = np.isin(rel, GOOD_RELIABILITY) & (raw != NDVI_FILL) & (raw >= NDVI_VALID_MIN) & (raw <= NDVI_VALID_MAX)
    return np.where(ok, raw.astype("float64") * NDVI_SCALE, np.nan)


def composite_stat(raw_ndvi, reliability, min_good_frac=MIN_COMPOSITE_GOOD_FRAC):
    """Per-composite summary of window pixels (1-D arrays, already masked to the window).

    Returns dict: median (None if unusable), n_pix, n_good, classes {name: count}.
    """
    import numpy as np

    vals = good_ndvi(raw_ndvi, reliability)
    n_pix = int(vals.size)
    good = vals[np.isfinite(vals)]
    n_good = int(good.size)
    rel = np.asarray(reliability).astype("int64")
    classes = {name: int((rel == code).sum()) for code, name in REL_CLASSES.items()}
    classes["fill"] = int(np.isin(rel, REL_FILL_CODES).sum())
    usable = n_pix > 0 and n_good / n_pix >= min_good_frac
    return {"median": round(float(np.median(good)), 4) if usable else None,
            "n_pix": n_pix, "n_good": n_good, "classes": classes}


def aggregate(stats, min_composites=MIN_COMPOSITES):
    """Combine per-composite stats -> (ndvi, p10, p90, n_usable, valid_frac, reason)."""
    import numpy as np

    meds = [s["median"] for s in stats if s.get("median") is not None]
    n_pix = sum(s["n_pix"] for s in stats)
    n_good = sum(s["n_good"] for s in stats)
    valid_frac = round(n_good / n_pix, 4) if n_pix else None
    if not stats:
        return None, None, None, 0, valid_frac, "no MOD13Q1 composites found for the window"
    if n_pix == 0:
        return None, None, None, 0, valid_frac, "no MOD13Q1 pixels inside the window (covering tile not found)"
    if len(meds) < min_composites:
        return (None, None, None, len(meds), valid_frac,
                f"only {len(meds)} of {len(stats)} composites have >= {MIN_COMPOSITE_GOOD_FRAC:.0%} good pixels "
                f"(need {min_composites})")
    p10, p50, p90 = np.percentile(np.asarray(meds, dtype="float64"), [10, 50, 90])
    return round(float(p50), 4), round(float(p10), 4), round(float(p90), 4), len(meds), valid_frac, ""


def class_summary(stats):
    """'good 80%, marginal 10%, ...' over all pixel-observations (classes > 0 only)."""
    tot = {}
    for s in stats:
        for k, v in s["classes"].items():
            tot[k] = tot.get(k, 0) + v
    n = sum(s["n_pix"] for s in stats)
    if not n:
        return ""
    parts = [f"{k} {100 * v / n:.1f}%" for k, v in tot.items() if v]
    return "reliability over window x composites: " + ", ".join(parts)


def select_items(features, start=PERIOD_START, end=PERIOD_END, platform=PLATFORM):
    """Terra items whose start date is within [start, end]; one per (tile, start date), latest production."""
    best = {}
    for f in features:
        p = f.get("properties", {})
        if p.get("platform") != platform:
            continue
        day = (p.get("start_datetime") or p.get("datetime") or "")[:10]
        if not (start <= day <= end):
            continue
        key = (p.get("modis:horizontal-tile"), p.get("modis:vertical-tile"), day)
        if key not in best or f["id"] > best[key]["id"]:
            best[key] = f
    return sorted(best.values(), key=lambda f: (f["properties"]["start_datetime"], f["id"]))


def sinusoidal_tiles(bounds):
    """MODIS (h, v) tiles covering a lon/lat window (densified outline + centre), pure maths."""
    w, s, e, n = bounds
    tiles = set()
    steps = 10
    for i in range(steps + 1):
        for j in range(steps + 1):
            lon = w + (e - w) * i / steps
            lat = s + (n - s) * j / steps
            x = MODIS_R * math.radians(lon) * math.cos(math.radians(lat))
            y = MODIS_R * math.radians(lat)
            tiles.add((int((x - MODIS_X0) // MODIS_TILE_M), int((MODIS_Y0 - y) // MODIS_TILE_M)))
    return sorted(tiles)


def tile_label(feature):
    p = feature["properties"]
    return f"h{int(p['modis:horizontal-tile']):02d}v{int(p['modis:vertical-tile']):02d}"


# ---------------------------------------------------------------- network

class SasToken:
    def __init__(self, session):
        self.session, self.lock, self.token, self.expiry = session, threading.Lock(), None, 0.0

    def get(self):
        with self.lock:
            if self.token is None or time.time() > self.expiry - 300:
                r = self.session.get(SAS_URL, timeout=60)
                r.raise_for_status()
                j = r.json()
                self.token = j["token"]
                exp = j.get("msft:expiry", "")
                try:
                    self.expiry = datetime.fromisoformat(exp.replace("Z", "+00:00")).timestamp()
                except ValueError:
                    self.expiry = time.time() + 1800
            return self.token


def stac_items(session, bounds):
    """Items found by bbox, plus items for any covering sinusoidal tile the bbox search missed."""
    feats = _stac_search(session, {"bbox": list(bounds)})
    found = {(int(f["properties"]["modis:horizontal-tile"]), int(f["properties"]["modis:vertical-tile"]))
             for f in feats if "modis:horizontal-tile" in f.get("properties", {})}
    for h, v in sinusoidal_tiles(bounds):
        if (h, v) not in found:
            feats += _stac_search(session, {"query": {"modis:horizontal-tile": {"eq": h},
                                                      "modis:vertical-tile": {"eq": v}}})
    return feats


def _stac_search(session, extra):
    feats, body = [], {"collections": [COLLECTION],
                       "datetime": f"{PERIOD_START}T00:00:00Z/{PERIOD_END}T23:59:59Z", "limit": 250, **extra}
    url = STAC_SEARCH
    while url:
        r = session.post(url, json=body, timeout=120)
        r.raise_for_status()
        j = r.json()
        feats += j.get("features", [])
        nxt = next((l for l in j.get("links", []) if l.get("rel") == "next"), None)
        url, body = (nxt["href"], nxt.get("body", body)) if nxt else (None, None)
    return feats


_mask_cache, _mask_lock = {}, threading.Lock()


def window_pixels(src, bounds):
    """(rasterio Window, boolean mask of pixel centres inside the lon/lat window) for one tile, or None."""
    import numpy as np
    from rasterio.warp import transform as warp_transform
    from rasterio.errors import WindowError
    from rasterio.windows import Window, from_bounds

    key = (src.name.split("?")[0].rsplit("/", 1)[-1].split(".")[2], tuple(round(b, 6) for b in bounds))
    with _mask_lock:
        if key in _mask_cache:
            return _mask_cache[key]
    w, s, e, n = bounds
    # densified outline of the lon/lat window -> sinusoidal bbox
    t = np.linspace(0, 1, 21)
    lons = np.concatenate([w + (e - w) * t, np.full(21, e), e - (e - w) * t, np.full(21, w)])
    lats = np.concatenate([np.full(21, s), s + (n - s) * t, np.full(21, n), n - (n - s) * t])
    xs, ys = warp_transform("EPSG:4326", src.crs, lons.tolist(), lats.tolist())
    win = from_bounds(min(xs), min(ys), max(xs), max(ys), src.transform)
    c0, r0 = math.floor(win.col_off), math.floor(win.row_off)
    win = Window(c0, r0, math.ceil(win.col_off + win.width) - c0, math.ceil(win.row_off + win.height) - r0)
    try:
        win = win.intersection(Window(0, 0, src.width, src.height))
    except WindowError:
        win = None
    out = None
    if win is not None and win.width > 0 and win.height > 0:
        rows, cols = np.mgrid[0:int(win.height), 0:int(win.width)]
        a = src.window_transform(win)
        cx = a.c + (cols + 0.5) * a.a
        cy = a.f + (rows + 0.5) * a.e
        plon, plat = warp_transform(src.crs, "EPSG:4326", cx.ravel().tolist(), cy.ravel().tolist())
        plon, plat = np.asarray(plon).reshape(cx.shape), np.asarray(plat).reshape(cy.shape)
        mask = (plon >= w) & (plon <= e) & (plat >= s) & (plat <= n)
        out = (win, mask) if mask.any() else None
    with _mask_lock:
        _mask_cache[key] = out
    return out


def gdal_options():
    """GDAL config for /vsicurl/ reads. rasterio.Env is thread-local, so each worker enters its own."""
    ca = tc.configure_gdal_ssl()
    opts = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2", GDAL_HTTP_TIMEOUT="120")
    if ca:
        opts.update(GDAL_CURL_CA_BUNDLE=ca, CURL_CA_BUNDLE=ca)
    return opts


def read_composite(items, bounds, sas):
    """Pool window pixels of every tile item of one date -> composite_stat dict."""
    import rasterio

    with rasterio.Env(**gdal_options()):
        return _read_composite(items, bounds, sas)


def _read_composite(items, bounds, sas):
    import numpy as np
    import rasterio

    ndvi_parts, rel_parts = [], []
    for it in items:
        tok = sas.get()
        nd_href = it["assets"][NDVI_ASSET]["href"]
        rl_href = it["assets"][REL_ASSET]["href"]
        with rasterio.open(f"/vsicurl/{nd_href}?{tok}") as src:
            wp = window_pixels(src, bounds)
            if wp is None:
                continue
            win, mask = wp
            nd = src.read(1, window=win)
        with rasterio.open(f"/vsicurl/{rl_href}?{tok}") as src:
            rl = src.read(1, window=win)
        ndvi_parts.append(nd[mask])
        rel_parts.append(rl[mask])
    if not ndvi_parts:
        return composite_stat(np.zeros(0, "int16"), np.zeros(0, "int8"))
    return composite_stat(np.concatenate(ndvi_parts), np.concatenate(rel_parts))


# ---------------------------------------------------------------- driver

def read_sites():
    with open(SITES_CSV, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def load_cache():
    try:
        return json.loads(CACHE_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_cache(cache):
    CACHE_JSON.parent.mkdir(parents=True, exist_ok=True)
    CACHE_JSON.write_text(json.dumps(cache, indent=0, sort_keys=True), encoding="utf-8")


def measure_site(site, session, sas, cache, force=False, log=print):
    lat, lon = float(site["lat"]), float(site["lon"])
    bounds = tc.window_bounds_deg(lat, lon)
    items = select_items(stac_items(session, bounds))
    tiles = sorted({tile_label(f) for f in items})
    by_date = {}
    for f in items:
        by_date.setdefault(f["properties"]["start_datetime"][:10], []).append(f)
    site_cache = cache.setdefault(site["id"], {})
    todo = [d for d in sorted(by_date) if force or d not in site_cache]
    errors = []

    def work(day):
        try:
            return day, read_composite(by_date[day], bounds, sas), None
        except Exception as exc:  # noqa: BLE001 - recorded per composite
            return day, None, f"{day}: {exc}"

    with ThreadPoolExecutor(WORKERS) as pool:
        for day, stat, err in pool.map(work, todo):
            if err:
                errors.append(err)
            else:
                site_cache[day] = stat
    stats = [site_cache[d] for d in sorted(by_date) if d in site_cache]
    log(f"  {site['id']}: {len(by_date)} dates, {len(todo)} read, {len(errors)} errors, tiles {tiles}")
    return stats, tiles, len(by_date), errors


def build_row(site, stats, tiles, n_dates, errors, now):
    ndvi, p10, p90, n, vf, reason = aggregate(stats)
    notes = []
    if reason:
        notes.append(reason)
    if errors:
        notes.append(f"{len(errors)} composite read error(s), first: {errors[0][:160]}")
    if stats:
        notes.append(f"{len(stats)} of {n_dates} Terra composites read; usable = >= "
                     f"{MIN_COMPOSITE_GOOD_FRAC:.0%} good pixels; ~{stats[0]['n_pix']} pixels per window")
        notes.append(class_summary(stats))
    fmt = lambda v: "" if v is None else v  # noqa: E731
    return {"id": site["id"], "ndvi": fmt(ndvi), "ndvi_p10": fmt(p10), "ndvi_p90": fmt(p90),
            "n_composites": n, "valid_frac": fmt(vf), "period": PERIOD, "product": PRODUCT,
            "product_label": PRODUCT_LABEL, "citation": CITATION, "tiles": ";".join(tiles),
            "note": "; ".join(x for x in notes if x), "retrieved_at": now}


def main(argv=None):
    import rasterio
    import requests

    argv = sys.argv[1:] if argv is None else argv
    force = "--force" in argv
    only = None
    if "--only" in argv:
        only = set(argv[argv.index("--only") + 1].split(","))
    tc.configure_gdal_ssl()
    session = requests.Session()
    sas = SasToken(session)
    cache = load_cache()
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    existing = {}
    if OUT_CSV.exists():
        with open(OUT_CSV, newline="", encoding="utf-8") as fh:
            existing = {r["id"]: r for r in csv.DictReader(fh)}

    rows = []
    with rasterio.Env(**gdal_options()):
        for site in read_sites():
            if only and site["id"] not in only:
                if site["id"] in existing:
                    rows.append(existing[site["id"]])
                continue
            try:
                stats, tiles, n_dates, errors = measure_site(site, session, sas, cache, force)
                rows.append(build_row(site, stats, tiles, n_dates, errors, now))
            except Exception as exc:  # noqa: BLE001 - one site must not stop the rest
                rows.append({**{k: "" for k in FIELDS}, "id": site["id"], "period": PERIOD,
                             "product": PRODUCT, "product_label": PRODUCT_LABEL, "citation": CITATION,
                             "n_composites": 0, "note": f"failed: {exc}"[:300], "retrieved_at": now})
            save_cache(cache)

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    for r in rows:
        print(f"{r['id']:14s} ndvi={r['ndvi']!s:8} p10={r['ndvi_p10']!s:8} p90={r['ndvi_p90']!s:8} "
              f"n={r['n_composites']!s:3} vf={r['valid_frac']!s:7} tiles={r['tiles']}")
    print("wrote data/ndvi.csv")


if __name__ == "__main__":
    main()
