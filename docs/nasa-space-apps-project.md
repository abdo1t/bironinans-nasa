# Earth Analog Finder: NASA Space Apps Challenge 2026 project brief

**Challenge:** [Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/)
**Type:** static web app (React + Leaflet) with an offline Python data pipeline
**Version documented:** commit `98cb3d4` (branch `redesign-cinematic`, 2026-11-15), real data bundle `eaf-bundle/2` generated `2026-11-14T06:11:36+00:00`. The last tagged release candidate is `rc-2026-11-15` (`7ad092d`). A visual redesign was in progress, uncommitted, in the working tree when this brief was written. It is **not** described here.

> **In one sentence:** Earth Analog Finder ranks 11 places on Earth by how closely their measured terrain, climate, vegetation cover, geology and ground ice resemble a Moon or Mars site. For every match it shows what agrees, what does not, what is still unmeasured, and where each number came from.

---

## 1. Project summary

**What is an Earth analog?** It is a place on Earth that shares some conditions with a site on the Moon or Mars, such as bare volcanic rock, extreme dryness or frozen ground. Mission teams use analogs to rehearse rover driving, test drills and instruments, and train crews before they fly. No Earth site matches everywhere: Earth cannot reproduce lunar or Martian gravity, vacuum or radiation. A useful analog matches on the characteristics that matter for one specific test.

**Who would use it?** Mission planners, field-test coordinators, instrument teams and planetary scientists who need a shortlist of Earth places for a particular rehearsal. It is also aimed at students and the public, who can see why a desert or an Icelandic lava field is compared with Mars.

**What decision does it support?** *Which Earth places should we look at first for this test, and what do we still need to check on the ground?* The tool is a **screening aid**. A high score means resemblance on the selected criteria. It does not mean the site is suitable for a mission, and none of its results is a validated analog.

The project was built by our team for the NASA Space Apps Challenge 2026 (November 14–15). NASA's role is that of the challenge organiser and the provider of most of the open datasets listed in §3. NASA has not reviewed or endorsed this project.

---

## 2. How we address the challenge

The challenge asks teams to use open Earth, Moon and Mars data to identify and characterise Earth analogs. Teams should explain what makes a site analogous and where the analogy breaks down, and present the findings as a map, visualisation or tool. The table maps each part of that brief to what the app does now.

| Challenge objective | What Earth Analog Finder does | Where |
|---|---|---|
| Use open NASA Earth data with Moon/Mars data | NASA POWER, NASADEM and MODIS describe Earth sites. USGS Mars 2020 CTX terrain, LRO LOLA terrain and published mission results (Perseverance MEDA, LRO Diviner, LCROSS, M3) describe the targets. See §3. | `pipeline/fetch_*.py`, `pipeline/seed/targets_real.json` |
| Compare several locations / build a similarity metric | 7 criteria: terrain relief, aridity, surface temperature, daily temperature swing, bare ground, geology class and ground ice. Earth values are normalised on fixed Earth-wide bounds. A weighted similarity gives a 0–100 score. The Python and JavaScript implementations are tested for identical results. | `pipeline/scoring.py`, `web/src/lib/scoring.js`, [methodology](methodology.md) |
| Relate the analog to exploration | 4 research objectives (Rover testing, Habitat & construction, Ice exploration, General research) set the criterion weights. Each objective names a field test and the field measurement that is still needed. | `web/src/lib/presets.js`, `web/src/lib/missions.js` |
| Explain what is similar | "Why this match?" lists the matching criteria with both values, % similarity and the evidence type (measured, reanalysis, literature). | Site details, Explore cards |
| Explain where the analogy breaks down | "What's different?" names the criterion that costs the most points. "What still needs measuring?" lists missing data. A fixed note states that no Earth site reproduces gravity, vacuum or radiation. | Site details, Planetary Mirror |
| Map / visualisation / tool | Interactive world map with ranked markers, ranked result cards, Planetary Mirror (Earth and Moon/Mars terrain side by side at one ground scale), and a Compare view (radar chart and table for 2–3 sites). | `/explore`, `/mirror`, `/compare` |
| Look beyond well-known analog sites | Each site is tagged **catalogued analog** (a published analog study exists) or **uncatalogued candidate** (more than 300 km from every catalogued analog and no study found). | `novelKm`, `isNewCandidate` in `sites.geojson` |

**Established analogs vs. our candidates.** Of the 11 Earth sites, 9 are catalogued analogs with a published analog study: Atacama Desert (Yungay), Mars Desert Research Station (Hanksville), Death Valley, Haughton impact structure, McMurdo Dry Valleys, Río Tinto, Holuhraun lava field, Lanzarote (Timanfaya) and Dallol. Two are **uncatalogued candidates** selected by this project: the White Desert in Egypt (1,917 km from the nearest catalogued analog) and Wadi Rum in Jordan (1,779 km). We found no analog study for either. That does not prove none exists. Both are leads for field checking. They are not discoveries and not validated analogs.

**What part of search and discovery is implemented.** The app **screens and ranks a curated list** of candidate sites. Every site is scored with the same data pipeline and the same metric, so a new candidate can be added by adding one row to `pipeline/seed/sites_real.csv` and re-running the pipeline. **Not implemented:** a global, grid-based search of the whole Earth, automatic candidate generation, and machine-learning clustering. These remain future work (`CLAUDE.md` stretch goals). The real bundle covers **2 targets**, one per world: the Jezero Crater landing site and the Lunar South Pole connecting ridge. The other four targets in the original plan were dropped because their values could not be verified.

**Ranking and missing data.** A missing value is never counted as 0 or as a match. It is left out, and every score carries a **range**: the lowest and highest score that the missing criteria could produce. The app can rank by **Conservative lower bound**, the low end of that range, so that a site with gaps cannot outrank a fully measured site on the strength of unknowns. The Jezero rover scenario uses this ordering by default.

---

## 3. How we used NASA and other open data

All data is fetched **once, offline**, by the Python pipeline and shipped as static JSON in `web/public/data/`. The browser makes no calls to NASA or other data APIs at runtime. The only external requests are basemap tiles. Every value in the bundle carries its dataset, units, period, resolution and citation, and the app shows these under **View evidence**.

### 3.1 Scored data

| Agency / provider | Product | Variable or asset used | Feeds into | Link |
|---|---|---|---|---|
| NASA Langley (POWER project; MERRA-2 reanalysis) | POWER climatology API v2.10.1, 2001–2025, ~50 km grid cell | `PRECTOTCORR` (mm/day × 365.25 → mm/yr), `TS` (surface skin temperature), `TS_RANGE` (mean daily range) | Aridity, Surface temperature, Daily temperature swing for 8 of 11 sites. Death Valley, Dallol and Lanzarote are shown but not scored because the grid cell does not represent the site. | <https://power.larc.nasa.gov/> |
| NASA JPL | NASADEM_HGT v001 (SRTM reprocessing), 1 arc-second, read from Microsoft Planetary Computer | Elevation → relief: P99 − P1 in a 10 × 10 km window at a ~200 m common posting | Terrain relief for 8 sites. Earth terrain images. | <https://doi.org/10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001> |
| NASA (LP DAAC) | MODIS/Terra MOD13Q1 v061, 250 m, 16-day, 2022–2023, read from Microsoft Planetary Computer | `250m_16_days_NDVI`, inverted to "bare ground" | Bare ground for 10 of 11 sites (McMurdo has no usable composites) | <https://doi.org/10.5067/MODIS/MOD13Q1.061> |
| ESA / Copernicus (partner data) | Copernicus DEM GLO-30 Public, 2021 release, AWS Open Data | Elevation → relief (same method) | Terrain relief for Haughton, McMurdo and Holuhraun, which lie outside NASADEM coverage. Cross-check for the other sites. | <https://doi.org/10.5270/ESA-c5d3d65> |
| USGS / NASA Mars 2020 | Mars 2020 TRN CTX DTM `JEZ_ctx_B_soc_008`, 20 m (Fergason et al. 2020) | Elevation → relief (same method): **231 m** | Jezero terrain relief. Jezero terrain image. | [direct GeoTIFF (large file)](https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif) |
| NASA LRO (PDS Geosciences) | LOLA LDEM_875S_20M, 20 m south polar DEM (Smith et al. 2010) | Elevation → relief (same method): **1107 m** | Lunar South Pole terrain relief. Lunar terrain image on Home and in the Mirror. | [PDS LOLA GDR polar products](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/) |
| NASA mission results (literature) | Perseverance MEDA (Munguira et al. 2023, 2024), LRO Diviner (Williams et al. 2019), LCROSS (Colaprete et al. 2010), M3 (Li et al. 2018) | Published surface temperature, daily swing and ice values | Target values for temperature, swing and ground ice | Per-value citations in `pipeline/seed/targets_real.json`, e.g. [Munguira et al. 2024](https://doi.org/10.1029/2024JE008385), [Williams et al. 2019](https://doi.org/10.1029/2019JE006028) |
| Published literature | Per-site geology, ground ice and analog studies (peer-reviewed where available; some Wikipedia, agency pages and conference abstracts, marked as such) | Geology class, ground-ice yes/no, analog reference | Geology match, Ground ice, catalogued/uncatalogued tag | `pipeline/seed/sites_real.csv`, `pipeline/seed/analog_evidence.csv` |

### 3.2 Supporting data (not scored)

* **ASTER GDEM 30 m (NASA/METI)** via the public OpenTopoData API: site elevations for 8 sites, used only to decide whether a POWER grid cell represents the site.
* **HRSC–MOLA Blended DEM v2 (USGS; HRSC is ESA/DLR Mars Express)** and **MOLA MEGDR (NASA)**: cross-checks of the Jezero relief (product range 229.1–252.0 m).
* **LOLA LDEM_875S_5M**: cross-check of the lunar relief (product range 1093.4–1125.0 m).
* **Copernicus DEM GLO-90**: cross-check of the Earth relief.

### 3.3 Imagery used for display only

* **Terrain previews** on Home, Site details and the Planetary Mirror: shaded-relief images that we rendered offline from the same elevation models used for scoring (LOLA, CTX DTM, NASADEM, Copernicus). They show 27 km of ground at 60 m per pixel and mark the 10 × 10 km scoring window. Each is captioned "synthetic shading, not a photograph", and the elevations are not exaggerated.
* **Basemap tiles** from Esri (`server.arcgisonline.com`; Dark Gray Canvas at the documented commit). They provide geographic context only and carry no data.
* **Planet artwork** in the uncommitted redesign is procedural SVG illustration, labelled as such in its source. It carries no data.
* **NASA Moon/Mars Trek** is linked, not embedded.

### 3.4 Proxy values and mock data

* **Proxies:** Aridity uses POWER reanalysis precipitation, not rain gauges. Bare ground uses NDVI. Ground ice for the Moon is a region-level property: ice in nearby cold traps, measured by LCROSS in Cabeus about 100 km away, not on the ridge surface. Jezero surface temperature is the midpoint of a published range (210–232 K), because no annual mean is published. The aridity of 0 mm/yr for both targets is **definitional** (no liquid precipitation). Target values beyond Earth's range (Jezero daily swing, lunar temperature) are clipped to Earth's extreme. The app then says "near Earth's extreme", never "close to target".
* **Mock data:** a separate synthetic bundle (`web/public-mock/data/`, `npm run dev:mock`) exists for development only. Every mock value is labelled `MOCK`. A real build refuses to start if it contains any `MOCK` value or if a file hash differs from `manifest.json`. **No mock value appears in the real app or in this brief.**

### 3.5 One traceable example: dataset → measurement → ranking → screen

1. **Dataset:** NASA POWER climatology API v2.10.1, parameter `PRECTOTCORR`, at Holuhraun (64.85° N, 16.83° W), 2001–2025. The request URL is stored in the bundle and the raw response is cached in `pipeline/data/power/`.
2. **Measurement:** 862 mm/yr of precipitation for the ~50 km grid cell.
3. **Feature:** Aridity is normalised on the fixed 0–2000 mm/yr bound and inverted: 1 − 862/2000 = **0.569**. Jezero's target value is 1.0 (0 mm/yr), so the similarity is **57 %**.
4. **Ranking:** with the Rover testing weights (aridity 3 of a total of 17), this criterion costs Holuhraun **7.6 points**. That is its largest loss. Holuhraun still ranks #1 at 83/100.
5. **Screen:** Site details → **What's different?** shows "Largest shortfall: Wetter than the target · Aridity: 862 mm/yr vs the target's 0 mm/yr (−7.6 pts)". The Planetary Mirror shows the same pair of values, each with a link to its source.

---

## 4. Worked example: Mars, Jezero Crater, Rover testing

Recomputed from the bundle with `web/src/lib/scoring.js`, and checked in the running dev server at 1280×720 on 2026-11-15: Explore, Site details and the Planetary Mirror showed the values below. That dev server served the working tree, whose Home page had been redesigned (uncommitted). At the documented commit, the same choice is made on Home with **Choose** → **Mars** → **Rover testing** → **Find places on Earth**, or with the example card "Mars rover mobility testing — Jezero".

**Candidate:** **Holuhraun lava field, Iceland**, a catalogued analog (Voigt et al. 2025, *Planetary Science Journal*). It is ranked **#1 of 11** by conservative lower bound: **similarity 83/100, lower bound 83, 6 of 6 selected criteria measured, evidence coverage High**.

| Rank | Site | Lower bound | Similarity | Measured | Tag |
|---|---|---|---|---|---|
| 1 | Holuhraun lava field | 83 | 83 | 6/6 | catalogued |
| 2 | Atacama Desert (Yungay) | 71 | 71 | 6/6 | catalogued |
| 3 | Mars Desert Research Station (Hanksville) | 70 | 70 | 6/6 | catalogued |
| 4 | White Desert (Farafra) | 69 | 69 | 6/6 | **uncatalogued candidate** |
| 5 | Lanzarote (Timanfaya) | 66 | 94 (range 66–96) | 3/6 | catalogued |

**What helped it rank:**
* **Terrain relief:** 164 m at Holuhraun vs 231 m at Jezero, **96 % similar**. This is the strongest match and carries the highest Rover-testing weight (5).
* **Bare ground:** NDVI 0.02 (MODIS MOD13Q1), 98 % similar.
* **Geology:** basalt, matching the Máaz basaltic lava flows on the Jezero crater floor (literature, 100 %).

**One sourced measurement, with units and scale:** Holuhraun terrain relief = **164.3 m**, the P99 − P1 elevation range in a **10 × 10 km window**, aggregated to a **~200 m** common posting. It comes from Copernicus DEM GLO-30 (2021 release; native posting about 26 × 31 m), and the GLO-90 cross-check gives 164 m. The Jezero value of 231 m uses the same method on the USGS Mars 2020 CTX DTM (20 m). That is why the two numbers can be compared.

**Where it falls short:** aridity (862 vs 0 mm/yr, −7.6 points), daily temperature swing (4.87 °C vs Jezero's 55–105 K, beyond Earth's range, −5.1 points) and surface temperature (−4.4 °C vs about −52 °C, −3.0 points).

**Field measurement still needed:** rover-scale slopes, rock abundance and soil bearing strength along a planned test traverse. The 10 km relief metric cannot see these. Holuhraun's coordinate is also an arc-minute general location, not a surveyed point on the 2014–15 lava flow.

**The ranking metric.** *Similarity* is the weighted mean of per-criterion similarities over the criteria that have data, from 0 to 100. *Conservative lower bound* is the similarity the site would keep if every missing criterion were a total mismatch. Lanzarote shows why this matters: it has 94 similarity but only 3 of 6 criteria measured, so its lower bound is 66.

**What "evidence coverage" covers.** Coverage is the **share of the selected criterion weight** that has data on both the site and the target. It is High at ≥ 80 %, Medium at ≥ 50 %, and Low below that or with fewer than 3 criteria. It measures **completeness only**. It does not measure accuracy, spatial resolution, or whether a reanalysis cell represents the exact field site. "6 of 6 measured" means every selected criterion has a value, not that the value was observed on the ground.

**Second scenario (Moon → Lunar South Pole → Ice exploration).** Computed from the bundle with `scoring.js` for this brief. The live UI walkthrough for this scenario was recorded earlier in [first_visit_ux.md](first_visit_ux.md) and is consistent with these numbers. **McMurdo Dry Valleys (University Valley)** ranks #1: **88/100, range 68–91, 4 of 7 criteria measured, coverage Medium**. It ranks first because of ground-ice permafrost (literature, matching the lunar target's "yes"), a surface temperature near Earth's extreme (−35 °C; the lunar target is beyond Earth's range), and aridity. Bare ground (no MODIS composites) and geology (mixed, no single class) are missing. Haughton is #2 at 68 with 6 of 7 measured. Field measurement still needed: depth to ground ice and ice content, from boreholes or ground-penetrating radar.

---

## 5. What we built

### 5.1 From mission choice to evidence in four steps

1. **Home: choose a world and a research objective.** A one-line selection (e.g. "Moon · South Pole · Ice Exploration") has one **Choose / Change** control, which opens a chooser: world → research objective → criteria. The criteria and their importance are shown *before* the results (**Adjust** opens the weight sliders). There is one primary button, **Find places on Earth**, plus two one-click examples (Jezero rover testing, lunar south pole ice prospecting). *Helps the user* state the question before seeing answers.
2. **Explore: map and ranked list.** Numbered markers are coloured by score, and the legend marks uncatalogued candidates. A **Top matches** list beside the map gives each place its location, one evidence-backed reason (value here, target value, % similarity, evidence type) and its missing data ("not counted"). Selecting a card highlights its marker and the reverse, and the selection is kept in the URL (`sel=`). **Advanced options** hold the weight sliders, which re-rank instantly, and the ranking order. A badge such as "up 1" shows how a place moved after a weight or objective change. *Helps the user* see where the candidates are, why each ranks where it does, and how sensitive the order is to priorities.
3. **Why this match?** (Site details) leads with three questions: *What matches? · What's different? · What still needs measuring?* Each answer has both values, the % similarity and an evidence tag. Then come Similarity, Conservative lower bound, Possible range and Evidence coverage, each with a one-line explanation. **View evidence** opens every value with its units, dataset, period, resolution and citation link. *Helps the user* judge whether to trust the score and what to verify next.
4. **Planetary Mirror** puts the Moon/Mars site and the Earth place side by side as terrain images from their own elevation models: the same 27 km of ground, the same 60 m pixels, and the same 10 × 10 km window marked on both. A 2D takeaway shows one measured match and one important difference, with source links for both worlds, then *What could we test here?* and *Field measurement still needed*. *Helps the user* see that the comparison is like-for-like, and where it is not.
5. **Compare** (optional): 2–3 shortlisted places with an "In short" summary, a radar chart and a criteria × sites table. Missing cells read "Data pending".

### 5.2 Mobile, motion and accessibility

* **Phones:** the page opens on the results, with a **Map / List** switch that shares the selected place. The primary action stays on the first screen. Released screens were checked for horizontal overflow at 375 px and 768 px ([release readiness](release_readiness.md)).
* **Motion:** 200 ms transitions for world changes and selection, one gentle map pan only when the selected marker is off-centre, and a short reveal on explanations. Under `prefers-reduced-motion` all animation is removed and the pan is instant. No numeric value is ever animated.
* **Keyboard:** markers, sliders and actions are focusable, with a visible focus ring.

### 5.3 Engineering that keeps the claims honest

* **One scoring specification, two implementations.** `pipeline/scoring.py` is the source of truth and `web/src/lib/scoring.js` is a port. Both run a shared fixture with hand-calculated cases and must agree exactly. In dev mode the app recomputes the shipped ranking and warns on any mismatch.
* **Bundle integrity.** `manifest.json` records the bundle kind and a SHA-256 hash per file. `pipeline/validate_bundle.py` rejects NaN or infinite values, out-of-range values, values without a source, and any `MOCK` text in a real bundle.
* **Validation reported as-is.** Four humid control sites (Manaus, Freiburg, Can Tho, Galway) run through the same pipeline and score below every scorable known analog on numeric criteria. No bound or weight was tuned to the rankings. See [validation report](validation_report.md).
* **Static and offline.** There is no backend, database or login, and there are no runtime API or LLM calls.

**Tests on the documented commit (2026-11-15):** Vitest **88 passed** (7 files), pytest **104 passed**. The production build was not re-run for this brief because the working tree had uncommitted UI edits. The last recorded build pass is in [release readiness](release_readiness.md).

### 5.4 Contributions

* **Member 1:** Software Architecture & Product Development pass for the release candidate (`7ad092d`, tag `rc-2026-11-15`): the "Why this match?" flow, Planetary Mirror 2D takeaway, active ranking metric and the related checks. This is recorded in [release readiness §R](release_readiness.md#r-release-candidate-branch-mission-control-ui-2026-11-15).
* **Git history:** commits are authored by Omar Mohamed (30) and by "Claude" (4: the Mission Control UI v2 commits `611a731`–`64fefad`). Most commits carry an AI co-author trailer.
* **"Model 1":** no attribution under this name was found in the repository, so none is made here.
* **Team names:** still TODO in the README and on the About page. The team must fill them in.
* **Use of AI:** code and documentation were developed with an AI coding assistant (Claude) and reviewed by the team, as stated on the About page and in the README. Scientific values come from the cited datasets and publications, not from AI.

---

## 6. Demo and limitations

### 6.1 30-second demo (submission video)

No video link exists in the repository yet. The script below is the release-candidate script from [release readiness §R](release_readiness.md), with the clicks of the documented commit. If the uncommitted Home redesign is merged before recording, the first step becomes World **Mars** → Mission **Rover testing** → **Find places on Earth**.

| Time | Clicks | Shows |
|---|---|---|
| 0–5 s | Home → **Choose** → **Mars** → **Rover testing** → **Find places on Earth** (or the example card "Mars rover mobility testing — Jezero") | The question: where could rover driving for Jezero be rehearsed? |
| 5–12 s | Explore opens ranked by Conservative lower bound | Holuhraun #1, 83/100, 6 of 6 measured. Atacama 71, MDRS 70. |
| 12–22 s | **Why this match?** on Holuhraun → scroll to Planetary Mirror | Same 27 km ground. Terrain relief 164 m vs 231 m (96 %). Aridity 862 vs 0 mm/yr. |
| 22–30 s | Click the NASA POWER source link. Point to *Field measurement still needed*. | Every value links to its source. Next step: rover-scale slopes and soil strength on site. |

Avoid the words "discovered", "mission-ready", "NASA-approved" and "live data". The 2026 rule allows a video of ≤ 30 s or a deck of ≤ 7 slides. The 90-second live-judging script is in [demo_script.md](demo_script.md).

### 6.2 What the evidence supports, and what it does not

**Supported:** On the 7 landscape-scale criteria, with cited global datasets, Holuhraun is the closest fully measured Earth place to the Jezero landing site for rover-testing priorities. McMurdo Dry Valleys is the closest to the lunar south pole for ice-exploration priorities, with 3 criteria missing. Humid control sites score lower than known analogs on numeric criteria.

**Not supported or unverified:**
* Suitability for any mission, and rover-scale ground conditions (slope, rocks, soil strength). Relief is a 10 km metric.
* Point climate: POWER values are ~50 km reanalysis cells.
* Exact site locations: several coordinates are area reference points (Holuhraun, Timanfaya, White Desert, Wadi Rum, Dallol). The Río Tinto coordinate comes from a low-authority source.
* Whether the White Desert and Wadi Rum have been studied as analogs elsewhere. "Uncatalogued" means we found no study, not that none exists.
* Dust, wind, illumination, caves and subsurface, biology, access and permitting are not encoded. Gravity, vacuum and radiation cannot be reproduced on Earth.
* Coverage: 2 of the planned 6 targets and 11 sites. The rankings depend on the user's weights.

Full list: [methodology §4](methodology.md#4-limitations-and-open-issues).

### 6.3 Next practical field-validation step

For the Jezero rover scenario: survey a planned rover test traverse on the Holuhraun lava field. Measure rover-scale slopes and roughness (e.g. drone photogrammetry), rock abundance and soil bearing strength, and confirm that the scoring window actually covers the 2014–15 basalt flow. For the lunar ice scenario: measure depth to ground ice and ice content at University Valley with boreholes or ground-penetrating radar, and log surface temperature for a year to replace the reanalysis value.

---

**Further reading:** [Methodology](methodology.md) · [Data readiness](data_readiness.md) · [Terrain integration](terrain_integration.md) · [Validation report](validation_report.md) · [Release readiness (engineering handoff)](release_readiness.md) · [Judge Q&A](judge_qa.md)
