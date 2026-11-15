# Raw Data — Analog Portfolio Planner

Raw, unprocessed inputs for the Data plan in *Problem Definition & Innovation Brief*.
Every file is listed in `manifest.csv` with its source URL, size and SHA-256.
`sites.csv` lists the 12 Earth sites. `download_log.txt` is the full download log.

Re-create or resume everything (files already present are skipped) with:

```bash
python -I data-tools/download_raw_data.py
```

## Layout

```
Raw Data/
├── sites.csv  manifest.csv  download_log.txt
├── Moon/
│   ├── LOLA_DEM_80S_80m/              south polar elevation, 80 m
│   ├── LOLA_Illumination_South/       average solar illumination, 85°S (60 m) and 75°S (120 m)
│   ├── Diviner_PolarResource_South/   avg/max temperature + ice-stability depth
│   └── MiniRF_CPR_Global_32ppd/       radar circular polarization ratio
└── Earth/
    ├── Copernicus_DEM_GLO30/<site>/   1°×1° elevation tile, 30 m
    ├── Sentinel1_RTC/<site>/          10 km × 10 km radar cut-out, ~10 m
    ├── MODIS_LST_8day/<site>/         50 km × 50 km land surface temperature, 1 km, one 8-day composite per month
    ├── MODIS_NDVI_16day/<site>/       50 km × 50 km vegetation index (MOD13A1), one 16-day composite per month, NDVI = value × 0.0001 (10 sites; none for Devon and McMurdo). Get it with `python data-tools/download_ndvi.py`
    └── EMIT_L2B_Minerals/<site>/      surface mineral map + uncertainty, ~60 m (6 sites; see gaps)
```

## Data plan coverage

| Requirement | Moon (target) | Earth (candidates) | Status |
|---|---|---|---|
| Slope and roughness | LOLA DEM 80°S, 80 m | Copernicus DEM GLO-30 | ✅ both (compute slope from DEM) |
| Lighting / low sun | LOLA-derived illumination | computed from DEM + latitude | ✅ Moon; Earth is computed, not downloaded |
| Temperature range | Diviner polar resource product | MODIS MOD11A2 LST | ✅ both |
| Ice-rich, cold ground | Mini-RF CPR + Diviner ice depth | Sentinel-1 RTC | ✅ both (LEND skipped, see gaps) |
| Mineralogy | — (see gaps) | EMIT L2B minerals | ✅ Earth, 6 of 12 sites; ❌ no Moon layer |
| Visual check | — | NASA Worldview (online) | not a download |

## How to read each dataset

**LOLA DEM** `ldem_80s_80m_float.img`: raw 32-bit little-endian float, 7600 × 7600, polar stereographic centred on the south pole. Values are height in **km** relative to a 1737.4 km sphere. Full geometry is in the `.lbl` file. GDAL opens it directly through the `.lbl`.

**LOLA illumination** `AVGVISIB_*S_*.TIF`: GeoTIFF, polar stereographic. Each value is the average solar illumination, computed hourly over an 18.6-year lunar nutation cycle (Mazarico et al. 2011, NASA GSFC PGDA product 69). Scaling is already applied in the GeoTIFF. The 85°S file covers the core base region at 60 m, and the 75°S file gives wider context at 120 m.

**Diviner polar resource product** `dlre_prp_south.tab`: fixed-width ASCII table, 2,880,000 rows (triangular facets). Useful columns: `tri_clon`, `tri_clat` (degrees), `temp_avg`, `temp_max` (K) and `ice_depth` (m; −999 means no stable ice). Column definitions are in `dlre_prp.fmt` and the `.xml` label. Coverage: 75–90°S.

**Mini-RF CPR** `global_cpr_32ppd_simp_0c.img`: 32-bit float, 11520 × 5760, simple cylindrical (32 pixels per degree, about 950 m). Missing value is −1.797e308. A high CPR (above about 1) means rough surfaces or possible ice. Note that the poles are stretched in this projection.

**Copernicus DEM GLO-30**: Cloud-Optimized GeoTIFF, EPSG:4326, 1 arc-second, heights in m (EGM2008). It covers the poles, unlike SRTM.

**Sentinel-1 RTC**: GeoTIFF, EPSG:4326, 1000 × 1000, band 1 is **linear gamma-naught backscatter** (10·log10 gives dB) and band 2 is a mask. Most sites are VV+VH. Devon Island is **HH+HV** and McMurdo is **HH only**: polar scenes use different polarizations, so compare like with like. The scene date is in the file name (Dec 2025).

**MODIS LST** `MOD11A2_<date>_LST_day_night.tif`: GeoTIFF, EPSG:4326, 50 × 50. Band 1 is daytime LST, band 2 night-time LST, band 3 a mask. The values are scaled: **kelvin = value × 0.02**, and 0 means no data (cloud, or ocean around Lanzarote). The year is **2024**, except Devon Island, which uses **2023** because the catalog is missing most of 2024 for its tile.

**EMIT L2B minerals** `EMIT_L2B_MIN_002_<date>.nc` and `EMIT_L2B_MINUNCERT_002_<date>.nc`: NetCDF4 (HDF5) files, one pair per site, the least-cloudy v002 scene whose footprint contains the site (cloud 0% except Lanzarote, 12%). `MIN` holds the matched mineral group per pixel and its fit; `MINUNCERT` holds the matching uncertainty. Pixels are about 60 m, and the swath is not georeferenced to a map grid: use the `latitude` / `longitude` geolocation arrays (or the EMIT tools) to place it. Open with `xarray` or `netCDF4`.

## Gaps and caveats (for the uncovered ledger)

- **EMIT minerals cover 6 of 12 sites:** Atacama, Meteor Crater, Death Valley, Lanzarote, Dallol and Pilbara. There is **no EMIT scene** for Devon, McMurdo, Iceland or Mistastin (too far north or south), so those get *unknown* for mineralogy. The Amazon control only has an older v001 scene, which is not downloaded, so it is also *unknown*. **Egypt** needs a new scene for its corrected point (the old one ends just north of it); fetching it needs an Earthdata token, see below. Until then Egypt is *unknown* for mineralogy.
- **EMIT needs an Earthdata login.** The files are already downloaded here. To re-create them, generate a token at urs.earthdata.nasa.gov (approve "LP DAAC Data Pool" under Authorized Apps), then in PowerShell: `$env:EARTHDATA_TOKEN = "<token>"` and `python -I data-tools/download_emit.py`. Do not paste the token anywhere shared, and revoke it afterwards.
- **Lunar mineralogy:** the Diviner silicate (Christiansen feature) maps are not reliable at the poles, so the south-pole target has no mineral layer.
- **LEND hydrogen skipped:** PDS only has raw neutron counts, not maps. Diviner ice depth and Mini-RF CPR cover the ice requirement.
- **Radar bands differ:** Mini-RF is S-band (12.6 cm) and Sentinel-1 is C-band (5.6 cm). Treat CPR and backscatter as related but not equivalent.
- **Mars not included:** the plan makes Mars optional. MOLA, CRISM and THEMIS are in PDS if time allows.
- **Site coordinates** for Egypt and Pilbara were corrected on 15 Nov 2026. Pilbara now uses the published Strelley Pool locality (S21.11094, E119.13709; Retallack et al. 2023). Egypt now sits on the Kharga Depression floor (25.58 N, 30.62 E), in the yardang field Breed & McCauley describe north of Kharga; the old point (25.9 N, 30.4 E) was on the limestone plateau. The exact Egypt point was picked on the DEM and should still be confirmed on imagery. The superseded cut-outs are kept locally in `_superseded_2026-11-15/` (not tracked).
- Sentinel-1 and MODIS cut-outs come through Microsoft Planetary Computer's open mirror of the same ESA and NASA data, because the official portals need a login.
