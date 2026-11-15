"""Test-conditioned qualification: pass / partial / fail / unknown per requirement,
per Earth site, per lunar target, plus the smallest site portfolio for a campaign.

Reads Processed/features_*.csv and data-tools/tests.json.
Writes prototype/data/qualification.json and prototype/web/qualification.js.
With --report also writes Processed/validation.md.

Run with:  python data-tools/qualify.py [--report]
"""
import itertools
import json
import math
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_scores import COUNTRY  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "Processed")
PROTO = os.path.join(ROOT, "prototype")
RANK = {"pass": 3, "partial": 2, "unknown": 1, "fail": 0}
MOON_DESC = {
    "shackleton_ridge": "Best-lit ground next to Shackleton: the likely place for landers, power and surface work.",
    "shackleton_floor": "Permanently shadowed floor about 3 km below the rim: the cold-trap and ice target.",
    "malapert_massif": "High massif with long sunlight and direct Earth view.",
    "haworth_floor": "Large permanently shadowed crater floor, one of the coldest mapped areas.",
}
TARGET_VALUES = ["slope_p95_deg", "rough_rms_m", "illum_frac_mean", "illum_frac_max",
                 "div_tavg_K", "div_tmax_K", "div_ice_frac", "cpr_mean", "t_range_K"]


def num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) else v


def judge(req, site_row, target_row, tol_scale=1.0):
    """Return {verdict, site_value, target_value, note} for one requirement."""
    rule = req["rule"]
    sv = num(site_row.get(req["site"]))
    tv = num(target_row.get(req["target"])) if "target" in req else None
    out = {"site_value": None if sv is None else round(sv, 3),
           "target_value": None if tv is None else round(tv, 3), "note": ""}
    if rule == "unscored":
        out["verdict"] = "unknown"
        out["note"] = "not scored: datasets are not comparable"
        return out
    if sv is None:
        out["verdict"] = "unknown"
        out["note"] = "no data for this site"
        return out
    if rule == "evidence":
        out["verdict"] = "partial" if sv >= req["min"] else "fail"
        note = site_row.get(req.get("note_col"), "")
        out["note"] = "" if num(note) is None and not isinstance(note, str) else str(note or "")
        return out
    if rule in ("match", "match_rel"):
        if tv is None:
            out["verdict"] = "unknown"
            out["note"] = "no target data"
            return out
        gap = abs(sv - tv) / (abs(tv) if rule == "match_rel" else 1.0)
        tol = req["tol"] * tol_scale
        out["verdict"] = "pass" if gap <= tol else "partial" if gap <= 2 * tol else "fail"
        return out
    # at_most / at_least: thresholds fixed in tests.json or derived from the lunar target
    p = req.get("pass")
    if "pass_from_target_plus" in req:
        p = None if tv is None else tv + req["pass_from_target_plus"]
    if "pass_from_target_frac" in req:
        p = None if tv is None else tv * req["pass_from_target_frac"]
    if p is None:
        out["verdict"] = "unknown"
        out["note"] = "no target data"
        return out
    out["pass_threshold"] = round(p, 2)
    good = (lambda x, lim: x <= lim) if rule == "at_most" else (lambda x, lim: x >= lim)
    out["verdict"] = "pass" if good(sv, p) else "partial" if good(sv, req["partial"]) else "fail"
    return out


def test_verdict(test, verdicts, reqs):
    """fail if any scored requirement fails; unknown if a core requirement is unknown;
    otherwise the worst of pass / partial. Unknown supporting or unscored ones are only counted."""
    req_ids, supporting = test["requirements"], set(test.get("supporting", []))
    scored = [r for r in req_ids if reqs[r]["rule"] != "unscored"]
    vs = {r: verdicts[r]["verdict"] for r in scored}
    unknowns = sum(verdicts[r]["verdict"] == "unknown" for r in req_ids)
    if "fail" in vs.values():
        v = "fail"
    elif any(v == "unknown" and r not in supporting for r, v in vs.items()):
        v = "unknown"
    else:
        known = [v for v in vs.values() if v != "unknown"]
        v = min(known, key=RANK.get) if known else "unknown"
    cap = test.get("max_verdict")
    if cap and v in RANK and RANK[v] > RANK[cap]:
        v = cap
    return {"verdict": v, "unknowns": unknowns}


def portfolio(sites, target, test_ids):
    """Smallest set of sites that gives every test its best achievable verdict (exact search)."""
    best, uncovered = {}, []
    for t in test_ids:
        top = max((s["tests"][target][t]["verdict"] for s in sites), key=RANK.get)
        if RANK[top] >= RANK["partial"]:
            best[t] = top
        else:
            uncovered.append(t)
    if not best:
        return {"sites": [], "covers": {}, "best": {}, "uncovered": uncovered}
    cand = [s for s in sites if any(s["tests"][target][t]["verdict"] == best[t] for t in best)]
    for size in range(1, len(cand) + 1):
        options = []
        for combo in itertools.combinations(cand, size):
            covers = {t: [s["id"] for s in combo if s["tests"][target][t]["verdict"] == best[t]] for t in best}
            if all(covers.values()):
                # tie-break: fewer unknowns, then more tests covered per site, then name
                unk = sum(s["tests"][target][t]["unknowns"] for s in combo for t in best)
                options.append((unk, -sum(len(v) for v in covers.values()), [s["id"] for s in combo], covers))
        if options:
            options.sort(key=lambda o: (o[0], o[1], o[2]))
            return {"sites": options[0][2], "covers": options[0][3], "best": best, "uncovered": uncovered}
    return {"sites": [], "covers": {}, "best": {}, "uncovered": list(test_ids)}


# Why a site is on the list, where the literature frames it differently from the lunar tests.
SITE_CONTEXT = {
    "egypt_western_desert": "Discovery case. Published as a Mars analog for wind-carved landforms "
                            "(yardangs and dunes; Breed & McCauley; NASA CR-3611, 1983). On these lunar "
                            "south-pole tests it screens out: the depression floor is flat at the ~90 m scale "
                            "the data can see, warm, and has no mineral map at this point yet.",
    "amazon_negative_control": "Negative control: should qualify for nothing that needs bare, cold or low-sun ground.",
}

ALWAYS_CHECK = [
    "Ground-truth slope, rock abundance and soil strength at rover scale (finer than the ~90 m elevation data).",
    "Confirm access, permits and season with the site authority.",
]


def evidence(site, reqs, first_target):
    """Evidence grade from how many scored requirements have data, plus the field checks needed."""
    v = site["verdicts"][first_target]
    scored = [r for r, req in reqs.items() if req["rule"] != "unscored"]
    have = [r for r in scored if v[r]["site_value"] is not None]
    share = len(have) / len(scored)
    grade = "A" if share >= 0.9 else "B" if share >= 0.7 else "C"
    checks = [f"Measure '{reqs[r]['label']}' on site: no open data for it here." for r in scored if r not in have]
    checks += ALWAYS_CHECK
    if site.get("note") and "confirm" in site["note"].lower():
        checks.insert(0, "Confirm the site location on high-resolution imagery: " + site["note"])
    return {"grade": grade, "data_share": round(share, 2), "layers_with_data": len(have),
            "layers_scored": len(scored), "field_checks": checks}


def build(tol_scale=1.0):
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = json.load(open(os.path.join(here, "tests.json"), encoding="utf-8"))
    reqs, tests = cfg["requirements"], cfg["tests"]
    e = pd.read_csv(os.path.join(PROC, "features_earth.csv"))
    m = pd.read_csv(os.path.join(PROC, "features_moon.csv"))
    m["t_range_K"] = m["div_tmax_K"] - m["div_tmin_est_K"]
    notes = pd.read_csv(os.path.join(ROOT, "Raw Data", "sites.csv")).set_index("site_id")["note"].to_dict()

    targets = {}
    for _, r in m.iterrows():
        vals = {k: num(r[k]) for k in TARGET_VALUES}
        targets[r.site_id] = {"name": r["name"], "desc": MOON_DESC.get(r.site_id, ""),
                              "lat": float(r.lat), "lng": float(r.lon),
                              "values": {k: (None if v is None else round(v, 3)) for k, v in vals.items()}}
    sites = []
    for _, s in e.iterrows():
        srow = s.to_dict()
        site = {"id": s.site_id, "name": s["name"].split(",")[0], "full_name": s["name"],
                "country": COUNTRY.get(s.site_id, ""), "lat": float(s.lat), "lng": float(s.lon),
                "role": s.role, "note": str(notes.get(s.site_id, "") or ""),
                "context": SITE_CONTEXT.get(s.site_id, ""), "verdicts": {}, "tests": {}}
        for _, t in m.iterrows():
            v = {rid: judge(req, srow, t.to_dict(), tol_scale) for rid, req in reqs.items()}
            site["verdicts"][t.site_id] = v
            site["tests"][t.site_id] = {tid: test_verdict(td, v, reqs)
                                        for tid, td in tests.items()}
        site["evidence"] = evidence(site, reqs, m.site_id.iloc[0])
        sites.append(site)
    data = {
        "targets": targets, "tests": tests,
        "requirements": {rid: {"label": r["label"], "unit": r.get("unit", ""), "caveat": r["caveat"],
                               "rule": r["rule"], "basis": r.get("basis", ""),
                               "target_text": r.get("target_text", ""),
                               "target_unit": r.get("target_unit", "")} for rid, r in reqs.items()},
        "sites": sites, "cannot_reproduce": cfg["cannot_reproduce"],
        "disclaimer": "Screening evidence from open data with stated limits. No site is a confirmed "
                      "analog and verdicts do not predict hardware performance.",
    }
    data["portfolios"] = {tid: portfolio(sites, tid, list(tests)) for tid in targets}
    return data


def report(data):
    tests, sites = data["tests"], data["sites"]
    names = {s["id"]: s["name"] for s in sites}
    L = ["# Validation report", "", data["disclaimer"], "",
         "Test verdict: fail if any scored requirement fails; unknown if a core requirement has no data; "
         "otherwise the worst of pass / partial. `+Nu` = requirements with no data or not scored.", ""]
    for tid, t in data["targets"].items():
        L += [f"## Target: {t['name']}", "",
              "| Site | Role | " + " | ".join(td["name"] for td in tests.values()) + " |",
              "|---|---|" + "---|" * len(tests)]
        for s in sites:
            cells = []
            for k in tests:
                tv = s["tests"][tid][k]
                cells.append(tv["verdict"] + (f" (+{tv['unknowns']}u)" if tv["unknowns"] else ""))
            L.append(f"| {s['name']} | {s['role']} | " + " | ".join(cells) + " |")
        p = data["portfolios"][tid]
        L += ["", "**Smallest portfolio for all tests:** " + (", ".join(names[i] for i in p["sites"]) or "none"), ""]
        for k, best in p["best"].items():
            L.append(f"- {tests[k]['name']}: best achievable = **{best}**, via "
                     + ", ".join(names[i] for i in p["covers"][k]))
        L += ["", "**Uncovered tests (no site reaches partial):** "
              + (", ".join(tests[x]["name"] for x in p["uncovered"]) or "none"), ""]
    L += ["## Evidence grade per site", "",
          "Grade A: data for at least 90% of scored requirements; B: at least 70%; C: less.", "",
          "| Site | Grade | Requirements with data |", "|---|---|---|"]
    for s in sites:
        ev = s["evidence"]
        L.append(f"| {s['name']} | {ev['grade']} | {ev['layers_with_data']} of {ev['layers_scored']} |")
    L.append("")
    neg = next(s for s in sites if s["role"] == "negative control")
    L += ["## Negative control", "", f"{neg['full_name']}:", ""]
    for tid, t in data["targets"].items():
        L.append(f"- {t['name']}: "
                 + ", ".join(f"{tests[k]['name']} = {neg['tests'][tid][k]['verdict']}" for k in tests))
    L += ["", "## Sensitivity (match tolerances x0.5 and x2)", ""]
    for scale in (0.5, 2.0):
        alt = build(scale)
        for tid, t in data["targets"].items():
            a, b = data["portfolios"][tid]["sites"], alt["portfolios"][tid]["sites"]
            L.append(f"- x{scale}, {t['name']}: "
                     + ("portfolio unchanged" if a == b else "portfolio changes to " + ", ".join(names[i] for i in b)))
    path = os.path.join(PROC, "validation.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))
    print("\nWrote", path)


def main():
    data = build()
    os.makedirs(os.path.join(PROTO, "data"), exist_ok=True)
    with open(os.path.join(PROTO, "data", "qualification.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    with open(os.path.join(PROTO, "web", "qualification.js"), "w", encoding="utf-8") as f:
        f.write("window.QUALIFICATION = " + json.dumps(data, ensure_ascii=False) + ";\n")
    print("Wrote prototype/data/qualification.json and prototype/web/qualification.js")
    if "--report" in sys.argv:
        report(data)


if __name__ == "__main__":
    main()
