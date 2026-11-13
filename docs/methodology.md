# Methodology and limitations (real-data bundle, Phase 3)

Companion to [data_readiness.md](data_readiness.md). The scoring formula itself is specified in [CLAUDE.md §5](../CLAUDE.md).

## 1. Pipeline

```
seed/sites_real.csv  ─┐                       ┌─ web/public/data/   (kind "real")
seed/targets_real.json┤                       │    features.json, targets.json,
fetch_power.py ──► data/power.csv  ─► build_bundle.py ─┤    sites.geojson, scores.json,
fetch_terrain.py ─► data/terrain.csv          │    manifest.json (SHA-256 per file)
                                              └─ validate_bundle.py (fails the build on any problem)
make_mock.py ──────────────────────────────────► web/public-mock/data/ (kind "mock", separate)
```

Run: `python pipeline/fetch_power.py`, `python pipeline/fetch_terrain.py`, `python pipeline/build_bundle.py` (Python 3.12 venv with `pipeline/requirements.txt`). Raw POWER responses are cached with their exact request in `pipeline/data/power/<site>.json`; reruns never refetch unless coordinates change or `--refresh` is given.

## 2. Decisions made in Phase 3 (and why)

| Decision | Reason |
|---|---|
| Temperature criteria use **surface (skin) temperature** (POWER `TS`, `TS_RANGE`) instead of 2 m air (`T2M`). | The Moon has no air. Diviner and MEDA report surface/ground temperatures, so skin temperature is the like-for-like Earth quantity. `T2M` is still fetched for reference. |
| Daily swing uses `TS_RANGE`, never `T2M_MAX − T2M_MIN`. | In the annual climatology, `_MAX`/`_MIN` are period extremes (Atacama: 32.9 / −0.6 °C), so their difference is an annual range, not a day–night swing. |
| Bounds: temperature −60…+35 °C, swing 0…35 °C, precipitation 0…2000 mm/yr. | Chosen from Earth-wide values in the same dataset (POWER `TS` annual mean: Dome A −58.9 °C, Vostok −55.7 °C; hottest checked deserts +26.8…+27.6 °C; largest `TS_RANGE` checked 28.6 °C at Atacama), **not** from our candidate sites and not to change rankings. |
| Precipitation converted mm/day × 365.25. | POWER returns `PRECTOTCORR` in mm/day (unit checked on every response). |
| **Grid-cell representativeness rule:** if \|site elevation − cell elevation\| > 500 m, or the site is an island smaller than the cell, POWER values are shown but not scored. | A 50 km cell averages very different terrain. Excluded: Death Valley (Δ 932 m), Dallol (Δ 1162 m; the cell reports 449 mm/yr of rain for a hyper-arid salt plain), Lanzarote (ocean-dominated cell, swing 4.5 °C). |
| **Minimum 3 usable criteria for a score** (`scores.json.minCriteria`, implemented identically in Python and JS). | Before this rule Lanzarote scored 100/100 for Jezero from two categorical matches alone. Sites below the minimum show "Insufficient data", with their per-criterion similarities still visible. |
| **Confidence** label: Low if < 3 criteria or < 50 % of selected criteria had data; Medium if < 80 %; else High. | Every scored site in this bundle is Medium or Low, because terrain and NDVI are pending — the UI says so. |
| Targets: only Jezero and the Lunar South Pole; unverified targets removed. | Brief: one verified target per body rather than six unverified ones. |
| Target values beyond Earth's range are **clipped and flagged** (`targets.json.clipped`), shown as "Beyond Earth range". | Moon/Mars are colder and have larger swings than anywhere on Earth. A clipped criterion answers "how close does Earth get?" and is labelled as such rather than hidden. |
| Novelty: "catalogued" = has a peer-reviewed analog study or is on the project reference list; "uncatalogued candidate" = > 300 km from all of them **and** no study found. | Several original "new candidates" (Dallol, Uyuni, Lut, …) are in fact published analogs. Only White Desert and Wadi Rum remain uncatalogued; neither is presented as a validated analog. |
| Real and mock bundles live in different Vite public dirs; `manifest.json` records kind + SHA-256 per file; the app refuses to start on a kind mismatch, a hash mismatch, or any MOCK value in a real build. | Makes it impossible for a deployed build to silently show or mix synthetic values. |

## 3. Verification done

* `pytest pipeline/tests` (37 tests): scoring parity fixture, 8 hand-calculated cases and 2 ranking cases (including the minimum-criteria rule), POWER parsing (units, fill value −999 → null, mm/day → mm/yr), terrain helpers (coverage choice, 10 km window at any latitude, robust relief with spikes/voids), and full validation of both bundles (no NaN/∞, valid coordinates, provenance for every non-null value, no "MOCK" in the real bundle, scores equal a fresh recomputation).
* `npm test` (32 tests): JS parity with the same fixture and hand cases, URL state, bundle-integrity rules.
* Manual spot-check: a fresh POWER request for Wadi Rum and Haughton matches the bundle exactly (raw and normalized values).

## 4. Limitations and open issues

1. **Terrain and vegetation are not acquired** — two of seven criteria are missing for every site, and terrain is missing for both targets. Scores therefore rest on aridity, surface temperature, swing, geology and ice.
2. **POWER is reanalysis at ~50 km**, not point measurement. Three of eleven sites are excluded on representativeness grounds; others (e.g. MDRS, Wadi Rum) still average mixed terrain.
3. **Targets are partly beyond Earth's range.** Jezero's swing and the lunar temperature are clipped; the corresponding similarity measures closeness to Earth's extreme, not to the target value.
4. **Jezero surface temperature** is the midpoint of a published range (no annual mean is published); its normalized value could lie anywhere from 0 to 0.20.
5. **Lunar ice** is a region-level property (cold traps tens of km from the ridge), not a property of the ridge surface.
6. **Coordinates**: Río Tinto comes from a low-authority source and must be verified; several sites are area reference points. White Desert elevation is unverified (DEM lookup gave an implausible 13 m), so its representativeness check could not run.
7. **Geology** is a single dominant class per site; mixed sites are left empty rather than forced.
8. **Weights are user choices.** Rankings change with weights; known analogs are validation references, not required outcomes, and no parameter was tuned to move them.
9. No Earth site reproduces lunar/Martian gravity, vacuum or radiation.

## 5. To finish before relying on terrain (needs a human)

1. Create a NASA Earthdata account (https://urs.earthdata.nasa.gov) and run once:
   `pipeline/.venv/Scripts/python -c "import earthaccess; earthaccess.login(persist=True)"`
2. `python pipeline/fetch_terrain.py && python pipeline/build_bundle.py`
3. Compute target relief from MOLA (Jezero) and LOLA (south pole) with the same 10 × 10 km P99 − P1 method before terrain is scored for targets.
