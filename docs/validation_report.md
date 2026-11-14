# Scientific Validation Report

Interpretation of the generated results in [validation.md](validation.md) (produced by `pipeline/validate_analogs.py` from the real bundle `2026-11-14T05:20:03+00:00`, `sites.geojson` sha256 `3eaf2176b13b…`). `validation.md` was regenerated on 2026-11-14 after the Death Valley evidence field in `analog_evidence.csv` was quoted; only that §6 row changed.

Scope: 2 targets (Jezero Crater, Perseverance landing site; Lunar South Pole connecting ridge, point C1), 11 Earth sites, 7 criteria, 4 presets. This is a screening model, not a site-certification method.

**No parameter was tuned to favour known analogs.** Since the Phase 3 commit (`b17e663`), no normalization bound or preset weight has changed. The terrain (0–1500 m) and NDVI (0–0.8) bounds date from the Phase 0 scaffold, before any real data existed. The precipitation bound (0–2000 mm/yr) also dates from Phase 0. Only the temperature (−30…30 → −60…35 °C) and swing (0…30 → 0…35 °C) bounds changed, in the same Phase 3 commit that added the real POWER data, so git alone cannot show that they were set before real results were seen. The Earth-wide reference values quoted for them ([methodology.md](methodology.md) §2) are not cached in the repo. The Phase 0 terrain bound was set for a different metric (a ~5 km box) than the current P99 − P1 over 10 km. CLAUDE.md Phase 4 says to "tune the bounds" if known analogs do not rank in the top third. We did not follow that instruction, because tuning toward the expected answer would make the validation circular. The Jezero geology alternative (§5 below) is reported, not adopted.

---

## 1. Verified similarity results

The balanced preset is the default used in `scores.json`. "Range" is `scoreRange`: the score if every criterion missing **on the site side** were a total mismatch (low end) or a perfect match (high end). "Min rank" is the rank by the low end (the app's "Rank by: Guaranteed minimum").

### Jezero Crater (target: basalt crater floor, ice-free, relief 231 m, swing clipped)

| Site | Score | Range | Criteria | Rank by score | Rank by guaranteed minimum |
|---|---|---|---|---|---|
| Lanzarote (Timanfaya) | 95 | 56–97 | 4/7 | 1 | 7 |
| Holuhraun lava field | 76 | 71–77 | 6/7 | 2 | **1** |
| Death Valley (Badwater Basin) | 67 | 39–80 | 4/7 | 3 | 10 |
| Atacama Desert (Yungay) | 64 | 64–64 | 7/7 | 4 | 2 |
| McMurdo Dry Valleys (University Valley) | 64 | 41–77 | 5/7 | 5 | 9 |
| Dallol (Danakil Depression) | 63 | 37–78 | 4/7 | 6 | 11 |
| Mars Desert Research Station (Hanksville) | 63 | 63–63 | 7/7 | 7 | 3 |
| White Desert (Farafra) | 62 | 62–62 | 7/7 | 8 | 4 |
| Wadi Rum | 59 | 59–59 | 7/7 | 9 | 5 |
| Haughton (Devon Island) | 57 | 57–57 | 7/7 | 10 | 6 |
| Río Tinto (Peña de Hierro) | 50 | 50–50 | 7/7 | 11 | 8 |

With the rover preset, the guaranteed-minimum ranking is Holuhraun 83, Atacama 71, MDRS 70, White Desert 69, Lanzarote 66 (score 94), Haughton 65, Wadi Rum 63, Río Tinto 55, Death Valley 50, Dallol 47 and McMurdo 38 (`validation.md` §1b).

### Lunar South Pole, C1 (target: anorthosite, ice in nearby cold traps, relief 1107 m, temperature clipped, swing unavailable)

| Site | Score | Range | Criteria | Rank by score | Rank by guaranteed minimum |
|---|---|---|---|---|---|
| McMurdo Dry Valleys | 86 | 54–92 | 4/7 | 1 | 1 |
| Lanzarote | 58 | 36–74 | 4/7 | 2 | 8 |
| Holuhraun | 57 | 53–59 | 5/7 | 3 | 2 |
| Haughton | 53 | 53–53 | 6/7 | 4 | 3 |
| Wadi Rum | 52 | 52–52 | 6/7 | 5 | 4 |
| Atacama | 48 | 48–48 | 6/7 | 6 | 5 |
| MDRS | 45 | 45–45 | 6/7 | 7 | 6 |
| White Desert | 43 | 43–43 | 6/7 | 8 | 7 |
| Death Valley | 40 | 25–62 | 4/7 | 9 | 10 |
| Dallol | 36 | 22–60 | 4/7 | 10 | 11 |
| Río Tinto | 34 | 34–34 | 6/7 | 11 | 9 |

McMurdo is #1 by score in all four presets. With the ice preset, Haughton is #2 (68, no missing data).

---

## 2. Consistency with documented analog use

Source: `validation.md` §6, built from `pipeline/seed/analog_evidence.csv`. "Opened" means the source was read, not just a search snippet.

### Consistent

| Observation | Evidence |
|---|---|
| McMurdo is #1 for the lunar south pole by score in all four presets. By guaranteed minimum it is #1 in balanced (54) and ice (68, tied with Haughton and ahead on score), but #4 in habitat (44) and #6 in rover (49), because its score rests on 3–4 criteria (no NDVI, no geology class; range 54–92 balanced). | Documented cold and ground-ice analog: Icebreaker drilling into ice-cemented ground (McKay et al., NTRS 20140011650) and Heldmann et al. 2013, doi:10.1016/j.pss.2013.05.019. |
| Haughton is #4 (balanced) and #2 (ice preset) for the Moon. | K10 lunar-analog rover survey (Fong et al.); ground ice confirmed in polygon troughs (Osinski et al., LPSC 2020, NTRS 20200001979). |
| Holuhraun is #2 by score and #1 by guaranteed minimum for Jezero (balanced and rover). | Basaltic rover-autonomy field test (SAND-E; Ewing et al. 2020, NTRS 20200001815). **Caveats:** SAND-E worked at Skjaldbreiðarhraun, not Holuhraun. The site's own analog citation (Voigt et al. 2025, PSJ, doi:10.3847/PSJ/adb5f1) treats Holuhraun as an analog for young volcanic terrain in Elysium Planitia, not Jezero. Our coordinate is an "arc-minute general location, not a point on the 2014–15 flow" (`sites_real.csv` `coord_precision`), so the terrain and NDVI windows may not sample the lava field itself. |
| Atacama (#2) and MDRS (#3) are near the top by guaranteed minimum for Jezero, with 7/7 criteria. | Atacama: NASA ARADS rover drilling; Navarro-González et al. 2003, doi:10.1126/science.1089143. MDRS: inverted fluvial channels (Clarke & Stoker 2011, NTRS 20110023235). |
| Río Tinto is last for Jezero (#11). | Its documented use is as a Meridiani **sulfate** analog (Fernández-Remolar et al. 2005, doi:10.1016/j.epsl.2005.09.043), not a Jezero analog. |
| McMurdo drops to #9 (balanced) and #11 (rover) for Jezero by guaranteed minimum. | Its Mars use is as a ground-ice analog, not a Jezero-type crater-floor or delta site (Heldmann et al. 2013). |

### Disagreements and why

| Result | Cause |
|---|---|
| **Lanzarote is #1 by score for Jezero in all four presets** (95 balanced, 4/7 criteria, range 56–97). | **Missing data.** The POWER cell is mostly ocean, so aridity, temperature and swing are shown but not scored (`sites_real.csv` `power_quality=low`). The score rests on four criteria: terrain (similarity 0.91), bare ground (0.93), geology basalt = basalt (1.0) and ice no = no (1.0). The 7 missing weight points (of 17) could put it anywhere from 56 to 97. By guaranteed minimum it is #7. The cited analog paper studies the La Corona lava tubes, not Timanfaya. |
| Lanzarote's terrain value (370 m) may be biased. | **Coastal relief artefact.** 16 % of window pixels lie within ±1 m of 0 m (`terrain.csv` note), so P1 may be sea level and relief may be overstated. For Jezero (231 m), a lower true relief would move it *closer* to the target, so the artefact does not inflate its Jezero score. For the Moon (1107 m) it inflates the terrain similarity slightly. |
| Death Valley is #3 (67, range 39–80) and Dallol #6 (63, range 37–78) by score for Jezero. | **~50 km POWER cells.** Both fail the representativeness rule: the cell elevation is 846 m against the −86 m basin floor, and 1063 m against the −99 m Dallol plain (the cell reports 449 mm/yr of rain). Only 4/7 criteria remain. Death Valley's documented NASA tests (Lander Vision System, Scarecrow) took place at Mars Hill and near the dunes, not at our Badwater point. Its site-level analog citation is a Badwater remote-sensing analog study (Baldridge et al. 2004, doi:10.1029/2004JE002315). |
| Haughton is #10 (57) and MDRS #7 (63) for Jezero by score. | **Single geology class.** The target is the landing-site basalt. Haughton (`sedimentary`, crater-lake sediments; Osinski & Lee 2005, doi:10.1111/j.1945-5100.2005.tb00152.x) and MDRS (`clay`) get 0 for geology. The taxonomy has no `carbonate` class. With the delta (`clay`) as the target instead, MDRS would be #1 (§5). |
| Atacama is penalised on temperature for Jezero (similarity 0.25 in the rover preset). | **Variable choice.** We compare annual-mean surface (skin) temperature: Atacama 18.95 °C against about −52 °C at Jezero. Documented rover use of Atacama rests on dryness, soils and access, not temperature. |
| Wadi Rum (59) and White Desert (62) score close to MDRS (63) for Jezero. | Their scores come from climate, relief and bare ground. Neither has geology support for a basalt target, and no site-specific analog study was found for either (`sites_real.csv` `analog_lit = no`). White Desert's only evidence is a 2005 GPR field test near Farafra mentioned in Grimm 2017 (PSS; source partly read, proximity not verified); Wadi Rum's is snippet-only. Their scores are **not** analog validation. |
| Lanzarote is #2 for the Moon (58, range 36–74). | Missing POWER data again (4/7 criteria). Geology basalt is only "related" to anorthosite (0.5 credit). By guaranteed minimum it is #8. |

### What this shows

- Where the model has complete or near-complete data, its orderings agree with documented use in most cases: Haughton for the Moon; Holuhraun, Atacama and MDRS for Jezero by guaranteed minimum; Río Tinto low for Jezero. McMurdo's Moon #1 by score also agrees, but it rests on 4/7 criteria (range 54–92), and 26 % of it comes from the clipped temperature.
- The largest disagreements come from **missing data** (Lanzarote, Death Valley, Dallol, McMurdo on Jezero) and from the **single geology class** per site (Haughton and MDRS under a basalt target). Weight perturbation moves ranks less (§4). Site-side measurement noise (POWER, DEM, NDVI) was not tested. The score range and the guaranteed-minimum ranking make this visible instead of hiding it.
- The model measures **environmental similarity at 10–50 km scale**. Documented analog use also depends on access, logistics, specific landforms and history, which the model does not encode.

---

## 3. Negative controls: what they do and do not prove

**Design** (`validation.md` §2; `pipeline/seed/controls.csv`, `pipeline/data/controls.csv`): four humid, vegetated, non-analog places get the **same** data (NASA POWER, NASADEM relief, MODIS NDVI) and the **same** scoring: Manaus, Freiburg/Black Forest edge, Can Tho (Mekong Delta) and Galway. The controls have no curated geology or ice class, so the comparison uses numeric criteria only, for analogs and controls alike.

**Result:** separation is 1.0 for every target × preset (8 of 8). Every scored known analog outscores every control. Examples: Jezero balanced, analogs 58–76 against controls 41–45; Moon balanced, analogs 46–85 against controls 21–34. The best control ranks #9, below all 8 scored real sites.

**What it shows:** a sanity check that the score separates barren, dry places from wet, vegetated ones using NASA data alone, without the curated categorical classes.

**What it does not show:**
- **Fine-grained analog quality.** The controls are easy cases: up to 1958 mm/yr of rain and NDVI up to 0.72. The test does not show that the model can rank one desert against another correctly.
- **Correlated criteria.** Aridity, bare ground and temperature co-vary on Earth, so "desert-ness" is effectively counted more than once. The controls are wet, vegetated and humid on these same correlated axes, which makes a separation of 1.0 close to expected.
- **Coverage.** Only 6 known analogs are scored in the numeric-only test (Atacama, MDRS, Haughton, McMurdo, Río Tinto, Holuhraun). Death Valley, Dallol and Lanzarote have only 2 numeric criteria there and are not scored.
- **Sample size.** 4 controls is a small sample. Can Tho has no NDVI (only 5 of 45 composites usable; 6 are needed), so it was scored on 4 numeric criteria for Jezero and 3 for the Moon (the lunar swing is unavailable).
- **Representativeness.** The controls are city reference points (`controls.csv` `coord_source`: "Wikipedia infobox (city reference point)").

---

## 4. Robustness

| Test (`validation.md` §3) | Result | Interpretation |
|---|---|---|
| Leave one criterion out, balanced (Kendall τ) | Jezero: τ 0.53–0.82. Lanzarote stays #1 unless geology is removed (then Death Valley is #1). Moon: τ 0.75–1.0, and McMurdo stays #1 in every case. No site loses its score. | The Moon top rank does not depend on any single criterion. The Jezero order depends most on terrain and geology (τ 0.53 each). |
| Random weight perturbation (±2 per weight, clamped 0–5, 500 draws, seed 20261114) | Lanzarote is #1 for Jezero in 100 % of draws; McMurdo is #1 for the Moon in 100 %. Holuhraun's 5–95 % rank interval is 2–8; McMurdo's on Jezero is 2–11. | Within ±2 perturbations of the balanced weights, Lanzarote stayed #1 in 100 % of draws. Its advantage comes from missing data, which perturbation does not address; the score range does. Larger weight changes do move it: with geology at 0, Death Valley is #1 (§3a); with terrain and bare ground both at 0, Lanzarote has only 2 usable criteria and is not scored. |
| Target-value uncertainty, balanced | Jezero temperature at −63.15 °C and −41.15 °C (ends of the MEDA range): τ 0.93 and 0.89. Terrain product range (Jezero 229.1–252.0 m; Moon 1093.4–1125.0 m): τ 1.0. | Rankings are insensitive to the tested ranges of Jezero temperature and target relief (τ ≥ 0.89). Not covered by this test: the Jezero geology class (§5 changes the whole top 5), the two clipped values (untestable by construction) and the normalization bounds (terrain 1500 m, NDVI 0.8, precipitation 2000 mm/yr), which every numeric similarity scales with. |

---

## 5. Jezero geology choice (reported, not adopted)

The target point is the landing site on the basaltic crater floor (Máaz formation; Sun et al. 2023; Farley et al. 2022). The delta a few kilometres away is clay and carbonate.

| Target geology | Top 5 (balanced) |
|---|---|
| basalt (bundle) | Lanzarote 95, Holuhraun 76, Death Valley 67, Atacama 64, McMurdo 64 |
| clay (delta, not adopted) | MDRS 81, White Desert 71, Wadi Rum 68, Death Valley 67, Haughton 66 |

By leave-one-out τ, geology is tied with terrain as the most influential single criterion for Jezero (0.53 each), and it is the only criterion whose removal changes #1. We fixed the target point from the landing-site coordinates before seeing the results. Switching it to the delta because MDRS and Haughton would then rank higher would be post-hoc fitting. A defensible fix is two separate targets (floor and delta), each fixed from the literature first.

---

## 6. Share of score from clipped target values

Where a target value is beyond Earth's range, it is set to the bound. That criterion then measures how close a site comes to **Earth's extreme**, not to the target value. The UI wording says "near Earth's extreme (target is beyond Earth's range)".

| Target | Clipped criterion | Share of balanced score (`validation.md` §5) |
|---|---|---|
| Jezero | daily swing (55–105 K, above Earth's 35 °C bound) | 0–8 % (Atacama and Wadi Rum 8 %) |
| Moon | surface temperature (≤ −73 °C, below Earth's −60 °C bound) | 0–26 % (McMurdo 26 %, Haughton 19 %, Holuhraun 15 %) |

For the Moon, a quarter of McMurdo's 86 rests on its closeness to Earth's cold bound (−60 °C; McMurdo's annual-mean skin temperature is −35.25 °C) rather than on a match to the lunar temperature.

---

# Data Quality & Uncertainty Assessment

Counts are for the 11 Earth sites and 2 targets in the real bundle (`sites.geojson` `norm` and `provenance`, `targets.json`).

| Class | Values | Where | Main uncertainty |
|---|---|---|---|
| **Derived from instrument products** (computed by us from a cited product; cross-checked where possible) | Earth terrain relief, 11/11 | NASADEM v001 for 8 sites; Copernicus GLO-30 for Haughton, McMurdo and Holuhraun (`terrain.csv`) | Cross-check DEM within 0–7.1 % (Dallol: 36.8 m against 34.2 m; all others ≤ 2.2 %). Block-offset spread up to 220.6–258.2 m (Death Valley). Lanzarote coastal artefact. DSM, not bare earth. |
| | Bare ground (NDVI), 10/11 | MODIS MOD13Q1 v061, 2022–2023 (`ndvi.csv`) | Haughton: 10 usable composites, good-pixel share 0.21 (snow/fill), so the value likely reflects mainly the snow-free season (inferred from these shares; `ndvi.csv` does not state it). Holuhraun: 17 composites, share 0.37 (good 5.3 %, marginal 31.7 %, snow/ice 29.8 %), and the window may not sit on the lava field (coordinates row below). |
| | Jezero relief 231.1 m; Moon relief 1106.9 m | USGS Mars 2020 CTX DTM; LRO LOLA LDEM_875S_20M (`planetary_terrain.csv`) | Product range 229.1–252.0 m and 1093.4–1125.0 m. LOLA is interpolated between laser tracks. The C1 window includes crater-flank slopes. |
| **In-situ / orbital literature values** | Jezero temperature, Jezero swing, Moon temperature, Moon ice | Munguira et al. 2024 and 2023 (MEDA); Williams et al. 2019 (Diviner); Colaprete et al. 2010 (LCROSS) | See approximations and out-of-range rows. |
| **Reanalysis** | Aridity, surface temperature, swing: 8/11 scored | NASA POWER v2.10.1, MERRA-2, 2001–2025, 0.5° × 0.625° cell (`power.csv`) | The cell value is not a point value. Reported to 0.01 mm/day (about ±1.8 mm/yr). MDRS and Wadi Rum cells still average mixed terrain. |
| **Literature classifications** | Geology 10/11; ground ice 10/11 | Per-site citations in `sites_real.csv` | One dominant class per site. Ice "no" for hot sites relies on a global permafrost zonation (Gruber 2012), not checked per pixel. |
| **Definitional** | Target aridity 0 and bare ground (both targets) | NASA Mars and Moon Facts | Physical constraint, not a measurement. |
| **Approximations** | Jezero temperature −52.15 °C, the midpoint of 210–232 K; normalized 0.0826 (could be 0–0.20) | `targets.json` provenance | Midpoint derived by us; no annual mean is published. |
| | Moon temperature: Diviner summer ≈ 200 K used as an upper bound | `targets.json` | Clips to 0 whatever the true annual mean. |
| | Lunar ice is region-level (cold traps; Cabeus about 100 km away) | `targets.json` | Not a property of the sunlit ridge. |
| | Coordinates: area reference points (Holuhraun: an arc-minute general location, not a point on the 2014–15 flow; Timanfaya, White Desert, Wadi Rum, Dallol); Haughton to the arc-minute; Río Tinto from a low-authority source | `sites_real.csv` `coord_precision` | The 10 km and 50 km windows may not sit on the documented analog field site. White Desert's window median elevation is 27 m (NASADEM) and 28.5 m (Copernicus); the earlier audit flagged this as a possible coordinate problem. |
| **Missing** (excluded, never scored as 0) | McMurdo NDVI (no MOD13Q1 composites for the window); McMurdo geology (mixed dolerite and sandstone); Holuhraun ice (site at about 750 m, against a modelled permafrost limit of 600–900 m); Moon daily swing (none published) | `provenance.status = unavailable` | Shown in the score range. |
| | POWER criteria for Death Valley, Dallol and Lanzarote: shown but not scored | Representativeness rule (> 500 m elevation difference, or an island smaller than the cell) | Accounts for 7 of 17 balanced weight points on these sites. |
| **Out of Earth's range** (clipped and flagged) | Jezero daily swing (above); Moon surface temperature (below) | `targets.json.clipped` | The criterion measures closeness to Earth's extreme (§6). |

## Data-quality controls in place

- `pipeline/validate_bundle.py`: manifest hashes; no NaN or Infinity; norm values in [0, 1]; a source and provenance record for every non-null value; no MOCK text in the real bundle; `scores.json` equals a fresh recomputation.
- The app refuses a bundle whose kind or SHA-256 does not match `manifest.json`.
- Python/JS scoring parity runs on a shared fixture (`pipeline/tests/fixture.json`).
- Missing values are `null` with a reason, never 0, and every score carries its `scoreRange`.

## Limitations of this validation

- 11 sites and 2 targets. 9 of 11 sites are catalogued analogs, so "known analogs rank high" is partly a base-rate effect. The negative controls address this only coarsely.
- `analog_evidence.csv` has one evidence row per site–target pair, assembled by the team. It is not a systematic literature review. Wadi Rum's evidence is snippet-only.
- No Earth site reproduces lunar or Martian gravity, vacuum or radiation.
