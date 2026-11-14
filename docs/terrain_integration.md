# Terrain Integration Status and Evidence

Status (bundle `2026-11-14T05:20:03+00:00`): **terrain relief is acquired and scored for all 11 Earth sites and both targets.** Sources: `pipeline/data/terrain.csv`, `pipeline/data/planetary_terrain.csv`, `pipeline/fetch_terrain.py`, `pipeline/fetch_planetary_terrain.py`, `pipeline/terrain_common.py`.

## 1. Authentication blocker and the chosen route

The original plan (CLAUDE.md Phase 3) used LP DAAC **SRTMGL1 v003**, with **ASTGTM v003** (ASTER GDEM) as the fallback. Both are stored under `lp-prod-protected`. On 2026-11-13, an anonymous GET of a tile from either collection returned **302 → urs.earthdata.nasa.gov → 401** (`fetch_terrain.py` docstring). No Earthdata login exists on the build machine, and the project rule is not to handle credentials for the team.

The route chosen instead uses only public, credential-free products:

| Role | Product | Why |
|---|---|---|
| Earth primary (56° S – 60° N) | **NASADEM_HGT v001** (NASA JPL MEaSUREs reprocessing of SRTM, 1 arc-second), doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001. Cloud-Optimized GeoTIFFs on Microsoft Planetary Computer (anonymous SAS token). | NASA product with SRTM lineage, the same 1″ posting as SRTMGL1, and improved void filling. Keeps the NASA data lineage. |
| Earth fill (outside NASADEM coverage) | **Copernicus DEM GLO-30 Public** (2021 release), doi:10.5270/ESA-c5d3d65, AWS Open Data `copernicus-dem-30m`. | Global coverage. Used **only** where the 10 km window is not entirely inside NASADEM coverage (56° S – 60° N): Haughton (75.4° N), McMurdo (77.9° S) and Holuhraun (64.9° N). Never mixed with NASADEM inside a window. Quality flag `partner-fill`. |
| Earth cross-check (stored, never scored) | Copernicus GLO-30 for the NASADEM sites; Copernicus GLO-90 for the Copernicus sites. | An independent product and resolution check. |
| Mars | **USGS Mars 2020 TRN CTX DTM** mosaic `JEZ_ctx_B_soc_008`, 20 m, MOLA-areoid heights (Fergason et al. 2020, LPSC 51 #2020). | The DTM used for Perseverance terrain-relative navigation; it covers the landing site. |
| Mars cross-checks | HRSC–MOLA Blended DEM v2, 200 m (Fergason, Hare & Laura 2018); MOLA MEGDR 128 ppd, about 463 m (Smith et al. 2001, doi:10.1029/2000JE001364). | Independent products. MEGDR is too coarse for 200 m and is excluded from the min/max range. |
| Moon | **LRO LOLA LDEM_875S_20M** (V2.0, 2017-06-15), PDS LRO-L-LOLA-4-GDR-V1.0 (Smith et al. 2010, doi:10.1029/2010GL043751). | Standard south-polar LOLA DEM covering point C1. |
| Moon cross-check | LOLA LDEM_875S_5M, same release (HTTP byte-range read of the window rows). | Resolution check. |

## 2. Method (identical for every site and body)

1. **Window:** 10 km × 10 km square centred on the point (`terrain_common.window_bounds_deg`). It uses mean body radii, so it covers 10 km on the ground at any latitude. For the Moon it is ±5000 m × k in polar-stereographic map coordinates (k = 1.000022 at C1).
2. **Common posting:** native elevations are box-mean aggregated by integer factors to a posting of about **200 m** (Earth: 185 m N–S × 188–210 m E–W; Jezero 200.0 × 208.7 m; Moon 200 × 200 m). Mixing 20 m, 30 m and 463 m products at native resolution would compare different spatial scales.
3. **Metric:** relief = **P99 − P1** of the aggregated elevations. Percentiles make it robust to spikes and voids. Relief is set to null if the valid fraction is too low.
4. **Mean over block offsets:** box-mean results depend on where the first block starts. Relief is computed at **every** (row, column) block offset and averaged. The min/max over offsets is recorded as an alignment-uncertainty range (`relief_m_min`, `relief_m_max`).
5. Native-posting relief (`relief_native_m`) and the cross-check DEM value are stored alongside for comparison.
6. Normalization: `x = relief / 1500 m`, clipped to [0, 1] (`config.py`, unchanged since Phase 0).

## 3. Earth sites (`pipeline/data/terrain.csv`)

| Site | DEM (quality) | Native posting | Relief at native posting (m) | **relief_m** (~200 m, scored) | Block-offset range (m) | Cross-check DEM: relief (m) | Window median elevation (m) |
|---|---|---|---|---|---|---|---|
| Atacama (Yungay) | NASADEM (primary) | 1″ × 1″ (28 × 31 m) | 377.0 | **373.2** | 369.2–378.5 | GLO-30: 374.6 | 1096 |
| MDRS (Hanksville) | NASADEM | 1″ × 1″ (24 × 31 m) | 197.0 | **195.4** | 194.4–196.2 | GLO-30: 196.1 | 1380 |
| Death Valley (Badwater) | NASADEM | 1″ × 1″ (25 × 31 m) | 266.0 | **242.3** | 220.6–258.2 | GLO-30: 242.4 | −84 |
| Haughton (Devon Island) | Copernicus GLO-30 (partner-fill) | 3″ × 1″ (23 × 31 m) | 162.7 | **159.0** | 157.5–161.0 | GLO-90: 159.6 | 229.8 |
| McMurdo (University Valley) | Copernicus GLO-30 (partner-fill) | 3″ × 1″ (19 × 31 m) | 938.5 | **924.4** | 916.3–936.3 | GLO-90: 926.6 | 1626 |
| Río Tinto (Peña de Hierro) | NASADEM | 1″ × 1″ (24 × 31 m) | 347.0 | **339.6** | 334.5–344.6 | GLO-30: 341.7 | 414 |
| Holuhraun | Copernicus GLO-30 (partner-fill) | 2″ × 1″ (26 × 31 m) | 170.9 | **164.3** | 158.4–169.6 | GLO-90: 164.4 | 745.3 |
| Lanzarote (Timanfaya) | NASADEM | 1″ × 1″ (27 × 31 m) | 373.0 | **370.2** | 364.3–376.1 | GLO-30: 368.6 | 121 |
| Dallol (Danakil) | NASADEM | 1″ × 1″ (30 × 31 m) | 40.0 | **36.8** | 36.0–37.6 | GLO-30: 34.2 | −123 |
| White Desert (Farafra) | NASADEM | 1″ × 1″ (27 × 31 m) | 49.0 | **44.8** | 44.0–45.9 | GLO-30: 43.8 | 27 |
| Wadi Rum | NASADEM | 1″ × 1″ (27 × 31 m) | 758.0 | **752.9** | 748.4–756.6 | GLO-30: 749.1 | 1046 |

The cross-check differs from the scored value by at most 3.8 m (Wadi Rum). The largest relative difference is Dallol (−7.1 % on 36.8 m); all other sites are within 2.2 %. Every window has `valid_frac` = 1.0.

## 4. Planetary targets (`pipeline/data/planetary_terrain.csv`)

| Target | Primary product (native posting) | Relief at native posting (m) | **relief_m** (~200 m, scored) | Block-offset range (m) | Cross-checks at ~200 m | Product range used (min–max) | Normalized |
|---|---|---|---|---|---|---|---|
| Jezero (18.44° N, 77.45° E) | CTX DTM JEZ_ctx_B_soc_008 (20 m) | 233.3 | **231.1** | 229.1–232.8 | HRSC–MOLA 200 m: 252.0 m. MOLA MEGDR (463 m, excluded from range): 255.9 m, 46 % of pixels contain a MOLA shot | **229.1–252.0** | 0.1541 |
| Lunar South Pole C1 (89.468° S, 222.6° E) | LOLA LDEM_875S_20M (20 m) | 1130.0 | **1106.9** | 1093.4–1125.0 | LDEM_875S_5M at 200 m: 1105.3 m (native 5 m: 1129.5 m). 5 m → 20 m block mean minus the 20 m product: mean 0.0 m, RMS 0.7 m | **1093.4–1125.0** | 0.7379 |

Checks recorded in the CSV:
- **Moon:** the target's map x/y was checked against PROJ. Orientation check PASSED: a 4 km window at Shackleton's centre has a median of −2755 m, against 814 m at the longitude-mirrored point.
- **Jezero:** all products are referenced to the MOLA areoid. Relief comes mainly from km-scale slopes (crater floor and delta front), so 20 m and 200 m postings differ little. Differences between products dominate.

Ranking effect of the product ranges (`validation.md` §3c): Kendall τ = 1.0 at both ends, for both targets.

## 5. Resolution, datum and product caveats

| Caveat | Effect |
|---|---|
| **DSM vs DTM.** NASADEM (C-band radar) and Copernicus (X-band) are surface models that include vegetation and buildings. The CTX DTM and LOLA are bare-surface products. | Negligible at the barren sites; possibly not at Río Tinto (NDVI 0.48, p90 0.59) or at vegetated negative controls such as Freiburg and Manaus. |
| **LOLA interpolation.** LOLA grids are interpolated between laser tracks (GMT blockmedian/surface). | True resolution is coarser than 20 m. The 200 m common posting reduces, but does not remove, this effect. |
| **The C1 window is not ridge-top roughness.** The 10 km window spans the ridge crest and the steep Shackleton and de Gerlache flanks (window min/max 531/1959 m). | 1107 m describes the regional relief around C1, not the slope a rover would drive on. Which flank holds the low end was not checked. |
| **Coastal window (Lanzarote).** 16 % of pixels lie within ±1 m of 0 m. | P1 may be sea level, so relief may be overstated (flagged in `sites.geojson` provenance). |
| **Copernicus latitude-dependent posting.** Longitude spacing grows with latitude: 1″ below 50°, 1.5″ for 50–60°, 2″ for 60–70°, 3″ for 70–80°, 5″ for 80–85°, 10″ above 85° (as recorded in the `fetch_terrain.py` docstring; check against the Copernicus DEM product handbook before citing). | The native E–W ground spacing stays about 19–26 m at our sites. The real posting is recorded per site. The 200 m common posting removes most of the difference. |
| **Different instruments per body** (radar DEM, stereo CTX, laser altimetry). | The Jezero products already span 229.1–252.0 m, a spread of 22.9 m (about 10 % of 231.1 m). Treat terrain similarity as approximate. |
| **Datums differ** (geoid-referenced heights on Earth, MOLA areoid on Mars, 1737.4 km sphere on the Moon). | Irrelevant for relief, a within-window difference, but absolute elevations are not comparable across bodies. |
| **10 km scale.** | Relief at 10 km and 200 m does not describe rover-scale slopes, rock abundance or soil strength (`scenarios.js` limitation text). |
| **Normalization bound 0–1500 m** (Phase 0 value, no Earth-wide derivation recorded). | The 0–1500 m bound has no recorded derivation, and it was chosen for an earlier ~5 km metric. Every terrain similarity scales as Δrelief / 1500 m, and no bound-sensitivity test was run. |

## 6. Required attribution (Copernicus DEM)

Haughton, McMurdo and Holuhraun use Copernicus GLO-30, and every NASADEM site carries a Copernicus cross-check. The licence requires the following text wherever these derived values are redistributed. It is stored in `terrain.csv` (`attribution`) and the bundle provenance, and shown on the About page:

> © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

Also cite: European Space Agency, Sinergise (2021). Copernicus Global Digital Elevation Model (COP-DEM), doi:10.5270/ESA-c5d3d65. Copernicus is partner-agency data (ESA), not NASA data. NASADEM remains the primary source for 8 of 11 sites.

## 7. Reproduce

```bash
cd pipeline
python fetch_terrain.py            # Earth sites -> data/terrain.csv (reuses rows unless --force)
python fetch_planetary_terrain.py  # Jezero + Moon -> data/planetary_terrain.csv (downloads cached, gitignored)
python build_bundle.py             # -> web/public/data
```

Tests: `pipeline/tests/test_terrain_common.py`, `test_fetchers.py` and `test_planetary_terrain.py` cover window size at any latitude, scale-invariant common-posting relief, block means, void handling, sea-surface flagging, DEM choice by whole-window coverage, tile mosaicking, polar-stereographic coordinates against PROJ, and LOLA scaling without the radius offset.
