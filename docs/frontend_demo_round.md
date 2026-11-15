# Frontend enhancement & demo preparation — development round report

Date: 2026-11-15 · Scope: `web/src` only. No scientific source data, pipeline code, scoring code
(`scoring.js` / `scoring.py`) or bundle files were changed. **Nothing is committed** (the folder is not a
git repository); the full change set is in [`frontend_demo_round.patch`](frontend_demo_round.patch) for review.
The 30-second submission script stays in [`demo_script.md`](demo_script.md); §11 below is the 2–3 minute live script.

Verification at the end of the round: `npm test` → **105 passed** (91 before + 14 new), `npm run build` ✓,
`oxlint` → 1 warning (pre-existing, `AppState.jsx`).

---

## 1. Frontend improvements completed

| # | Change | Files |
|---|---|---|
| 1 | **Live ranking** panel (replaces the old top-5 preview): previous → current rank, score change, animated reorder, explanation of each move, places that drop out | `components/LiveRanking.jsx`, `lib/rankShift.js`, `styles/ranking.css` |
| 2 | **Same target, different objectives** strip on Explore: top 3 per research objective, side by side, one-click "Use this objective" | `components/ObjectiveLeaders.jsx` |
| 3 | **Guided live demo** (12 steps, 2–3 min) driving the real app | `components/DemoGuide.jsx`, `lib/demoSteps.js`, `styles/demo.css` |
| 4 | **3D terrain: hover elevation probe** (stored DEM cell value + datum + distance) | `three/TerrainPair3D.jsx` |
| 5 | **Elevation profile** of both places on one chart, scoring window shaded | `three/TerrainPair3D.jsx`, `styles/three.css` |
| 6 | Ranked result cards slide to their new position (shared FLIP hook) | `lib/useFlip.js`, `components/SiteCards.jsx` |
| 7 | Evidence labels: `measured` / `estimated` supported; **unknown statuses are shown, never hidden** | `lib/format.js`, `components/Tags.jsx`, `index.css` |
| 8 | Robustness for more data: 6 compare colours (was exactly 3); demo text/actions no longer assume 7 criteria or a `terrain` criterion; test that every preset weights every criterion in `features.json` | `lib/format.js`, `lib/demoSteps.js`, `lib/presets.test.js` |
| 9 | Small fixes: "no  value" double space (MatchAnalysis); TerrainPair said "only with the real data bundle" when a *target* image was simply missing | `MatchAnalysis.jsx`, `TerrainPair.jsx` |
| 10 | `AppState.setShortlist(ids)` (used by the demo; validates ids, caps at 3) | `state/AppState.jsx` |

## 2. Live ranking improvements

Every number comes from the existing engine: `scoring.js rankSites` + `explain.js orderRanking`, i.e. exactly
what AppState uses. The comparison ranking is the same function with other weights (`rankShift.js rankWith`).

- **Previous → current position** per place (`was #9`, `▲7` / `▼2`, `new`): symbol + word + position, never
  colour alone; screen-reader text "up from rank 9".
- **Score change** beside each score. When ordered by *Most complete evidence first*, the shown number is the
  conservative lower bound (`≥71`) and its change is the change of that bound — number and delta always refer to
  the same metric (the old preview showed the similarity score while ordering by the bound).
- **Baseline toggle**: *vs objective* (the objective's default weights) or *vs last change*.
- **What changed**: chips such as `Terrain relief 5→0`.
- **New best match** notice when the leader changes: "the recommendation depends on the research priorities".
- **Why it moved** (click any row; defaults to the biggest mover): for each changed weight, the place is
  re-scored with *only that weight changed* using `scoreSite` — e.g. "Terrain relief 5→0: +11 pts · match here
  54%". Criteria with no data at that place say "no data here — this weight cannot affect it". Stated caveat:
  effects interact, so parts need not add up; rank also depends on other places. When rank and own score move in
  opposite directions the panel says so explicitly.
- **Places that drop out** are listed ("No longer scored: Lanzarote (was #1)… fewer than 3 weighted criteria have
  data — missing data is left out, not counted as a poor match"). Previously they silently vanished.
- **Motion**: 380 ms FLIP slide + 1.1 s fading tint on moved rows; none with `prefers-reduced-motion`.
- Available on Home (Adjust criteria) and in Explore → Advanced options, directly above the sliders.
- Tests: `lib/rankShift.test.js` (every explained effect equals a direct `scoreSite` re-run).

## 3. Final demo workflow

Start: Home → **Guided demo (2–3 min)**, or any URL with `?demo=1`. A small docked card shows the step, one line
to say, Back / Show / Next, pacing (~3.2 min budget), minimise and end. "Next" performs the step with ordinary app
actions (target, objective, weight, shortlist, navigation). Nothing is simulated; there is no fake "processing".
The step survives a page reload (sessionStorage).

| # | Step | What the guide does |
|---|---|---|
| 1 | Mission overview | Home, highlights *Start a new mission* |
| 2 | Select Mars | Target = Jezero Crater (globe turns to the cited marker) |
| 3 | Research objective | Objective = Rover testing; order = most complete evidence first (the app's own documented Jezero scenario setting) |
| 4 | Research priorities | Opens *Adjust criteria* (sliders + live ranking) |
| 5 | Run the discovery | Explore — narration states scoring runs instantly in the browser on an offline-prepared bundle |
| 6 | Ranked candidates | Highlights the ranked cards |
| 7 | Map | Highlights the map (click a card → marker + fly-to) |
| 8 | Change priorities | Opens Advanced options; button "Set terrain relief to 0" → live ranking moves |
| 9 | Inspect a candidate | Resets weights, opens the objective's #1 place (Holuhraun) |
| 10 | Compare | Shortlists the objective's top 3, opens Compare |
| 11 | Evidence | Planetary Mirror for the #1 place (values on both sides, 3D terrain) |
| 12 | Report | Research report (Print/PDF, CSV, JSON) |

## 4. 3D visualization improvements

- **Elevation probe** (Mirror → 3D terrain): point at either surface to read the **stored value of the 180 m
  grid cell** under the pointer (raycast on the real mesh, nearest cell, no interpolation), its height datum and
  distance from the reference point; nodata cells say so. Observed values: Jezero floor −2,581 m (MOLA areoid),
  Holuhraun 770 m (EGM2008), McMurdo 1,814 m. Updates the DOM directly once per frame (no React re-render per
  mouse move); disabled for touch (drag rotates).
- **Elevation profile**: west–east line through both reference points on one chart with the **same km and metre
  scales**; data gaps drawn as gaps; the central 10 km scoring window is shaded, and the caption explains that the
  relief *score* uses only that window (Jezero's line crosses the crater rim, 876 m, while its scored relief is
  231 m). The second line is also dashed (not colour alone).
- Existing strengths kept: real DEM meshes with checksums, stated vertical exaggeration, synced cameras, render on
  demand, pause off-screen, disposal, reduced-motion camera resets.
- **Not done (deliberately):** a 3D Earth globe with candidate markers. The bundle has no Earth imagery or
  coastline data; adding it needs a new texture download (e.g. NASA Blue Marble) — a team decision. Without it
  the globe would be decorative, which the brief rules out. The 2D Leaflet map remains the candidate view.

## 5. Animations and interactions added

| Where | What | Purpose |
|---|---|---|
| Live ranking | FLIP slide + up/down tint; score-bar width transition | Show *which* places moved and in which direction |
| Result cards (Explore) | Same FLIP slide | Cards and live ranking move together |
| Demo guide | 280 ms slide-in; outline pulse on the element being discussed; smooth scroll | Direct the audience's attention |
| 3D terrain | Probe dot + readout following the pointer | Connect the surface to a real value |

All motion ≤ 0.4 s (the fading tint 1.1 s), transform/opacity/background only, off under
`prefers-reduced-motion`. No glows, spinners or decorative space effects were added.

## 6. Readiness for upcoming datasets

**Ready (no redesign needed):**
- Lists, tables, map markers, report and CSV/JSON exports iterate `data.sites` / `data.features`; nothing assumes
  11 sites or 2 targets. The new live-ranking and objective views do the same.
- Missing data is never displayed as 0 anywhere checked (score bars, compare table, radar, Mirror, report,
  exports); completeness (coverage, evidence level, score range, lower bound) is shown separately from similarity.
- New provenance statuses are displayed (unknown ones as-is); `measured` / `estimated` are styled.
- A criterion with no data anywhere is announced (data banner, "no data — no effect" slider tag).
- Missing preview/mesh entries degrade to "No terrain image for this place yet"; 3D falls back to images.

**Needs attention when the data grows (documented, not changed):**

| Priority | Issue | Where |
|---|---|---|
| High | Custom-weight share links (`w=3-3-…`) are positional: adding or reordering a criterion silently drops a link's custom weights (falls back to the preset). A keyed format (`w=terrain:3,…`) would fix it — URL contract change, needs a team decision. | `lib/urlState.js` |
| High | A new criterion gets weight 0 in every objective unless `presets.js` **and** `pipeline/config.py` are updated. Now caught by `presets.test.js` on the JS side; Python/JS drift is only warned about in dev. | `lib/presets.js`, `data/useBundle.js` |
| Medium | Radar: short labels exist only for the 7 current ids (12–15 long labels will clip); a criterion missing for any compared place is dropped from the radar. | `components/RadarCompare.jsx` |
| Medium | Map: no marker clustering — 40–100 sites will overlap in Europe / SW USA. | `components/MapView.jsx` |
| Medium | Home shows another target's terrain preview if the selected target has none (titled correctly, but mismatched). | `pages/Home.jsx previewFor` |
| Medium | No `onError` fallback for preview images listed in JSON but missing on disk. | `TerrainPair.jsx`, `pages/Mirror.jsx` |
| Low | Gap wording (`GAP_WORDS`) for new numeric criteria falls back to "higher/lower" (must stay in parity with `scoring.py`); target selector groups only Moon/Mars; CSV has no per-criterion columns. | `lib/scoring.js`, `TargetSelect.jsx`, `pages/Report.jsx` |

## 7. Scientific observations for review (no logic changed)

1. **By raw score, the same partial-data place leads every objective.** Jezero: Lanzarote is #1 for all four
   objectives (94–96, but 3 of 6 measurements; ranges as wide as 53–98). Lunar South Pole: McMurdo is #1 for all
   four. Because missing criteria are excluded (correctly — never counted as 0), a place with fewer measurements
   can outscore well-measured places. With the conservative lower-bound order the leaders differ by objective
   (Jezero: Rover/Habitat/General → Holuhraun, Ice → Atacama; Moon: Rover → Wadi Rum, Habitat → Holuhraun,
   Ice/General → McMurdo). The demo therefore uses the conservative order, as the app's own Jezero scenario
   already does. **Suggest the team decide** which ordering is the default and how the final missing-data
   methodology should treat partial coverage.
2. `scoreRange` widens only for gaps on the *site* side; a criterion missing on the target lowers coverage but not
   the range. UI wording is accurate ("no missing site data") but may be read as "complete".
3. Weights are screening priorities, not validated requirements — stated in every new view's caption.

## 8. Remaining bugs and known limitations

- **Latent navigation race (pre-existing):** AppState writes state to the URL after 150 ms; if a state change
  (e.g. the shortlist) and a navigation to a lazily loaded page (Compare/Mirror/Report) happen together, the URL
  write can cancel the pending navigation. Hit by the demo's Compare step during testing; the guide now navigates
  after the write. Users would only meet it with sub-150 ms clicks. The fix belongs in `AppState.jsx` — left for
  review.
- On phones the demo guide covers ~40 % of the screen (minimise available); it is meant for the laptop demo.
- In Explore's narrow Advanced panel, long place names wrap to 2–3 lines in the live ranking.
- **Not verified:** browser print preview / PDF output (the print dialog cannot be driven by the test browser;
  print CSS hides the demo guide), frame rate on a real low-end laptop GPU, Safari/Firefox.
- Test-environment note: the in-app test browser pauses `requestAnimationFrame` while hidden, so animation and 3D
  checks used a timer shim injected into the page (test-only; nothing in the app).

## 9. What was tested (and how)

Production build (`vite preview`), 1440×900 and 375×812:
- 14 routes incl. empty/invalid states (`/explore` without a target, unknown site id, unknown route): no error
  boundary, no `NaN`/`undefined` text, no console errors.
- Full 12-step guided demo end to end (dev and production), incl. reload persistence and Finish.
- Live ranking with Terrain relief 5→0 and Surface temperature 1→5 in both orderings; values cross-checked
  against Compare and the result cards.
- Compare with 2 and 3 places; Mirror 3D (Jezero↔Holuhraun, Jezero↔Atacama, Moon↔McMurdo) incl. probe values.
- CSV and JSON export content (captured in the page, no files saved): metadata, header, 11 rows, no NaN/undefined.
- Mobile: no horizontal overflow on Home/Explore.

## 10. Screenshots

[`screenshots/demo-round/`](screenshots/demo-round/): `01-home-guided-demo-1440` ·
`02-explore-live-ranking-change-1440` · `03-objective-comparison-1440` · `04-mirror-3d-probe-profile-moon-1440` ·
`05-mirror-3d-probe-jezero-1440` · `06-compare-evidence-backed-1440` · `07-mobile-live-ranking-375` ·
`08-mobile-demo-guide-375`. (02 and 05 were taken before the final ordering/profile tweaks; the others show the
final build.)

## 11. Recommended 2–3 minute NASA Space Apps demo script

Open Home → *Guided demo*. Numbers are from the current bundle (2026-11-14).

1. **(0:00) Problem.** "Mission teams rehearse on Earth before they fly. But no place on Earth is a copy of Mars —
   the right analog depends on what you want to test."
2. **(0:15) Target.** Mars → Jezero Crater. "Every target value carries a citation."
3. **(0:25) Objective.** Rover testing. "An objective is just a set of priorities — here terrain relief and bare
   ground count most."
4. **(0:35) Priorities.** Show the sliders and live ranking. "These are our screening priorities, not validated
   requirements."
5. **(0:50) Discovery.** Explore. "Eleven Earth places, scored instantly in the browser from NASA-derived data
   prepared offline. We order by the conservative lower bound — what a place keeps even if every missing
   measurement were a mismatch."
6. **(1:05) Results + map.** Holuhraun 83, Atacama 71, MDRS 70. Click a card — the map flies there.
7. **(1:20) Key moment.** Advanced options → *Set terrain relief to 0*. "Wadi Rum jumps from 7th to 3rd, MDRS drops
   two — and the panel says why. Three places drop out: not enough data, and we never count missing data as zero."
   Scroll to *Same target, different research objectives*: "Rover testing puts Holuhraun first; ice exploration
   puts Atacama first. **Different research objectives, different best analogs.**"
8. **(1:45) Why this match.** Holuhraun: strongest match terrain relief (measured, NASADEM), main difference
   (wetter), what still needs measuring.
9. **(2:00) Compare.** Top three: "Holuhraun is the closest match, and its result rests on all six measurements."
10. **(2:15) Evidence.** Mirror → 3D: "Built from the real elevation grids — point anywhere to read the elevation;
    the profile puts both places on the same scale."
11. **(2:30) Report.** Mission, priorities, ranking, parameter comparison, method, sources, limitations — PDF, CSV,
    JSON.
12. **(2:45) Close.** "Not just a map of NASA data — a decision aid that shows which Earth place fits which research
    objective, and why. No Earth site reproduces lunar or Martian gravity, vacuum or radiation; field validation is
    still required."

---

## 12. Analog method v1.0.0 integration (analog_results.json)

Source: `Raw Data/analysis/analog_method/` (method v1.0.0, generated 2026-11-15). Copied **unchanged** into the app:
`web/public/method-v1/analog_results.json` and `web/public/method-v1/METHOD_ar.md`; the integration guide is kept as
[`method_v1_INTEGRATION.md`](method_v1_INTEGRATION.md). The existing bundle and its scoring engine are untouched —
the two methods have different data contracts and are never mixed.

| Added | What |
|---|---|
| `/tests` — **Mission tests** (nav "Tests") | Target (Jezero, Gale, Arcadia, lunar south polar region) → mission test (only tests whose `bodies` include the target body; thermal is Moon-only) → the 12 sites, then a site panel: contribution bar (parts sum to the score), parameter table (Earth vs target values with units, similarity, weight, comparability, contribution, notes, lunar percentile), context-only values, site caveats, method link. English / العربية toggle for data labels and summaries |
| `/method/ar` | `METHOD_ar.md` rendered in the app, right-to-left, plus a download link. Linked from Mission tests (banner + every site panel), the About page and the footer |
| `lib/methodV1.js` + tests | Structure check, test filter, display order, status reasons, formatting (missing → "not available", never 0) — 9 tests run against the real file |

Display rules from INTEGRATION.md, as implemented:
- `ranking_allowed: false` → sites are ordered by score **inside one test** under the label "Provisional similarity for
  this test · تشابه مبدئي لهذا الاختبار"; no rank numbers, no "best", no "ranking".
- Every score is shown with `score_range` (bar + numbers), `coverage` and `confidence`; ⚠ when
  `sensitive_to_assumptions` (53 of 156 results).
- `status != scored` → the reason, never 0. Arcadia terrain tests: "Terrain data unavailable — DTM file damaged,
  re-download required".
- Amazon negative control: dashed badge and hatched row in every list; its panel explains why it is included.
- Lighting test: "Sun geometry only — this is not an environmental or terrain analog" + the test rationale.
- Moon target: "Regional target (80–90° S), not a landing site".
- No averages across tests or targets anywhere ("not comparable across tests or targets and never averaged").

Verified on the production build: all four targets and their tests, Arabic labels, Arcadia, the negative control,
lighting and regional notes, no `NaN`/`null` text, no console errors, 1440 px and 375 px (no horizontal overflow;
inline code in the Arabic page wraps). Screenshots: [`screenshots/method-v1/`](screenshots/method-v1/).
Tests: 114 passing. The patch (`frontend_demo_round.patch`) covers `web/src`; the two copied data files are not in it.

**Note for review:** the main Explore/Compare/Report views still use the earlier 7-criterion bundle and its wording
("best match first", live ranking). Moving those views onto method v1 would require applying the same "not a
ranking" rules there, and the v1 scores are precomputed (weights live in `config/*.json`, so sliders cannot re-score
in the browser without porting `method_core`/`score.py`).
