# Earth Analog Finder — Build Plan for Claude Code

> NASA Space Apps Challenge 2026 (Nov 14–15) · Challenge: **Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars**
> This file is the single source of truth for the build. Read it fully before writing code. Work phase by phase, in order, and stop at each checkpoint so a human can review.

---

## 1. What we are building

A single-page web app that helps mission planners find **places on Earth that resemble a chosen Moon or Mars base site**, ranks them with an **explainable similarity score**, and lets users **compare** sites side by side.

User flow:

1. Choose a world (Moon or Mars).
2. Pick a target base site (e.g. Jezero Crater).
3. Choose what matters: a preset or one weight slider per criterion.
4. See ranked Earth analogs on a map and in a list.
5. Open a site: score breakdown, why it was selected, where it falls short, data sources.
6. Shortlist up to 3 sites.
7. Compare them (radar chart and table).
8. *(Stretch)* Export/share.

**The key demo moment:** moving a weight slider reorders the ranking instantly.

### Architecture (one-way data flow)

```
Open data (NASA Earthdata, NASA POWER, Moon/Mars Trek, PDS)
        │  (fetched once, before the demo)
        ▼
Python pipeline (Jupyter + scripts) ── normalize ── score + explain
        │  export once
        ▼
Static data bundle: web/public/data/{targets.json, features.json, sites.geojson, scores.json}
        │  loaded once at startup
        ▼
React web app (static build) ── re-scores in the browser when weights change
```

**Hard constraints:**

- **No backend server, no database, no auth, no Docker.** The app is a static site.
- **The browser never calls NASA APIs.** All data comes from `web/public/data/`.
- **No LLM or API calls at runtime.** Any generated text is precomputed into `scores.json`.
- **`main` must always build and deploy.**

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Analysis | Python 3.11, Jupyter, pandas, GeoPandas, numpy, scikit-learn |
| Raster sampling | rasterio (or xarray + rioxarray) |
| Data access | `earthaccess` (NASA Earthdata login), `requests` (NASA POWER API) |
| Front end | React 18 + Vite, React Router, JavaScript (switch to TS only if asked) |
| Map | Leaflet + react-leaflet |
| Charts | Recharts (RadarChart, bar charts) |
| Styling | Plain CSS modules or Tailwind. Pick one, keep it simple. |
| Tests | Vitest (front end), pytest (pipeline) |
| Hosting | Vercel / Netlify / GitHub Pages (static `dist/`) |

**Not used in the app:** Folium and Plotly (they're fine in notebooks for quick checks), FastAPI/Flask, any database.

---

## 3. Repository layout

```
earth-analog-finder/
├─ CLAUDE.md                 # this file
├─ README.md                 # how to run pipeline + app, team, data sources
├─ pipeline/
│  ├─ requirements.txt
│  ├─ config.py              # feature bounds, presets, thresholds, paths
│  ├─ seed/
│  │  ├─ targets_seed.csv    # 6 Moon/Mars targets (hand-written, cited)
│  │  ├─ sites_seed.csv      # ~40 Earth candidate sites (name, lat, lon, knownAnalog, geology, ice)
│  │  └─ known_analogs.csv   # catalogued analog sites, for novelty distance
│  ├─ data/
│  │  ├─ power/<site>.json   # raw POWER responses + request (committed cache)
│  │  ├─ power.csv           # fetch_power.py output
│  │  └─ terrain.csv         # fetch_terrain.py output (relief or null + reason)
│  ├─ make_mock.py           # writes a deterministic MOCK bundle to web/public/data/
│  ├─ fetch_power.py         # NASA POWER climatology per site → data/power.csv
│  ├─ fetch_terrain.py       # SRTMGL1 → ASTER GDEM v3 relief per site → data/terrain.csv
│  ├─ bundle_io.py / validate_bundle.py  # bundle + manifest writer; schema/provenance validator
│  ├─ fetch_ndvi.py          # (optional) vegetation per site
│  ├─ scoring.py             # SOURCE OF TRUTH for normalize + score + explain
│  ├─ build_bundle.py        # seed + raw → normalized → scores → JSON export
│  ├─ notebooks/
│  │  ├─ 01_targets.ipynb
│  │  ├─ 02_sites.ipynb
│  │  └─ 03_score_validate.ipynb
│  └─ tests/
│     ├─ fixture.json        # shared Python/JS parity fixture
│     └─ test_scoring.py
└─ web/
   ├─ index.html
   ├─ package.json
   ├─ vite.config.js
   ├─ public/data/           # REAL bundle: targets.json, features.json, sites.geojson, scores.json, manifest.json
   ├─ public-mock/data/      # MOCK bundle (served only by `npm run dev:mock` / `build:mock`)
   └─ src/
      ├─ main.jsx
      ├─ App.jsx             # routes
      ├─ data/useBundle.js   # loads the 4 files once, exposes them via context
      ├─ state/AppState.jsx  # selected body, target, weights, shortlist (+ URL sync)
      ├─ lib/scoring.js      # JS port of scoring.py (must match exactly)
      ├─ lib/scoring.test.js
      ├─ lib/presets.js
      ├─ pages/
      │  ├─ Home.jsx
      │  ├─ Explore.jsx      # Map | List toggle
      │  ├─ SiteDetails.jsx
      │  ├─ Compare.jsx
      │  └─ About.jsx        # method, limitations, data sources
      └─ components/
         ├─ WorldCard.jsx
         ├─ TargetSelect.jsx
         ├─ CriteriaPanel.jsx   # preset dropdown + sliders
         ├─ MapView.jsx         # react-leaflet markers coloured by score
         ├─ ResultsList.jsx     # ranked table
         ├─ ScoreBars.jsx       # per-criterion breakdown
         ├─ RadarCompare.jsx
         └─ CompareTable.jsx
```

---

## 4. Data contract (freeze this first; mock and real data use the SAME shape)

All numbers in `norm` are in `[0, 1]`. Categorical features are strings. Feature IDs are stable and shared everywhere.

### 4.1 Criteria (feature IDs)

| id | label | kind | Earth source | notes |
|---|---|---|---|---|
| `terrain` | Terrain relief | numeric | SRTMGL1 v003 (56°S–60°N) else ASTER GDEM v3: P99 − P1 elevation in a 10 × 10 km window | higher = more relief |
| `aridity` | Aridity | numeric | NASA POWER annual precipitation (inverted) | 1 = hyper-arid |
| `temp` | Surface temperature | numeric | NASA POWER annual mean `TS` (skin temperature; the Moon has no air) | bounds −60…+35 °C; 0 = coldest Earth bound |
| `temp_range` | Daily temperature swing | numeric | NASA POWER `TS_RANGE` (mean daily range). Never `T2M_MAX − T2M_MIN` (annual extremes) | bounds 0…35 °C |
| `veg` | Bare ground | numeric | NDVI (inverted) or literature | 1 = no vegetation |
| `geology` | Geology match | categorical | literature / EMIT | e.g. `basalt`, `anorthosite`, `clay`, `sulfate`, `evaporite`, `sedimentary`, `ice` |
| `ice` | Ground ice / permafrost | categorical | literature flag | `yes` / `no` |

### 4.2 `features.json`

```json
[
  {
    "id": "aridity",
    "label": "Aridity",
    "kind": "numeric",
    "unit": "mm/yr precipitation (inverted)",
    "earthMin": 0,
    "earthMax": 2000,
    "invert": true,
    "description": "Drier is more Moon/Mars-like.",
    "source": "NASA POWER"
  },
  {
    "id": "geology",
    "label": "Geology match",
    "kind": "categorical",
    "related": { "basalt": ["anorthosite"], "clay": ["sedimentary"], "sulfate": ["evaporite"] },
    "source": "Literature; EMIT L2B where available"
  }
]
```

### 4.3 `targets.json`

```json
[
  {
    "id": "mars-jezero",
    "body": "mars",
    "name": "Jezero Crater",
    "lat": 18.4,
    "lon": 77.5,
    "summary": "Ancient lake delta; clays and carbonates; Perseverance landing site.",
    "norm": { "terrain": 0.6, "aridity": 1.0, "temp": 0.0, "temp_range": 1.0, "veg": 1.0, "geology": "clay", "ice": "no" },
    "refs": { "temp": "TODO citation", "geology": "TODO citation" },
    "trekUrl": "https://trek.nasa.gov/mars/"
  }
]
```

(The `norm` numbers above are placeholders, not measurements.)

### 4.4 `sites.geojson`

FeatureCollection of Points. `properties`:

```json
{
  "id": "atacama",
  "name": "Atacama Desert",
  "country": "Chile",
  "knownAnalog": true,
  "raw":  { "precip_mm": null, "tmean_c": null, "trange_c": null, "relief_m": null, "ndvi": null },
  "norm": { "terrain": null, "aridity": null, "temp": null, "temp_range": null, "veg": null, "geology": "clay", "ice": "no" },
  "novelKm": 0,
  "isNewCandidate": false,
  "sources": { "terrain": "SRTMGL1 v003", "aridity": "NASA POWER", "temp": "NASA POWER" }
}
```

**Source labels for non-measured values.** Every non-null `norm` value has a `sources` entry (targets: `refs`). Synthetic values use `"MOCK — synthetic placeholder, not a measurement"`; categorical classes copied from the seed CSVs use `"Seed CSV class (literature, unverified)"` (constants in `config.py`). The UI flags any source starting with `MOCK` as synthetic and `Seed` as unverified, and shows `features.json` `source` only as the *planned* source. Synthetic values must never be presented as NASA observations.

### 4.5 `scores.json` (default ranking per target, computed with the `balanced` preset)

`minCriteria` (real bundle: 3) is the minimum number of usable criteria for a score; the app uses the same value.

```json
{
  "generatedAt": "2026-11-14T12:00:00Z",
  "defaultPreset": "balanced",
  "byTarget": {
    "mars-jezero": [
      {
        "site": "atacama",
        "score": 0,
        "contrib": { "terrain": 0.0, "aridity": 0.0, "temp_range": null },
        "coverage": { "used": 2, "selected": 3 },
        "scoreRange": [0, 33],
        "why": ["Strongest match: aridity", "Bare ground close to target"],
        "gap": "Much warmer than the target"
      }
    ]
  }
}
```

---

### 4.6 Real-bundle extensions (contract `eaf-bundle/2`, Phase 3)

* `manifest.json`: `{contract, kind: "real"|"mock", generatedAt, files: {name: sha256}}`. The app refuses to start if the kind does not match its build mode, a hash differs, or a real bundle contains any `MOCK` value (`web/src/lib/bundleIntegrity.js`). `pipeline/validate_bundle.py` enforces the same plus schema, NaN/∞, coordinates and provenance.
* `targets.json` adds `provenance[fid] = {status: in-situ|orbital|model|literature|definitional|unavailable, display, citation, url, note, basisValue}`, `clipped[fid] = "below"|"above"`, `coord {source, note}`. `status: unavailable` ⇔ `norm[fid] = null`.
* `sites.geojson` properties add `provenance[fid]` (dataset, parameter, status e.g. `reanalysis`, value, units, period, resolution, request url, `excluded` reason when shown-but-not-scored), `clipped`, `coord {source, precision, elevM, elevSource}`, `analogRef`, `notes`. `raw` keys: `relief_m, precip_mm_yr, ts_mean_c, ts_range_c, ndvi`.
* Methodology, decisions and limitations: `docs/methodology.md`; per-criterion readiness: `docs/data_readiness.md`.

## 5. Scoring spec (implement identically in `pipeline/scoring.py` and `web/src/lib/scoring.js`)

1. **Normalize (Python only).** For each numeric feature: `x = clip((raw - earthMin) / (earthMax - earthMin), 0, 1)`; if `invert`, `x = 1 - x`. Use the **fixed bounds in `config.py`**, never the sample min/max.
2. **Targets are already normalized.** Values beyond Earth's range are clipped to 0 or 1 ("as close as Earth gets").
3. **Per-criterion similarity:**
   - numeric: `s = 1 - abs(site - target)`
   - categorical: `s = 1` if equal; `0.5` if listed in `related` (either direction); else `0`.
   - missing value on either side: `s = null` — skip that criterion (exclude it from both numerator and denominator). A missing value is never treated as 0; `0` always means "measured, no match".
4. **Overall score:** `score = round_half_up(100 * Σ(w_i * s_i) / Σ(w_i))` over usable criteria with `w_i > 0` (half-up = `floor(x + 0.5)` in both languages). If no criterion is usable — or fewer than `min_used` (real bundle: `minCriteria` = 3) — the score is **`null`** (UI: "No score — insufficient data"), not 0. Default `min_used` is 1.
5. **Contribution:** `contrib_i = w_i * s_i / Σ(w_i)` over the usable criteria, rounded half-up to 4 decimals. `contrib` lists every selected criterion (`w_i > 0`); a selected criterion with missing data is `null`.
5a. **Coverage:** `coverage = { used, selected }` — how many selected criteria (`w_i > 0`) actually contributed. Shown next to every score.
5b. **Score range:** `scoreRange = [lo, hi]` — the score if every selected criterion that is missing on the SITE side (target value known) were a total mismatch (`s = 0`) or a perfect match (`s = 1`), both rounded half-up; `[score, score]` when nothing is missing; `null` when `score` is `null`. The app can rank by the lower end ("Guaranteed minimum", URL `rank=min`; display-only ordering in `web/src/lib/explain.js orderRanking`), which favours evidence-backed sites.
6. **Explanations:**
   - `why` = the top 2–3 criteria by contribution (only those with `s_i ≥ 0.7`), as short phrases built from feature labels. A criterion whose target value is clipped to Earth's bounds (`target.clipped`) is worded "near Earth's extreme (target is beyond Earth's range)", never "close to target".
   - `gap` = among usable criteria with `s_i < 0.7`, the one that loses the most points, max `w_i · (1 − s_i)` (ties: feature order); `"No gaps on the selected criteria"` if none — so it never contradicts `why`. Clipped criteria get the same suffix.
   - The UI always shows a fixed limitations note: *No Earth site reproduces lunar/Martian gravity, vacuum or radiation.*
7. **Novelty:** `novelKm` = great-circle distance to the nearest site in `known_analogs.csv`; `isNewCandidate = novelKm > 300` (constant in `config.py`). In the UI this is an **"uncatalogued candidate"** — far from every catalogued analog, *not* a scientifically validated new analog. Never call it "new analog" or "discovered".
8. **Ranking:** sort by score desc; tie-break by name asc (code-point order, not locale), then id. `null` scores sort after all scored sites.

### Presets (`web/src/lib/presets.js`, mirrored in `config.py`)

Weights range from 0 to 5.

| preset | terrain | aridity | temp | temp_range | veg | geology | ice |
|---|---|---|---|---|---|---|---|
| `balanced` | 3 | 3 | 3 | 1 | 3 | 3 | 1 |
| `rover` (Rover testing) | 5 | 3 | 1 | 1 | 4 | 3 | 0 |
| `habitat` (Habitat & construction) | 2 | 3 | 2 | 2 | 3 | 5 | 1 |
| `ice` (Ice drilling) | 2 | 2 | 5 | 2 | 3 | 1 | 5 |

### Parity test (required)

- `pipeline/tests/test_scoring.py` and `web/src/lib/scoring.test.js` run the **same fixture** (`pipeline/tests/fixture.json`: 2 targets, 5 sites, 2 weight sets) and assert identical scores and order. The fixture also holds `handCases` / `rankCases` whose expected values were worked out by hand (independent of either implementation).
- In dev mode the app recomputes the default ranking and `console.warn`s on any mismatch with `scores.json`.

---

## 6. Seed data (starting points — verify coordinates; values marked TODO must be filled from cited sources)

### 6.1 Targets (`targets_seed.csv`), 3 per world

| id | body | name | approx lat, lon | character |
|---|---|---|---|---|
| `moon-south-pole` | moon | Lunar South Pole (Shackleton rim / Artemis region) | −89.5, 0 | extreme cold, low sun, rough, ice in cold traps |
| `moon-mare` | moon | Mare Tranquillitatis | 8.5, 31.4 | flat basalt plain, large day–night swing |
| `moon-lava-tube` | moon | Marius Hills skylight | 14.1, −56.7 | volcanic, lava tube, sheltered |
| `mars-jezero` | mars | Jezero Crater | 18.4, 77.5 | delta, clays, carbonates |
| `mars-gale` | mars | Gale Crater | −5.4, 137.8 | layered sediments, sulfates, clays |
| `mars-arcadia` | mars | Arcadia Planitia | ~46.7, −168 | mid-latitude plains with shallow ice |

### 6.2 Earth candidate sites (`sites_seed.csv`), ~40 total

**Known analogs (`knownAnalog=true`):** Atacama Desert (Chile) · Haughton Crater / Devon Island (Canada) · Death Valley (USA) · McMurdo Dry Valleys (Antarctica) · Mojave Desert (USA) · Mars Desert Research Station area, Utah (USA) · Iceland lava fields · Mauna Kea / Hawaiʻi volcanics (USA) · Río Tinto (Spain) · Svalbard (Norway) · Pilbara (Australia) · Lanzarote (Spain) · Lonar Crater (India) · Ladakh (India) · Dhofar desert (Oman)

**New candidates (`knownAnalog=false`), for the team to extend:** Western Desert / White Desert (Egypt) · Gilf Kebir (Egypt) · Wadi Rum (Jordan) · Danakil Depression (Ethiopia) · Namib Desert (Namibia) · Altiplano salt flats (Bolivia) · Gobi (Mongolia) · Taklamakan (China) · Lut Desert (Iran) · Rub' al Khali (Saudi Arabia) · and others

Claude Code: write these to CSV with best-known approximate coordinates and a `coord_note` column = `approx — verify`. Do **not** invent raw measurements. Raw values come only from the fetch scripts, or stay `null`. Known analogs also go into `known_analogs.csv`.

---

## 7. Screens (routes)

| Route | View | Must have |
|---|---|---|
| `/` | Home | Two world cards (Moon, Mars) → target dropdown filtered by world → "Find Earth analogs" button |
| `/explore?target=…&preset=…` | Explore — Map | Left: CriteriaPanel (target name, preset dropdown, one slider per criterion, reset). Right: Leaflet map. Marker colour/opacity = score. A ring marker means `isNewCandidate` (uncatalogued candidate). Popup shows name, score, coverage, "catalogued analog / uncatalogued candidate", and a "View details" link. Legend. Map/List toggle. |
| `/explore?view=list` | Explore — List | Ranked table: rank, site, score bar, coverage (`used/selected`), one-line `why`, catalogued/uncatalogued tag, checkbox to shortlist (max 3). "Compare (n)" button. |
| `/site/:id?target=…` | Site details | Name, score badge, ScoreBars per criterion, Why it was selected, Where it falls short, limitations note, data sources list, "Add to compare". Optional: Moon/Mars Trek link for the target. |
| `/compare?sites=a,b,c&target=…` | Compare | Recharts RadarChart (one series per site) plus a table of criteria × sites plus an overall row and a one-line verdict (best overall, best per top-weighted criterion). |
| `/about` | About | Method (plain-English scoring), limitations, data sources with links, team. |

**State:** keep the selected target, weights and shortlist in React context and **sync them to the URL query** so any screen can be shared or reloaded. Changing a weight must re-rank **within one frame** (no loading state).

**Basemap:** Esri World Imagery or OpenStreetMap tiles (no API key). Add attribution.

**UX basics:** responsive down to 1280×720 for the demo laptop, a clear empty state ("Pick a target to start"), "data pending" labels for `null` values, and keyboard-accessible sliders and buttons.

---

## 8. Build order: phases and checkpoints

Work through the phases in order. After each phase, run the listed checks, commit, and **stop for human review at checkpoints**.

### Phase 0: Scaffold

- [ ] Create the repo layout from §3, plus `README.md`, `.gitignore`, `pipeline/requirements.txt`.
- [ ] `npm create vite@latest web -- --template react`; add `react-router-dom react-leaflet leaflet recharts`; add `vitest` as a dev dependency.
- [ ] Write `pipeline/make_mock.py`: a deterministic mock bundle (seeded RNG) in exactly the §4 shapes, covering the 6 targets and ~40 sites from §6. Mark it clearly as mock (`"generatedAt": "MOCK"`).
- [ ] `useBundle.js` loads the 4 files; `App.jsx` sets up the routes with placeholder pages.
- **Check:** `npm run dev` shows Home; `npm run build` passes.

### Phase 1: Scoring core

- [ ] `pipeline/scoring.py` per §5, plus `config.py` (bounds, presets, novelty threshold).
- [ ] `web/src/lib/scoring.js`: an exact port.
- [ ] Shared fixture plus pytest and Vitest parity tests.
- **Check:** both test suites pass with identical outputs.

### ✔ Checkpoint A: human reviews the contract, scoring and mock bundle

### Phase 2: Core screens on mock data

- [ ] Home (WorldCard, TargetSelect).
- [ ] Explore: CriteriaPanel plus MapView plus ResultsList with Map/List toggle; live re-rank on slider change.
- [ ] Site details with ScoreBars, why/gap, sources.
- [ ] Shortlist (max 3) in context and URL.
- **Check:** the full flow Home → Explore → Site → back works; moving a slider reorders the list instantly.

### Phase 3: Real data pipeline

- [ ] `fetch_power.py`: for each site, call the NASA POWER climatology point API (no login), e.g. `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR&community=RE&latitude={lat}&longitude={lon}&format=JSON` (verify the parameter names and units against the POWER docs before relying on them). Write the results to `sites_raw.csv`. Add a polite delay and caching; never refetch rows that are already filled.
- [ ] `fetch_terrain.py`: use `earthaccess.login()` and search `SRTMGL1` (v003) for a ~0.1° box around each site; compute relief (max − min) and slope std or roughness with rasterio/numpy; cache. If downloads fail, fall back to coarser elevation and log which sites fell back.
- [ ] *(Optional)* `fetch_ndvi.py`, or fill `veg` from literature with a source note.
- [ ] `build_bundle.py`: seed + raw → normalize → novelty (GeoPandas great-circle distance) → scores for every target using the `balanced` preset → write the 4 JSON files to `web/public/data/`.
- **Check:** the app runs unchanged on real data (same shapes); no `NaN` in the output; every non-null `norm` value has a `sources` entry.

### ✔ Checkpoint B: human reviews the real data and validation

### Phase 4: Validation and compare

- [ ] `03_score_validate.ipynb`: for each Mars target, check whether Atacama, Haughton, Death Valley and Utah (MDRS) rank in the top third; for `moon-south-pole`, check McMurdo and Svalbard. Print a table. If they don't, tune the bounds (not the per-site data) and record the change. Superseded: bounds are NOT tuned to rankings; validation is reported as-is (docs/validation_report.md).
- [ ] Compare page: RadarCompare, CompareTable, verdict.
- [ ] About page: method, limitations, sources.
- **Check:** validation table saved as `pipeline/validation.md`; Compare works with 2 and 3 sites.

### ✔ Checkpoint C: feature freeze. After this only fixes, polish and stretch work.

### Phase 5: Polish and deploy

- [ ] Loading and empty states, responsive pass, favicon/title, map attribution.
- [ ] Deploy the static `web/dist` (Vercel/Netlify/GitHub Pages; set `base` in `vite.config.js` if needed).
- [ ] README: how to run the pipeline, how to run the app, data sources, team.
- **Check:** the public URL works in a fresh incognito window; the browser network tab shows no external data calls except map tiles.

### Stretch goals (only after Checkpoint C, in this order)

1. A Trek tile layer or link showing the Moon/Mars target beside the Earth site on Site details.
2. A coarse global "analog heat" layer (e.g. a 1° grid from NASA POWER plus coarse elevation), precomputed to GeoJSON, toggled on the map.
3. k-means clustering of sites on normalized features, shown as "site families".
4. Export a shortlist as CSV or a share link.

---

## 9. Definition of done (MVP)

- [ ] 2 worlds, 6 targets, ~40 sites, 5–7 criteria, 4 presets.
- [ ] Map plus ranked list, re-ranking live on weight change.
- [ ] Site details show the breakdown, why, gap, limitations and sources.
- [ ] Compare for 2–3 sites with radar plus table.
- [ ] Python and JS scoring parity tests pass.
- [ ] Validation table shows known analogs ranking sensibly.
- [ ] Deployed static site; no runtime API calls except basemap tiles.

## 10. Rules for Claude Code

- Keep the §4 shapes exactly. If a change is truly needed, update this file, `make_mock.py`, both scoring implementations and the tests **in the same commit**.
- Never fabricate scientific values. Use `null` plus `TODO` with a note, and surface "data pending" in the UI.
- Prefer small, readable components. No state libraries beyond React context.
- Commit after each checklist item with a clear message. Run `npm run build` and the tests before each commit.
- If a NASA download blocks progress for more than 30 minutes, fall back as described in Phase 3 and keep going.
- Ask the human before adding any dependency not listed in §2.

## 11. Demo script (90 seconds, for reference)

> Official 2026 submission limit: the submitted demo must be a video of ≤ 30 s or a deck of ≤ 7 slides (see docs/demo_script.md); this 90 s script is for live judging only.

1. "Mission teams rehearse on Earth before they fly, but most analog sites aren't well characterized."
2. Mars → Jezero Crater → preset **Rover testing**.
3. The map lights up; open the top site and read its "why" and sources.
4. Shortlist 3 sites → Compare.
5. Drag the Temperature slider; the ranking reorders live.
6. Close on an **uncatalogued candidate** the tool surfaced (a lead worth field validation, not a confirmed analog).

## 12. References

- Challenge: https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/ (check the Resources tab at kickoff)
- SRTMGL1 v003: https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003
- EMIT L2B minerals: https://cmr.earthdata.nasa.gov/search/concepts/C2408034484-LPCLOUD.html
- HLS L30: https://www.earthdata.nasa.gov/data/catalog/lpcloud-hlsl30-2.0
- MRO CRISM: https://pds-geosciences.wustl.edu/missions/mro/crism.htm
- Trek tile API (Mars): https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
- LRO Diviner: https://pds-geosciences.wustl.edu/missions/lro/diviner.htm
- NASA POWER: https://power.larc.nasa.gov/
