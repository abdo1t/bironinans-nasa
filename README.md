# Earth Analog Finder

NASA Space Apps Challenge 2026 — *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

Pick a Moon or Mars base site, weight what matters, and get a ranked, explainable list of Earth analog sites you can compare side by side. The build plan and data contract live in [CLAUDE.md](CLAUDE.md).

> **Status:** Phase 3 checkpoint. The default build runs on **real, cited data**: 11 Earth sites, 2 targets (Jezero / Perseverance landing site, Lunar South Pole connecting ridge), NASA POWER climatology. Terrain relief and vegetation are not yet acquired and are excluded from scores. See [docs/methodology.md](docs/methodology.md) and [docs/data_readiness.md](docs/data_readiness.md).

## Layout

- `pipeline/` — Python: curated seeds, NASA data fetchers, scoring, bundle build + validation.
- `web/` — React + Vite static site. Reads only its own bundle: `web/public/data/` (real) or `web/public-mock/data/` (mock).
- `docs/` — methodology, limitations, data readiness matrix.

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

python pipeline/fetch_power.py       # NASA POWER climatology (no login); cached in pipeline/data/power/
python pipeline/fetch_terrain.py     # SRTM/ASTER relief; needs a NASA Earthdata login (else null)
python pipeline/build_bundle.py      # -> web/public/data + validation
python pipeline/make_mock.py         # -> web/public-mock/data (synthetic demo)
python pipeline/validate_bundle.py real
```

Earthdata login for terrain (once): `pipeline/.venv/Scripts/python -c "import earthaccess; earthaccess.login(persist=True)"`.

## Tests

Scoring lives in `pipeline/scoring.py` (source of truth) and `web/src/lib/scoring.js` (exact port). Both run the shared fixture `pipeline/tests/fixture.json`, including hand-calculated cases, and must agree exactly.

```bash
pipeline/.venv/Scripts/python -m pytest pipeline/tests
cd web && npm test
```

In dev mode the app also recomputes the default ranking and `console.warn`s on any mismatch with `scores.json`.

## Data sources

- NASA POWER climatology API (MERRA-2, 2001–2025) — https://power.larc.nasa.gov/
- SRTMGL1 v003 — https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003 (pending login)
- ASTER GDEM v3 (ASTGTM 003) — https://www.earthdata.nasa.gov/ (fallback outside SRTM coverage; pending login)
- Perseverance MEDA (Munguira et al. 2023, 2024), LRO Diviner (Williams et al. 2019), LCROSS (Colaprete et al. 2010) and other peer-reviewed sources cited per value in `pipeline/seed/targets_real.json` and `pipeline/seed/sites_real.csv`
- Moon/Mars Trek — https://trek.nasa.gov/

## Limitations

No Earth site reproduces lunar/Martian gravity, vacuum or radiation. Climate values are ~50 km reanalysis cells, not point measurements. Full list: [docs/methodology.md](docs/methodology.md#4-limitations-and-open-issues).

## Team

TODO
