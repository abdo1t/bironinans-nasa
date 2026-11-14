# Anticipated Judge Questions

Answers are grounded in the repository files named in each answer. All numbers come from the real bundle (`2026-11-14T05:20:03+00:00`) and [validation.md](validation.md).

**1. Why does Lanzarote rank #1 for Jezero?**
It ranks #1 **by score** (95 balanced) because of missing data, not because it is the best-evidenced analog. Its POWER grid cell is mostly ocean, so aridity, temperature and daily swing are shown but not scored (`sites_real.csv` `power_quality=low`). The score rests on 4 of 7 criteria: terrain similarity 0.91, bare ground 0.93, basalt = basalt and ice-free = ice-free. The excluded criteria carry 7 of 17 weight points, so the score could be anywhere from 56 to 97 (`scoreRange`). By guaranteed minimum it is #7, and Holuhraun is #1 (guaranteed minimum 71; score 76, range 71–77). In 500 random ±2 perturbations of the balanced weights, Lanzarote stayed #1 in 100 % of draws; perturbation does not address missing data. Larger weight changes do move it (with geology at 0, Death Valley is #1).

**2. Why surface (skin) temperature rather than air temperature?**
The Moon has no atmosphere, and the target reference values are surface temperatures (Perseverance MEDA, LRO Diviner). POWER `TS` is the like-for-like Earth quantity; `T2M` is still fetched for reference. The daily swing uses `TS_RANGE`, a mean daily range. It is not `TS_MAX − TS_MIN`, which in the annual climatology is an annual extreme range (`docs/methodology.md` §2).

**3. What does "clipped" mean?**
Normalization uses fixed Earth bounds (temperature −60 to +35 °C; swing 0 to 35 °C). Jezero's daily swing (55–105 K) exceeds the upper bound, and the lunar ridge temperature (≤ −73 °C) is below the lower bound. Both are set to the bound and flagged (`targets.json.clipped`). That criterion then measures how close a site comes to **Earth's extreme**, and the UI says "near Earth's extreme (target is beyond Earth's range)". The clipped share of McMurdo's Moon score is 26 %; for Jezero sites it is at most 8 % (`validation.md` §5).

**4. Why only 11 sites and 2 targets?**
We kept only values we could cite or measure. The other four mock targets (Mare Tranquillitatis, Marius Hills, Gale, Arcadia Planitia) were removed because their values were not verified. The ~40-site seed list was cut to 11 sites with cited coordinates and literature classes (geology for 10 of 11; McMurdo's mixed geology is left empty). The pipeline is generic: adding a site means one row in `sites_real.csv` plus re-running the fetchers.

**5. What does "new candidate" / novelty mean?**
`novelKm` is the great-circle distance to the nearest catalogued analog in `known_analogs.csv`. A site is an "uncatalogued candidate" if it is more than 300 km away **and** has no peer-reviewed analog study. That applies only to White Desert (1917 km) and Wadi Rum (1779 km). This means uncatalogued, not untested and not validated. Wadi Rum has hosted crewed analog missions (snippet-level evidence), and a planetary radar was tested near Farafra (Grimm 2017, proximity not verified).

**6. How do the negative controls work, and what do they prove?**
Four humid, vegetated places (Manaus, Freiburg, Can Tho, Galway) are run through the same POWER, NASADEM and MODIS pipeline and the same scoring. Only numeric criteria are used, because controls have no curated geology. Separation is 1.0 for all 8 target × preset combinations; for Jezero balanced, analogs score 58–76 and controls 41–45. This shows the score separates barren, dry places from wet, vegetated ones. It does **not** prove fine-grained analog quality, such as ranking one desert against another. Only 6 known analogs could be scored in this test (`validation_report.md` §3).

**7. How is NASA data used?**
NASA data is the core of the scores:
- NASA POWER (MERRA-2) supplies aridity, surface temperature and daily swing for 8 of 11 sites; the other 3 are shown but not scored.
- NASADEM v001 supplies terrain relief for 8 of 11 sites.
- MODIS MOD13Q1 v061 supplies bare ground for 10 of 11 sites.
- The USGS Mars 2020 CTX DTM supplies Jezero relief, and LRO LOLA LDEM supplies lunar relief.
- Target temperatures and ice come from NASA mission results (MEDA, Diviner, LCROSS).

Copernicus GLO-30 (ESA) fills terrain only for the three sites outside NASADEM coverage (`docs/terrain_integration.md`).

**8. What happens with missing data?**
A missing value is `null` with a stated reason, never 0. It is excluded from both the numerator and the denominator. A site needs at least 3 usable criteria to be scored. Every score shows its `scoreRange`, and the app can rank by its low end ("Guaranteed minimum"). Explore shows a data-availability notice when a selected criterion has no data, and Site details shows "data pending" per criterion.

**9. Is the top site suitable for rover testing?**
The tool does not assess that. It ranks resemblance at 10 km relief, ~50 km climate and site-level geology scale, not rover-scale slopes, rock abundance or soil strength. The scenario text says field reconnaissance and engineering assessment are still required (`scenarios.js`). For the Jezero rover scenario, Holuhraun leads by guaranteed minimum (83, all 6 criteria). Icelandic basalt has documented rover-autonomy testing (SAND-E; Ewing et al. 2020), but at Skjaldbreiðarhraun, not Holuhraun. Our Holuhraun coordinate is an arc-minute general location, not a point on the 2014–15 flow, so the terrain and NDVI windows may not sample the lava field itself.

**10. Did you tune the model so famous analogs rank high?**
We did not tune bounds or weights toward the validation rankings. No bound or weight has changed since Phase 3, when the real data were added. The terrain, NDVI and precipitation bounds date from the Phase 0 scaffold. The temperature and swing bounds were widened in the same Phase 3 commit that added the real POWER data, so git alone cannot show they were set before results were seen, and the Earth-wide reference values used for them are not cached in the repo. The CLAUDE.md Phase 4 instruction to tune the bounds was deliberately not followed. The Jezero geology alternative (delta clay, under which MDRS would score 81 and rank #1) is reported in `validation.md` §4 but not adopted, because adopting it after seeing the result would be post-hoc fitting.

**11. How robust are the rankings?**
For the Moon, by score with the balanced base, McMurdo stays #1 whichever criterion is removed (Kendall τ 0.75–1.0) and in 100 % of 500 ±2 weight perturbations. Like Lanzarote on Jezero, its lead partly rests on missing data (4/7 criteria, range 54–92); by guaranteed minimum it is #6 with the rover preset. For Jezero, removing terrain or geology changes the order most (τ 0.53 each). Removing geology makes Death Valley #1. The tested ends of the Jezero temperature range and of the terrain product ranges barely change the ranking (τ 0.89–0.93 and 1.0). Not tested: the Jezero geology class (it changes the whole top 5), the clipped values and the normalization bounds. The biggest sensitivity found is missing data, which is why the score range exists.

**12. How comparable is terrain across Earth, Mars and the Moon?**
The same metric is used everywhere: P99 − P1 in a 10 × 10 km window, aggregated to ~200 m and averaged over block offsets. The products differ: radar surface models on Earth, a stereo DTM on Mars, interpolated laser altimetry on the Moon. Product cross-checks give ranges of 229.1–252.0 m (Jezero) and 1093.4–1125.0 m (Moon). Earth cross-check DEMs agree with the scored values within 0–7.1 %. Treat terrain similarity as approximate.

**13. Why is Haughton low for Jezero when it is a famous Mars analog?**
The Jezero target is the basaltic landing site, and our taxonomy gives one class per site. Haughton is `sedimentary` (carbonate target rocks and crater-lake sediments), so it gets 0 for geology against basalt. With a delta (clay) target it would rank #5 (66). For the lunar south pole, where ground ice matters, Haughton is #2 with the ice preset (68).

**14. Can the app run offline, and does it call NASA APIs at runtime?**
Apart from basemap tiles, yes: the app makes no runtime API calls. The browser loads four static JSON files and a manifest, verifies their SHA-256 hashes, and re-scores locally, so scoring works offline once loaded. Map tiles need the network. There is no backend, database, login or LLM call.

**15. Did you use AI?**
Yes. Code and documentation were developed with an AI coding assistant (Claude), and the team reviewed the outputs. This is stated on the About page, as the 2026 rules require for code and data. Scientific values come from the cited datasets and publications, not from AI generation. (Team to confirm before answering: the 2026 rules also say SI must not be used to come up with the solution idea; only the team can state where the idea came from.)
