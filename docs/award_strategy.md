# Award Strategy and Judging Review

Internal planning document. The award names and judging criteria come from the 2026 Space Apps Judging & Awards Guide and Project Submission Guide, as summarised in the team's notes of 2026-11-13 (not a repo file); re-check them on the official spaceappschallenge.org resources pages before submission. Everything below describes **targets and evidence**. Nothing here claims an award, NASA endorsement, a discovery, certification or mission readiness.

## (a) Award-Oriented Product Value Summary

| Global Award (strategic target) | Official focus (paraphrased) | What the project offers | Evidence |
|---|---|---|---|
| **Best Use of Data** | Makes space data accessible, or uses it in a distinctive application | NASA Earth data (POWER/MERRA-2, NASADEM, MODIS MOD13Q1) and NASA planetary data (USGS Mars 2020 CTX DTM, LRO LOLA, plus MEDA and Diviner results) are put on **one comparable scale**: the same 10 km window and ~200 m relief metric on all three bodies. Every value carries provenance, and every missing value is shown as missing. | `docs/terrain_integration.md`, `docs/data_readiness.md`, `sites.geojson`/`targets.json` `provenance`, About page |
| **Best Use of Science** | Best and most valid use of the scientific method | Hypothesis-style checks were run and reported unchanged: negative controls, leave-one-out, weight perturbation, target-value ranges, a geology choice reported but not adopted, and the share of each score from clipped values. No bound or weight has changed since the Phase 3 commit that added the real data; the terrain, NDVI and precipitation bounds date from the Phase 0 scaffold without a recorded Earth-wide justification. Disagreements with documented use are explained, not hidden. | `docs/validation.md` (generated), `docs/validation_report.md`, `pipeline/validate_analogs.py` |
| **Best Mission Concept** | The most plausible concept and design | A screening tool for test-site shortlisting. The "Mars rover mobility testing — Jezero" scenario ranks by guaranteed minimum and states its limitation: it does not assess rover-scale slopes, rocks or soil strength. | `web/src/lib/scenarios.js`, Explore page "Mission brief" |

## (b) NASA Judging Criteria Review Matrix

| Criterion | Existing strengths | Evidence available | Remaining weaknesses | Highest-value feasible improvement | Status |
|---|---|---|---|---|---|
| **Impact** | Gives planners a transparent, reproducible way to compare Earth test sites for a named Moon or Mars site. Weights reflect the mission purpose (4 presets with written rationale). | Presets in `web/src/lib/presets.js`; mission scenarios; Compare page | Only 2 targets and 11 sites. No access, permitting, safety or cost information. No user testing with planners. | Add one sentence per site on its documented test use (already in `analog_evidence.csv`) to Site details. | Partial |
| **Creativity** | Cross-body common-scale terrain metric; a score range for missing data; a "guaranteed minimum" ranking; explicit "near Earth's extreme" wording for clipped values; uncatalogued-candidate flag. | `pipeline/terrain_common.py`, `scoring.py` (`scoreRange`), `explain.js` (`orderRanking`) | Criteria do not cover dust and wind, illumination, subsurface or biology, all of which the challenge page lists. Only 2 uncatalogued candidates. | Write a short "where the analogy breaks down" text per top site, taken from the existing gap and points-lost data. | Partial |
| **Validity** | 75 pytest and 53 Vitest tests passing, including the shared Python/JS parity fixture. Bundle validation with hashes. Provenance for every value. Negative-control separation of 1.0 (numeric criteria only; 6 scorable analogs against 4 controls). Robustness tables. Bounds and weights not tuned to the rankings. | `pipeline/tests`, `web/src/lib/*.test.js`, `validate_bundle.py`, `docs/validation.md` | ~50 km POWER cells. Missing data drives the top Jezero rank by score (Lanzarote). The controls are easy contrasts. One geology class per site. Several coordinates are approximate. | Present "Rank by: Guaranteed minimum" as the default for the demo scenario (already done for Jezero rover) and explain the score range in the demo. | Mostly complete |
| **Relevance** | NASA data is the core of the scores: POWER (3 criteria, 8/11 sites scored), NASADEM (8/11 sites), MODIS NDVI (10/11), CTX DTM and LOLA (target relief), MEDA, Diviner and LCROSS (target values), and ASTER GDEM via OpenTopoData (site elevations for the POWER representativeness rule). | `features.json` `source`, `targets.json` `refs`, About page data sources | Copernicus (ESA) fills 3 sites. Geology and ice are literature classes, not EMIT or CRISM. Moon/Mars Trek is a link only. | List the NASA datasets explicitly in the submission's "NASA Data" field (dataset name, DOI, use). | Ready to document |
| **Presentation** | Live re-ranking on slider change. Map and list views. Radar compare. Every number traceable. | `docs/demo_script.md`; app | Submission limit: a video of **≤ 30 s** or **≤ 7 slides**. The 90 s demo in CLAUDE.md §11 is live-only. The production bundle is 762.82 kB of JS (Vite warning). | Record the 30 s video from the scenario flow and prepare the 7-slide deck (outlines in `docs/demo_script.md`). | Not started |

## (c) Three strongest differentiators

1. **One terrain metric across Earth, Mars and the Moon.** P99 − P1 in a 10 km window at a common ~200 m posting, averaged over block offsets. It is applied to NASADEM, Copernicus, CTX DTM and LOLA, and product cross-checks give ranges (Jezero 229.1–252.0 m; Moon 1093.4–1125.0 m).
2. **Missing data is never hidden.** Every score has a `scoreRange`, and the app can rank by the guaranteed minimum. Lanzarote, for example, is 95 by score for Jezero but has a guaranteed minimum of 56 (#7), because 3 of its 7 criteria are excluded. Holuhraun (76, range 71–77) ranks #1 by guaranteed minimum (71), with the caveat that its coordinate is a general location, not a point on the 2014–15 flow. The same missing-data caveat applies to McMurdo for the Moon (86, range 54–92, 4/7 criteria).
3. **Validation reported without tuning.** Four negative controls run through the same NASA-data pipeline separate from the known analogs in 8/8 target × preset cases (numeric criteria only, 6 scorable analogs; the controls are easy contrasts). The geology alternative is reported, not adopted, and disagreements with documented analog use are listed with causes.

## (d) Concise technical explanation

The project has two parts: a Python pipeline that runs once, and a static React site that reads only the bundle the pipeline produces.

**Pipeline** (`pipeline/`):
- `fetch_power.py` calls the NASA POWER climatology point API (no login) for `PRECTOTCORR`, `TS` and `TS_RANGE`, and caches each response with its request URL.
- `fetch_terrain.py` reads NASADEM COGs from Microsoft Planetary Computer, using an anonymous SAS token, as windowed HTTP reads. It falls back to Copernicus GLO-30 on AWS only where NASADEM has no coverage.
- `fetch_planetary_terrain.py` reads the USGS CTX DTM and LOLA polar DEMs, using HTTP byte ranges for the 5 m product.
- `fetch_ndvi.py` reads MODIS MOD13Q1 COGs, selecting pixels by centre coordinates in the sinusoidal grid.
- `build_bundle.py` normalizes raw values with **fixed** Earth bounds, applies the POWER representativeness rule, computes novelty distances and default scores, and writes `features.json`, `targets.json`, `sites.geojson`, `scores.json` and a `manifest.json` with SHA-256 hashes.
- `validate_bundle.py` rejects NaN values, unsourced values, MOCK text and score drift.
- `validate_analogs.py` writes `docs/validation.md`.

**Web app** (`web/`, React 18 + Vite, Leaflet, Recharts):
- `useBundle.js` loads the four files once and verifies the manifest kind and hashes.
- `scoring.js` is an exact port of `scoring.py`, checked by a shared fixture. Weight changes re-score in the browser with no network call.
- State (target, weights, shortlist, rank mode, view) is synced to the URL.
- In dev mode, the default ranking is recomputed and compared with `scores.json`.
- There is no backend, database or login, and no runtime calls to NASA APIs or LLMs. Only basemap tiles are fetched at runtime.

## (d) Scientific methodology summary

The model asks: *how similar is an Earth site to a named Moon or Mars site, on criteria a mission planner selects?*

**Criteria.** Seven criteria are used:
- Terrain relief (10 km window, ~200 m posting).
- Aridity (annual precipitation, inverted).
- Annual-mean surface skin temperature.
- Mean daily surface-temperature swing.
- Bare ground (inverted NDVI).
- Dominant geology class.
- Ground-ice state.

The temperatures are skin rather than air temperatures, because the targets have no comparable atmosphere and their reference values (MEDA, Diviner) are surface temperatures.

**Normalization.** Numeric values are mapped to [0, 1] with fixed Earth-wide bounds. Target values beyond Earth's range are clipped and flagged. A clipped criterion then measures closeness to Earth's extreme, and the UI says so.

**Similarity and score.**
- Numeric similarity is `1 − |site − target|`.
- Categorical similarity is 1 for a match, 0.5 for a related class and 0 otherwise.
- The score is the weighted mean over criteria with data on both sides; at least 3 usable criteria are required.
- The site-side missing criteria define the score range.

**Explanations.**
- "Why" lists the top contributors with similarity ≥ 0.7.
- "Gap" is the criterion that loses the most points among those below 0.7.

**Validation.**
- Negative controls (humid, vegetated sites, same data).
- Leave-one-criterion-out and random weight perturbation (Kendall τ, rank intervals).
- Target-value ranges.
- The sensitivity to Jezero's geology class (reported, not adopted).
- The share of each score from clipped values.
- A comparison with documented analog use from cited studies.

No bound or weight has changed since the Phase 3 commit that added the real data (the temperature and swing bounds were set in that same commit, so git alone cannot show they preceded the results). Results that disagree with documented use (Lanzarote's Jezero rank by score; Haughton and MDRS under a basalt target) are attributed to missing data, grid-cell scale or single-class geology.

## (e) Limitations statement

Earth Analog Finder is a research prototype for **screening**. It is not a site-selection, certification or mission-readiness tool.

- It covers 2 targets and 11 Earth sites.
- Climate values are ~50 km reanalysis grid cells, not point measurements. Three sites have their climate values excluded for that reason.
- Terrain is 10 km-scale relief from surface models, not rover-scale slope, rock abundance or soil strength.
- Geology and ground ice are single literature classes per site.
- Some target values are clipped (beyond Earth's range), approximate (the Jezero temperature midpoint) or region-level (lunar ice). The lunar daily swing is unavailable.
- Rankings depend on user-selected weights and, for sites with missing data, on what the missing values would be. The score range and guaranteed-minimum ranking show this.
- The model does not encode dust, wind, illumination, subsurface, biology, access, permitting or safety.
- No Earth site reproduces lunar or Martian gravity, vacuum or radiation.
- AI assistance was used to develop code and documentation (see the About page). Scientific values come from the cited datasets and publications.
