# First-visit UX pass — Moon ice journey (2026-11-15)

Branch `ux-first-visit`. The submitted release candidate is tagged `rc-2026-11-15` (= `7ad092d`,
branch `mission-control-ui`) and is unchanged. Scoring, ranking, URL state and the data bundle are
untouched (`git diff rc-2026-11-15 -- web/src/lib/scoring.js web/src/lib/urlState.js web/src/state web/public pipeline` is empty).

## Where a first-time visitor got stuck (before)

| Screen | Problem |
|---|---|
| Home | First viewport was an abstract emblem plus three paragraphs. The selection from the deep link was split across step cards, and the only primary button ("Find matching places on Earth") was below the fold at 1440×900 (a fixed bar on phones). |
| Explore (desktop) | The map took the stage and its side panel analysed only #1. The ranked list sat below the fold, so other candidates showed only as numbered rings. |
| Explore (phone) | The map came first, results were two screens down, and "Quick / Research" sat beside Map/List with no clear meaning. |
| Site details | A dense score panel (similarity, lower bound, range, coverage, rank) came before "What matches?", and the match claims were phrases with no values. |
| Planetary Mirror | Terrain first; you had to click criteria one by one to learn what matched. |

## What changed

* **Home**: heading "Find places on Earth that are like the Moon or Mars". A one-line selection
  (**Moon · South Pole · Ice Exploration**) has a single **Change** control that opens the
  world/objective chooser. There is one primary button, **Find places on Earth**. A credited LRO LOLA
  shaded-relief image of the target (the existing `previews/*-terrain.webp`) sits beside the text, or
  as a banner above it on phones. On Home the top bar hides its own "Change mission", so there is
  one Change per screen.
* **Explore**: on desktop, the map has a **Top matches** list (top 5) beside it. Each compact card
  shows the name, country and coordinates, and one evidence-backed reason: the criterion earning the
  most points, with its value here, the target's value, % similarity and evidence type (from
  `lib/selection.js topReason`). Each card has **Why this match?** and **+ Compare**, and the Compare
  tray is in the list footer. The analysis, terrain and evidence panels follow below the map. On
  phones the page opens on the results with a **Map / List** switch; the selected place (`sel=`)
  is shared by both views, and the ranking help and data-availability note follow the results.
  Weights, ranking order and the evidence table moved behind **Advanced options**, which replaces
  Quick/Research.
* **Site details**: a one-line result strip comes first, then **What matches? / What's different? /
  What still needs measuring?**. Each match shows the measured values, % similarity and evidence
  tag, and matched criteria are no longer repeated as differences. **View evidence** is in the
  header actions. Terrain imagery appears when both sourced previews exist; otherwise a
  side-by-side evidence table is shown. The full score panel follows.
* **Planetary Mirror**: the same three questions lead. Each item opens that criterion's evidence,
  and **View evidence** is always visible.
* **Motion** (CSS + Leaflet only):
  * World change fades the terrain in and eases the card state (200 ms).
  * Selecting a card and its marker highlights both together (200 ms), with a 220 ms marker ease-in.
  * One gentle `panTo` (0.45 s, no zoom) runs only when the marker is outside the central view.
  * Explanations fade and rise 6–8 px (200–220 ms).
  * Under `prefers-reduced-motion`, the existing global rule removes all animation and the pan is
    instant (`animate: false`).
* The `ice` preset label "Ice drilling" became "Ice exploration" (display text; weights unchanged).

## Verified flows (Playwright + Chromium, `localhost:5173`, 58 checks, no console errors)

1. **Moon, desktop 1440×900 and phone 375×812**:
   * Open `/?target=moon-south-pole&preset=ice`. The heading and selection line render, there is
     exactly one primary button and it sits in the first viewport, and the LOLA credit shows.
   * Change → Mars swaps the terrain → Moon keeps Ice Exploration.
   * Find places on Earth (one click) → `/explore?target=moon-south-pole&preset=ice&rank=score`.
   * #1 is McMurdo Dry Valleys at 88/100, with Antarctica and the reason "Ground ice / permafrost
     — yes here; target: water ice in nearby permanently shadowed regions, 100% similar,
     Literature source".
   * Phone: the first "Why this match?" is on the first screen; Map/List sync with #3 selected
     keeps the same place, its marker and `sel=`.
   * Why this match? → `/site/mcmurdo` leads with the three questions. View evidence is on the first
     screen and opens the evidence section (units, datasets, sources).
   * Reload keeps the site, target and mission; Back returns to Explore with the same query.
2. **Mars smoke**: `/?target=mars-jezero&preset=rover` → "Mars · Jezero Crater · Rover Testing" and
   the Jezero terrain → Explore with `rank=min` (the scenario order is kept) → 5 cards.
3. **Compare**: "Compare top 3" → `/compare?...&sites=iceland-lava,atacama,mdrs-utah` → radar and
   table render → Back returns to Explore.
4. **Mirror**: `/mirror?target=moon-south-pole&preset=ice` leads with the three questions; View
   evidence is visible.
5. **Reduced motion**: card reveal `animation-name: none`; selecting #5 does not start an animated
   pan; the card and marker are selected together.

Unit tests: 85/85 (`npm test`, including the new `lib/selection.test.js`). Build passes; oxlint shows
only the existing AppState fast-refresh warning.

Screenshots: `docs/screenshots/first-visit/` (`before-*` = RC, `after-*` = this branch, same URL and
viewports). Headless captures have no basemap tiles.

## Remaining issues

* All 11 real-bundle sites have terrain previews, so the new evidence-table fallback on Site details
  renders only for sites without imagery (e.g. the mock bundle); the real demo path does not use it.
* The gentle pan no longer zooms in, so tightly clustered markers (ranks 5, 8 and 10 in the Moon ice
  ranking) still overlap at world zoom; the selected marker is raised above the others.
* The main JS chunk is 520 kB (RC: 513 kB); the existing >500 kB Vite warning remains.
* No usability study with real first-time users; the findings come from a heuristic walkthrough.

## Follow-up: the four-step researcher flow

Target flow: **(1) Moon or Mars + test type → (2) choose criteria and their importance → (3) the
system compares the sites → (4) ranked list with match score, reason and missing data.**

* **Step 2 is now visible before results.** Home shows a "Criteria and importance" row under the
  selection: each criterion the test type uses, by importance (dots, 0–5), with any criterion that
  has no data flagged and any switched-off criterion listed as not used. Phones show the top 3 plus
  "+N more". **Adjust** opens step 3 of the chooser, which has the same importance sliders as Explore's
  Advanced options (shared `components/WeightSliders.jsx`). Setting a criterion to 0 leaves it out.
* **Adjusted importance keeps the test type.** The selection reads "Moon · South Pole · Ice
  Exploration (custom criteria)", and the URL now carries `preset=<test type>` beside `w=`, so
  reload, share links and "Reset to …" return to Ice exploration instead of Balanced. Old links with
  only `w=` still parse as before (covered by `urlState.test.js`). Headers on Explore, Site, Compare
  and Mirror and the top bar use the same label (`missions.js missionLabel`).
* **Step 4: each result card names its missing data.** Below the reason, every card says
  "Missing data: Bare ground, Geology match — not counted", or "No missing data for this place"
  (`selection.js siteMissing`; criteria the target lacks are reported once in the page notice).
* Wording: the number is a **match / similarity score**, not "suitability" (ملاءمة). The project
  rule is that a high score means resemblance, not mission suitability.
* Not done: entering target *values* per criterion (as opposed to importance). The comparison
  values come from the cited Moon/Mars measurements; letting users override them would change the
  scoring contract (§4–5) and needs its own design and tests.

Verified (79 checks, desktop and 375 px):
* Criteria are listed by importance, the no-data criterion is flagged, and the button stays on the
  first screen.
* Adjust → Ground ice set to 0 → the selection says "custom criteria" and Ice is listed as not used.
* Find places on Earth → `explore?target=moon-south-pole&preset=ice&w=2-2-5-2-3-1-0` → the first card
  shows its score, reason and missing data.
* Reload keeps the weights and the test type ("Ice exploration (custom criteria)").
* The earlier Moon, Mars, Compare, Back, reload and reduced-motion flows still pass.

Unit tests 88/88.
