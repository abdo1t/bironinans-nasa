# Methodology and limitations (real-data bundle, Phase 4)

Companion to [data_readiness.md](data_readiness.md), [terrain_integration.md](terrain_integration.md) and [validation_report.md](validation_report.md). The base scoring formula is specified in [CLAUDE.md §5](../CLAUDE.md). The additions below (minimum criteria, scoreRange, gap rule, clipped wording) are implemented identically in `pipeline/scoring.py` and `web/src/lib/scoring.js`.

## 1. Pipeline

```
seed/sites_real.csv  ─┐
seed/targets_real.json┤
fetch_power.py ──────► data/power.csv              ┐
fetch_terrain.py ────► data/terrain.csv            ├─► build_bundle.py ─► web/public/data/ (kind "real")
fetch_planetary_terrain.py ► data/planetary_terrain.csv │     features.json, targets.json, sites.geojson,
fetch_ndvi.py ───────► data/ndvi.csv               ┘     scores.json, manifest.json (SHA-256 per file)
                                                         └─ validate_bundle.py (fails the build on any problem)
validate_analogs.py (+ seed/controls.csv, data/controls.csv, seed/analog_evidence.csv) ─► docs/validation.md
make_mock.py ─────────────────────────────────────────► web/public-mock/data/ (kind "mock", separate)
```

Run with the Python 3.12 venv (`pipeline/requirements.txt`) from `pipeline/`: `fetch_power.py`, `fetch_terrain.py`, `fetch_planetary_terrain.py`, `fetch_ndvi.py`, `build_bundle.py`, `validate_bundle.py real`, `validate_analogs.py`. All fetchers are credential-free and cache their results. POWER responses are stored with their exact request in `pipeline/data/power/<site>.json`, and NDVI composites in `data/downloads/ndvi_cache.json`. Reruns never refetch filled rows unless `--force`/`--refresh` is given.

## 2. Decisions (and why)

| Decision | Reason |
|---|---|
| Temperature criteria use **surface (skin) temperature** (POWER `TS`, `TS_RANGE`) instead of 2 m air temperature (`T2M`). | The Moon has no air. Diviner and MEDA report surface or ground temperatures, so skin temperature is the like-for-like Earth quantity. `T2M` is still fetched for reference. |
| Daily swing uses `TS_RANGE`, never `T2M_MAX − T2M_MIN`. | In the annual climatology, `_MAX`/`_MIN` are period extremes, so their difference is an annual range, not a day–night swing (`fetch_power.py` notes; `T2M_MAX`/`T2M_MIN` are not in the cached responses). |
| Bounds: temperature −60…+35 °C and swing 0…35 °C (set in Phase 3); precipitation 0…2000 mm/yr, terrain 0…1500 m and NDVI 0…0.8 (unchanged since the Phase 0 scaffold, no recorded Earth-wide derivation). | The Phase 3 temperature and swing bounds were set from Earth-wide POWER values (`TS` annual mean: Dome A −58.9 °C, Vostok −55.7 °C; hottest checked deserts +26.8…+27.6 °C; for swing, the Atacama `TS_RANGE` of 28.6 °C was among the values checked). These reference values are not cached in `pipeline/data/power/`, so they cannot be reproduced from the repo, and the bounds were changed in the same commit (`b17e663`) that added the real data. The Phase 0 terrain bound was set for a different metric (a ~5 km box). No bound changed in Phase 4, and none was changed to move rankings. |
| Precipitation converted from mm/day × 365.25. | POWER returns `PRECTOTCORR` in mm/day (the unit is checked on every response). |
| **Grid-cell representativeness rule:** if \|site elevation − cell elevation\| > 500 m, or the site is an island smaller than the cell, POWER values are shown but not scored. | A ~50 km cell averages very different terrain. Excluded: Death Valley (Δ 932 m), Dallol (Δ 1162 m; the cell reports 449 mm/yr of rain for a hyper-arid salt plain) and Lanzarote (ocean-dominated cell, swing 4.5 °C). When the seed has no site elevation, the DEM window median is used (White Desert: 27 m against a 156 m cell, so it passes). |
| **Terrain: one metric for every body.** P99 − P1 of elevation in a 10 × 10 km window, box-mean aggregated to a ~200 m common posting and averaged over all block offsets. | Makes 20 m (CTX, LOLA), 30 m (NASADEM, Copernicus) and 200 m (HRSC–MOLA) products comparable. Details in [terrain_integration.md](terrain_integration.md). |
| Terrain from **NASADEM v001** (8 sites) and **Copernicus GLO-30** only where NASADEM has no coverage (Haughton, McMurdo, Holuhraun), instead of SRTMGL1 or ASTER. | LP DAAC SRTMGL1 and ASTGTM need an Earthdata login (an anonymous request returns 302 → 401). NASADEM is NASA's SRTM reprocessing, served publicly. |
| Bare ground from **MODIS MOD13Q1 v061** (250 m, 16-day), median of usable Terra composites from 2022–2023 in the 10 km window; a composite is usable with ≥ 50 % good pixels, and at least 6 usable composites are required. | Public mirror (Planetary Computer). The quality mask and the median over two years reduce cloud and snow effects. Where many composites are unusable (Haughton 10, Holuhraun 17 usable), the remaining composites are likely biased toward the snow-free season, and the median does not remove that bias. |
| **Minimum 3 usable criteria for a score** (`scores.json.minCriteria`). | Without this rule, a site could score 100 from two categorical matches. Sites below the minimum show "Insufficient data", with their per-criterion similarities still visible. |
| **scoreRange** `[lo, hi]` on every score: the score if every selected criterion missing on the **site** side (target value known) were a total mismatch (s = 0) or a perfect match (s = 1). | Missing data is skipped, not counted as 0, which can favour sites with gaps. The range shows how far missing data could move the score. A narrow range means the score is data-backed. |
| **Rank by: Conservative lower bound** (`orderRanking` in `web/src/lib/explain.js`, URL `rank=min`): orders by the low end of scoreRange, then score, then name. The default remains rank by score. The Jezero rover scenario opens with this ordering. | A planner shortlisting test sites needs evidence-backed candidates. Example: Lanzarote is #1 by score for Jezero (95, 4/7 criteria) but #7 by conservative lower bound (56). |
| **Gap rule:** the gap is the selected, usable criterion that loses the most points, max w·(1 − s), among criteria with s < 0.7. Ties go to the first criterion in feature order. If none qualifies, the gap reads "No gaps on the selected criteria". | Picks the largest real shortfall, and never contradicts the "why" list (which uses s ≥ 0.7). |
| **Clipped wording:** for target values beyond Earth's range (`targets.json.clipped`), "why" says "near Earth's extreme (target is beyond Earth's range)" and gap sentences carry the same note. | A clipped criterion measures closeness to Earth's extreme, not to the target value. It must not be worded "close to target". |
| **Evidence coverage** label by **weight share** (`evidenceCoverage`): Low if fewer than 3 criteria or < 50 % of selected weight has data; Medium if < 80 %; otherwise High. | Weight share reflects what the score actually rests on better than a count of criteria. |
| Targets: only Jezero (landing site) and the Lunar South Pole (point C1); unverified targets removed. | One verified target per body rather than six unverified ones. |
| Target values beyond Earth's range are **clipped and flagged** and shown as "Beyond Earth range". | The Moon and Mars are colder and have larger swings than anywhere on Earth. |
| Jezero geology = landing-site basalt, fixed before results were seen. The delta (clay) alternative is **reported, not adopted** (`validation.md` §4). | Changing the target after seeing which sites win would be post-hoc fitting. |
| Novelty: "catalogued" = has a peer-reviewed analog study or is on the project reference list. "Uncatalogued candidate" = more than 300 km from all of them **and** no study found. | Only White Desert (1917 km) and Wadi Rum (1779 km) are uncatalogued. Neither is presented as a validated analog. |
| Real and mock bundles live in different Vite public dirs. `manifest.json` records the kind and a SHA-256 per file. The app refuses to start on a kind mismatch, a hash mismatch, or any MOCK value in a real build. | A deployed build cannot silently show or mix synthetic values. |

## 3. Verification done

- `pytest pipeline/tests` (**75 tests**, all passing on 2026-11-14). Covers: the scoring parity fixture and hand-calculated cases (minimum criteria, half-up rounding, tie-breaks, why/gap rules); POWER parsing (units, fill value −999 → null, mm/day → mm/yr); terrain helpers (window size at any latitude, block means, scale-invariant common-posting relief, voids, sea-surface flag, DEM choice, tile mosaics); NDVI (scale, fill, reliability masks, composite and aggregate rules, Terra-only selection); planetary terrain (polar stereographic against PROJ, the C1 window, LOLA scaling, PDS labels); and full validation of both bundles.
- `npm test` (**53 tests** in 4 files, all passing). Covers: JS parity with the same fixture and hand cases, URL state, bundle integrity, the explain helpers (coverage, ranges, points lost, guaranteed-minimum ordering, citation links) and scenarios.
- `validate_bundle.py real` and `validate_bundle.py mock`: OK.
- `validate_analogs.py`: negative controls, robustness, geology choice, clipped share and documented use (see [validation_report.md](validation_report.md)). It reproduces `docs/validation.md` exactly.
- Manual spot-check (Phase 3): a fresh POWER request for Wadi Rum and Haughton matches the bundle exactly.

## 4. Limitations and open issues

1. **POWER is reanalysis at ~50 km**, not a point measurement. Three of eleven sites are excluded on representativeness grounds, and others (e.g. MDRS, Wadi Rum) still average mixed terrain.
2. **Missing data drives the largest rank changes.** Lanzarote, Death Valley and Dallol are scored on 4/7 criteria for both targets, and McMurdo on 5/7 (Jezero) and 4/7 (Moon). Check the scoreRange or use the guaranteed-minimum ranking.
3. **Targets are partly beyond Earth's range.** Jezero's swing and the lunar temperature are clipped. The clipped temperature is 26 % of McMurdo's Moon score.
4. **Jezero surface temperature** is the midpoint of a published range (no annual mean is published). Its normalized value could lie anywhere from 0 to 0.20. Across this range, rankings change little (τ 0.89–0.93).
5. **Lunar ice** is a region-level property (ice in nearby cold traps; the cited LCROSS measurement is in Cabeus, about 100 km away), not a property of the ridge surface. The lunar daily swing is unavailable.
6. **Terrain** is a 10 km-scale relief, not rover-scale slope or roughness. The products are DSMs on Earth and DTM/altimetry on Mars and the Moon. The Lanzarote window is coastal. See [terrain_integration.md](terrain_integration.md) §5.
7. **NDVI** is missing for McMurdo (no MOD13Q1 composites for the window). For Haughton (10 usable composites) and Holuhraun (17) it is likely biased toward the snow-free season (inferred from the snow/ice and fill shares in `ndvi.csv`).
8. **Coordinates:** Río Tinto comes from a low-authority source and must be verified. Several sites are area reference points. The White Desert window median elevation (27 m) needs checking against the expected terrain.
9. **Geology** is one dominant class per site; mixed sites are left empty. There is no `carbonate` class, and the Jezero result is sensitive to the target class (`validation.md` §4).
10. **Weights are user choices.** Rankings change with weights. Known analogs are validation references, not required outcomes, and no bound or weight was tuned to move them.
11. **Correlated criteria.** Aridity, bare ground and temperature co-vary on Earth, so "desert-ness" is effectively weighted more than once. This also makes the negative-control separation easier to achieve ([validation_report.md](validation_report.md) §3).
12. **Bound sensitivity untested.** Every numeric similarity scales with its fixed bound (e.g. Δrelief / 1500 m); no test varied the bounds.
13. **Not encoded:** dust and wind, illumination, subsurface and caves, biology, access, permitting and safety.
14. No Earth site reproduces lunar or Martian gravity, vacuum or radiation.
