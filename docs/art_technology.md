# Art & Technology: Planetary Mirror

Branch `ux-simplification`. Rollback point: tag `pre-art-tech`. Written 2026-11-14. Nothing is deployed or submitted. This document makes no award, nomination, NASA-endorsement or discovery claim.

## 1. Creative concept and visual direction

**Planetary Mirror: two worlds, one comparison.** A Moon or Mars site and one Earth place sit side by side. Each is drawn from the elevation model its terrain score was measured on, both at the same ground scale. Between the two worlds is a "bridge" made of the scored characteristics. Pick one characteristic and the evidence for both worlds opens below.

Guiding principle: *make science visible, make exploration intuitive, make data beautiful without making it misleading.* Every visual element in the Mirror is a measurement, a measurement window, a scale, or a label for missing data. Nothing is decoration.

The story arc is DISCOVER → UNDERSTAND → COMPARE → EXPLORE:

| Stage | Where | Purpose |
|---|---|---|
| Discover | Home | Choose a world and a research objective; one button. |
| Understand | Explore (map + ranked cards) | Why each place ranks where it does. Ranking-change feedback shows what an objective changes. |
| Compare | **Planetary Mirror**, Compare | One place against the planetary site (Mirror), or 2–3 places against each other (Compare). |
| Explore | Mirror evidence panel, Site details | Values, units, datasets, citations and limitations. |

The Mirror is optional. Explore → View details → Compare still works without it, and the Mirror is lazy-loaded (33 kB JS, 8 kB gzipped) so it adds nothing to the main journey.

## 2. UI UX Pro Max decisions actually applied

| Guidance (skill search result or rule) | Applied in |
|---|---|
| *Color only*: "Don't convey information by color alone; use icons/text" (ux-guidelines, severity High). | Every semantic colour is paired with a symbol and a word: ✓ similar, ✗ different, – no data, · not used. Moves read "▲ up 2". World panels are named "Mars · planetary reference" / "Earth · candidate place". |
| Charts: radar is a poor fit for precise comparison or for audiences unfamiliar with radar; offer a grouped-bar alternative and a table (charts.csv, multi-variable comparison). | The Mirror uses one labelled bar per characteristic with its % value. The radar stays on Compare with its table and plain summary. |
| Touch targets ≥ 44 px; visible focus. | Characteristic buttons measured at 44 px at 375 px width; `:focus-visible` outline. |
| Reduced motion. | The only motion (measurement-square highlight, rank-move fade) is wrapped in `prefers-reduced-motion: no-preference`. No numeric value is ever animated. |
| No horizontal scroll; mobile-first. | 375 px: `scrollWidth` = 375 on the Mirror. The stage stacks to one column below 1000 px. |
| Semantic colour tokens, not raw hex in components. | `styles/mirror.css` defines `--world-planet`, `--world-earth`, `--sem-match`, `--sem-differ` and `--sem-missing`. |

### Colour semantics

| Meaning | Token | Value | Paired with |
|---|---|---|---|
| Mars reference | `--world-planet` | rust `#d9774a` | "Mars · planetary reference" |
| Moon reference | `--world-planet` | regolith grey `#c9ccd6` | "Moon · planetary reference" |
| Earth candidate | `--world-earth` | teal `#4cc3b0` | "Earth · candidate place" |
| Similar (≥ 70 %) | `--sem-match` | `#9ee0c4` | ✓ and "similar" |
| Different (< 70 %) | `--sem-differ` | `#f2a65a` | ✗ and "different" |
| No data | `--sem-missing` | grey, **hatched track** | – and "no data"; never a zero-length bar |
| Elevation | cividis ramp | colour-blind safe, lightness rises with height | min/max in metres under each picture |

## 3. Planetary Mirror component

- Route `/mirror?target=…&preset=…&site=…&crit=…`. All state is in the URL, so a view can be shared or reloaded.
- Entry points: nav **Mirror**; **Mirror** on every scored Explore card; **Mirror with Mars / the Moon** on Site details.
- Files:
  - `web/src/pages/Mirror.jsx` and `web/src/styles/mirror.css`
  - `web/src/lib/mirror.js` (+ tests): per-characteristic status from the scored `similarity()` and the same 70 % threshold as "What matches"
  - `pipeline/make_site_preview.py` (+ tests) and `web/src/data/sitePreviews.json`
  - 11 Earth images in `web/public/previews/`, 180 KB in total
- Interactions the brief asked for:
  - select the planetary target and the Earth place;
  - see both terrains side by side;
  - switch characteristics: Terrain outlines the 10 km measurement squares on both images; the others say they cannot be seen in the picture;
  - open the evidence (values, evidence type, dataset, period, resolution, citation, notes);
  - full evidence, add to compare, back to the map.

## 4. Before and after screenshots

- Before (earlier pass, still current for those pages): `docs/screenshots/01–06*.png`.
- After: `docs/screenshots/art-tech/`:
  - `mirror-jezero-holuhraun.jpg`
  - `mirror-moon-mcmurdo.jpg`
  - `mirror-evidence-temperature.jpg`
  - `explore-rank-change.jpg`

## 5. 3D terrain: evaluated and deferred

3Dviz Pro Max guidance was read: ground the representation, state what changes and what stays fixed, measure before optimising. A scientifically valid 3D view is possible, because the DEMs exist (Mars CTX 20 m, LOLA 20 m, Earth NASADEM/Copernicus COGs). It was deferred for four reasons:

1. **It needs a new dependency** (three.js or similar, about 150 KB gzipped). CLAUDE.md §10 requires human approval for any dependency not in the stack.
2. **3D invites misleading comparisons.** A pair of surfaces needs one vertical exaggeration and one vertical datum, and the relief ranges differ (Holuhraun 651–1260 m, Jezero −2710 to −1517 m). Getting that right takes more than one demo slot.
3. **The 2D Mirror already answers the scientific question.** It shows the same ground, the same measurement window and the same scale.
4. **Deadline risk.** The hackathon is November 14–15.

If approved, the spec is a lazy-loaded `TerrainMesh` per side built from the same 60 m grids. It would use one shared, labelled exaggeration (for example ×2, stated on screen), rotate/zoom/reset buttons plus keyboard controls, and fall back to the 2D image.

## 6. Scientific provenance and visualization checks

| Check | Result |
|---|---|
| Earth image uses the scored DEM | `make_site_preview.py` reads `terrain.csv` `dem` (never re-chosen). Test `sameAsScored`. |
| Same ground scale on both sides | Earth windows are 26.98 km at 60 m per pixel, matching the Jezero preview. The Moon image (50 km) is cropped to 26.98 km around its marker. Tests compare `metresPerPixel` and `windowKm` with Jezero. |
| No vertical exaggeration | `vertExag` = 1.0 in every entry (tested). Stated in each caption. |
| Missing stays missing | Nodata becomes NaN, never 0 (tested). Missing characteristics use a hatched track and say which side lacks data. |
| Coastal / sea surface | `nearSeaLevelFrac` recorded. Lanzarote's caption says 51 % of the view is sea surface. Haughton is 0.4 %, below the 5 % note threshold. |
| Surface-model caveat | "Surface model: ice, vegetation and buildings count as height" on every Earth panel. Holuhraun's high ground at lower left is glacier surface. |
| Colour honesty | Each image stretches its own range, and the panel says so: "equal colours ≠ equal heights". |
| Height references | Earth: EGM96 (NASADEM) / EGM2008 (Copernicus) geoid. Mars: MOLA areoid. Moon: sphere. All shown. |
| Orientation | Earth and Mars: north up. Moon: "up = toward 0° E (polar view, no single north)". |
| Attribution | Copernicus licence text and citations are in the Mirror footer and the JSON. |
| Scores unchanged | `git diff pre-art-tech` on bundle data, pipeline data, seeds, scoring (both languages), presets and the parity fixture: **empty**. |

## 7. Accessibility and performance

- Native buttons with `aria-pressed`; screen-reader text gives status, threshold and weight for each characteristic. Images have descriptive `alt`. No hover-only information.
- 375 px: no horizontal overflow; targets are 44 px.
- Main bundle 461 kB (144 kB gzipped), unchanged in kind. The Mirror chunk is 33 kB (8 kB gzipped). Each image is 7–26 KB and loads only on the Mirror.

## 8. Test and build results

- Vitest: 77 passed (6 files); new tests in `mirror.test.js` and `summary.test.js`.
- pytest: 104 passed; 3 new in `test_site_preview.py`.
- `validate_bundle.py`: real OK, mock OK.
- `npm run build` and `npm run build:mock`: pass.

## 9. Commits (this pass)

- `df3b60f`: pipeline Earth previews
- `2128031`: Planetary Mirror
- `2297080`: ranking-change feedback and screenshots
- plus this document

## 10. 30-second demonstration storyboard (real app, real data)

| Time | Shot | On screen | Narration |
|---|---|---|---|
| 0–4 s | Home | Click **Mars**, then **Rover testing**, then **Find matching places on Earth** | "Pick a world and a goal." |
| 4–9 s | Explore | Map lights up; the list opens with the most complete evidence first; Holuhraun is #1 (83/100) | "Real NASA and ESA data rank Earth places by resemblance." |
| 9–12 s | Explore | Click **Mirror** on Holuhraun | "Now put the two worlds side by side." |
| 12–19 s | Mirror | Jezero and Holuhraun at the same 27 km scale; Terrain relief 96 % with both measurement squares lit | "Same ground, same scale, measured the same way." |
| 19–25 s | Mirror | Click **Surface temperature**: ✗ 50 %; Jezero −52 °C (MEDA, in situ) vs Holuhraun −4.4 °C (NASA POWER) | "And it shows where Earth falls short." |
| 25–30 s | Mirror | Click **Full evidence**: citations and datasets | "Every pixel and number traces back to its source." |

## 11. How art and technology are integrated

The picture is the data: shaded relief rendered from the elevation models behind the score, with the scoring window drawn in. The composition is the method. Two worlds at one scale, with the scored characteristics as the bridge between them, show that the ranking compares like with like. The colour system carries meaning (world identity, similar, different, no data), and every colour has a word. The software keeps that honesty: one shared scale, cropping by ground distance, provenance in the JSON, tests that guard scale and exaggeration, and no change to any validated number.

## 12. Remaining risks before submission

- **Scoring order.** With "best match first", Lanzarote is #1 for Jezero (94, 3 of 6 measured). The demo relies on the Home → Rover path opening "most complete evidence first". Opening Explore from the nav loses that.
- **Network for one-off re-renders.** Earth previews need network only to regenerate them; the app ships the images.
- **Unscored on the Moon.** Holuhraun and others have no Moon-side daily temperature swing; the Mirror shows "no data" honestly.
- **Card actions.** The fourth action wraps onto a second line on narrow cards.
- **No real users.** No usability study with real users has been run.
- **3D not built.** It needs dependency approval (section 5).
