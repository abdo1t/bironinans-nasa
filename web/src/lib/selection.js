// Display-only helpers for the first-visit journey: short names for the current
// selection and the single evidence-backed reason a place appears. Nothing here
// changes a score; similarities come from scoring.js.
import { EVIDENCE, bodyLabel, describeSiteValue, describeTargetValue } from './format.js'
import { WHY_MIN_SIM, similarity } from './scoring.js'

// Title-case mission names for the one-line selection ("Moon · South Pole · Ice Exploration").
const MISSION_SHORT = {
  ice: 'Ice Exploration',
  rover: 'Rover Testing',
  habitat: 'Habitat & Construction',
  balanced: 'General Research',
}

/** "Lunar South Pole — Shackleton…" -> "South Pole"; "Jezero Crater — …" -> "Jezero Crater". */
export function targetShortName(target) {
  if (!target) return ''
  return target.name.split(' — ')[0].replace(/^(Lunar|Martian)\s+/, '')
}

export function missionShortName(presetId, isCustom = false) {
  if (isCustom) return 'Custom Weights'
  return MISSION_SHORT[presetId] || presetId
}

/** ["Moon", "South Pole", "Ice Exploration"] — the parts of the current selection. */
export function selectionParts(target, presetId, isCustom) {
  if (!target) return []
  return [bodyLabel(target.body), targetShortName(target), missionShortName(presetId, isCustom)]
}

/**
 * The selected criterion that adds the most to this place's score (largest weight × similarity
 * among those at least WHY_MIN_SIM similar; ties: feature order), with the measured values on
 * both sides and the evidence type behind the Earth value. Null when no criterion qualifies.
 */
export function topReason(site, target, weights, features) {
  let best = null
  for (const f of features) {
    const w = weights[f.id] || 0
    if (w <= 0) continue
    const sim = similarity(f, site.norm[f.id], target.norm[f.id])
    if (sim === null || sim < WHY_MIN_SIM) continue
    if (best === null || w * sim > best.w * best.sim) best = { f, w, sim }
  }
  if (!best) return null
  const sv = describeSiteValue(best.f, site)
  const tv = describeTargetValue(best.f, target)
  return {
    feature: best.f,
    sim: best.sim,
    siteText: sv.text,
    // compact form: the method note in a trailing "(…)" stays in the evidence view
    targetText: tv.text ? tv.text.replace(/\s*\([^()]*\)\s*$/, '') || tv.text : null,
    clipped: Boolean(tv.clipped),
    evidence: sv.status ? EVIDENCE[sv.status]?.label || sv.status : null,
  }
}
