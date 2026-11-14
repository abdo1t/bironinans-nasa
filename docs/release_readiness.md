# Final Testing and Deployment Readiness Report

State checked: commit `7b39a3e` plus uncommitted changes to documentation, `pipeline/seed/analog_evidence.csv` (quoting fix), `CLAUDE.md` notes and the SPA fallback files; real bundle `2026-11-14T05:20:03+00:00`, 2026-11-14.

## 1. Automated checks (run on 2026-11-14)

| Command (from repo root unless noted) | What it verifies | Result |
|---|---|---|
| `pipeline/.venv/Scripts/python.exe -m pytest pipeline/tests -q` | Scoring against the shared parity fixture and hand-calculated cases (rounding, ties, minimum criteria, why/gap); POWER parsing and units; terrain helpers (window, block mean, common posting, voids, sea flag, DEM choice, tile mosaic); NDVI masking and aggregation; planetary DEM geometry (polar stereographic vs PROJ, C1 window, LOLA scaling); full validation of the real and mock bundles | **75 passed** |
| `cd web && npm test` | JS scoring parity with the same fixture; hand cases; URL state round-trip; bundle integrity (kind, hash, MOCK rejection); explain helpers (coverage, score range, points lost, guaranteed-minimum ordering, citation links); scenarios; compare verdict | **53 passed** (4 files) |
| `cd web && npm run build` | Production build with the real bundle (`public/`) | **OK.** JS bundle 762.82 kB (gzip 229.20 kB); Vite warns about a chunk over 500 kB (non-blocking) |
| `cd web && npm run build:mock` | Mock build (`public-mock/` → `dist-mock/`) stays separate | **OK** |
| `cd web && npm run lint` | oxlint | 1 warning (`react(only-export-components)` in `src/state/AppState.jsx`), 0 errors |
| `pipeline/.venv/Scripts/python.exe pipeline/validate_bundle.py real` | Manifest kind and SHA-256; no NaN/∞; norm in [0, 1]; valid classes; a source and provenance record for every non-null value; no MOCK text; `scores.json` equals a fresh recomputation | **real bundle: OK** |
| `pipeline/.venv/Scripts/python.exe pipeline/validate_bundle.py mock` | Same rules for the mock bundle | **mock bundle: OK** |
| `pipeline/.venv/Scripts/python.exe pipeline/validate_analogs.py` | Regenerates `docs/validation.md` from cached data (offline): rankings, negative controls, robustness, geology choice, clipped share, documented use | **OK.** Regenerated after quoting the Death Valley evidence field in `analog_evidence.csv`; only that §6 row changed |

Re-run all of these after any data or code change, before tagging the submission.

## 2. Deployment steps (static host)

1. `cd web && npm ci && npm run build` → `web/dist/` contains `index.html`, `assets/`, `data/` (4 JSON files plus `manifest.json`), `favicon.svg` and `_redirects`.
2. **SPA fallback is required.** The app uses `BrowserRouter`, so deep links such as `/explore?…` and `/site/:id` must serve `index.html`:
   - Netlify: `web/public/_redirects` (`/*    /index.html   200`) is copied into `dist/`. The same file is in `web/public-mock/` for the mock build.
   - Vercel: `web/vercel.json` rewrites all paths to `/index.html` (set the Vercel project root to `web/`). Existing static files such as `data/*.json` are served before the rewrite applies.
   - GitHub Pages: **not implemented.** Pages has no rewrite support, so a deep link returns 404 unless `dist/index.html` is also copied to `dist/404.html` after each build, and `base: '/<repo>/'` is set in `vite.config.js` for a project page. The router `basename` and data URLs already use `import.meta.env.BASE_URL`; check that the favicon resolves under the subpath. Prefer Netlify or Vercel.
   - The fallback files are not yet tested on a live host (no deployment).
3. Deploy `web/dist/` only. Never deploy `dist-mock/` as the project link.
4. Open the public URL and confirm the About page shows the real-data status (no MOCK banner) and the bundle date `2026-11-14`.

## 3. Manual checks before submission

| Check | How | Status |
|---|---|---|
| Fresh incognito load of the public URL | Private window, no cache; Home → scenario → Site details → Compare; reload a deep link | Not done (no deployment yet) |
| Network tab: only static files and map tiles | DevTools → Network: expect the app's own `index.html`, `assets/*`, `data/*.json` and tiles from `server.arcgisonline.com` only. No NASA, LLM or analytics calls | Not done |
| Links work without password, permission or registration | Open the app, repo and demo links logged out; the GitHub repo is public and the demo is not on restricted (e.g. Drive) sharing | Not done |
| FortiGuard classification (recommended, optional) | Submit the new domain for web-filter classification so judges on filtered networks can open it | Optional, not done |
| 1280×720 layout, keyboard-accessible sliders | Demo laptop | Not re-checked after Phase 4 |
| Demo length | Video ≤ 30 s **or** ≤ 7 slides including title and intro (binding rule; see `docs/demo_script.md`) | Not recorded |

## 4. Submission-guide requirements (2026)

These requirements were taken from the team's notes on the 2026 Project Submission Guide and Judging & Awards Guide (not a repo file). Verify them on the official site before submission.

- **AI ("Super Intelligence") acknowledgement.** The rules require code and data produced with AI to be acknowledged in descriptive text and metadata. Present now: About page (`AI_STATEMENT` in `web/src/pages/About.jsx`), README and commit trailers. To do: add an AI note to the `web/index.html` meta description and the `web/package.json` description; consider "Use of AI (Super Intelligence, SI)" as the About heading and stating that the data-processing pipeline was also AI-assisted; the team must confirm a sentence on where the solution idea came from; fill the "Use of Super Intelligence (SI)" field on the project page. AI must not be used to come up with the solution idea, and any AI-generated image or video needs a visible watermark and no NASA branding.
- **NASA Data field.** List each dataset with DOI and use:
  - NASA POWER (MERRA-2; Gelaro et al. 2017, doi:10.1175/JCLI-D-16-0758.1, cited on the About page, not in the bundle provenance)
  - NASADEM_HGT v001 (doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001)
  - MODIS MOD13Q1 v061 (doi:10.5067/MODIS/MOD13Q1.061)
  - ASTER GDEM 30 m (NASA/METI) via the OpenTopoData public API: site elevations for 8 sites, used in the POWER representativeness rule (`sites_real.csv` `elev_source`)
  - USGS Mars 2020 TRN CTX DTM (Fergason et al. 2020)
  - MOLA MEGDR (Smith et al. 2001, doi:10.1029/2000JE001364): Jezero cross-check only, not scored and excluded from the product range
  - LRO LOLA LDEM_875S (doi:10.1029/2010GL043751)
  - Mission results: Perseverance MEDA, LRO Diviner, LCROSS and M3 (citations in `targets.json`)
  - NASA Moon/Mars Trek (link only)
- **Space Agency Partner Data and Other References.** List:
  - Copernicus DEM GLO-30/90 (ESA), doi:10.5270/ESA-c5d3d65, with the attribution text: "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"
  - HRSC–MOLA Blended DEM v2, 200 m (Fergason, Hare & Laura 2018, USGS; HRSC is an ESA/DLR Mars Express instrument): Jezero cross-check only, not scored, but it sets the 252.0 m upper end of the Jezero product range
  - Microsoft Planetary Computer (mirror), AWS Open Data, the OpenTopoData API and the Esri basemap
  - Every source cited in `sites_real.csv`, `targets_real.json` and `analog_evidence.csv`, including the non-peer-reviewed ones (Wikipedia infoboxes, NPS, ESA and UNOOSA pages, conference abstracts)
  - The libraries: React, React Router, Leaflet, react-leaflet, Recharts and Vite (`web/package.json`), plus dev tools Vitest, oxlint and @vitejs/plugin-react; pandas, GeoPandas, numpy, scikit-learn, rasterio, earthaccess, requests, Jupyter and pytest (`pipeline/requirements.txt`)
  - The favicon is currently the default Vite logo: replace it with an own icon (no NASA insignia) or list it in References
- **Originality box.** All external code, text and images must be listed in References.
- **English only** on the project page, slides and captions.
- **Team.** Every member registered for the same Local Event and on the Members tab before Nov 15, 11:59 p.m. local time. README "Team" is still TODO.
- **Required project-page fields:** name, high-level summary, demo link, final project link, detailed description, SI use, NASA data, and partner data and references.

## 5. Open issues

| # | Issue | Impact | Owner action |
|---|---|---|---|
| 1 | No deployment yet. SPA fallback files exist for Netlify (`_redirects`) and Vercel (`web/vercel.json`); GitHub Pages would need a `404.html` copy (§2) | Deep links untested on a live host | Deploy to Netlify or Vercel, run §3 |
| 2 | About page (`web/src/pages/About.jsx`) and `pipeline/config.py` text lag the docs: the geology source reads "Literature; EMIT L2B where available" although EMIT is not used (exported to `features.json`); SRTMGL1 and EMIT are listed "if used"; terrain and NDVI are missing from the data-status list; no screening-only line in the limitations; the CTX DTM link is a direct multi-MB `.tif` | Overstates NASA data use; inconsistent with the docs | Code change (out of scope for this docs pass); rebuild the bundle and re-run validation after the `config.py` change |
| 3 | Favicon is the default Vite logo; Team names are TODO (README, About) | Originality / References requirement; required project fields | Replace the icon or list it; fill in the team |
| 4 | Coordinates to verify: Río Tinto (low-authority source); White Desert (DEM window median 27 m); area reference points for Holuhraun, Timanfaya, Wadi Rum and Dallol | Windows may not sit on documented field sites | Verify against primary sources |
| 5 | JS bundle 762.82 kB (Vite chunk warning) | Slower first load on slow networks | Optional code splitting |
| 6 | 1 lint warning in `AppState.jsx` | None at runtime | Optional |
| 7 | Demo video / slide deck not produced | Required for submission | Use `docs/demo_script.md` §(b) |
| 8 | Scope below the CLAUDE.md MVP (2 of 6 targets, 11 of ~40 sites) | Must be stated, not hidden | Already stated in About, README and the docs |
| 9 | `CLAUDE.md` §11 lists a 90 s demo, and Phase 4 suggests tuning bounds | Now annotated in `CLAUDE.md`: the ≤ 30 s / ≤ 7-slide limit applies to the submission, and bound tuning is superseded | None (the annotations point to `docs/demo_script.md` and `docs/validation_report.md`) |
