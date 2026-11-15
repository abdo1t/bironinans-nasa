# Demo script (about 3 minutes)

Open `prototype/web/planner.html` before you start. Each step has a deep link that opens the
exact view, so a broken click never stalls the demo (serve the folder or open the file directly).

| # | Time | Show | Say |
|---|---|---|---|
| 1 | 0:00 | `planner.html?target=shackleton_ridge` | "Analog lists tell you a place *looks* like the Moon. Engineers need to know if a site is good enough for **their test**, and what it can't tell them. We pick a NASA south-pole zone: the sunlit ridge next to Shackleton." |
| 2 | 0:25 | Left panel: target values | "Every number here comes from LRO data: LOLA slopes and sunlight, Diviner temperatures, Mini-RF radar." |
| 3 | 0:40 | Verdict matrix | "Each test becomes measurable requirements. Each Earth site gets pass, partial, fail, or unknown per requirement, from Copernicus DEM, Sentinel-1, MODIS and EMIT. Grey means no data: we never guess." Hover a cell to show the values and the caveat. |
| 4 | 1:10 | Recommended portfolio | "No single site covers a campaign. The planner finds the **smallest set** that does: here Haughton Crater plus Atacama." |
| 5 | 1:25 | Uncovered ledger | "And it says what stays uncovered: thermal cycling is partial at best, because no Earth site gets near 50 K, and ice sampling is capped because the radar can't be compared. Plus what Earth can't reproduce at all: gravity, vacuum, radiation, regolith." |
| 6 | 1:50 | `planner.html?target=shackleton_floor&tests=rover_traverse,thermal_cycling,ice_sampling` | "Change the target to the shadowed floor and pick three tests: the portfolio changes to Atacama plus McMurdo." |
| 7 | 2:10 | `planner.html?target=shackleton_floor&site=egypt_western_desert` | "Our discovery case, Egypt's Kharga yardangs, gets a passport with an evidence grade and the field checks needed. Honest result: a strong Mars wind analog, but it screens out for the lunar pole." |
| 8 | 2:35 | `Processed/validation.md` | "Validation: the Amazon negative control fails every test for every target, known analogs land where expected, and we report how the portfolio shifts when tolerances are halved or doubled." |
| 9 | 2:50 | — | "Screening evidence with stated limits, not confirmed analogs. Thresholds are plain data an engineer can change in one file." |

## Likely questions

- **Why not one similarity score?** It hides which requirement fails. The old score view is still at `index.html` for comparison.
- **Where do thresholds come from?** `data-tools/tests.json`; each has a written basis. They are first estimates for an engineer to confirm.
- **Why is Devon Island "unknown" on bare ground?** MODIS does not produce NDVI that far north. Unknown is shown, not guessed.
- **Can it do Mars?** The pipeline is target-agnostic; Mars needs MOLA / CRISM / THEMIS layers in `extract_features.py`.

## Screenshots

`docs/screenshots/` holds full-size captures of steps 1, 6 and 7 and of the similarity overview.
