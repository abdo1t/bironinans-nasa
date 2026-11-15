// Research objectives ("missions") = the weight presets, framed in plain language.
// UI text only: a mission selects PRESETS[id].weights and nothing else, so Quick and
// Advanced exploration share one scoring system (lib/scoring.js).
import { PRESETS } from './presets.js'

// fieldTest / fieldMeasure: what a team could try at a well-matched place, and the one
// measurement this tool cannot supply for that objective (it compares 10 km-scale relief,
// grid-cell climate and literature geology only). Suggestions, not validated requirements.
export const MISSIONS = {
  rover: {
    question: 'Where could rover driving and navigation be rehearsed?',
    fieldTest: 'Rover driving and navigation trials across ground whose landscape-scale relief and bare surface resemble the reference site.',
    fieldMeasure: 'Rover-scale slopes, rock abundance and soil bearing strength along a planned test traverse.',
  },
  habitat: {
    question: 'Where could building and local-materials trials be rehearsed?',
    fieldTest: 'Construction and local-materials handling trials using rock and loose material of the matching type.',
    fieldMeasure: 'Grain size, cohesion and bulk density of local loose material from sampled pits.',
  },
  ice: {
    question: 'Where could ice prospecting and drilling be rehearsed?',
    fieldTest: 'Ice prospecting and drilling trials in cold, frozen ground.',
    fieldMeasure: 'Depth to ground ice and ice content, from boreholes or ground-penetrating radar.',
  },
  balanced: {
    question: 'Which Earth sites resemble this place overall?',
    fieldTest: 'A reconnaissance visit to check the closest-matching characteristics on the ground.',
    fieldMeasure: 'On-site ground truth for the global-dataset values used here (e.g. a year of surface-temperature logging).',
  },
}

// Mission-specific objectives first, the general screen last.
export const MISSION_ORDER = ['rover', 'habitat', 'ice', 'balanced'].filter((id) => PRESETS[id])

export const MISSION_CAVEAT =
  'A research objective sets screening priorities (criterion weights). It is not a validated set of mission requirements, and a high score means resemblance — not mission suitability.'

/** Display title of a mission (the preset label; Balanced is also the general-research screen). */
export function missionTitle(presetId) {
  const p = PRESETS[presetId]
  if (!p) return presetId
  return presetId === 'balanced' ? 'General research (balanced)' : p.label
}

/** Mission label for the current state; adjusted weights keep the test type they started from. */
export function missionLabel({ isCustom, presetId, basePresetId }) {
  if (!isCustom) return missionTitle(presetId)
  return PRESETS[basePresetId] ? `${missionTitle(basePresetId)} (custom criteria)` : 'Custom weights'
}

/**
 * Labels of the criteria a mission emphasises: every criterion at the preset's top
 * weight, plus those within one point of it (at most `limit`), in feature order.
 */
export function missionEmphasis(presetId, features, limit = 3) {
  const weights = PRESETS[presetId]?.weights
  if (!weights) return []
  const top = Math.max(...features.map((f) => weights[f.id] || 0))
  if (top <= 0) return []
  return features
    .filter((f) => (weights[f.id] || 0) >= Math.max(top - 1, 1))
    .sort((a, b) => (weights[b.id] || 0) - (weights[a.id] || 0))
    .slice(0, limit)
    .map((f) => f.label)
}
