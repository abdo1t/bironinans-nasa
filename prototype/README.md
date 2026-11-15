# BIRONIENS | NASA Space Apps 2026 Prototype

## Overview
This prototype matches terrestrial geological/environmental sites (analogs) to specific lunar and Martian base candidate regions using a Weighted Multi-Criteria Decision Analysis (MCDA) approach.

## Setup & Execution

### 1. Prototype Structure
- `/scripts/analyzer.py`: Backend matching engine implementing the similarity algorithm.
- `/web/index.html`: Interactive dashboard for visualizing analog rankings, target comparison, and sensitivity weighting.

### 2. How to Run
Ensure Python 3 is installed.

```bash
# 1. Run the Backend Matching Engine
python3 scripts/analyzer.py

# 2. View Dashboard
# Open /web/index.html in any modern browser.
```

### 3. Data pipeline (real data instead of hand-written scores)
Run from the folder that contains `data-tools/`, `Raw Data/` and `prototype/`:

```bash
python data-tools/download_raw_data.py   # raw Moon + Earth datasets (~2.5 GB)
python data-tools/download_ndvi.py       # MODIS NDVI for the Earth sites
python data-tools/extract_features.py    # -> Processed/features_earth.csv, features_moon.csv
python data-tools/build_scores.py        # -> prototype/data/features.json, prototype/web/data.js
python data-tools/qualify.py --report    # -> prototype/data/qualification.json, web/qualification.js, Processed/validation.md
```

`analyzer.py` and the dashboard load those outputs automatically and fall back to the
old hand-written vectors if they are missing. Needs `numpy scipy pandas tifffile imagecodecs h5py`.

### 4. Analog Portfolio Planner (`web/planner.html`)
The main page. Pick a lunar target and the tests in a campaign; it shows a
pass / partial / fail / unknown verdict per requirement for each Earth site, the smallest
set of sites that covers the campaign, an "uncovered ledger" and a passport per site.
- Tests and thresholds live in `data-tools/tests.json` and can be edited without touching code.
- A test fails if any scored requirement fails, and is unknown if a core requirement has no data. Missing data is never guessed.
- `Processed/validation.md` holds the validation table, the negative control (Amazon) and a tolerance sensitivity check.
- `web/index.html` is the older single-score similarity view, kept as an overview.

Current limits:
- Targets are four lunar south-pole zones (Shackleton ridge and floor, Malapert massif, Haworth floor). Zone coordinates were checked against the illumination and elevation data, not against a mission plan.
- Verdict thresholds are first estimates and need review by an engineer.
- Thermal cycling can reach "partial" at best: no Earth site gets near lunar polar temperatures.
- Mineral sampling is Earth-side evidence only (no lunar polar mineral layer) and unknown for the 5 sites without EMIT.
- **Geology weight defaults to 0.** The axis is only a radar proxy (Sentinel-1 for Earth, Mini-RF CPR for the Moon) and is not comparable between the two bodies yet.
- **Aridity = barrenness** from NDVI (missing plant cover), not rainfall.
- Every axis is min-max scaled over the 12 Earth sites; lunar values beyond that range clip to 0 or 1.

## Team Task Split (48-Hour Plan)

| Role | Responsibility (16h - 48h) |
| :--- | :--- |
| **Data Sci/ML (4)** | Process raster datasets, define vector embeddings, tune similarity engine weights. |
| **Mechanical/Energy (1)** | Define physical constraints for base candidate sites (power, cooling, shielding). |
| **Software CS (1)** | Build API wrapper (FastAPI), host dashboard, ensure data integration pipeline. |

## Methodology
We use **Weighted Euclidean Distance** to map planetary feature vectors (Topography, Geology, Aridity, Thermal, Altitude) between target base sites and candidate Earth locations. Normalization is achieved via Min-Max scaling of planetary dataset values.
