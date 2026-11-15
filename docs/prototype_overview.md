# Earth Analog Finder — prototype overview

*Find the right Earth environment for your planetary research mission — and understand exactly why it matches.*

Earth Analog Finder is a static web app that ranks Earth places by how closely they resemble a chosen Moon or
Mars site **for a chosen research objective**. Every ranking can be traced back to measured or cited values,
their sources, and what is still missing. Independent NASA Space Apps Challenge 2026 project; not affiliated
with or endorsed by NASA.

Screenshots: [`docs/screenshots/prototype/`](screenshots/prototype/) (main screens),
[`docs/screenshots/redesign-3d/`](screenshots/redesign-3d/) (3D views and motion clips).
The 30-second submission script stays in [`demo_script.md`](demo_script.md).

---

## 1. Scientific workflow

1. **Choose a target.** One Moon site (Lunar South Pole, Shackleton–de Gerlache ridge) or one Mars site
   (Jezero Crater). Each target value carries a citation or dataset (`targets.json` → `provenance`).
2. **Choose a research objective.** Rover testing, Habitat & construction, Ice exploration, or General research
   (balanced). An objective is a set of default criterion weights, nothing more.
3. **Set research priorities.** Seven criteria, each weighted 0–5: terrain relief, aridity, surface temperature,
   daily temperature swing, bare ground, geology match, ground ice. The live ranking beside the sliders shows how
   each change moves places compared with the objective's defaults. Weights are the team's priorities, **not**
   validated mission requirements.
4. **Score.** Per criterion, similarity = 1 − |site − target| on values normalised with fixed Earth bounds
   (categories: 1 same / 0.5 related / 0 different). Score = weighted mean over criteria with data on both
   sides. Missing data is excluded, never counted as 0. A place needs ≥ 3 usable criteria. Each score carries a
   range (missing criteria as total mismatch … perfect match). The same code runs in Python (pipeline) and
   JavaScript (browser), checked by a shared parity fixture.
5. **Review results.** Map plus ranked cards: score, strongest evidence-backed match, missing-data indicator,
   "Why this match?" and the Planetary Mirror (terrain images, or 3D meshes built from the real elevation grids).
6. **Compare** up to three places: one-sentence summary, aligned metrics, radar, criterion table.
7. **Report.** A printable research report (Print / Save as PDF) plus CSV and JSON exports, all generated in the
   browser from the same state, with a link that reproduces the search.

## 2. Completed features

| Area | What works |
|---|---|
| Mission overview | Cinematic hero with an interactive 3D globe (NASA mosaics, drag/swipe/keys, cited site marker); "Start a new mission" console; *What makes an Earth analog useful?* explanation; 4-step *how discovery works*; two example scenarios |
| Mission configuration | World → site → objective in one control (Home and the top bar); URL state for every choice |
| Research priorities | 0–5 sliders per criterion, reset to objective, live top-5 ranking with ▲/▼ moves vs the objective's defaults; also in Explore → Advanced options |
| Results | Leaflet map (Esri World Imagery) synced with ranked cards: rank, score, one evidence-backed reason, missing-data chip, Why this match?, + Compare; Map/List switch on phones; basemap loading / partial / failed states with Retry |
| Evidence | Site details: score card, what matches, what's different, what still needs measuring, per-criterion contribution bars, full measurement table with units, evidence type (measured / reanalysis / literature / …) and source per value |
| Planetary Mirror | Target and Earth terrain side by side at one ground scale; select a criterion → its real value on both sides; optional 3D terrain from the actual elevation grids (synced camera, stated vertical exaggeration, 10 km window outlined, Reset view) |
| Compare | 2–3 places: one-sentence verdict, aligned cards, detailed verdict, where they differ most, radar, side-by-side table; order by score or conservative lower bound |
| Report | Mission configuration, priorities with score shares, full ranking, parameter comparison (values, evidence types, similarity), method, sources behind the shown values, limitations; Print/PDF, CSV, JSON |
| Quality | 91 front-end tests + 107 pipeline tests; Python/JS scoring parity; bundle integrity check (hashes, no MOCK values in the real bundle); responsive 375–1440 px; reduced motion respected; no runtime calls except basemap tiles and the app's own static files |

## 3. Incomplete, limited or simulated

- **Targets:** the real bundle has 2 targets (one Moon, one Mars) with verified, cited values. The other sites in
  the original plan (Mare Tranquillitatis, Marius Hills, Gale, Arcadia) are not in the real bundle because their
  values were not verified.
- **Earth places:** 11 scored candidates (the original plan said ~40).
- **Objectives:** four are implemented (Rover testing, Habitat & construction, Ice exploration, General
  research). *Geological field research* and *Environmental simulation* are **not** separate objectives yet;
  General research is the closest.
- **Geology** comes from peer-reviewed literature per site; NASA EMIT mineral maps are not used yet.
- **Ground ice** is a literature yes/no flag.
- **Climate** values are NASA POWER reanalysis for a ~50 km grid cell. Small islands and coastal places can be
  shown but not scored for climate, with the reason stated (e.g. Lanzarote's cell is mostly ocean).
- **Mock mode** (`npm run dev:mock`) uses synthetic values, labelled MOCK everywhere. It is a development aid and
  is not part of the real build.
- **No live processing:** all NASA data is fetched and scored offline by the pipeline. The browser re-scores
  instantly when weights change; there are no simulated loading or "analysis" steps.
- **Not modelled:** gravity, vacuum, radiation, rover-scale slopes, rock abundance or soil strength. Field
  reconnaissance is still required.

## 4. Data sources and how they are used

| Data | Used for | Where |
|---|---|---|
| NASADEM v001 (NASA JPL); Copernicus DEM GLO-30 outside NASADEM coverage | Earth terrain relief (P99−P1 in a 10 km window, ~200 m posting); Mirror images and 3D meshes | `fetch_terrain.py`, `make_site_preview.py`, `make_terrain_mesh.py` |
| USGS Mars 2020 CTX DTM (Fergason et al. 2020) | Jezero terrain relief, image and 3D mesh | `fetch_planetary_terrain.py`, `make_target_preview.py`, `make_terrain_mesh.py` |
| LRO LOLA LDEM | Lunar south pole terrain relief, image and 3D mesh | same |
| NASA POWER (MERRA-2 climatology): PRECTOTCORR, TS, TS_RANGE | Earth aridity, surface temperature, daily swing | `fetch_power.py` |
| MODIS MOD13Q1 v061 NDVI (NASA LP DAAC) | Earth bare ground | `fetch_ndvi.py` |
| Mission and literature values (e.g. Mars 2020 MEDA) | Target temperatures and other target values, cited per value | `pipeline/seed/` |
| Peer-reviewed literature | Geology classes, ground-ice flags, catalogued-analog references | seed CSVs, cited per site |
| NASA LRO WAC colour mosaic (SVS CGI Moon Kit); Viking MDIM 2.1 colour mosaic (NASA Ames / USGS) | Home globe imagery only, not used in scoring | `web/public/textures/` |
| Esri World Imagery | Basemap tiles only | Explore map |

Full method: [`methodology.md`](methodology.md). Per-criterion readiness: [`data_readiness.md`](data_readiness.md).

## 5. Running it

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:5173. The real data bundle is already in `web/public/data`.

Tests and build:

```bash
cd web && npm test && npm run build
```

```bash
pipeline/.venv/Scripts/python -m pytest pipeline/tests
```

To rebuild the data, run from `pipeline/` with its venv: `fetch_*.py` → `build_bundle.py` →
`validate_bundle.py real`. The Mirror assets come from `make_target_preview.py`, `make_site_preview.py` and
`make_terrain_mesh.py`. See the README for details.

## 6. Live demo (2–3 minutes)

Scenario: *a planetary research team needs Earth places to rehearse rover driving for Jezero Crater.*

1. **Problem (15 s).** Home. "No place on Earth is a copy of Mars. The right analog depends on what you want to
   test." Point at *What makes an Earth analog useful?*
2. **Target (10 s).** In *Start a new mission*, choose **Mars**: the globe crossfades and turns to the Jezero
   marker (18.44° N, 77.45° E, cited). Site: **Jezero Crater**.
3. **Objective (10 s).** Mission: **Rover testing**. The hint says it weighs terrain relief and bare ground most.
4. **Priorities (20 s).** *Adjust criteria*: drag **Terrain relief** to 0 → McMurdo jumps ▲7 in the live
   ranking. "Weights are our priorities, not validated requirements." Click *Reset to Rover testing*.
5. **Results (20 s).** *Find places on Earth*. Map plus ranked cards: Lanzarote 94 (could be 66–96), Holuhraun
   83, Atacama 71. Open Lanzarote's "3 missing" chip: missing data is left out, not counted as zero.
6. **Map selection (15 s).** Click Holuhraun's card: its marker highlights and the map pans to Iceland.
7. **Why it matches (25 s).** *Why this match?* → Site details: strongest match (terrain relief 164 m vs 231 m,
   measured, NASADEM), the important difference (wetter than the target), what still needs measuring.
8. **Planetary Mirror (20 s).** Mirror → choose *Terrain relief*: 231 m vs 370 m lights up on both images →
   *3D terrain*, rotate both surfaces together, vertical exaggeration stated.
9. **Compare (20 s).** Add Lanzarote, Holuhraun and Atacama → Compare. One sentence: Lanzarote scores highest but
   on 3 of 6 measurements; Holuhraun rests on complete evidence.
10. **Evidence (10 s).** Site details → *View evidence*: each value with units, evidence type and dataset.
11. **Report (15 s).** *Generate report*: mission configuration, priorities, ranking, parameter comparison,
    method, sources, limitations → *Print / Save as PDF*, CSV, JSON.

Closing line: "Not just a map of NASA data — a decision aid that shows which Earth place fits which research
objective, and why."

## 7. Screens

| # | Screen | File |
|---|---|---|
| 1 | Overview + Start a new mission | `screenshots/prototype/01-overview-start-mission.jpg` |
| 2 | What makes an analog useful · how discovery works | `screenshots/prototype/02-overview-what-is-an-analog.jpg` |
| 3 | Research priorities with live ranking | `screenshots/prototype/03-research-priorities-live-ranking.jpg` |
| 4 | Explore: map + ranked results | `screenshots/prototype/04-explore-map-results.jpg` |
| 5 | Site details: score, matches, differences, missing | `screenshots/prototype/05-site-evidence.jpg` |
| 6 | Planetary Mirror, 3D terrain | `screenshots/prototype/06-mirror-3d-terrain.jpg` |
| 7 | Compare three places | `screenshots/prototype/07-compare.jpg` |
| 8 | Research report | `screenshots/prototype/08-report.jpg` |
| 9 | Report: parameter comparison | `screenshots/prototype/09-report-parameter-comparison.jpg` |
| 10 | Report on a phone (375 px) | `screenshots/prototype/10-report-375.jpg` |
