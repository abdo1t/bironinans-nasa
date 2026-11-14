# Earth Analog Finder

NASA Space Apps Challenge 2026 — *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

Pick a Moon or Mars base site, weight what matters, and get a ranked, explainable list of Earth analog sites you can compare side by side. The build plan and data contract live in [CLAUDE.md](CLAUDE.md). Where it differs from the current state (6 targets / ~40 sites, a 90 s demo, tuning bounds), the docs below are authoritative.

> **Status:** Phase 4 (bundle `2026-11-14T05:20:03+00:00`). The default build runs on **real, cited data**: 11 Earth sites and 2 targets (Jezero / Perseverance landing site; Lunar South Pole connecting ridge, point C1).
> - NASA POWER climatology for 8/11 sites; the other 3 are shown but not scored because the grid cell does not represent the site.
> - Terrain relief for all sites and both targets: NASADEM v001, Copernicus GLO-30 for 3 high-latitude sites, the USGS Mars 2020 CTX DTM and LRO LOLA.
> - MODIS MOD13Q1 NDVI for 10/11 sites.
>
> Every score shows a range for missing data, and the app can rank by guaranteed minimum. The validation (negative controls, robustness, documented analog use) is reported as-is; no bound or weight was tuned to the rankings. This is a research screening prototype, not a site-certification tool.
>
> **Use of AI (Super Intelligence, SI):** code and documentation were developed with assistance from an AI coding assistant (Claude) and reviewed by the team. Scientific values come from the cited datasets and publications.
>
> Docs:
> - [Methodology](docs/methodology.md)
> - [Data readiness](docs/data_readiness.md)
> - [Terrain integration](docs/terrain_integration.md)
> - [Validation results (generated)](docs/validation.md)
> - [Validation report](docs/validation_report.md)
> - [Demo scripts](docs/demo_script.md)
> - [Judge Q&A](docs/judge_qa.md)
> - [Release readiness](docs/release_readiness.md)

## Layout

- `pipeline/` — Python: curated seeds, NASA data fetchers, scoring, bundle build + validation.
- `web/` — React + Vite static site. Reads only its own bundle: `web/public/data/` (real) or `web/public-mock/data/` (mock).
- `docs/` — methodology, limitations, data readiness, terrain integration, validation, demo and submission notes (links above).

## Run the app

```bash
cd web
npm install
npm run dev          # real data   -> http://localhost:5173
npm run dev:mock     # mock demo (synthetic values, MOCK banner)
npm run build        # real build  -> web/dist
npm run build:mock   # mock build  -> web/dist-mock
```

A build only ever contains one bundle. The app checks `manifest.json` (bundle kind + SHA-256 per file) at start-up and refuses to run if the bundle does not match the build mode, a file was altered, or a real build contains any synthetic value.

## Data pipeline (Python 3.12)

```bash
py -3.12 -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt

cd pipeline                         # run every script from pipeline/ with the venv's python
python fetch_power.py               # NASA POWER climatology -> data/power.csv (raw responses cached in data/power/) [--refresh]
python fetch_terrain.py             # Earth relief: NASADEM v001 via Microsoft Planetary Computer,
                                    #   Copernicus GLO-30 (AWS) only outside NASADEM coverage -> data/terrain.csv [--force]
python fetch_planetary_terrain.py   # Jezero: USGS Mars 2020 CTX DTM; Moon: LRO LOLA LDEM_875S -> data/planetary_terrain.csv
                                    #   [--skip-megdr] [--skip-5m] (large downloads cached in data/downloads/, gitignored)
python fetch_ndvi.py                # MODIS MOD13Q1 v061 NDVI via Planetary Computer -> data/ndvi.csv [--force] [--only id1,id2]
python build_bundle.py              # normalize, score, write web/public/data (+ manifest.json), then validate
python validate_bundle.py real      # re-check the real bundle (or: mock)
python validate_analogs.py          # negative controls, robustness, documented use -> docs/validation.md [--refresh-controls]
python make_mock.py                 # -> web/public-mock/data (synthetic demo, separate)
```

No login is needed: every fetcher uses public, credential-free endpoints and caches its results, so reruns never refetch filled rows unless forced. The LP DAAC SRTMGL1 and ASTGTM tiles were not used for relief because they require a NASA Earthdata login ([terrain integration](docs/terrain_integration.md)).

## Tests

Scoring lives in `pipeline/scoring.py` (source of truth) and `web/src/lib/scoring.js` (exact port). Both run the shared fixture `pipeline/tests/fixture.json`, including hand-calculated cases, and must agree exactly.

```bash
pipeline/.venv/Scripts/python -m pytest pipeline/tests
cd web && npm test
```

In dev mode the app also recomputes the default ranking and `console.warn`s on any mismatch with `scores.json`.

## Data sources

Scored data (NASA unless noted):
- **NASA POWER** climatology API v2.10.1 (`PRECTOTCORR`, `TS`, `TS_RANGE`; MERRA-2, 2001–2025; Gelaro et al. 2017, doi:10.1175/JCLI-D-16-0758.1) — https://power.larc.nasa.gov/ — aridity, surface temperature and daily swing for 8 of 11 sites.
- **NASADEM_HGT v001** (NASA JPL), doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001, read from Microsoft Planetary Computer — terrain relief for 8 sites.
- **Copernicus DEM GLO-30 Public** (ESA, partner data), doi:10.5270/ESA-c5d3d65, AWS Open Data — terrain relief for Haughton, McMurdo and Holuhraun (outside NASADEM coverage) and a cross-check for the NASADEM sites; GLO-90 as a cross-check. Required attribution: "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved".
- **MODIS MOD13Q1 v061** NDVI (Didan 2021), doi:10.5067/MODIS/MOD13Q1.061, read from Microsoft Planetary Computer — bare ground for 10 of 11 sites.
- **USGS Mars 2020 TRN CTX DTM** `JEZ_ctx_B_soc_008`, 20 m (Fergason et al. 2020, LPSC 51 #2020) — Jezero relief.
- **LRO LOLA LDEM_875S** (PDS LRO-L-LOLA-4-GDR-V1.0; Smith et al. 2010, doi:10.1029/2010GL043751) — lunar south pole relief.
- Target values: Perseverance MEDA (Munguira et al. 2023, 2024), LRO Diviner (Williams et al. 2019), LCROSS (Colaprete et al. 2010), M3 (Li et al. 2018) and the other sources cited per value in `pipeline/seed/targets_real.json`.
- Site geology, ground ice and analog literature: per-site citations in `pipeline/seed/sites_real.csv` and `pipeline/seed/analog_evidence.csv` (peer-reviewed where available; some Wikipedia, agency pages and conference abstracts, marked as such).

Cross-checks and supporting data (not scored):
- HRSC–MOLA Blended DEM v2, 200 m (Fergason, Hare & Laura 2018, USGS; HRSC is ESA/DLR Mars Express) and MOLA MEGDR (Smith et al. 2001, doi:10.1029/2000JE001364) — Jezero relief cross-checks.
- LRO LOLA LDEM_875S_5M — lunar relief cross-check.
- ASTER GDEM 30 m (NASA/METI) via the OpenTopoData public API — site elevations for 8 sites, used in the POWER grid-cell representativeness rule.

Other: NASA Moon/Mars Trek (link only) — https://trek.nasa.gov/ · basemap tiles: Esri World Dark Gray Canvas (`server.arcgisonline.com`) · mirrors: Microsoft Planetary Computer, AWS Open Data. Full provenance per value is in the bundle (`sites.geojson`, `targets.json`) and on the About page.

## Limitations

No Earth site reproduces lunar/Martian gravity, vacuum or radiation. Climate values are ~50 km reanalysis cells, not point measurements. Full list: [docs/methodology.md](docs/methodology.md#4-limitations-and-open-issues).

## Team

TODO
