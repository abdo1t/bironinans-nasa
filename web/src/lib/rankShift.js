// Display helpers that EXPLAIN how a ranking changed when research priorities change.
// Nothing here computes a new kind of score: every number comes from scoring.js
// (rankSites / scoreSite, the same engine that ranks everywhere else). These helpers
// only compare two rankings and re-run that engine with one weight changed at a time.
import { orderRanking } from './explain.js'
import { rankSites, scoreSite } from './scoring.js'

/**
 * Rank a target's sites with a given weight set, exactly as AppState does (scoring.js +
 * orderRanking), and number the scored places 1..n. Unscored places get rank null.
 */
export function rankWith(target, sites, weights, features, minCriteria, rankBy, siteById) {
  if (!target) return []
  const ranked = orderRanking(rankSites(target, sites, weights, features, minCriteria), rankBy, siteById)
  let n = 0
  return ranked.map((r) => ({ ...r, rank: r.score === null ? null : ++n }))
}

/**
 * Per-site movement between a baseline ranking and the current one.
 * Returns { [siteId]: { prevRank, rank, delta, prevScore, score, scoreDelta, status } }
 *   delta      = prevRank - rank (positive = moved up), null if either rank is missing
 *   scoreDelta = score - prevScore, null if either score is missing
 *   minDelta   = change of the conservative lower bound (scoreRange[0]), null if either is missing
 *   status     = 'up' | 'down' | 'same' | 'entered' (now scored, was not) | 'dropped' (was scored, now not) | 'none'
 */
export function rankShift(baseline, current) {
  const before = Object.fromEntries((baseline || []).map((r) => [r.site, r]))
  const out = {}
  for (const r of current || []) {
    const b = before[r.site]
    const prevRank = b?.rank ?? null
    const prevScore = b?.score ?? null
    const rank = r.rank ?? null
    const delta = prevRank !== null && rank !== null ? prevRank - rank : null
    const scoreDelta = prevScore !== null && r.score !== null ? r.score - prevScore : null
    // lower end of the score range (conservative lower bound), for rank=min displays
    const lo = (e) => (e && e.score !== null && e.score !== undefined ? (e.scoreRange?.[0] ?? e.score) : null)
    const minDelta = lo(b) !== null && lo(r) !== null ? lo(r) - lo(b) : null
    let status = 'none'
    if (rank !== null && prevRank === null) status = 'entered'
    else if (rank === null && prevRank !== null) status = 'dropped'
    else if (delta !== null) status = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'
    out[r.site] = { prevRank, rank, delta, prevScore, score: r.score, scoreDelta, minDelta, status }
  }
  return out
}

/** Criteria whose weight differs between two weight sets, in feature order. */
export function weightChanges(fromWeights, toWeights, features) {
  return features
    .map((f) => ({ id: f.id, label: f.label, from: fromWeights?.[f.id] || 0, to: toWeights?.[f.id] || 0 }))
    .filter((c) => c.from !== c.to)
}

/**
 * Why did ONE site's score change between two weight sets? For each changed criterion,
 * re-run scoreSite (the real engine) with only that weight changed from the baseline and
 * report the difference. Effects are measured one at a time, so they need not add up exactly
 * to the total change (a score is a weighted mean, so changes interact) — the UI says so.
 *
 * Returns { total, baseScore, score, items: [{ id, label, from, to, effect, sim, siteHasData }] }
 * sorted by |effect| desc; `effect` is null when the site has no score in either variant.
 * `sim` is the site's similarity on that criterion (null = data missing on either side).
 */
export function explainScoreChange(target, site, fromWeights, toWeights, features, minCriteria) {
  const base = scoreSite(target, site, fromWeights, features, minCriteria)
  const now = scoreSite(target, site, toWeights, features, minCriteria)
  const total = base.score !== null && now.score !== null ? now.score - base.score : null
  // similarity per criterion regardless of weight (weight 1 everywhere just to read sims)
  const allOn = Object.fromEntries(features.map((f) => [f.id, 1]))
  const sims = scoreSite(target, site, allOn, features, 1).sims
  const items = weightChanges(fromWeights, toWeights, features).map((c) => {
    const one = scoreSite(target, site, { ...fromWeights, [c.id]: c.to }, features, minCriteria)
    const effect = base.score !== null && one.score !== null ? one.score - base.score : null
    const sim = sims[c.id] ?? null
    return { ...c, effect, sim, siteHasData: sim !== null }
  })
  items.sort((a, b) => Math.abs(b.effect ?? 0) - Math.abs(a.effect ?? 0))
  return { total, baseScore: base.score, score: now.score, items }
}

/** "+4", "−3", "±0" with a real minus sign; '' for null. */
export function signed(n) {
  if (n === null || n === undefined) return ''
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '±0'
}

/**
 * The places that moved most (by rank), largest first. Ties: larger |scoreDelta|, then
 * current rank. Only places ranked in both rankings.
 */
export function biggestMovers(shift, limit = 3) {
  return Object.entries(shift)
    .filter(([, s]) => s.delta)
    .sort(
      ([, a], [, b]) =>
        Math.abs(b.delta) - Math.abs(a.delta) ||
        Math.abs(b.scoreDelta ?? 0) - Math.abs(a.scoreDelta ?? 0) ||
        a.rank - b.rank,
    )
    .slice(0, limit)
    .map(([site, s]) => ({ site, ...s }))
}

/**
 * Leaders per research objective for one target: the same ranking run with each preset's
 * weights. Returns [{ presetId, top: [{site, score, rank, scoreRange, ...}], scored }].
 */
export function leadersByObjective(target, sites, features, minCriteria, rankBy, siteById, presets, order, limit = 3) {
  return order
    .filter((id) => presets[id])
    .map((presetId) => {
      const ranked = rankWith(target, sites, presets[presetId].weights, features, minCriteria, rankBy, siteById)
      const scored = ranked.filter((r) => r.score !== null)
      return { presetId, top: scored.slice(0, limit), scored: scored.length }
    })
}
