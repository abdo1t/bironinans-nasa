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
```

`analyzer.py` and the dashboard load those outputs automatically and fall back to the
old hand-written vectors if they are missing. Needs `numpy scipy pandas tifffile imagecodecs h5py`.

Current limits:
- Targets are three lunar south-pole regions (Shackleton, Malapert, Haworth); their coordinates are approximate.
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
