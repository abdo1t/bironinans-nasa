# Mission Control UI (v2)

Branch `mission-control-ui`. Rollback point: tag `pre-mission-control` (= `2b7bebf`). Written 2026-11-14.
Nothing is deployed, merged or submitted. No scoring, data, pipeline or bundle file changed
(`git diff pre-mission-control -- pipeline web/public web/public-mock web/src/lib/scoring.js web/src/lib/presets.js` is empty).
Builds on the previous pass recorded in `docs/art_technology.md`.

## 1. Reference analysis

The brief describes a premium satellite mission-control dashboard. **The reference screenshot itself was
not attached to the session**, so the layout below follows the written description of it (left
navigation, system header, dominant central Earth view, right telemetry panel, three lower cards,
navy/cyan palette). The design should be re-checked against the image once it is available.

| Pattern from the reference | Decision | How it appears here |
|---|---|---|
| Compact left navigation sidebar | **Adapted** | 88 px icon rail with a text label under every icon (no hover-only labels); cyan edge bar + `aria-current` for the active page; becomes a drawer below 760 px. |
| System header | **Adapted** | Brand, then the current search as three facts (reference world · planetary target · research mission) and one *Change mission* action. |
| "LIVE" telemetry / status lights | **Rejected** | Would imply a live NASA connection. Replaced by a factual chip: *Scientific dataset · static bundle, 2026-11-14* (mock builds: *Mock data · not measurements*). |
| Large central Earth visualization | **Adapted** | The existing React-Leaflet map is the dominant panel; dark basemap tinted navy; HUD label; *Show all sites*. |
| Right telemetry panel | **Adapted** | *Planetary match analysis*: candidate vs. reference, score, guaranteed minimum, evidence completeness, strongest similarities, important differences, missing data, *Why this match?* |
| Three lower dashboard cards | **Adapted** | A Recommended Earth sites · B Planetary terrain · C Mission & scientific evidence. Two columns ≤ 1320 px, one column ≤ 760 px. |
| Dense numeric readouts, arbitrary gauges, ticker text | **Rejected** | Only values the scoring engine produces are shown; raw measurements wait behind *Why this match?* and Research mode. |
| Neon glow, scan lines, blinking markers | **Rejected** | Accessibility and comprehension (UI UX Pro Max flags the HUD style as *accessibility risk: high*). Fine borders and one restrained radial gradient instead. |

## 2. Design system (`web/src/styles/mission.css`)

Tokens re-point the variables every existing component already used, so pages changed colour without
per-component hex values.

| Token | Value | Role | Contrast (min over all four surfaces) |
|---|---|---|---|
| `--bg` | `#060d1a` | ground | — |
| `--panel` / `--panel-2` / `--panel-3` | `#0b1729` / `#10203a` / `#16294a` | layered surfaces | — |
| `--border` / `--border-strong` | `#1e3557` / `#2b4a74` | fine borders | — |
| `--text` | `#e6f0ff` | primary text | 12.6 : 1 |
| `--text-2` | `#b4c4dc` | secondary text | 8.2 : 1 |
| `--muted` | `#8ea3c2` | labels | 5.6 : 1 |
| `--accent` | `#2fd6f0` | electric cyan: actions, selection | 8.3 : 1 (ink on cyan 10.7 : 1) |
| `--accent-2` | `#3cc9b0` | muted teal: measured / evidence | 7.0 : 1 |
| `--link` | `#7fd4fb` | links | 8.8 : 1 |
| semantic | ok `#9ee0c4`, differ `#f2a65a`, warn `#f5d58a` on `#2a2110`, missing = hatched `#8ea3c2` | similar / different / warning / no data | every state also has a symbol or word (✓ ✗ – , "no data") |

* **Type:** system UI stack for all reading text; a system monospace stack (`--font-tech`) only for small
  uppercase panel labels. No web fonts: the app makes no runtime request except basemap tiles.
* **Spacing/shape:** existing `--space-*` scale; 8 px controls, 12 px panels; 1 px borders; one inset
  highlight (`--panel-glow`). Shared panel anatomy: `.mc-panel` › `.mc-panel__head` (icon + uppercase
  title) › `.mc-panel__body`.
* **Icons:** `components/Icons.jsx`, drawn for this app (24 px, 1.75 px stroke, `currentColor`,
  `aria-hidden`); no icon library added.
* **Motion:** 150–200 ms colour/drawer transitions and the existing map fly-to; all disabled under
  `prefers-reduced-motion` (checked in the browser).
* **Touch:** every button, segmented control and the brand link is ≥ 44 px tall below 760 px
  (checked in the browser).

## 3. What changed, screen by screen

* **Shell** (`App.jsx`): rail (Discover · Explore Map · Planetary Mirror · Compare Sites · Scientific
  Data · Methodology), top bar with the mission strip, drawer + scrim + Escape on small screens.
  *Scientific Data* and *Methodology* are anchors on the existing About page (`#data`, `#method`); no
  new routes. In-page anchors scroll below the sticky bar (`RouteEffects.jsx`).
* **Discover** (`Home.jsx`): framed hero with an original "two worlds" emblem and the three questions
  every result answers (*Where · Why · How reliable*). The guided world → objective → one button flow is
  unchanged.
* **Explore** (`Explore.jsx`, `explore.css`):
  * map + *Planetary match analysis* on top, panels A/B/C below;
  * **Quick / Research** switch. Research = the existing Advanced options (`adv=1`): weights, ranking
    method, and the full per-criterion table (weights, units, values, points lost) inside the analysis
    panel. Both modes call the same `scoring.js`;
  * **selection model:** clicking or pressing Enter/Space on a marker, or choosing a card, selects a
    place (`sel=` in the URL). The map, the card list, the analysis panel and the terrain pair all
    follow it. Choosing from the list flies the map there; choosing on the map scrolls the list inside
    its own panel (the page never jumps). Marker popups were removed so nothing covers neighbouring
    markers; a tooltip names the place on hover and focus;
  * selected marker: cyan halo ring (shape + colour); the legend explains it.
* **Planetary match analysis** (`MatchAnalysis.jsx`): every number comes from the ranking entry,
  `mirrorRows()` (scored `similarity()`, same 70 % threshold as "What matches") and `evidenceCoverage()`.
  The 0–100 scale shows the guaranteed part solid and the range missing data still allows hatched.
* **Planetary terrain** (`TerrainPair.jsx`, also on Site details): the validated target preview beside
  the selected Earth place's preview, both cropped by `cropOf()` to the same 27 km of ground (moved
  from `Mirror.jsx` to `lib/mirror.js`, now unit-tested), 60 m pixels, no vertical exaggeration;
  datasets, height references, projections and the "equal colours ≠ equal heights" caveat are stated.
* **Mission & scientific evidence** (`MissionEvidence.jsx`): mission question, why the place may be
  relevant (`why`, `gap`), the scenario limitation + fixed limitations note, the datasets behind the
  place's used values, and actions.
* **Site details**: "Research dossier" label and the terrain pair; otherwise unchanged.
* **Compare, Mirror, About**: restyled through the tokens; content unchanged. About keeps the AI-use
  disclosure and all attributions.

## 4. How the two skills were used

Neither skill was installed on the team machine (`~/.agents/skills` held other skills). Both were read
from their GitHub repositories in a scratch workspace; nothing was installed into the project.

**UI UX Pro Max** (`.claude/skills/ui-ux-pro-max/SKILL.md` read in full):
* `search.py "scientific research dashboard space mission control dark" --design-system --density 8
  --variance 4 --motion 2` → style *HUD / Sci-Fi FUI*, palette *Space Tech* (star white + launch blue),
  type *Exo + Roboto Mono*, dense spacing. Kept: dark navy ground, one cool accent, technical labels,
  density. Rejected with reason: glow/scan/ticker effects (accessibility risk high), Roboto Mono body
  text (readability), Google Fonts (would add a runtime request).
* `--domain ux "sidebar navigation collapse active state"` → *Active state* and *Deep linking* rules:
  active rail item + `aria-current`; selection, mode and view live in the URL.
* `--domain color "space aerospace dark navy cyan"`, `"dark mode contrast palette"` → navy/kiosk
  palettes used as the starting point; final values were contrast-checked (table above).
* Priority checklist applied: contrast ≥ 4.5 : 1, visible focus, 44 px touch targets, no colour-only
  meaning, reduced motion, no horizontal scroll at 375 px.

**3Dviz Pro Max** (`skills/3dviz-pro-max/SKILL.md` read in full; catalogue searched):
* `knowledge.reasoning-vertical-exaggeration-disclosure` — applied: every terrain view states
  "no vertical exaggeration".
* `recipe.map-projection-frames` — evaluated for a 3D globe; a globe helps when the question is
  projection distortion, not ours.
* Workflow step 3 (*ground the representation*) decided the 3D status below.

## 5. 3D visualization status: evaluated, not built

* **3D globe:** rejected. Eleven point sites gain no information from a globe; the Leaflet map is more
  usable, keyboard-accessible and already validated; a globe needs a new dependency.
* **3D terrain:** still deferred. The app ships shaded-relief *images*, not height grids, so a faithful
  mesh needs new pipeline output (the 60 m grids behind the previews) plus three.js (~150 KB gzipped).
  `CLAUDE.md` §10 requires team approval for any new dependency. The spec in `docs/art_technology.md`
  §5 still applies: lazy-loaded, one shared stated exaggeration, keyboard controls, 2D fallback.
* The 2D terrain pair already answers the scientific question (same ground, same scale, same window).

## 6. Verification (2026-11-14, on the team Windows machine + headless Chromium)

| Check | Result |
|---|---|
| pytest (`pipeline`) | 104 passed |
| `validate_bundle.py real` / `mock` | OK / OK |
| Vitest | 79 passed (6 files; +2 `cropOf` shared-scale tests) |
| oxlint | 0 errors, 1 warning (pre-existing `AppState.jsx` fast-refresh note; 2 before) |
| `vite build` / `vite build --mode mock` | pass / pass |
| Real build data contains `MOCK` | no |
| Mock build | mock banner, mock header chip, MOCK tags in the analysis panel |
| Browser interaction suite (26 checks) | 26 passed, 0 console errors or warnings |
| Horizontal overflow at 1440 / 1280 / 768 / 375 on all 6 pages | none |
| Real basemap tiles | checked in the Claude desktop browser on the team machine |

The interaction suite covers: Home → Mars → Rover testing → Explore journey; default selection;
header facts; marker → analysis and list; card → analysis and marker; Enter on a focused marker;
*Why this match?*; Research mode (7 weights, 2 ranking methods, full table, `adv=1`); a weight change
switching the mission to *Custom weights*; shortlist count in the rail; Compare with both places;
reload keeping target, mission and shortlist; analysis → Mirror carrying the place; the Moon workflow;
rail → `/about#data` with active state; AI-use disclosure present; mobile drawer open/Escape; 44 px tap
targets; no overflow; reduced motion.

Bundle size: main JS 506.5 kB (154.7 kB gzip), previously 461 kB (144 kB). The Earth preview metadata
now loads with Explore (panel B); the Mirror chunk fell from 32.8 kB to 12.6 kB.

**Fixed during QA:** Research table needed `scoreSite()` (ranking entries carry no `sims`); Leaflet maps
Enter to "open popup", so markers got an explicit Enter/Space handler; a map created before its
stylesheet applied started empty, so the map now fits all sites once its container is sized; the
`.btn` override hid the cyan primary buttons; panel A overflowed at 768 px.

## 7. Screenshots

`docs/screenshots/mission-control/before/` and `after/` (same URLs, same viewports). Headless captures
have no basemap tiles (the capture sandbox cannot reach the tile server);
`after/explore-moon-real-tiles-800.jpg` is from the desktop browser with real tiles.

## 8. Remaining limitations

* The reference screenshot was not available; visual parity with it is unverified.
* 3D terrain not built (approval + height-grid export needed).
* Below 1100 px the analysis panel follows the map instead of sitting beside it.
* Long target names truncate in the header at narrow widths (full name in its tooltip and on the page).
* No usability study with real users.

## 9. 30-second Art & Technology walkthrough (real app, real data)

| Time | On screen | Narration |
|---|---|---|
| 0–4 s | Discover: **Mars** → **Rover testing** → *Find matching places on Earth* | "Pick a world and a mission." |
| 4–10 s | Explore: the map dominates; **#1 Holuhraun lava field** (Iceland) is selected; the analysis shows **83/100, guaranteed minimum 83, 6 of 6 measured** | "Open datasets rank Earth places by resemblance — and say how complete the evidence is." |
| 10–15 s | Analysis: ✓ terrain relief 96 %, bare ground 98 %, geology 100 %; ✗ aridity 57 %, daily temperature swing 14 % | "Where it matches, and where Earth falls short." |
| 15–21 s | Panel B: Jezero and Holuhraun at the same 27 km scale, 10 km relief squares | "Two worlds, one scale, measured the same way." |
| 21–26 s | *Planetary Mirror* → Surface temperature: Jezero ≈ −52 °C vs Holuhraun −4.4 °C | "It shows the differences too." |
| 26–30 s | *Why this match?* → evidence types and *Full evidence and citations* | "Every number traces back to its source." |

Claims to avoid: discovery, suitability for a mission, NASA endorsement, live data.
