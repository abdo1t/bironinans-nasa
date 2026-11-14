// Planetary Mirror: per-criterion comparison rows for one target and one Earth site.
// Display only. Similarities come from scoring.js `similarity` (the scored function), and the
// match threshold is WHY_MIN_SIM, the same one "What matches" uses — nothing is re-scored here.
import { describeSiteValue, describeTargetValue } from './format.js'
import { WHY_MIN_SIM, isMissing, similarity } from './scoring.js'

/**
 * One row per feature, in feature order:
 *   { feature, weight, sim, status, missingSide, target, site }
 * status: 'match' (sim >= WHY_MIN_SIM), 'differ' (sim < WHY_MIN_SIM), 'missing' (no similarity:
 * a value is missing or excluded on at least one side) or 'unused' (weight 0 under the objective).
 * missingSide: 'target' | 'site' | 'both' | null. Missing is never shown as 0.
 * target / site: describeTargetValue / describeSiteValue results (display text + provenance).
 */
export function mirrorRows(target, site, weights, features) {
  return features.map((feature) => {
    const weight = weights[feature.id] || 0
    const t = target.norm?.[feature.id]
    const s = site.norm?.[feature.id]
    const sim = similarity(feature, s, t)
    const tMiss = isMissing(t)
    const sMiss = isMissing(s)
    const missingSide = tMiss && sMiss ? 'both' : tMiss ? 'target' : sMiss ? 'site' : null
    let status
    if (weight <= 0) status = 'unused'
    else if (sim === null) status = 'missing'
    else status = sim >= WHY_MIN_SIM ? 'match' : 'differ'
    return {
      feature,
      weight,
      sim,
      status,
      missingSide,
      target: describeTargetValue(feature, target),
      site: describeSiteValue(feature, site),
    }
  })
}

/** Criterion to open first: the highest-weight used match, else the highest-weight used row. */
export function defaultCriterion(rows) {
  const used = rows.filter((r) => r.status !== 'unused')
  const best = (list) => list.reduce((a, b) => (b.weight > a.weight ? b : a), list[0])
  const matches = used.filter((r) => r.status === 'match')
  return (matches.length ? best(matches) : used.length ? best(used) : rows[0])?.feature.id ?? null
}

export const MIRROR_STATUS = {
  match: { label: 'Similar', symbol: '✓', help: `at least ${Math.round(WHY_MIN_SIM * 100)}% similar` },
  differ: { label: 'Different', symbol: '✗', help: `under ${Math.round(WHY_MIN_SIM * 100)}% similar` },
  missing: { label: 'No data', symbol: '–', help: 'not scored: a value is missing or excluded' },
  unused: { label: 'Not used', symbol: '·', help: 'weight 0 under this objective' },
}
