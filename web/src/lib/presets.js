// Weight presets (0–5). Mirrored in pipeline/config.py PRESETS — keep in sync
// (scoring.test.js checks the balanced preset against the shared fixture).
export const PRESETS = {
  balanced: {
    label: 'Balanced',
    weights: { terrain: 3, aridity: 3, temp: 3, temp_range: 1, veg: 3, geology: 3, ice: 1 },
  },
  rover: {
    label: 'Rover testing',
    weights: { terrain: 5, aridity: 3, temp: 1, temp_range: 1, veg: 4, geology: 3, ice: 0 },
  },
  habitat: {
    label: 'Habitat & construction',
    weights: { terrain: 2, aridity: 3, temp: 2, temp_range: 2, veg: 3, geology: 5, ice: 1 },
  },
  ice: {
    label: 'Ice drilling',
    weights: { terrain: 2, aridity: 2, temp: 5, temp_range: 2, veg: 3, geology: 1, ice: 5 },
  },
}

export const DEFAULT_PRESET = 'balanced'
export const WEIGHT_MIN = 0
export const WEIGHT_MAX = 5
