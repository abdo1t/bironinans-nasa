# Earth Analog Finder

NASA Space Apps Challenge 2026 — *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

Pick a Moon or Mars base site, weight what matters, and get a ranked, explainable list of Earth analog sites you can compare side by side. The build plan and data contract live in [CLAUDE.md](CLAUDE.md).

> **Status:** Phase 0 (scaffold). The app runs on a **mock** data bundle — all numbers are placeholders, not measurements.

## Layout

- `pipeline/` — Python: seed CSVs, NASA data fetchers, scoring, bundle export.
- `web/` — React + Vite static site. Reads only `web/public/data/*.json`.

## Run the app

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in web/dist
```

## Data pipeline

Generate the mock bundle (standard library only, no install needed):

```bash
python pipeline/make_mock.py
```

Full pipeline (Phase 3+), Python 3.11+:

```bash
pip install -r pipeline/requirements.txt
python pipeline/fetch_power.py
python pipeline/fetch_terrain.py      # needs a NASA Earthdata login
python pipeline/build_bundle.py
```

## Data sources

- NASA POWER climatology — https://power.larc.nasa.gov/
- SRTMGL1 v003 — https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003
- EMIT L2B minerals — https://cmr.earthdata.nasa.gov/search/concepts/C2408034484-LPCLOUD.html
- Moon/Mars Trek — https://trek.nasa.gov/

Seed coordinates and geology/ice classes are approximate and marked `approx — verify` / `literature — verify` in the CSVs.

## Limitations

No Earth site reproduces lunar/Martian gravity, vacuum or radiation.

## Team

TODO
