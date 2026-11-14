// Research objectives ("missions") = the weight presets, framed in plain language.
// UI text only: a mission selects PRESETS[id].weights and nothing else, so Quick and
// Advanced exploration share one scoring system (lib/scoring.js).
import { PRESETS } from './presets.js'

export const MISSIONS = {
  rover: {
    question: 'Where could rover driving and navigation be rehearsed?',
  },
  habitat: {
    question: 'Where could building and local-materials trials be rehearsed?',
  },
  ice: {
    question: 'Where could ice prospecting and drilling be rehearsed?',
  },
  balanced: {
    question: 'Which Earth sites resemble this place overall?',
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
