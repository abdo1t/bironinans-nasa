# Earth Analog Finder

A NASA Space Apps Challenge 2026 project for the challenge [*Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/).

Mission teams rehearse Moon and Mars operations at Earth "analog" sites. Earth Analog Finder helps them shortlist those sites. You pick a Moon or Mars site and a research objective (rover testing, habitat & construction, ice exploration or general research). The app then ranks Earth places by how closely their measured terrain relief, aridity, surface temperature, daily temperature swing, bare ground, geology and ground ice resemble that site. Each result shows **what matches, what is different, what is still unmeasured, and the source of every value**. The data comes from open NASA datasets and partner data, processed offline into a static bundle.

It is a **research screening prototype**. A high score means resemblance, not mission suitability, and no result is a validated analog.

**Start here → [Project brief for judges](docs/nasa-space-apps-project.md)**: what it does, the data used, a worked Jezero example, the UI, the demo and the limitations.

## Status

* Real, cited data for **2 targets** (Jezero Crater, Perseverance landing site; Lunar South Pole connecting ridge) and **11 Earth sites**. Bundle contract `eaf-bundle/2`, generated `2026-11-14T06:11:36+00:00` (`web/public/data/manifest.json`).
* Static site: no backend and no runtime data or API calls (basemap tiles only).
* Not yet deployed. No demo video link yet.
* **Use of AI (Super Intelligence, SI):** code and documentation were developed with an AI coding assistant (Claude) and reviewed by the team. Scientific values come from the cited datasets and publications.

## Documentation

| Document | For |
|---|---|
| [Project brief](docs/nasa-space-apps-project.md) | Judges: summary, challenge mapping, NASA data, worked example, UI, demo, limitations |
| [Release readiness (engineering handoff)](docs/release_readiness.md) | Checks run, deployment steps, submission checklist, open issues |
| [Prototype overview](docs/prototype_overview.md) | Workflow, features (done and limited), data sources, 2–3 min demo, screenshots |
| [Methodology](docs/methodology.md) | Pipeline, scoring decisions, limitations |
| [Data readiness](docs/data_readiness.md) · [Terrain integration](docs/terrain_integration.md) | Every criterion's dataset, units, resolution and gaps |
| [Validation report](docs/validation_report.md) · [Validation results (generated)](docs/validation.md) | Rankings, negative controls, robustness |
| [Demo scripts](docs/demo_script.md) · [Judge Q&A](docs/judge_qa.md) | 30 s submission video, 90 s live demo, likely questions |
| [First-visit UX](docs/first_visit_ux.md) · [Mission Control UI](docs/mission_control_ui.md) · [Art & Technology: Planetary Mirror](docs/art_technology.md) · [UX audit](docs/ux_audit.md) | Design records and screenshots |
| [CLAUDE.md](CLAUDE.md) | Original build plan and data contract. Where it differs from the current state (6 targets / ~40 sites, a 90 s demo, bound tuning), the documents above are authoritative. |

## Layout

* `pipeline/`: Python. Curated seeds, NASA data fetchers, scoring (source of truth), bundle build and validation.
* `web/`: React 18 + Vite static site. It reads only its own bundle: `web/public/data/` (real) or `web/public-mock/data/` (mock, development only).
* `docs/`: project brief, methodology, validation, demo and handoff notes.

## Run the app

Requires Node.js (checked with v24).

```bash
cd web
npm install
npm run dev          # real data   -> http://localhost:5173
npm run dev:mock     # mock demo (synthetic values, MOCK banner)
npm run build        # real build  -> web/dist
npm run build:mock   # mock build  -> web/dist-mock
```

A build contains exactly one bundle. At start-up the app checks `manifest.json` (bundle kind and a SHA-256 hash per file). It refuses to run if the bundle does not match the build mode, a file was altered, or a real build contains any synthetic value. Deployment steps (SPA fallback for Netlify/Vercel) are in the [handoff](docs/release_readiness.md#2-deployment-steps-static-host).

## Rebuild the data (Python 3.12, Windows paths shown)

```bash
py -3.12 -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt

cd pipeline                         # run every script from pipeline/ with the venv's python
python fetch_power.py               # NASA POWER climatology -> data/power.csv
python fetch_terrain.py             # NASADEM v001 (Copernicus GLO-30 outside its coverage) -> data/terrain.csv
python fetch_planetary_terrain.py   # Jezero CTX DTM, LRO LOLA -> data/planetary_terrain.csv
python fetch_ndvi.py                # MODIS MOD13Q1 v061 NDVI -> data/ndvi.csv
python build_bundle.py              # normalize, score, write web/public/data (+ manifest.json), validate
python validate_bundle.py real      # re-check the real bundle (or: mock)
python validate_analogs.py          # controls, robustness, documented use -> docs/validation.md
python make_mock.py                 # synthetic bundle -> web/public-mock/data
```

No login is needed. Every fetcher uses public, credential-free endpoints and caches its results, so reruns only refetch when forced (`--force` / `--refresh`). Flags and details: [methodology §1](docs/methodology.md#1-pipeline).

## Tests

```bash
pipeline/.venv/Scripts/python -m pytest pipeline/tests
cd web && npm test
```

Both suites run the shared fixture `pipeline/tests/fixture.json`, so the Python and JavaScript scoring must agree exactly. Last run, 2026-11-15, on commit `98cb3d4`: **pytest 104 passed, Vitest 88 passed**. The full check list (validators, lint, builds, browser checks) is in the [handoff](docs/release_readiness.md).

## Data sources (summary)

NASA POWER (MERRA-2 climatology), NASADEM, MODIS MOD13Q1, the USGS Mars 2020 CTX DTM, LRO LOLA, and published Perseverance MEDA, LRO Diviner, LCROSS and M3 results. Partner data: Copernicus DEM GLO-30 (ESA) for 3 high-latitude sites. Cross-checks: HRSC–MOLA, MOLA MEGDR, LOLA 5 m, Copernicus GLO-90, ASTER GDEM. Per-site geology, ice and analog literature come from `pipeline/seed/`. Full table with links and usage: [project brief §3](docs/nasa-space-apps-project.md#3-how-we-used-nasa-and-other-open-data). Copernicus attribution: "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved".

## Limitations

No Earth site reproduces lunar or Martian gravity, vacuum or radiation. Climate values are ~50 km reanalysis cells, and terrain relief is a 10 km-scale metric, not rover-scale ground. Full list: [methodology §4](docs/methodology.md#4-limitations-and-open-issues).

## Team

TODO: team names (also on the About page).
