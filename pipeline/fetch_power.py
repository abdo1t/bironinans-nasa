"""Fetch NASA POWER climatology for every real-bundle site -> data/power.csv.

Verified against the live API (v2.10.1) and the POWER parameter manager
(https://power.larc.nasa.gov/api/system/manager/parameters/<PARAM>?community=AG&temporal=climatology):
  * Endpoint: GET /api/temporal/climatology/point  (no login, no API key)
  * Climatology period: reported by the API in header.range
    (at time of writing "January 2001 - December 2025", MERRA-2 meteorology)
  * Fill value: header.fill_value (-999.0) -> stored as empty / None
  * Spatial resolution: 0.5 deg lat x 0.625 deg lon for meteorology
    (https://power.larc.nasa.gov/docs/services/). A value describes the whole
    ~50 km grid cell, not the exact point — see `cell_elev_m` and the
    representativeness notes in docs/methodology.md.
  * Units are read from the response ("parameters" block) and checked:
      PRECTOTCORR  mm/day  (bias-corrected precipitation) -> x 365.25 = mm/yr
      TS           C       Earth skin (surface) temperature, annual mean
      TS_RANGE     C       skin-temperature range; the annual climatology value
                           behaves as a mean DAILY range (e.g. Atacama 28.6 C vs an
                           annual max-min of ~48 C), see methodology caveat
      T2M, T2M_RANGE  C    2 m air temperature (kept for reference, not scored)
    NOTE: T2M_MAX / T2M_MIN in the annual climatology are the period EXTREMES,
    so T2M_MAX - T2M_MIN is NOT a daily range. We never use that difference.

Raw responses are cached in data/power/<site>.json together with the exact
request, so reruns never refetch and every number is traceable.

Usage:  python pipeline/fetch_power.py [--refresh]
"""
import argparse
import csv
import json
import sys
import time
from datetime import datetime, timezone

import config

API_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
COMMUNITY = "AG"
PARAMETERS = ["PRECTOTCORR", "TS", "TS_RANGE", "T2M", "T2M_RANGE"]
EXPECTED_UNITS = {"PRECTOTCORR": "mm/day", "TS": "C", "TS_RANGE": "C", "T2M": "C", "T2M_RANGE": "C"}
DAYS_PER_YEAR = 365.25
POLITE_DELAY_S = 1.0
CACHE_DIR = config.DATA_DIR / "power"
OUT_CSV = config.DATA_DIR / "power.csv"

OUT_COLUMNS = [
    "id", "lat", "lon", "cell_elev_m",
    "precip_mm_day", "precip_mm_yr", "ts_mean_c", "ts_range_c", "t2m_mean_c", "t2m_range_c",
    "period", "api_version", "sources", "retrieved_at", "request_url",
]


class PowerError(RuntimeError):
    pass


def request_params(lat, lon):
    return {
        "parameters": ",".join(PARAMETERS),
        "community": COMMUNITY,
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "format": "JSON",
    }


def parse_response(payload):
    """Validate a POWER climatology response and return annual values (None for fill)."""
    try:
        header = payload["header"]
        meta = payload["parameters"]
        values = payload["properties"]["parameter"]
        geometry = payload["geometry"]["coordinates"]
    except (KeyError, TypeError) as exc:
        raise PowerError(f"unexpected response structure: missing {exc}") from exc

    fill = header.get("fill_value", -999.0)
    out = {}
    for name in PARAMETERS:
        if name not in meta or name not in values:
            raise PowerError(f"parameter {name} missing from response")
        units = meta[name].get("units")
        if units != EXPECTED_UNITS[name]:
            raise PowerError(f"{name}: expected units {EXPECTED_UNITS[name]!r}, got {units!r}")
        v = values[name].get("ANN")
        out[name] = None if v is None or v == fill else float(v)

    precip_day = out["PRECTOTCORR"]
    return {
        "cell_elev_m": geometry[2] if len(geometry) > 2 else None,
        "precip_mm_day": precip_day,
        "precip_mm_yr": None if precip_day is None else round(precip_day * DAYS_PER_YEAR, 1),
        "ts_mean_c": out["TS"],
        "ts_range_c": out["TS_RANGE"],
        "t2m_mean_c": out["T2M"],
        "t2m_range_c": out["T2M_RANGE"],
        "period": header.get("range", ""),
        "api_version": header.get("api", {}).get("version", ""),
        "sources": "+".join(header.get("sources", [])),
    }


def fetch_site(site, refresh=False, session=None):
    """Return (parsed values, cache record). Uses the cache unless coordinates changed or refresh."""
    import requests  # imported lazily so parse_response stays stdlib-only for tests

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{site['id']}.json"
    params = request_params(site["lat"], site["lon"])

    if cache_path.exists() and not refresh:
        record = json.loads(cache_path.read_text(encoding="utf-8"))
        if record.get("request", {}).get("params") == params:
            return parse_response(record["response"]), record, True

    http = session or requests.Session()
    for attempt in range(4):
        resp = http.get(API_URL, params=params, timeout=90)
        if resp.status_code == 200:
            break
        if resp.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt * 2)
            continue
        raise PowerError(f"{site['id']}: HTTP {resp.status_code}: {resp.text[:200]}")
    else:
        raise PowerError(f"{site['id']}: gave up after retries")

    payload = resp.json()
    parsed = parse_response(payload)  # validate before caching
    record = {
        "request": {"url": API_URL, "params": params},
        "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "response": payload,
    }
    cache_path.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    time.sleep(POLITE_DELAY_S)
    return parsed, record, False


def read_sites():
    with open(config.SITES_REAL, newline="", encoding="utf-8") as f:
        return [dict(r, lat=float(r["lat"]), lon=float(r["lon"])) for r in csv.DictReader(f)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true", help="ignore the cache and refetch every site")
    args = ap.parse_args(argv)

    rows, fetched, failures = [], 0, []
    for site in read_sites():
        try:
            parsed, record, cached = fetch_site(site, refresh=args.refresh)
        except Exception as exc:  # keep going; a failed site stays empty (null), never invented
            failures.append(f"{site['id']}: {exc}")
            rows.append({"id": site["id"], "lat": site["lat"], "lon": site["lon"]})
            continue
        fetched += not cached
        req = record["request"]
        rows.append({
            "id": site["id"], "lat": site["lat"], "lon": site["lon"], **parsed,
            "retrieved_at": record["retrievedAt"],
            "request_url": req["url"] + "?" + "&".join(f"{k}={v}" for k, v in req["params"].items()),
        })

    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in OUT_COLUMNS})

    print(f"POWER: {len(rows)} sites, {fetched} fetched, {len(rows) - fetched - len(failures)} from cache, "
          f"{len(failures)} failed -> {OUT_CSV.relative_to(config.ROOT.parent).as_posix()}")
    for msg in failures:
        print("  FAILED", msg, file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
