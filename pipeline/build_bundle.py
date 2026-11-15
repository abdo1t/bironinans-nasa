"""Build the REAL data bundle -> web/public/data/ (kind "real").

Inputs (all committed, all traceable):
  seed/targets_real.json   curated planetary targets with per-feature citations
  seed/sites_real.csv      curated Earth sites: cited coordinates, geology, ice,
                           analog-literature reference, POWER representativeness
  seed/known_analogs.csv   project reference list used for the novelty distance
  data/power.csv           fetch_power.py output (NASA POWER climatology)
  data/terrain.csv         fetch_terrain.py output (may hold nulls)

Rules: nothing is invented. A missing input stays null (excluded from scores).
A POWER value whose ~50 km grid cell does not represent the site
(power_quality = "low") is kept in `raw` for display but set to null in `norm`,
with the reason in provenance. Values beyond Earth's bounds are clipped by
normalize() and flagged in `clipped`. The bundle is validated before success.

Usage:  python pipeline/build_bundle.py
"""
import csv
import json
import sys
from datetime import datetime, timezone

import config
from bundle_io import export_features, write_bundle
from scoring import MIN_CRITERIA_FOR_SCORE, haversine_km, normalize, rank_sites, round_half_up
from validate_bundle import validate

POWER_FEATURES = {"aridity", "temp", "temp_range"}
POWER_PARAM = {"aridity": "PRECTOTCORR (x 365.25)", "temp": "TS", "temp_range": "TS_RANGE"}
POWER_UNITS = {"aridity": "mm/yr", "temp": "°C", "temp_range": "°C"}
NUMERIC = [f for f in config.FEATURES if f["kind"] == "numeric"]
FEATURE_BY_ID = {f["id"]: f for f in config.FEATURES}


def _num(v):
    return None if v in (None, "") else float(v)


def _csv_by_id(path):
    return _csv_by_id_key(path, "id")


def _csv_by_id_key(path, key):
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r[key]: r for r in csv.DictReader(f)}


def _clip_flag(value, feature):
    if value < feature["earthMin"]:
        return "below"
    if value > feature["earthMax"]:
        return "above"
    return None


def _short_period(period):
    # "25-year ... (January 2001 - December 2025)" -> "2001–2025"
    years = [w for w in period.replace("(", " ").replace(")", " ").split() if w.isdigit() and len(w) == 4]
    return f"{years[0]}–{years[-1]}" if len(years) >= 2 else period


# --------------------------------------------------------------------------- targets

def planetary_terrain_entry(prow):
    """targets_real.json-style feature entry built from a data/planetary_terrain.csv row."""
    relief = _num(prow.get("relief_m"))
    if relief is None:
        return None
    lo, hi = _num(prow.get("relief_min_m")), _num(prow.get("relief_max_m"))
    rng = f"; products span {lo:.0f}–{hi:.0f} m" if lo is not None and hi is not None else ""
    return {
        "status": "orbital",
        "basisValue": relief,
        "display": f"{relief:.0f} m (P99 − P1, 10 × 10 km window at ~200 m)",
        "range": [lo, hi] if lo is not None and hi is not None else None,
        "citation": prow.get("citation", ""),
        "url": prow.get("url", ""),
        "note": (f"{prow.get('dem_label', '')}; native {prow.get('posting_native_m', '?')} m posting, native-resolution "
                 f"relief {prow.get('relief_native_m', '?')} m{rng}. Cross-checks: {prow.get('cross_checks', '')}. "
                 f"{prow.get('note', '')}").strip(),
    }


def build_targets():
    spec = json.loads(config.TARGETS_REAL.read_text(encoding="utf-8"))["targets"]
    planetary = _csv_by_id_key(config.PLANETARY_TERRAIN_CSV, "target_id")
    out = []
    for t in spec:
        norm, refs, prov, clipped = {}, {}, {}, {}
        for f in config.FEATURES:
            fid = f["id"]
            entry = t["features"].get(fid, {"status": "unavailable", "note": "not provided"})
            if fid == "terrain" and t["id"] in planetary:
                entry = planetary_terrain_entry(planetary[t["id"]]) or entry
            p = {k: v for k, v in entry.items() if k != "basisValue"}
            if entry["status"] == "unavailable":
                norm[fid] = None
            elif f["kind"] == "numeric":
                v = entry["basisValue"]
                norm[fid] = normalize(v, f)
                flag = _clip_flag(v, f)
                if flag:
                    clipped[fid] = flag
                p["basisValue"] = v
                refs[fid] = entry["citation"].split(" — ")[0][:120]
            else:
                norm[fid] = entry["category"]
                refs[fid] = entry["citation"].split(" — ")[0][:120]
            prov[fid] = p
        out.append({
            "id": t["id"], "body": t["body"], "name": t["name"], "lat": t["lat"], "lon": t["lon"],
            "summary": t["summary"], "trekUrl": t["trekUrl"], "coord": t["coord"],
            "norm": norm, "refs": refs, "provenance": prov, "clipped": clipped,
        })
    return out


# --------------------------------------------------------------------------- sites

def _power_prov(fid, value, prow, excluded_note):
    return {
        "dataset": f"NASA POWER climatology API {prow.get('api_version', '')} ({prow.get('sources', '')})".strip(),
        "parameter": POWER_PARAM[fid],
        "status": "reanalysis",
        "value": value,
        "units": POWER_UNITS[fid],
        "period": _short_period(prow.get("period", "")),
        "resolution": "0.5° × 0.625° grid cell (~50 km); cell elevation "
                      f"{prow.get('cell_elev_m') or '?'} m",
        "url": prow.get("request_url", ""),
        "retrievedAt": prow.get("retrieved_at", ""),
        **({"excluded": excluded_note} if excluded_note else {}),
    }


def site_elevation(row, trow):
    """(elevation m, source): seed value if given, else the DEM-measured window median."""
    if _num(row.get("elev_m")) is not None:
        return _num(row.get("elev_m")), row.get("elev_source") or None
    if _num(trow.get("elev_m")) is not None:
        return _num(trow.get("elev_m")), f"{trow.get('dem_label', 'DEM')}: median of the 10 × 10 km window"
    return None, row.get("elev_source") or None


def power_representativeness(row, prow, site_elev=None):
    """(is_low, reason). Manual flag in sites_real.csv, or |site - cell elevation| too large."""
    if row.get("power_quality") == "low":
        return True, row.get("power_note") or "grid cell not representative of the site"
    cell_elev = _num(prow.get("cell_elev_m"))
    if site_elev is None:
        site_elev = _num(row.get("elev_m"))
    if site_elev is not None and cell_elev is not None:
        diff = abs(site_elev - cell_elev)
        if diff > config.POWER_MAX_ELEV_DIFF_M:
            return True, (f"POWER grid cell (~50 km) mean elevation {cell_elev:.0f} m vs site {site_elev:.0f} m "
                          f"(difference {diff:.0f} m > {config.POWER_MAX_ELEV_DIFF_M} m): cell does not represent the site")
    return False, ""


def build_site(row, power, terrain, catalogue, ndvi=None):
    sid = row["id"]
    prow = power.get(sid, {})
    trow = terrain.get(sid, {})
    nrow = (ndvi or {}).get(sid, {})
    raw = {
        "relief_m": _num(trow.get("relief_m")),
        "precip_mm_yr": _num(prow.get("precip_mm_yr")),
        "ts_mean_c": _num(prow.get("ts_mean_c")),
        "ts_range_c": _num(prow.get("ts_range_c")),
        "ndvi": _num(nrow.get("ndvi")),
    }
    elev_m, elev_source = site_elevation(row, trow)
    low_power, power_note = power_representativeness(row, prow, elev_m)
    norm, sources, prov, clipped = {}, {}, {}, {}

    for f in NUMERIC:
        fid, v = f["id"], raw[f["raw"]]
        if fid in POWER_FEATURES:
            excluded = power_note if low_power else ""
            if v is None:
                norm[fid] = None
                prov[fid] = {"status": "unavailable", "note": "POWER value missing (fill value or fetch failed)"}
                continue
            prov[fid] = _power_prov(fid, v, prow, excluded)
            if low_power:
                norm[fid] = None  # shown, not scored
                continue
        elif fid == "terrain":
            if v is None:
                norm[fid] = None
                note = trow.get("note") or "terrain not acquired"
                if "credentials" in note:
                    note = f"Not yet acquired: {trow.get('dem_label') or 'DEM'} download needs a NASA Earthdata login"
                prov[fid] = {"status": "unavailable", "dem": trow.get("dem", ""), "note": note}
                continue
            cross = ""
            if _num(trow.get("cross_relief_m")) is not None:
                cross = f"{trow.get('cross_dem', 'cross-check')}: {_num(trow.get('cross_relief_m')):.0f} m"
            prov[fid] = {
                "dataset": trow["dem_label"], "status": "measurement", "value": v, "units": "m",
                "method": "P99 − P1 elevation in a 10 × 10 km window, box-mean aggregated to ~200 m "
                          "(common scale with the planetary DEMs)",
                "resolution": f"native posting {trow.get('posting_native', '?')}; scored at ~200 m",
                "nativeValue": _num(trow.get("relief_native_m")),
                "crossCheck": cross or None,
                "citation": trow.get("dem_citation", ""),
                "attribution": trow.get("attribution", ""),
                "rangeAlignment": [_num(trow.get("relief_m_min")), _num(trow.get("relief_m_max"))],
                "note": ("Coastal window: part of the 10 km window is sea at ~0 m, so P1 may be sea level and "
                         "relief may be overstated." if "sea surface" in (trow.get("note") or "") else None),
                "quality": trow.get("quality", ""),
                "retrievedAt": trow.get("retrieved_at", ""),
            }
        else:  # veg: MODIS NDVI
            if v is None:
                norm[fid] = None
                prov[fid] = {"status": "unavailable", "note": nrow.get("note") or "MODIS NDVI not acquired"}
                continue
            prov[fid] = {
                "dataset": nrow.get("product_label", "MODIS NDVI"), "status": "measurement", "value": v,
                "units": "NDVI",
                "method": "median over 16-day composites of the 10 × 10 km window median (good/marginal pixels)",
                "period": nrow.get("period", ""),
                "resolution": "250 m MODIS pixels",
                "range": [_num(nrow.get("ndvi_p10")), _num(nrow.get("ndvi_p90"))],
                "nComposites": _num(nrow.get("n_composites")),
                "citation": nrow.get("citation", ""),
                "retrievedAt": nrow.get("retrieved_at", ""),
            }
        norm[fid] = normalize(v, f)
        flag = _clip_flag(v, f)
        if flag:
            clipped[fid] = flag
        sources[fid] = prov[fid]["dataset"]

    for fid in ("geology", "ice"):
        value = (row.get(fid) or "").strip() or None
        norm[fid] = value
        if value:
            cite = row[f"{fid}_citation"]
            sources[fid] = f"Literature: {cite.split(';')[0][:100]}"
            prov[fid] = {"dataset": "Literature", "status": "literature", "value": value, "citation": cite}
        else:
            prov[fid] = {"status": "unavailable", "note": row.get(f"{fid}_citation") or "not adequately supported"}

    lat, lon = float(row["lat"]), float(row["lon"])
    known = row["analog_lit"].strip().lower() == "yes"
    others = [(k, la, lo) for k, la, lo in catalogue if k != sid]
    novel_km = 0 if known else round_half_up(min(haversine_km(lat, lon, la, lo) for _, la, lo in others))

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "id": sid, "name": row["name"], "country": row["country"],
            "knownAnalog": known,
            "analogRef": row.get("analog_citation") or None,
            "raw": raw, "norm": norm,
            "novelKm": novel_km,
            "isNewCandidate": (not known) and novel_km > config.NOVELTY_KM,
            "sources": sources, "provenance": prov, "clipped": clipped,
            "coord": {"source": row["coord_source"], "precision": row["coord_precision"],
                      "elevM": elev_m, "elevSource": elev_source},
            "notes": row.get("note") or None,
        },
    }


def main():
    with open(config.SITES_REAL, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    power = _csv_by_id(config.POWER_CSV)
    terrain = _csv_by_id(config.TERRAIN_CSV)

    catalogue = [(r["id"], float(r["lat"]), float(r["lon"])) for r in _csv_by_id(config.KNOWN_ANALOGS).values()]
    catalogue += [(r["id"], float(r["lat"]), float(r["lon"])) for r in rows if r["analog_lit"].strip().lower() == "yes"]

    features = export_features(config.FEATURES)
    targets = build_targets()
    ndvi = _csv_by_id(config.NDVI_CSV)
    sites = {"type": "FeatureCollection",
             "features": [build_site(r, power, terrain, catalogue, ndvi) for r in rows]}
    weights = config.PRESETS[config.DEFAULT_PRESET]
    props = [f["properties"] for f in sites["features"]]
    scores = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "defaultPreset": config.DEFAULT_PRESET,
        "minCriteria": MIN_CRITERIA_FOR_SCORE,
        "byTarget": {t["id"]: rank_sites(t, props, weights, features, MIN_CRITERIA_FOR_SCORE) for t in targets},
    }
    write_bundle(config.BUNDLE_DIR, "real", {
        "features.json": features, "targets.json": targets, "sites.geojson": sites, "scores.json": scores,
    }, root_for_log=config.ROOT.parent)

    problems = validate(config.BUNDLE_DIR, "real")
    for p in problems:
        print("FAIL", p, file=sys.stderr)
    print(f"real bundle validation: {'OK' if not problems else f'{len(problems)} problem(s)'}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
