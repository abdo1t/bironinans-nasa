# Prototype integration guide — Earth Analog Finder method v1.0.0

Read **one file**: `outputs/analog_results.json` (~0.5 MB, UTF-8, Arabic + English labels).
Everything the UI needs is in it; the CSVs are the same data flattened for spreadsheets.

## Files

| File | Use |
|---|---|
| `outputs/analog_results.json` | Main input for the prototype |
| `outputs/analog_results.csv` | One row per target × mission test × site (quick tables) |
| `outputs/contributions.csv` | One row per parameter contribution |
| `outputs/metrics_long.csv` | All extracted raw metrics (every scale/window) |
| `outputs/moon_region_windows.csv` | 2,887 lunar 10 km windows (for a distribution chart) |
| `config/*.json` | Targets, parameters, weights, site names/caveats |
| `METHOD_ar.md` | Method explanation (Arabic) — link it from the UI |

## JSON structure

```jsonc
{
  "meta": {
    "method_version": "1.0.0",
    "provisional": true,
    "ranking_allowed": false,          // see display rules below
    "display_guidance": "...",
    "score_definition": "...", "coverage_definition": "...", "score_range_definition": "...",
    "statuses": {"scored": "...", "insufficient_data": "...", "target_data_unavailable": "..."}
  },
  "targets":       [ {id, name, body, type, lat, ...} ],
  "mission_tests": [ {id, label_en, label_ar, bodies, parameters:{param: weight}, context:[...], rationale} ],
  "parameters":    { "slope_median_deg": {label_en, label_ar, unit, comparability:{mars, moon}, method, limitations}, ... },
  "earth_sites":   { "egypt_western_desert": {name_en, name_ar, negative_control?, caveats:[...]}, ... },
  "results": [
    {
      "target_id": "mars_jezero", "body": "mars",
      "mission_test": "rover_mobility", "mission_test_en": "...", "mission_test_ar": "...",
      "site_id": "egypt_western_desert", "site_name_en": "...", "site_name_ar": "...",
      "negative_control": false,
      "status": "scored",                 // | insufficient_data | target_data_unavailable
      "score": 0.875,                     // null unless status == scored
      "score_range": [0.60, 0.91],        // sensitivity min/max (null if never scorable)
      "sensitive_to_assumptions": false,  // true -> range wider than 0.4
      "coverage": 1.0,                    // 0..1 share of weight with data on both sides
      "confidence": "medium",             // medium | low | insufficient
      "summary_en": "Closest: ... Largest mismatch: ... Data coverage 100%.",
      "summary_ar": "...",
      "contributions": [
        {"parameter": "slope_median_deg", "label_en": "...", "label_ar": "...", "unit": "deg",
         "earth_value": 1.85, "target_value": 2.05, "similarity": 0.91,
         "weight": 0.30, "comparability": "comparable", "comparability_factor": 1.0,
         "contribution": 0.27,                       // sums to score over scored params
         "earth_percentile_in_target_region": null,  // Moon terrain only: where Earth value sits among lunar windows
         "note": "..."}                              // why missing, or data caveat
      ],
      "context": [ {"parameter": "solar_irradiance_kwh_m2_day", "earth_value": 6.46, "target_value": null, "unit": "...", "note": "..."} ],
      "site_caveats": ["..."]
    }
  ]
}
```

## Typical UI flow

1. User picks **target** (`targets[].id`) → offer only `mission_tests` whose `bodies` include the target body.
2. User picks **mission test** → filter `results` by `target_id` + `mission_test`.
3. Show the 12 sites with: score **and** `score_range`, `coverage`, `confidence`, `summary_ar/en`.
4. On site click: contributions bar (each `contribution`), Earth vs target values with units,
   `note`s, `context` values, `site_caveats`, and a link to `METHOD_ar.md`.

## Display rules (please keep these — they protect the project's scientific validity)

- `meta.ranking_allowed` is **false**. You may *order* sites by score inside one mission test, but label it
  "provisional similarity for this test" (e.g. «تشابه مبدئي لهذا الاختبار»), never "best site" / "ranking".
- Always show `score_range` and `confidence` next to `score`. If `sensitive_to_assumptions` is true, show a warning icon.
- `status != "scored"` → show the reason, not 0. Arcadia terrain tests are `target_data_unavailable`:
  show "Terrain data unavailable — DTM file damaged, re-download required".
- Mark `negative_control: true` (Amazon) visibly. It scores mid-pack on terrain — that is expected and is the
  main evidence that terrain-only scores are not a full analog assessment.
- `lighting_geometry` is Sun geometry only. Show its rationale text: it is not an environmental analog.
- Moon target is **regional** (80–90°S), not a landing site.
- Do not average scores across mission tests or across targets.

## Updating

Change weights/tolerances in `config/*.json`, then run `python -I score.py` (seconds).
Re-run `python -I extract_metrics.py` only if source data change (e.g. a re-downloaded Arcadia DTM).
