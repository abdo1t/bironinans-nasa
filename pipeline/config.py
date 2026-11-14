"""Shared configuration for the Earth Analog Finder pipeline.

Feature bounds here are FIXED Earth bounds used for normalization (CLAUDE.md §5.1).
Never replace them with sample min/max of our candidate sites. Phase 3 set them
from Earth-wide extremes in the same dataset (see docs/methodology.md §Bounds),
not to make particular sites rank well. Record every change in docs/methodology.md.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED_DIR = ROOT / "seed"
DATA_DIR = ROOT / "data"
# Real and mock bundles live in different Vite public dirs, so a build can only
# ever contain one of them (see web/vite.config.js).
BUNDLE_DIR = ROOT.parent / "web" / "public" / "data"            # real data (default build)
MOCK_BUNDLE_DIR = ROOT.parent / "web" / "public-mock" / "data"  # `vite --mode mock`

# Mock demo inputs (40 sites, 6 targets; values synthetic)
TARGETS_SEED = SEED_DIR / "targets_seed.csv"
SITES_SEED = SEED_DIR / "sites_seed.csv"
KNOWN_ANALOGS = SEED_DIR / "known_analogs.csv"

# Real-bundle inputs (curated, cited)
SITES_REAL = SEED_DIR / "sites_real.csv"
TARGETS_REAL = SEED_DIR / "targets_real.json"
POWER_CSV = DATA_DIR / "power.csv"
TERRAIN_CSV = DATA_DIR / "terrain.csv"
PLANETARY_TERRAIN_CSV = DATA_DIR / "planetary_terrain.csv"
NDVI_CSV = DATA_DIR / "ndvi.csv"

# Great-circle distance (km) beyond which a site is flagged `isNewCandidate` (§5.7).
# This only means "uncatalogued: far from every catalogued analog". It is NOT a
# scientific validation of the site as an analog.
NOVELTY_KM = 300

# NASA POWER values describe a ~50 km grid cell. If the site's elevation differs
# from the cell's mean elevation by more than this, the cell does not represent
# the site (e.g. a basin floor inside a highland cell): its POWER values are shown
# but NOT used in scores. Islands smaller than a cell are flagged by hand
# (sites_real.csv power_quality = "low").
POWER_MAX_ELEV_DIFF_M = 500

# Source labels for values that are not real measurements. The UI flags any
# source starting with "MOCK" as synthetic and "Seed" as unverified.
MOCK_SOURCE = "MOCK — synthetic placeholder, not a measurement"
SEED_CLASS_SOURCE = "Seed CSV class (literature, unverified)"

# Explanation thresholds (WHY_MIN_SIM etc.) live in scoring.py / scoring.js so the
# two implementations share one definition each.

GEOLOGY_CLASSES = ["basalt", "anorthosite", "clay", "sulfate", "evaporite", "sedimentary", "ice"]
ICE_CLASSES = ["yes", "no"]

# Order matters: it is the canonical criterion order everywhere (UI, tie-breaks).
# `raw` is the sites_raw.csv column the feature is normalized from (pipeline only,
# not exported to features.json).
FEATURES = [
    {
        "id": "terrain",
        "label": "Terrain relief",
        "kind": "numeric",
        "unit": "m (P99 − P1 elevation in a 10 × 10 km window)",
        "earthMin": 0,
        "earthMax": 1500,
        "invert": False,
        "description": "Higher = more relief. Same 10 km window and ~200 m common scale for Earth, Mars and Moon.",
        "source": "Earth: NASADEM v001 (NASA JPL), Copernicus GLO-30 where NASADEM has no coverage; "
                  "Mars: USGS Mars 2020 CTX DTM; Moon: LRO LOLA LDEM",
        "raw": "relief_m",
    },
    {
        "id": "aridity",
        "label": "Aridity",
        "kind": "numeric",
        "unit": "mm/yr precipitation (inverted)",
        "earthMin": 0,
        "earthMax": 2000,
        "invert": True,
        "description": "Drier is more Moon/Mars-like. Wetter than 2000 mm/yr counts as 0.",
        "source": "NASA POWER PRECTOTCORR (MERRA-2 climatology)",
        "raw": "precip_mm_yr",
    },
    {
        "id": "temp",
        "label": "Surface temperature",
        "kind": "numeric",
        "unit": "°C annual-mean surface (skin) temperature",
        "earthMin": -60,
        "earthMax": 35,
        "invert": False,
        "description": "0 = Earth's coldest annual mean (~−59 °C, Antarctic plateau). Colder targets are clipped.",
        "source": "NASA POWER TS (MERRA-2 climatology)",
        "raw": "ts_mean_c",
    },
    {
        "id": "temp_range",
        "label": "Daily temperature swing",
        "kind": "numeric",
        "unit": "°C mean daily surface-temperature range",
        "earthMin": 0,
        "earthMax": 35,
        "invert": False,
        "description": "Larger day–night swing is more Moon/Mars-like. Larger target swings are clipped.",
        "source": "NASA POWER TS_RANGE (MERRA-2 climatology)",
        "raw": "ts_range_c",
    },
    {
        "id": "veg",
        "label": "Bare ground",
        "kind": "numeric",
        "unit": "NDVI (inverted)",
        "earthMin": 0,
        "earthMax": 0.8,
        "invert": True,
        "description": "1 = no vegetation.",
        "source": "MODIS MOD13Q1 v061 NDVI (NASA LP DAAC), 2022–2023",
        "raw": "ndvi",
    },
    {
        "id": "geology",
        "label": "Geology match",
        "kind": "categorical",
        "related": {"basalt": ["anorthosite"], "clay": ["sedimentary"], "sulfate": ["evaporite"]},
        "description": "Dominant surface rock / mineral class.",
        "source": "Peer-reviewed literature, cited per site (EMIT mineral maps not used yet)",
    },
    {
        "id": "ice",
        "label": "Ground ice / permafrost",
        "kind": "categorical",
        "related": {},
        "description": "Whether ground ice or permafrost is present; scores a match to the TARGET's state "
                       "(an ice-free target rewards ice-free sites).",
        "source": "Literature",
    },
]

FEATURE_IDS = [f["id"] for f in FEATURES]

# Weights 0–5. Mirrored in web/src/lib/presets.js — keep in sync.
PRESETS = {
    "balanced": {"terrain": 3, "aridity": 3, "temp": 3, "temp_range": 1, "veg": 3, "geology": 3, "ice": 1},
    "rover":    {"terrain": 5, "aridity": 3, "temp": 1, "temp_range": 1, "veg": 4, "geology": 3, "ice": 0},
    "habitat":  {"terrain": 2, "aridity": 3, "temp": 2, "temp_range": 2, "veg": 3, "geology": 5, "ice": 1},
    "ice":      {"terrain": 2, "aridity": 2, "temp": 5, "temp_range": 2, "veg": 3, "geology": 1, "ice": 5},
}
DEFAULT_PRESET = "balanced"
