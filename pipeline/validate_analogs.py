"""Reproducible scientific validation of the REAL bundle -> docs/validation.md.

What it does (no parameter is tuned here — it only measures):
  1. Rankings for each target x preset, with scoreRange and evidence coverage.
  2. Negative controls: 4 humid, vegetated, non-analog sites (seed/controls.csv) get
     the SAME data (NASA POWER, NASADEM/Copernicus relief, MODIS NDVI) and the SAME
     scoring. A useful score must rank documented analogs above them. Compared on
     numeric criteria only (controls have no curated geology/ice class), so neither
     group benefits from skipped categorical criteria.
  3. Robustness: leave-one-criterion-out (Kendall tau), random weight perturbation,
     and target-value uncertainty (Jezero temperature range, terrain product ranges).
  4. Geology-choice sensitivity for Jezero (landing-site basalt vs delta clay) —
     REPORTED, not adopted (changing it after seeing ranks would be post-hoc fitting).
  5. Share of each score that comes from target values clipped to Earth's bounds.
  6. Consistency with documented analog use (seed/analog_evidence.csv).

Usage:  python pipeline/validate_analogs.py [--refresh-controls]
Control data are cached in data/controls.csv (commit it), so reruns are offline.
"""
import csv
import json
import random
import sys
from datetime import datetime, timezone

import config
from build_bundle import build_site
from scoring import MIN_CRITERIA_FOR_SCORE, normalize, rank_sites, score_site

CONTROLS_SEED = config.SEED_DIR / "controls.csv"
CONTROLS_DATA = config.DATA_DIR / "controls.csv"
EVIDENCE = config.SEED_DIR / "analog_evidence.csv"
OUT_MD = config.ROOT.parent / "docs" / "validation.md"
NUMERIC_IDS = [f["id"] for f in config.FEATURES if f["kind"] == "numeric"]
CONTROL_COLUMNS = ["id", "precip_mm_yr", "ts_mean_c", "ts_range_c", "cell_elev_m", "power_period",
                   "relief_m", "dem", "elev_m", "ndvi", "ndvi_n", "note", "retrieved_at"]
SEED = 20261114


def _read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# --------------------------------------------------------------------------- data

def fetch_controls():
    """Fetch POWER, terrain and NDVI for the controls with the production fetchers."""
    import requests

    import fetch_ndvi
    import fetch_power
    import fetch_terrain

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    fetch_terrain.ensure_gdal_ssl()
    try:
        sas, sas_err = fetch_terrain.get_sas_token(), ""
    except Exception as exc:  # noqa: BLE001
        sas, sas_err = None, str(exc)
    session = requests.Session()
    ndvi_sas = fetch_ndvi.SasToken(session)
    ndvi_cache = fetch_ndvi.load_cache()
    rows = []
    for c in _read(CONTROLS_SEED):
        site = {"id": c["id"], "lat": float(c["lat"]), "lon": float(c["lon"])}
        row, notes = {"id": c["id"], "retrieved_at": now}, []
        try:
            p, _, _ = fetch_power.fetch_site(site)
            row.update(precip_mm_yr=p["precip_mm_yr"], ts_mean_c=p["ts_mean_c"], ts_range_c=p["ts_range_c"],
                       cell_elev_m=p["cell_elev_m"], power_period=p["period"])
        except Exception as exc:  # noqa: BLE001
            notes.append(f"POWER failed: {exc}")
        t = fetch_terrain.build_row(site, now, sas_token=sas, token_error=sas_err)
        row.update(relief_m=t.get("relief_m"), dem=t.get("dem"), elev_m=t.get("elev_m"))
        if t.get("relief_m") in (None, ""):
            notes.append(f"terrain: {t.get('note', '')[:120]}")
        try:
            import rasterio

            with rasterio.Env(**fetch_ndvi.gdal_options()):
                stats, tiles, n_dates, errors = fetch_ndvi.measure_site(site, session, ndvi_sas, ndvi_cache)
            nrow = fetch_ndvi.build_row(site, stats, tiles, n_dates, errors, now)
            row.update(ndvi=nrow["ndvi"], ndvi_n=nrow["n_composites"])
            if nrow["ndvi"] in (None, ""):
                notes.append(f"NDVI: {nrow['note'][:120]}")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"NDVI failed: {exc}")
        fetch_ndvi.save_cache(ndvi_cache)
        row["note"] = "; ".join(notes)
        rows.append(row)
        print(f"  control {c['id']}: P={row.get('precip_mm_yr')} TS={row.get('ts_mean_c')} relief={row.get('relief_m')} "
              f"ndvi={row.get('ndvi')}")
    with open(CONTROLS_DATA, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CONTROL_COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: "" if r.get(k) is None else r.get(k) for k in CONTROL_COLUMNS})
    return rows


def control_sites(catalogue):
    """Control sites built by the SAME build_site() as the real bundle (geology/ice not classified)."""
    seed = {c["id"]: c for c in _read(CONTROLS_SEED)}
    data = {r["id"]: r for r in _read(CONTROLS_DATA)}
    out = []
    for cid, c in seed.items():
        d = data.get(cid, {})
        row = {"id": cid, "name": c["name"], "country": c["country"], "lat": c["lat"], "lon": c["lon"],
               "elev_m": "", "elev_source": "", "coord_source": c["coord_source"], "coord_precision": "city point",
               "geology": "", "geology_citation": "not classified (control site)", "ice": "",
               "ice_citation": "not classified (control site)", "analog_lit": "no", "analog_citation": "",
               "power_quality": "", "power_note": "", "note": c["why_control"]}
        power = {cid: {"precip_mm_yr": d.get("precip_mm_yr"), "ts_mean_c": d.get("ts_mean_c"),
                       "ts_range_c": d.get("ts_range_c"), "cell_elev_m": d.get("cell_elev_m"),
                       "period": d.get("power_period", ""), "api_version": "", "sources": "", "request_url": "",
                       "retrieved_at": d.get("retrieved_at", "")}}
        terrain = {cid: {"relief_m": d.get("relief_m"), "dem_label": d.get("dem") or "DEM", "elev_m": d.get("elev_m")}}
        ndvi = {cid: {"ndvi": d.get("ndvi"), "product_label": "MODIS MOD13Q1 v061"}}
        out.append(build_site(row, power, terrain, catalogue, ndvi)["properties"])
    return out


# --------------------------------------------------------------------------- analysis helpers

def kendall_tau(a, b):
    """Kendall tau-a between two rankings (lists of ids) over their common items."""
    common = [x for x in a if x in b]
    pos_b = {x: i for i, x in enumerate(b)}
    conc = disc = 0
    for i in range(len(common)):
        for j in range(i + 1, len(common)):
            s = (pos_b[common[i]] - pos_b[common[j]])
            if s < 0:
                conc += 1
            elif s > 0:
                disc += 1
    n = conc + disc
    return round((conc - disc) / n, 2) if n else None


def scored_order(ranking):
    return [r["site"] for r in ranking if r["score"] is not None]


def numeric_only(weights):
    return {k: (v if k in NUMERIC_IDS else 0) for k, v in weights.items()}


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    for r in rows:
        out.append("| " + " | ".join("" if v is None else str(v) for v in r) + " |")
    return "\n".join(out)


def with_target_value(target, fid, basis):
    t = json.loads(json.dumps(target))
    f = next(f for f in config.FEATURES if f["id"] == fid)
    t["norm"][fid] = normalize(basis, f)
    return t


# --------------------------------------------------------------------------- main

def main(argv):
    if "--refresh-controls" in argv or not CONTROLS_DATA.exists():
        print("fetching control-site data ...")
        fetch_controls()

    bundle = config.BUNDLE_DIR
    features = json.loads((bundle / "features.json").read_text(encoding="utf-8"))
    targets = json.loads((bundle / "targets.json").read_text(encoding="utf-8"))
    sites = [f["properties"] for f in json.loads((bundle / "sites.geojson").read_text(encoding="utf-8"))["features"]]
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    names = {s["id"]: s["name"] for s in sites}
    catalogue = [(r["id"], float(r["lat"]), float(r["lon"])) for r in _read(config.KNOWN_ANALOGS)]
    controls = control_sites(catalogue)
    names.update({c["id"]: c["name"] for c in controls})
    mc = MIN_CRITERIA_FOR_SCORE
    md = [f"# Validation report (generated)\n",
          f"Generated by `pipeline/validate_analogs.py` on {datetime.now(timezone.utc).date()} from the real bundle "
          f"`{manifest['generatedAt']}` (sites.geojson sha256 `{manifest['files']['sites.geojson'][:12]}…`). "
          "Nothing in this report was used to tune parameters.\n"]

    # 1. rankings ------------------------------------------------------------------
    md.append("## 1. Rankings per target and preset\n")
    md.append("Score · range = score if site-side missing criteria were a total mismatch / perfect match · "
              f"criteria used/selected. Sites with fewer than {mc} usable criteria are not scored.\n")
    for t in targets:
        for pid, w in config.PRESETS.items():
            rk = rank_sites(t, sites, w, features, mc)
            rows = [(i + 1 if r["score"] is not None else "—", names[r["site"]],
                     r["score"] if r["score"] is not None else "insufficient",
                     f"{r['scoreRange'][0]}–{r['scoreRange'][1]}" if r["scoreRange"] else "",
                     f"{r['coverage']['used']}/{r['coverage']['selected']}") for i, r in enumerate(rk)]
            md.append(f"### {t['name']} — {pid}\n")
            md.append(table(["#", "Site", "Score", "Range", "Criteria"], rows) + "\n")

    md.append("### 1b. Ranked by guaranteed minimum (lower end of the range)\n")
    md.append("The score a site keeps if every criterion missing for it were a total mismatch — an "
              "evidence-backed ordering offered in the app as “Rank by: Guaranteed minimum”.\n")
    for t in targets:
        for pid in ("balanced", "rover"):
            rk = [r for r in rank_sites(t, sites, config.PRESETS[pid], features, mc) if r["score"] is not None]
            rk.sort(key=lambda r: (-r["scoreRange"][0], -r["score"], names[r["site"]], r["site"]))
            md.append(f"**{t['name']} — {pid}:** " + ", ".join(
                f"{i + 1}. {names[r['site']]} {r['scoreRange'][0]} (score {r['score']})" for i, r in enumerate(rk)) + "\n")

    # 2. negative controls -----------------------------------------------------------
    md.append("## 2. Negative controls (non-analog sites)\n")
    md.append("Controls: " + "; ".join(f"{c['name']}" for c in controls) +
              ". Compared on numeric criteria only (terrain, aridity, temperature, swing, bare ground), "
              "because controls have no curated geology/ice class. `separation` = share of (analog, control) "
              "pairs in which the analog scores higher (1.0 = perfect separation, 0.5 = chance).\n")
    sep_rows = []
    for t in targets:
        for pid in ("balanced", "rover", "habitat", "ice"):
            w = numeric_only(config.PRESETS[pid])
            pool = sites + controls
            rk = rank_sites(t, pool, w, features, mc)
            score = {r["site"]: r["score"] for r in rk}
            an = [score[s["id"]] for s in sites if s["knownAnalog"] and score[s["id"]] is not None]
            ct = [score[c["id"]] for c in controls if score[c["id"]] is not None]
            pairs = [(a, c) for a in an for c in ct]
            sep = round(sum(1.0 if a > c else 0.5 if a == c else 0.0 for a, c in pairs) / len(pairs), 2) if pairs else None
            best_ctrl = max((c for c in controls if score[c["id"]] is not None), key=lambda c: score[c["id"]], default=None)
            ctrl_rank = (scored_order(rk).index(best_ctrl["id"]) + 1) if best_ctrl else None
            sep_rows.append((t["name"], pid, len(an), len(ct), f"{min(an) if an else '-'}–{max(an) if an else '-'}",
                             f"{min(ct) if ct else '-'}–{max(ct) if ct else '-'}", sep,
                             f"{best_ctrl['name']} #{ctrl_rank}" if best_ctrl else "—"))
    md.append(table(["Target", "Preset (numeric only)", "Analogs scored", "Controls scored", "Analog scores",
                     "Control scores", "Separation", "Best control (rank)"], sep_rows) + "\n")

    # 3. robustness ------------------------------------------------------------------
    md.append("## 3. Robustness\n")
    md.append("### 3a. Leave one criterion out (Kendall τ vs full ranking, balanced)\n")
    loo_rows = []
    for t in targets:
        base = scored_order(rank_sites(t, sites, config.PRESETS["balanced"], features, mc))
        for f in features:
            w = dict(config.PRESETS["balanced"], **{f["id"]: 0})
            order = scored_order(rank_sites(t, sites, w, features, mc))
            dropped = [names[s] for s in base if s not in order]
            loo_rows.append((t["name"], f["label"], kendall_tau(base, order), names[order[0]] if order else "—",
                             ", ".join(dropped)))
    md.append(table(["Target", "Criterion removed", "τ", "New #1", "No longer scored"], loo_rows) + "\n")

    md.append("### 3b. Random weight perturbation (each weight ± up to 2, clamped 0–5, 500 draws, balanced base)\n")
    rng = random.Random(SEED)
    pert_rows = []
    for t in targets:
        tally, tops = {}, []
        for _ in range(500):
            w = {k: min(5, max(0, v + rng.randint(-2, 2))) for k, v in config.PRESETS["balanced"].items()}
            order = scored_order(rank_sites(t, sites, w, features, mc))
            for i, s in enumerate(order):
                tally.setdefault(s, []).append(i + 1)
            if order:
                tops.append(order[0])
        for s, ranks in sorted(tally.items(), key=lambda kv: sorted(kv[1])[len(kv[1]) // 2]):
            ranks.sort()
            pert_rows.append((t["name"], names[s], ranks[len(ranks) // 2],
                              f"{ranks[int(0.05 * len(ranks))]}–{ranks[max(0, int(0.95 * len(ranks)) - 1)]}",
                              f"{100 * tops.count(s) / len(tops):.0f}%" if tops else "—",
                              f"{100 * len(ranks) / 500:.0f}%"))
    md.append(table(["Target", "Site", "Median rank", "5–95% rank", "P(#1)", "Scored in"], pert_rows) + "\n")

    md.append("### 3c. Target-value uncertainty (balanced)\n")
    unc_rows = []
    for t in targets:
        base = scored_order(rank_sites(t, sites, config.PRESETS["balanced"], features, mc))
        for fid in ("temp", "terrain"):
            p = (t.get("provenance") or {}).get(fid) or {}
            rng_vals = p.get("range")
            if not rng_vals or None in rng_vals or t["norm"].get(fid) is None:
                continue
            for v in rng_vals:
                order = scored_order(rank_sites(with_target_value(t, fid, v), sites, config.PRESETS["balanced"],
                                                features, mc))
                unc_rows.append((t["name"], fid, v, kendall_tau(base, order), names[order[0]] if order else "—"))
    md.append(table(["Target", "Criterion", "Target value at range end", "τ vs reported", "#1"], unc_rows) + "\n")

    # 4. geology choice ----------------------------------------------------------------
    md.append("## 4. Jezero geology choice (reported, NOT adopted)\n")
    md.append("The target is the landing site (crater floor: basalt). The delta, a few km away, is clay/carbonate. "
              "Choosing the target point after seeing which sites win would be post-hoc fitting, so the bundle keeps "
              "the landing site; this table only shows how much the choice matters.\n")
    jz = next((t for t in targets if t["id"] == "mars-jezero"), None)
    if jz:
        geo_rows = []
        for cls in ("basalt", "clay"):
            t = json.loads(json.dumps(jz))
            t["norm"]["geology"] = cls
            rk = rank_sites(t, sites, config.PRESETS["balanced"], features, mc)
            top = [f"{names[r['site']]} {r['score']}" for r in rk if r["score"] is not None][:5]
            geo_rows.append((cls, ", ".join(top)))
        md.append(table(["Target geology", "Top 5 (balanced)"], geo_rows) + "\n")

    # 5. clipped share ------------------------------------------------------------------
    md.append("## 5. Score share from clipped target values (balanced)\n")
    md.append("Where a target value lies beyond Earth's bounds it is set to the bound; that criterion then measures "
              "how close a site comes to Earth's extreme, not to the target value.\n")
    clip_rows = []
    for t in targets:
        clipped = t.get("clipped") or {}
        if not clipped:
            continue
        for s in sites:
            r = score_site(t, s, config.PRESETS["balanced"], features, mc)
            if r["score"] is None:
                continue
            share = sum(v for k, v in r["contrib"].items() if k in clipped and v is not None)
            clip_rows.append((t["name"], ", ".join(clipped), names[s["id"]], r["score"],
                              f"{100 * share / (r['score'] / 100):.0f}%" if r["score"] else "—"))
    md.append(table(["Target", "Clipped criteria", "Site", "Score", "Share of score"], clip_rows) + "\n")

    # 6. documented use ------------------------------------------------------------------
    md.append("## 6. Consistency with documented analog use\n")
    ev_rows = []
    ranks = {t["id"]: {r["site"]: (i + 1, r["score"]) for i, r in
                       enumerate(rank_sites(t, sites, config.PRESETS["balanced"], features, mc))} for t in targets}
    for e in _read(EVIDENCE):
        rank, score = ranks.get(e["target"], {}).get(e["site"], (None, None))
        ev_rows.append((names.get(e["site"], e["site"]), e["target"], e["use"],
                        f"#{rank} ({score})" if score is not None else "not scored", e["citation"], e["opened"]))
    md.append(table(["Site", "Target", "Documented use", "Model rank (balanced)", "Source", "Source opened"],
                    ev_rows) + "\n")
    md.append("Interpretation of these results is in `docs/validation_report.md`.\n")

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("\n".join(md), encoding="utf-8", newline="\n")
    print(f"wrote {OUT_MD.relative_to(config.ROOT.parent).as_posix()}")
    for r in sep_rows:
        print("  separation", r)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
