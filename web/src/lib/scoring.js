// Exact port of pipeline/scoring.py (score_site / rank_sites). CLAUDE.md §5.
// Must produce identical output for pipeline/tests/fixture.json — see scoring.test.js.
// Parity rules:
//   * Criteria are processed in the order of the `features` array.
//   * Rounding is explicit half-up: Math.floor(x + 0.5) (matches Python side).
//   * Names compare by code unit with plain `<`, never localeCompare.

export const MIN_CRITERIA_FOR_SCORE = 3 // real bundle + app; scoreSite defaults to 1
export const WHY_MIN_SIM = 0.7
export const WHY_MAX_ITEMS = 3
export const MUCH_DIFF = 0.5

// Direction words for the `gap` sentence: [site higher than target, site lower].
export const GAP_WORDS = {
  terrain: ['rougher', 'smoother'],
  aridity: ['drier', 'wetter'],
  temp: ['warmer', 'colder'],
  temp_range: ['larger temperature swing', 'smaller temperature swing'],
  veg: ['barer', 'more vegetated'],
}
const DEFAULT_GAP_WORDS = ['higher', 'lower']

export const NO_CRITERIA_GAP = 'No criteria selected'
export const NO_DATA_GAP = 'No usable data for the selected criteria'
export const NO_GAP = 'No gaps on the selected criteria'
export const CLIPPED_NOTE = "target is beyond Earth's range"
export const LIMITATIONS_NOTE = 'No Earth site reproduces lunar/Martian gravity, vacuum or radiation.'

export function isMissing(v) {
  return v === null || v === undefined || v === ''
}

export function roundHalfUp(x) {
  return Math.floor(x + 0.5)
}

export function roundTo(x, digits) {
  const f = 10 ** digits
  return Math.floor(x * f + 0.5) / f
}

const cap = (text) => text.slice(0, 1).toUpperCase() + text.slice(1)

/** Per-criterion similarity in [0, 1], or null if either side is missing (§5.3). */
export function similarity(feature, siteVal, targetVal) {
  if (isMissing(siteVal) || isMissing(targetVal)) return null
  if (feature.kind === 'numeric') return 1 - Math.abs(siteVal - targetVal)
  if (siteVal === targetVal) return 1.0
  const related = feature.related || {}
  if ((related[targetVal] || []).includes(siteVal) || (related[siteVal] || []).includes(targetVal)) {
    return 0.5
  }
  return 0.0
}

function whyPhrase(feature, siteVal, first, clipped = false) {
  const label = feature.label
  if (feature.kind === 'numeric') {
    if (clipped) {
      // target lies beyond Earth's bounds: a match means "near Earth's extreme"
      return first
        ? `Strongest match: ${label.toLowerCase()} (near Earth's extreme; ${CLIPPED_NOTE})`
        : `${label} near Earth's extreme (${CLIPPED_NOTE})`
    }
    return first ? `Strongest match: ${label.toLowerCase()}` : `${label} close to target`
  }
  if (first) return `Strongest match: ${label.toLowerCase()} (${siteVal})`
  return `${label}: ${siteVal}`
}

function gapPhrase(feature, s, siteVal, targetVal, clipped = false) {
  if (s >= 1) return NO_GAP
  const label = feature.label
  if (feature.kind === 'numeric') {
    const d = siteVal - targetVal
    const [higher, lower] = GAP_WORDS[feature.id] || DEFAULT_GAP_WORDS
    const word = d > 0 ? higher : lower
    const text = Math.abs(d) >= MUCH_DIFF ? `Much ${word}` : cap(word)
    return `${text} than the target` + (clipped ? ` (${CLIPPED_NOTE})` : '')
  }
  if (s > 0) return `${label}: ${siteVal} is only related to the target's ${targetVal}`
  return `${label}: ${siteVal} vs the target's ${targetVal}`
}

/**
 * Score one site against one target (§5.3–5.6).
 * Returns { score, scoreRange, contrib, coverage, why, gap, sims }.
 *   - scoreRange = [lo, hi]: score if every selected criterion missing on the SITE side
 *     (target value known) were a total mismatch (0) or a perfect match (1); null when
 *     score is null. Mirrors scoring.py exactly.
 *   - why: criteria with s >= WHY_MIN_SIM; clipped target criteria worded "near Earth's extreme".
 *   - gap: usable criterion with s < WHY_MIN_SIM losing the most points, max w * (1 - s);
 *     ties -> first in feature order; none -> NO_GAP.
 *   - Only selected criteria (weight > 0) appear in contrib / sims.
 *   - A selected criterion with a missing value is null in contrib / sims — never 0.
 *   - score is null when no selected criterion is usable (not 0).
 *   - coverage = { used, selected }.
 *   - minUsed: fewer usable criteria than this -> score null ("insufficient data").
 * `sims` is for the UI only.
 */
export function insufficientGap(used, selected, minUsed) {
  return `Insufficient data: ${used} of ${selected} selected criteria have data (minimum ${minUsed})`
}

export function scoreSite(target, site, weights, features, minUsed = 1) {
  const tnorm = target.norm
  const snorm = site.norm
  const clipped = target.clipped || {}
  const selected = [] // { f, w, s } in feature order, w > 0; s may be null
  let num = 0.0
  let den = 0
  for (const f of features) {
    const w = weights[f.id] || 0
    if (w <= 0) continue
    const s = similarity(f, snorm[f.id], tnorm[f.id])
    selected.push({ f, w, s })
    if (s !== null) {
      num += w * s
      den += w
    }
  }

  const rows = selected.filter((r) => r.s !== null)
  const coverage = { used: rows.length, selected: selected.length }
  const sims = {}
  for (const { f, s } of selected) sims[f.id] = s

  if (den === 0 || rows.length < minUsed) {
    const contrib = {}
    for (const { f } of selected) contrib[f.id] = null
    const gap = !selected.length
      ? NO_CRITERIA_GAP
      : den === 0
        ? NO_DATA_GAP
        : insufficientGap(rows.length, selected.length, minUsed)
    return { score: null, scoreRange: null, contrib, coverage, why: [], gap, sims }
  }

  const score = roundHalfUp((100 * num) / den)
  const contrib = {}
  for (const { f, w, s } of selected) contrib[f.id] = s === null ? null : roundTo((w * s) / den, 4)

  // Missing on the site side only (target value known): bound what the gap could do.
  let wMissing = 0
  for (const { f, w, s } of selected) {
    if (s === null && !isMissing(tnorm[f.id]) && isMissing(snorm[f.id])) wMissing += w
  }
  const scoreRange = [
    roundHalfUp((100 * num) / (den + wMissing)),
    roundHalfUp((100 * (num + wMissing)) / (den + wMissing)),
  ]

  // Array.prototype.sort is stable, matching Python's sorted().
  const strong = rows.filter((r) => r.s >= WHY_MIN_SIM).sort((a, b) => b.w * b.s - a.w * a.s)
  const why = strong
    .slice(0, WHY_MAX_ITEMS)
    .map(({ f }, i) => whyPhrase(f, snorm[f.id], i === 0, Boolean(clipped[f.id])))

  let worst = null
  for (const r of rows) {
    if (r.s < WHY_MIN_SIM && (worst === null || r.w * (1 - r.s) > worst.w * (1 - worst.s))) worst = r
  }
  const gap =
    worst === null
      ? NO_GAP
      : gapPhrase(worst.f, worst.s, snorm[worst.f.id], tnorm[worst.f.id], Boolean(clipped[worst.f.id]))

  return { score, scoreRange, contrib, coverage, why, gap, sims }
}

function compareStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareScore(a, b) {
  if (a === null || b === null) return (a === null) - (b === null) // null sorts last
  return b - a
}

/**
 * Rank site objects (with id, name, norm) for one target (§5.8): score desc, then
 * name asc, then id. Sites with a null score (no usable data) sort last.
 */
export function rankSites(target, sites, weights, features, minUsed = 1) {
  return sites
    .map((site) => {
      const r = scoreSite(target, site, weights, features, minUsed)
      return {
        name: site.name,
        out: {
          site: site.id,
          score: r.score,
          scoreRange: r.scoreRange,
          contrib: r.contrib,
          coverage: r.coverage,
          why: r.why,
          gap: r.gap,
        },
      }
    })
    .sort(
      (a, b) =>
        compareScore(a.out.score, b.out.score) || compareStr(a.name, b.name) || compareStr(a.out.site, b.out.site),
    )
    .map((x) => x.out)
}
