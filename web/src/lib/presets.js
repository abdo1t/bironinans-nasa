// Weight presets (0–5). Mirrored in pipeline/config.py PRESETS — keep in sync
// (scoring.test.js checks the balanced preset against the shared fixture).
// `rationale` is UI text only (one line under the preset select); it never affects scores.
export const PRESETS = {
  balanced: {
    label: 'Balanced',
    rationale:
      'General screening: relief, aridity, surface temperature, bare ground and geology weigh equally; temperature swing and ground ice count less.',
    weights: { terrain: 3, aridity: 3, temp: 3, temp_range: 1, veg: 3, geology: 3, ice: 1 },
  },
  rover: {
    label: 'Rover testing',
    rationale:
      'Rover mobility and navigation tests: relief and bare ground dominate; aridity and geology affect dust and regolith; ground ice is irrelevant.',
    weights: { terrain: 5, aridity: 3, temp: 1, temp_range: 1, veg: 4, geology: 3, ice: 0 },
  },
  habitat: {
    label: 'Habitat & construction',
    rationale:
      'Habitat and construction trials: geology (rock and regolith type for foundations and local materials) dominates; aridity and bare ground matter for dust and exposure; relief and temperature count moderately.',
    weights: { terrain: 2, aridity: 3, temp: 2, temp_range: 2, veg: 3, geology: 5, ice: 1 },
  },
  ice: {
    label: 'Ice drilling',
    rationale:
      "Ice prospecting and drilling trials: surface temperature and ground ice dominate. The ice criterion means 'matches the target's ground-ice state', so for an ice-free target it favours ice-free sites.",
    weights: { terrain: 2, aridity: 2, temp: 5, temp_range: 2, veg: 3, geology: 1, ice: 5 },
  },
}

export const DEFAULT_PRESET = 'balanced'
export const WEIGHT_MIN = 0
export const WEIGHT_MAX = 5
