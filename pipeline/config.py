"""Shared configuration for the Earth Analog Finder pipeline.

Feature bounds here are FIXED Earth bounds used for normalization (CLAUDE.md §5.1).
Never replace them with sample min/max. They are initial choices and may be tuned
in Phase 4 validation — record every change in pipeline/validation.md.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED_DIR = ROOT / "seed"
DATA_DIR = ROOT / "data"
BUNDLE_DIR = ROOT.parent / "web" / "public" / "data"

TARGETS_SEED = SEED_DIR / "targets_seed.csv"
SITES_SEED = SEED_DIR / "sites_seed.csv"
KNOWN_ANALOGS = SEED_DIR / "known_analogs.csv"
SITES_RAW = DATA_DIR / "sites_raw.csv"

# Great-circle distance (km) beyond which a site counts as a new candidate (§5.7).
NOVELTY_KM = 300

# Minimum per-criterion similarity for a criterion to appear in `why` (§5.6).
WHY_MIN_SIM = 0.7
WHY_MAX_ITEMS = 3

GEOLOGY_CLASSES = ["basalt", "anorthosite", "clay", "sulfate", "evaporite", "sedimentary", "ice"]
ICE_CLASSES = ["yes", "no"]

# Order matters: it is the canonical criterion order everywhere (UI, tie-breaks).
# `raw` is the sites_raw.csv column the feature is normalized from (pipeline only,
# not exported to features.json).
FEATURES = [
    {
        "id": "terrain",
        "label": "Terrain roughness",
        "kind": "numeric",
        "unit": "m relief within ~5 km box",
        "earthMin": 0,
        "earthMax": 1500,
        "invert": False,
        "description": "Higher = rougher, more relief.",
        "source": "SRTMGL1 v003",
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
        "description": "Drier is more Moon/Mars-like.",
        "source": "NASA POWER",
        "raw": "precip_mm",
    },
    {
        "id": "temp",
        "label": "Temperature",
        "kind": "numeric",
        "unit": "°C annual mean",
        "earthMin": -30,
        "earthMax": 30,
        "invert": False,
        "description": "0 = coldest Earth bound; Moon/Mars targets are clipped to 0.",
        "source": "NASA POWER",
        "raw": "tmean_c",
    },
    {
        "id": "temp_range",
        "label": "Temperature swing",
        "kind": "numeric",
        "unit": "°C (T2M_MAX − T2M_MIN)",
        "earthMin": 0,
        "earthMax": 30,
        "invert": False,
        "description": "Larger day–night / seasonal swing is more Moon/Mars-like.",
        "source": "NASA POWER",
        "raw": "trange_c",
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
        "source": "NDVI or literature",
        "raw": "ndvi",
    },
    {
        "id": "geology",
        "label": "Geology match",
        "kind": "categorical",
        "related": {"basalt": ["anorthosite"], "clay": ["sedimentary"], "sulfate": ["evaporite"]},
        "description": "Dominant surface rock / mineral class.",
        "source": "Literature; EMIT L2B where available",
    },
    {
        "id": "ice",
        "label": "Ground ice / permafrost",
        "kind": "categorical",
        "related": {},
        "description": "Whether ground ice or permafrost is present.",
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
