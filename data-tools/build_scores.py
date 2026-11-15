"""Turn Processed/features_*.csv into the 5 analyzer axes (0-1).

Axes (same order as the dashboard): topography, geology, aridity, thermal, altitude.
Method: every raw metric is min-max scaled over the Earth candidate sites; lunar
targets are scaled with the SAME Earth min/max and clipped to [0, 1]. A lunar value
beyond the Earth range therefore saturates at 0 or 1 ("more extreme than any Earth site").

Writes prototype/data/features.json and prototype/web/data.js.
Run with:  python data-tools/build_scores.py
"""
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "Processed")
PROTO = os.path.join(ROOT, "prototype")
AXES = ["topography", "geology", "aridity", "thermal", "altitude"]

# "aridity" axis = barrenness from MODIS NDVI (MOD13A1): 1 = bare ground, 0 = dense vegetation.
# It measures missing plant cover, not rainfall (wet-but-barren lava such as Holuhraun scores 1).
# veg = (annual max NDVI - bare-soil baseline) / (dense canopy - baseline), clipped to [0, 1].
NDVI_BARE, NDVI_DENSE = 0.10, 0.50
# MOD13A1 is not produced for these polar sites; both are unvegetated polar deserts.
NO_NDVI_BARREN = {"devon_haughton", "mcmurdo_dry_valleys"}
COUNTRY = {
    "devon_haughton": "Canada", "atacama_yungay": "Chile", "meteor_crater": "USA",
    "mcmurdo_dry_valleys": "Antarctica", "death_valley_ubehebe": "USA",
    "iceland_holuhraun": "Iceland", "lanzarote_cueva_verdes": "Spain",
    "egypt_western_desert": "Egypt", "dallol_ethiopia": "Ethiopia",
    "mistastin_crater": "Canada", "pilbara_strelley_pool": "Australia",
    "amazon_negative_control": "Brazil",
}
MOON_DESC = {
    "shackleton_crater": "South-pole crater, 21 km wide, steep walls, permanently shadowed floor with ice potential.",
    "malapert_massif": "High massif near the pole with near-continuous Earth view and good sunlight.",
    "haworth_crater": "South-pole crater with a permanently shadowed, very cold floor.",
}


def scale(series, lo, hi):
    return ((series - lo) / (hi - lo)).clip(0, 1) if hi > lo else series * 0 + 0.5


def axis_table(df, lo_hi):
    s = lambda col: scale(df[col], *lo_hi[col])
    out = pd.DataFrame(index=df.index)
    out["topography"] = (s("slope_p95_deg") + s("rough_rms_m") + s("relief_m")) / 3
    out["geology"] = s("radar")                        # proxy, see notes in output
    out["thermal"] = (s("cold") + s("t_range")) / 2
    out["altitude"] = s("elev_mean_m")
    return out


def main():
    e = pd.read_csv(os.path.join(PROC, "features_earth.csv"))
    m = pd.read_csv(os.path.join(PROC, "features_moon.csv"))

    # unify metric names across bodies
    e["radar"] = e["s1_copol_db_mean"]
    e["cold"] = -e["lst_mean_K"]
    e["t_range"] = e["lst_annual_range_K"]
    m["radar"] = m["cpr_mean"]                         # Mini-RF CPR as radar-roughness proxy
    m["cold"] = -m["div_tavg_K"]
    m["t_range"] = m["div_tmax_K"] - m["div_tmin_est_K"]

    veg = ((e["ndvi_max"] - NDVI_BARE) / (NDVI_DENSE - NDVI_BARE)).clip(0, 1)
    veg[e["site_id"].isin(NO_NDVI_BARREN) & veg.isna()] = 0.0
    barren = 1 - veg

    cols = ["slope_p95_deg", "rough_rms_m", "relief_m", "radar", "cold", "t_range", "elev_mean_m"]
    lo_hi = {c: (float(e[c].min()), float(e[c].max())) for c in cols}
    # radar range from mostly-bare sites only: canopy volume scattering is not geology
    bare = e[barren >= 0.5]
    lo_hi["radar"] = (float(bare["radar"].min()), float(bare["radar"].max()))
    # Moon CPR (S-band ratio) is not on the C-band dB scale: map its plausible range
    # 0.4-1.0 linearly onto the Earth dB range so the proxy is at least monotonic.
    m["radar"] = lo_hi["radar"][0] + (m["radar"] - 0.4) / 0.6 * (lo_hi["radar"][1] - lo_hi["radar"][0])

    ea = axis_table(e, lo_hi)
    ea["aridity"] = barren
    ea["geology"] = ea["geology"] * barren      # vegetated ground hides the surface geology
    ma = axis_table(m, lo_hi)
    ma["aridity"] = 1.0

    raw_cols = ["slope_p95_deg", "rough_rms_m", "relief_m", "s1_copol_db_mean",
                "lst_mean_K", "lst_annual_range_K", "elev_mean_m"]
    analogs = []
    for i, r in e.iterrows():
        analogs.append({
            "id": r.site_id, "name": r["name"].split(",")[0], "country": COUNTRY[r.site_id],
            "lat": r.lat, "lng": r.lon, "role": r.role,
            "features": [round(float(ea.loc[i, a]), 3) for a in AXES],
            "why": f"{r['name']}. Role: {r.role}.",
            "raw": {c: (None if pd.isna(r[c]) else round(float(r[c]), 3)) for c in raw_cols},
        })
    targets = {}
    for i, r in m.iterrows():
        targets[r.site_id] = {
            "name": r["name"], "desc": MOON_DESC.get(r.site_id, ""), "body": "Moon",
            "features": [round(float(ma.loc[i, a]), 3) for a in AXES],
        }
    data = {
        "axes": AXES, "targets": targets, "analogs": analogs,
        "notes": ["aridity axis = barrenness from MODIS NDVI (1 - vegetation), not rainfall; "
                  "Devon and McMurdo have no NDVI product and are assumed bare",
                  "geology axis is a radar proxy (Sentinel-1 dB for Earth, Mini-RF CPR for Moon), "
                  "multiplied by barrenness so canopy scattering does not count as geology",
                  "all axes are min-max scaled over the Earth sites; lunar values clip to [0,1]"],
    }
    os.makedirs(os.path.join(PROTO, "data"), exist_ok=True)
    with open(os.path.join(PROTO, "data", "features.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    with open(os.path.join(PROTO, "web", "data.js"), "w", encoding="utf-8") as f:
        f.write("window.ANALOG_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n")
    print(pd.concat([ea.round(2).assign(site=e.site_id), ma.round(2).assign(site=m.site_id)])
          .set_index("site").to_string())


if __name__ == "__main__":
    main()
