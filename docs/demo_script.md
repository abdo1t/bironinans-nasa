# Demo Scripts

All numbers below come from the real bundle (`web/public/data/`, generated `2026-11-14T05:20:03+00:00`) and [validation.md](validation.md). Before presenting, re-check them against the live app after any rebuild.

> **Binding submission rule (2026 Project Submission Guide):** the project demo must be a **video of 30 seconds or less** or a **slide deck of up to 7 slides, including the title and intro slides**. Projects that exceed these limits are not eligible for Global Judging. The demo must be hosted externally behind a public link that needs no login. The 90-second script in (a) is for **live judging or a local event only**. It is not the submission demo. These rules were taken from the team's notes on the 2026 guides; verify them on the official 2026 Project Submission Guide before submission.

---

## (a) 90-second live demo (local judging)

Setup: production build open at `/` in a 1280×720 or larger window; network tab clear; no shortlist. Narration is about 210 words (≈ 85 s at 2.5 words/s); rehearse with a timer.

| Time | Section | Action | Say |
|---|---|---|---|
| 0:00–0:12 | **Problem** | Home page visible. | "Teams rehearse Moon and Mars operations on Earth first. But comparing candidate Earth sites with a specific base site is usually done by expert judgement, with no common scale." |
| 0:12–0:25 | **Solution** | Point to the two world cards and **Mission scenarios**. | "We put NASA Earth data and NASA planetary data on one scale: POWER climate, NASADEM terrain and MODIS vegetation for Earth; Mars 2020 CTX and LRO LOLA terrain for the targets." |
| 0:25–0:50 | **Demonstration** | Click **"Mars rover mobility testing — Jezero"**. The list opens with the Rover testing preset and **Rank by: Guaranteed minimum**. | "Rover testing for Jezero, ranked by guaranteed minimum: the score a site keeps if its missing data were a total mismatch. Holuhraun leads at 83, Atacama 71, MDRS 70." |
| | | Switch **Rank by** to **Score**. | "By raw score, Lanzarote is 94, but its range is 66 to 96: only 3 of 6 criteria have data." |
| | | Switch back to **Guaranteed minimum**. Drag **Surface temperature** from 1 to 5. | "Weight temperature higher and the list reorders live: Haughton rises to second." |
| 0:50–1:10 | **Scientific evidence** | Reset the preset. Open **Holuhraun** → Site details. | "Holuhraun matches on terrain relief, bare ground and basalt; it falls short on aridity, 862 millimetres a year. Every value cites its source." |
| | | Scroll to **Data sources**. | "Four humid control sites, using the same NASA data, scored below every scorable known analog on numeric criteria: a sanity check, not proof. Nothing was tuned to the rankings." |
| 1:10–1:30 | **Impact** | Shortlist Holuhraun, Atacama and MDRS → **Compare (3)**. Show the radar. | "Planners get a transparent shortlist with stated limits: 10-kilometre relief and 50-kilometre climate, not rover-scale ground, and no Mars gravity or radiation. White Desert in Egypt is uncatalogued: a lead for field checking, not a validated analog." |

Backup facts if asked:
- For the Lunar South Pole, McMurdo Dry Valleys is #1 by score in every preset (86 balanced, range 54–92 on 4/7 criteria; 26 % of the score comes from the clipped temperature). By guaranteed minimum it is #6 with the rover preset.
- Holuhraun's coordinate is an arc-minute general location, not a point on the 2014–15 flow; the documented rover test (SAND-E) was at another Icelandic basalt field.
- Rover preset with Surface temperature at 5, by guaranteed minimum: Holuhraun 76 (#1), Haughton 64 (#2).
- Negative-control scores for Jezero balanced: analogs 58–76, controls 41–45 (numeric criteria only; 6 scorable analogs, 4 controls).

Avoid: "discovered", "NASA-approved", "mission-ready", "certified" and "saves cost". Do not present "set Geology to 0" as a finding.

---

## (b) Submission video (≤ 30 seconds)

Recording: screen capture of the production build with voice-over or English captions. If any AI-generated imagery is added, it needs a visible watermark (2026 rule). Do not use the NASA logo.

| Time | Screen | Narration / caption (61 words, ≈ 24 s at 2.5 words/s) |
|---|---|---|
| 0–5 s | Home → click "Mars rover mobility testing — Jezero" | "Which Earth sites resemble NASA's Jezero landing site for rover tests?" |
| 5–13 s | Ranked list (Guaranteed minimum): Holuhraun 83, Atacama 71, MDRS 70 | "NASA POWER, NASADEM, MODIS and Mars 2020 terrain data, on one scale. Ranked by guaranteed minimum: Holuhraun leads." |
| 13–19 s | Toggle Rank by → Score: Lanzarote 94, range 66–96 | "Missing data is shown: Lanzarote's 94 rests on only 3 of 6 criteria." |
| 19–25 s | Drag Surface temperature; list reorders | "Change priorities and the ranking updates instantly." |
| 25–30 s | Compare radar + limitations line | "Checked against control sites. Screening only: no Earth site has Mars gravity." |

Check before upload: time the voice-over with a stopwatch; the exported file must read ≤ 0:30; English; public link with no login; captions readable at 720p.

## (b) Slide deck alternative (≤ 7 slides, including title and intro)

No NASA logo, insignia or NASA-styled title; name NASA datasets only as data sources. Any AI-generated image needs a visible watermark.

1. **Title:** Earth Analog Finder: team name, challenge title, link to the app.
2. **Intro / problem:** Earth analog sites are chosen by expert judgement; the challenge asks which characteristics match and where the analogy breaks down.
3. **Data:** NASA POWER (MERRA-2), NASADEM, MODIS MOD13Q1, USGS Mars 2020 CTX DTM, LRO LOLA, MEDA, Diviner and LCROSS, with Copernicus DEM as partner fill for 3 sites. One 10 km / ~200 m relief metric on all three bodies.
4. **Method:** 7 criteria, fixed Earth bounds, weighted similarity, score range for missing data, "why" and "where it falls short" text.
5. **Demo result:** Jezero rover scenario screenshot. Guaranteed minimum: Holuhraun 83, Atacama 71, MDRS 70, White Desert 69. By score, Lanzarote 94 (range 66–96).
6. **Validation:** negative-control separation of 1.0 in 8/8 cases (numeric criteria only; 6 scorable analogs against 4 easy controls); McMurdo #1 for the Moon by score in all presets (4/7 criteria, range 54–92; 26 % of the score from the clipped temperature); geology-choice sensitivity reported, not adopted; bounds and weights not tuned to the rankings.
7. **Limitations and next steps:** ~50 km climate cells, 10 km relief, single geology class, 2 targets and 11 sites; no gravity, vacuum or radiation. Next: delta sub-target fixed from the literature, more sites, EMIT minerals. Slide footer: "Built with AI (SI) assistance, see About" and a link to References.

## (c) Which limit binds

The 30-second video / 7-slide deck limit is the **binding** rule for the submitted demo. Exceeding it makes the project ineligible for Global Judging. The 90-second script is only for a live presentation, where the local event allows one.
