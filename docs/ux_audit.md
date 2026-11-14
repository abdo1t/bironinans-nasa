# UX audit and simplification record

Scope: the web app at commit `79796f4` (Phase 4 checkpoint), audited before the UX simplification, and the changes made on branch `ux-simplification`. Rollback point: tag `pre-ux-upgrade` (= `79796f4`); `main` was not modified.

The audit was run as six independent read-only reviews (docs constraints, real-bundle facts, UX heuristics, accessibility and responsive layout, test/build baseline, lunar terrain source). Nothing in the scoring code, presets, data bundle or pipeline scoring inputs was changed by the UX work.

## 1. What the audit found

### The journey did not match the product goal

The intended journey is: choose Moon or Mars → target site → mission objective → recommended Earth sites → why → compare and inspect evidence.

| Step | Before | Problem |
|---|---|---|
| World | Two cards on Home | Fine. |
| Target site | Dropdown filtered by world | The real bundle has one target per world, so this was a one-option dropdown. |
| Mission objective | Not on Home. A "What matters" select in Explore's side panel, or two hard-wired scenario cards | The lede promised "choose what matters" with no control for it. Scenario cards were a second, competing entry path. |
| Recommended sites | Explore opened on a map with no list and no "why" | A first-time user had to guess that brighter dots were better, click a marker, then click "View details". |
| Why | On Site details, under a 7-column scoring table | The plain-language answer came after the expert table. |
| Compare | Three empty-state hops to reach it; verdict read like scoring notes | No one-click path; no summary cards; no limitation line. |

### Expert concepts were required up front

- Seven weight sliders with normalisation notes ("mm/yr · Earth scale 0 to 2000 · inverted") were fully expanded beside the first result.
- Every result carried three overlapping uncertainty indicators (range, n/m criteria, Evidence High/Medium/Low) explained only by `title` tooltips, which do not work on touch or keyboard.
- Up to seven blocks sat above the first result on Explore at 1280×720 (data banner, header, rank-by help, mission brief, availability notice, target reference, shortlist bar). The map started below the fold on the scenario path.

### Vocabulary was inconsistent

| Concept | Words in use before | Now |
|---|---|---|
| Moon/Mars reference | base site, candidate base sites, target | **target site** |
| Weight preset | what matters, preset, scenario, mission brief | **mission objective** |
| Pick-list | shortlist, compare | **Compare** |
| Sites far from catalogued analogs | "Not in reference catalogue" (UI) vs "uncatalogued candidate" (docs, CLAUDE.md) | **Uncatalogued candidate** |
| Unscored site | four wordings | **No score — insufficient data** |

### Accessibility and responsive issues

- Map markers were SVG circles: not keyboard-focusable, score conveyed by shade and a 6–12 px radius only. The lowest score band had 2.5:1 contrast against the basemap.
- Focus rings were clipped inside segmented controls; weight-0 table rows used `opacity: 0.6`, taking muted text to 3.2:1.
- Touch targets under 24 px (chip remove button, compare checkbox).
- The page title never changed between routes; focus and scroll were not reset on navigation.
- At 375 px the criteria panel was about 1000 px tall above the results and the results table needed about 850 px of horizontal scroll.

### Scientific safeguards that had to survive

From `docs/methodology.md`, `docs/validation_report.md` and `docs/award_strategy.md`:

1. A score range beside every score that missing data could move.
2. "Rank by: Guaranteed minimum" (URL `rank=min`); the Jezero + Rover testing scenario opens in that order. Without it Lanzarote looks like the best Jezero analog (94 on 3 of 6 criteria), which the validation report calls a missing-data artefact.
3. Criteria count (n/m) and Evidence High/Medium/Low by weight share.
4. Explicit labels for missing, shown-but-not-scored and clipped values.
5. The fixed sentence "No Earth site reproduces lunar/Martian gravity, vacuum or radiation."
6. Per-value provenance (dataset, parameter, period, resolution, citation).
7. Live re-ranking within one frame; URL-synced state; bundle integrity gate; no runtime calls except basemap tiles.

### Baseline

At `79796f4`: 53 Vitest tests and 75 pytest tests passing, `validate_bundle.py` OK for both bundles, real and mock builds passing, one 763 kB JS chunk (Vite size warning), one lint warning.

## 2. What changed

Two experience levels share one scoring system (`web/src/lib/scoring.js`); a mission objective is only a preset of weights.

- **Quick exploration (default).** Home is a three-step guided start (world → target site → mission objective) with one primary action. Explore shows the map, a ranked list of recommendation cards and the mission picker. No slider needs touching.
- **Advanced exploration.** The criterion weight sliders sit in an "Advanced" disclosure in the Explore panel, collapsed by default; it opens for custom weights or with `adv=1` in the URL. Ranking method, per-criterion breakdown, evidence coverage, ranges and sources are all still there.

| Area | Change |
|---|---|
| Explore | Three columns: controls, map, recommended sites. Numbered, keyboard-focusable rank markers (ring colour and size = score band, dashed ring = uncatalogued candidate, hollow = no score). Cards show score, possible range, evidence coverage, catalogue status, closest match and largest shortfall, with View details / Compare / Show on map. Marker and card highlight each other. The Table view remains as the non-map alternative. |
| Site details | Summary first (score, guaranteed minimum, range, evidence, what matches, what differs, research relevance); Scientific evidence, Similarity explanation and Limitations as expandable sections. |
| Compare | Side-by-side summary cards, plain-language verdict under the selected ranking method, "where they differ most", radar and accessible table, limitation line, one-click "Compare top 3". |
| Shell | Short prototype banner, per-route page titles, focus and scroll reset, error boundary, original favicon, Compare page code-split. |
| Shared | `Term` tooltips (hover, focus, tap) with a glossary; `Disclosure`; design tokens in `styles/system.css`. |

## 3. Implementation checklist and status

Test counts and browser checks are recorded in `docs/release_readiness.md` (section 0).

| # | Item | Status | Commit |
|---|---|---|---|
| 1 | Rollback tag `pre-ux-upgrade` and branch `ux-simplification` | Done | — |
| 2 | Design-system layer, glossary tooltips (`Term`), `Disclosure`, mission picker | Done | `a7db868` |
| 3 | Explore: map-first layout, ranked cards, numbered keyboard-focusable markers, Advanced collapsed | Done | `a7db868`, `e0ff1eb` |
| 4 | Home: guided three-step start, explicit ranking method on every entry link | Done | `e0ff1eb` |
| 5 | Site details: summary first; evidence, similarity and limitations on demand | Done | `887a60a` |
| 6 | Compare: summary cards, plain verdict, key differences, limitation line, "Compare top 3" | Done | `03140e0` |
| 7 | App shell (titles, focus, error boundary, 404, code-split Compare, favicon) and About | Done | `4aced2f` |
| 8 | Lunar south pole terrain: LOLA source check (scoring source not replaced) and offline previews for the Moon and Jezero | Done | `f80df63` |
| 9 | Accessibility and responsive pass (1280×720 and 375 px) | Done | all of the above |
| 10 | Tests, builds, browser verification, docs | Done | final docs commit |

### Fixed along the way

- A stopped agent left `scenarioQuery` half-migrated (1 failing test). The new contract (always emit `rank`, let Explore choose the view) fixes a real bug — a ranking method stuck from an earlier scenario — so the test was updated to it and now checks both scenarios.
- About listed MERRA-2 as not in the bundle: its match pattern `MERRA` never matched the provenance text `MERRA2`.
- Cards showed "no data gaps" when a criterion was missing on the target side (Moon daily swing); they now say "no missing site data".
- Compare showed "No gaps on the selected criteria" for Lanzarote although 3 of 6 criteria have no data; the card now says how many were left out.
- A shared custom-weights link was labelled "based on Balanced" although the URL does not record the starting mission; the label now says only "Custom weights".

### Remaining

- Verdict sentences and why/gap phrases are generated text (`verdict.js`, `scoring.js`) and were not reworded; the verdict still says "(weight 5)".
- `docs/judge_qa.md`, `docs/award_strategy.md` and CLAUDE.md §7 still mention some old labels (for example "Mission scenarios" and the list view). CLAUDE.md belongs to the team and was not edited.
- Team names are still "TBD" on the About page.

## 4. Second pass: "simple by default" (2026-11-14)

Guided by the UI UX Pro Max skill (priorities: accessibility, interaction, navigation, plain microcopy). Display and wording only — `scoring.js`, `scoring.py`, presets, the data bundles and the pipeline were not touched (`git diff 7681e96..HEAD` lists only `web/src` UI files and this doc).

| Page | Change | Commit |
|---|---|---|
| Home | Two choices and one action: **Choose a world → Choose a research objective → Find matching places on Earth**. The Moon/Mars reference site is named under the world cards ("Compared with …") instead of being a separate step; a select appears only if a world has more than one site. The primary button stays focusable and says what is missing instead of being greyed out. "Mission objective" is now "Research objective" everywhere. | `9ddce17` |
| Explore | Title "Places on Earth like <site>". One sentence explains the ranking; when any place lacks Earth-side measurements a plain warning says the ranking may change. "Rank by" moved into **Advanced options** as "Best match first / Most complete evidence first" (same `rank=` URL values; the conservative order is still announced above the list when active). Coverage reads "4 of 7 measured", ranges "could be 56–97". "Explore the terrain of <site>". | `5af1c43` |
| Site details | "Why this place?" and "How reliable is this result?" answered in sentences before the figures (`plainReliability`, tested). "What matches?" / "What's different?"; the difference card no longer says "No gaps" when criteria are unmeasured. | `7c3b436` |
| Compare | "In short" summary at the top (`plainComparison`, tested): closest match, whether it rests on fewer measurements than another place, unscored places named as missing data, and always "none of these places is confirmed as suitable for a mission". | `495f16f` |

### Persona walkthroughs (simulated in the in-app browser — no real users were observed)

| Persona | Task | Result |
|---|---|---|
| A. First-time visitor | Home → results | 2 actions with the default objective (Mars, then the button), 3 when choosing one (Moon → Ice drilling → button). Pressing the button before choosing a world explains what to do instead of doing nothing. |
| A. | Understand score and uncertainty | Explore: one ranking sentence plus "5 places are missing some measurements, so this ranking may change". Site details: "Based on 4 of 7 measurements … anywhere from 56 to 97". |
| B. Planetary researcher | Find evidence | Site details keeps the full figures, per-value provenance, citations and limitations in expandable sections below the plain answers. Advanced options holds the ranking method and weights. |
| C. Mission planner | Compare candidates | "Compare top 3" is visible beside the list at all times; Compare opens with "In short", e.g. McMurdo leads 88 vs 68 but rests on 4 of 7 measurements vs Haughton's 6 of 7. |
| All | Back navigation | Browser Back from Compare returns to Explore with target, objective and order intact (all state is in the URL). |

Checks: 73 Vitest + 101 pytest passing; `validate_bundle.py` OK for real and mock; real and mock builds pass; no horizontal overflow at 375 px on Home, Explore, Site details and Compare; Advanced options and the order switch are keyboard-operable native radios.

Not done: 3D terrain (the offline 2D shaded-relief preview stays; a 3D view was judged not to add understanding worth the load cost on the main journey); verdict text in `verdict.js` is still the earlier wording; no study with real users.
