// Exact port of pipeline/scoring.py (score_site / rank_sites). CLAUDE.md §5.
// Must produce identical output for pipeline/tests/fixture.json — see scoring.test.js.
// Parity rules:
//   * Criteria are processed in the order of the `features` array.
//   * Rounding is explicit half-up: Math.floor(x + 0.5) (matches Python side).
//   * Names compare by code unit with plain `<`, never localeCompare.

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

export const NO_DATA_GAP = 'No usable data for the weighted criteria'
export const NO_GAP = 'No gaps on the weighted criteria'
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

function whyPhrase(feature, siteVal, first) {
  const label = feature.label
  if (feature.kind === 'numeric') {
    return first ? `Strongest match: ${label.toLowerCase()}` : `${label} close to target`
  }
  if (first) return `Strongest match: ${label.toLowerCase()} (${siteVal})`
  return `${label}: ${siteVal}`
}

function gapPhrase(feature, s, siteVal, targetVal) {
  if (s >= 1) return NO_GAP
  const label = feature.label
  if (feature.kind === 'numeric') {
    const d = siteVal - targetVal
    const [higher, lower] = GAP_WORDS[feature.id] || DEFAULT_GAP_WORDS
    const word = d > 0 ? higher : lower
    const text = Math.abs(d) >= MUCH_DIFF ? `Much ${word}` : cap(word)
    return `${text} than the target`
  }
  if (s > 0) return `${label}: ${siteVal} is only related to the target's ${targetVal}`
  return `${label}: ${siteVal} vs the target's ${targetVal}`
}

/**
 * Score one site against one target (§5.3–5.6).
 * Returns { score, contrib, why, gap, sims }. `sims` is for the UI only.
 */
export function scoreSite(target, site, weights, features) {
  const tnorm = target.norm
  const snorm = site.norm
  const rows = [] // { f, w, s } for usable criteria with w > 0
  let num = 0.0
  let den = 0
  for (const f of features) {
    const w = weights[f.id] || 0
    if (w <= 0) continue
    const s = similarity(f, snorm[f.id], tnorm[f.id])
    if (s === null) continue
    rows.push({ f, w, s })
    num += w * s
    den += w
  }

  if (den === 0) return { score: 0, contrib: {}, why: [], gap: NO_DATA_GAP, sims: {} }

  const score = roundHalfUp((100 * num) / den)
  const contrib = {}
  const sims = {}
  for (const { f, w, s } of rows) {
    contrib[f.id] = roundTo((w * s) / den, 4)
    sims[f.id] = s
  }

  // Array.prototype.sort is stable, matching Python's sorted().
  const strong = rows.filter((r) => r.s >= WHY_MIN_SIM).sort((a, b) => b.w * b.s - a.w * a.s)
  const why = strong.slice(0, WHY_MAX_ITEMS).map(({ f }, i) => whyPhrase(f, snorm[f.id], i === 0))

  let worst = rows[0]
  for (const r of rows.slice(1)) if (r.s < worst.s) worst = r
  const wf = worst.f
  const gap = gapPhrase(wf, worst.s, snorm[wf.id], tnorm[wf.id])

  return { score, contrib, why, gap, sims }
}

function compareStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Rank site objects (with id, name, norm) for one target (§5.8): score desc, then name asc. */
export function rankSites(target, sites, weights, features) {
  return sites
    .map((site) => {
      const r = scoreSite(target, site, weights, features)
      return { name: site.name, out: { site: site.id, score: r.score, contrib: r.contrib, why: r.why, gap: r.gap } }
    })
    .sort((a, b) => b.out.score - a.out.score || compareStr(a.name, b.name) || compareStr(a.out.site, b.out.site))
    .map((x) => x.out)
}
