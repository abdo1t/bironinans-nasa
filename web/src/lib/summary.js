// Display-only summaries of ranking entries for cards and the Compare page.
// Nothing here changes a score: inputs are scoring.js results (rankSites / scoreSite).
import { whyGapSummary } from './explain.js'
import { describeSiteValue } from './format.js'
import { similarity } from './scoring.js'

/** Guaranteed minimum = low end of scoreRange (the score itself when nothing is missing); null when unscored. */
export function guaranteedMin(entry) {
  if (!entry || entry.score === null || entry.score === undefined) return null
  return entry.scoreRange?.[0] ?? entry.score
}

/** True when missing site data could still move the score. */
export function hasOpenRange(entry) {
  return Array.isArray(entry?.scoreRange) && entry.scoreRange[0] !== entry.scoreRange[1]
}

/**
 * One entry, ready to print: { scored, score, min, max, hasRange, match, short }.
 * `match` = strongest match phrase, `short` = largest shortfall (or the reason there is no score).
 */
export function entrySummary(entry) {
  const scored = entry?.score !== null && entry?.score !== undefined
  const { match, short } = whyGapSummary(entry?.why, entry?.gap, scored ? entry.score : null)
  return {
    scored,
    score: scored ? entry.score : null,
    min: guaranteedMin(entry),
    max: scored ? (entry.scoreRange?.[1] ?? entry.score) : null,
    hasRange: scored && hasOpenRange(entry),
    match,
    short,
  }
}

/**
 * Where 2–3 compared sites differ most on the selected criteria.
 * Returns { differences, notComparable }:
 *   differences   [{ feature, weight, spread, best: {site, sim, text}, worst: {site, sim, text} }]
 *                 criteria with data for at least two sites whose similarity spread is
 *                 >= minSpread, ordered by weight × spread (ties: feature order), at most `limit`.
 *   notComparable [{ feature, missing: [site, ...] }] selected criteria where at least one
 *                 compared site has no similarity (missing data is never treated as 0).
 */
export function keyDifferences(sites, target, features, weights, { limit = 3, minSpread = 0.15 } = {}) {
  const differences = []
  const notComparable = []
  for (const f of features) {
    const weight = weights[f.id] || 0
    if (weight <= 0) continue
    const rows = sites.map((site) => ({ site, sim: similarity(f, site.norm[f.id], target.norm[f.id]) }))
    const present = rows.filter((r) => r.sim !== null)
    const missing = rows.filter((r) => r.sim === null).map((r) => r.site)
    if (missing.length) notComparable.push({ feature: f, missing })
    if (present.length < 2) continue
    const best = present.reduce((a, b) => (b.sim > a.sim ? b : a))
    const worst = present.reduce((a, b) => (b.sim < a.sim ? b : a))
    const spread = best.sim - worst.sim
    if (spread < minSpread) continue
    const withText = (r) => ({ site: r.site, sim: r.sim, text: describeSiteValue(f, r.site).text })
    differences.push({ feature: f, weight, spread, best: withText(best), worst: withText(worst) })
  }
  differences.sort((a, b) => b.weight * b.spread - a.weight * a.spread)
  return { differences: differences.slice(0, limit), notComparable }
}
