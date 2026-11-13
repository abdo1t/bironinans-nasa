# Data Readiness Matrix (Phase 3 checkpoint, 2026-11-13)

Status key: **Ready** = in the real bundle and used in scores · **Partial** = in the bundle with exclusions · **Pending** = code ready, data not acquired · **Unavailable** = no defensible source yet (excluded from scores).

## Earth sites (11 sites in `pipeline/seed/sites_real.csv`)

| Criterion | Source / dataset | Units | Resolution | Period | Status | Limitations |
|---|---|---|---|---|---|---|
| Aridity | NASA POWER climatology API v2.10.1, `PRECTOTCORR` (MERRA-2 bias-corrected precipitation), community AG | mm/day → ×365.25 = mm/yr | 0.5° × 0.625° grid cell (~50 km) | Jan 2001 – Dec 2025 (from the API header) | **Partial** (8/11 scored) | Reanalysis, not a gauge. Reported to 0.01 mm/day (≈ ±1.8 mm/yr). Cells that do not represent the site are shown but not scored: Death Valley (Badwater basin floor vs. 846 m cell), Dallol (−99 m vs. 1063 m cell, which includes the Ethiopian highlands), Lanzarote (island smaller than the cell, mostly ocean). |
| Surface temperature | NASA POWER `TS` (Earth skin temperature), annual mean | °C | same | same | **Partial** (8/11) | Same cell caveats. Skin, not 2 m air, so it compares like-for-like with lunar/Martian surface temperature. |
| Daily temperature swing | NASA POWER `TS_RANGE`, annual climatology | °C | same | same | **Partial** (8/11) | POWER defines the range as max − min "in the period of interest"; the annual value (e.g. 28.6 °C at Atacama) behaves as a mean *daily* range, not the annual extreme range (`TS_MAX − TS_MIN`), which we never use. |
| Terrain relief | SRTMGL1 v003 (56°S–60°N); ASTER GDEM v3 `ASTGTM` 003 fallback (83°S–83°N) | m (P99 − P1 in 10 × 10 km window) | 1 arc-second (~30 m) | SRTM Feb 2000; ASTER 2000–2013 | **Pending** | `fetch_terrain.py` is written and unit-tested but needs a NASA Earthdata login (none on this machine). DEM per site is already recorded: SRTM for 8 sites, ASTER for Haughton (75°N), McMurdo (78°S) and Holuhraun (65°N). ASTER has coarser effective resolution and artefacts over ice/snow, so it is flagged `fallback`. |
| Bare ground (NDVI) | MODIS NDVI (MOD13A3) — planned | NDVI (inverted) | 1 km | — | **Pending** | Not implemented; needs an Earthdata/AppEEARS login. |
| Geology class | Peer-reviewed literature, cited per site | category | site | — | **Ready** (10/11) | McMurdo left empty (mixed dolerite/sandstone). Atacama `sulfate` (gypsum/anhydrite; `evaporite` also defensible). |
| Ground ice | Literature; Gruber 2012 global permafrost zonation for hot/temperate sites | yes/no | site | — | **Ready** (10/11) | Holuhraun left empty (site ~750 m vs. modelled permafrost limit 600–900 m). Gruber 2012 used as a general zonation, not checked per pixel. |
| Coordinates | Papers, station pages, Wikipedia/GeoNames (per site) | WGS84 ° | point | — | **Ready** with caveats | Río Tinto point from a user-contributed source (marked LOW-AUTHORITY); Yungay from a conference abstract; Haughton to the arc-minute; Holuhraun, Timanfaya, White Desert, Wadi Rum, Dallol are area reference points. Mauna Kea dropped: no published coordinates for its analog field site. |
| Analog-literature status | One peer-reviewed analog study per site | yes/no | — | — | **Ready** | 9/11 have one. White Desert and Wadi Rum: none found (not proof of absence) → "uncatalogued candidate". |

## Planetary targets (`pipeline/seed/targets_real.json`)

| Criterion | Jezero (Perseverance landing site, 18.44°N 77.45°E) | Lunar South Pole (connecting ridge, 89.468°S 222.6°E) |
|---|---|---|
| Aridity | 0 mm/yr — *definitional* (NASA Mars Facts) | 0 mm/yr — *definitional* (NASA Moon Facts) |
| Surface temperature | ≈ −52 °C — *in-situ*, midpoint of MEDA daily-mean surface temperature 210–232 K over one Mars year (Munguira et al. 2024). No annual mean is published; normalized value could be 0–0.20. | ≤ −73 °C — *orbital*, Diviner summer ≈ 200 K (Williams et al. 2019); annual mean unpublished but necessarily colder → clipped to Earth's bound. |
| Daily swing | 55–105 K — *in-situ* (Munguira et al. 2023); beyond Earth's range → clipped to 1 whatever the exact value. | **Unavailable** — no published day–night range for the ridge. |
| Terrain relief | **Unavailable** — needs MOLA/HiRISE DEM processed with the Earth method. | **Unavailable** — needs LOLA DEM processing. |
| Bare ground | No vegetation — *definitional*. | No vegetation — *definitional*. |
| Geology | `basalt` — *literature*: Máaz lava flows on the crater floor (Sun et al. 2023; Farley et al. 2022). The delta (not the landing site) is `clay`. | `anorthosite` — *literature* (Patterson et al. 2024). Surface is regolith/breccia. |
| Ground ice | `no` — *literature*, inferred from the 35°N shallow-ice limit (Piqueux et al. 2019). | `yes` — *in-situ/orbital*: LCROSS 5.6 ± 2.9 wt% in Cabeus (Colaprete et al. 2010); M3 surface ice (Li et al. 2018). Region-level: ice is in nearby cold traps, not on the sunlit ridge. |

The four other targets from the mock demo (Mare Tranquillitatis, Marius Hills, Gale, Arcadia Planitia) are **not** in the real bundle: their values have not been verified.
