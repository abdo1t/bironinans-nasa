// Pure display helpers that explain a ranking: data availability, evidence
// coverage, score ranges, points lost and citation links. Scoring itself lives
// in scoring.js (parity with pipeline/scoring.py); nothing here changes a score.
import { NO_GAP, isMissing, similarity } from './scoring.js'

/**
 * Which criteria have no data at all for this target: either the target value is
 * missing, or every site's value is missing. Such a criterion cannot affect the
 * ranking whatever its weight.
 * Returns { byFeature: {fid: 'target'|'sites'|null}, missing: [{id,label,weight,reason}],
 *           missingWeight, totalWeight } — weights count selected criteria (w > 0) only.
 */
export function dataAvailability(target, sites, weights, features) {
  const byFeature = {}
  const missing = []
  let missingWeight = 0
  let totalWeight = 0
  for (const f of features) {
    let reason = null
    if (!target || isMissing(target.norm?.[f.id])) reason = 'target'
    else if (!sites.some((s) => !isMissing(s.norm?.[f.id]))) reason = 'sites'
    byFeature[f.id] = reason
    const w = weights[f.id] || 0
    if (w <= 0) continue
    totalWeight += w
    if (reason) {
      missingWeight += w
      missing.push({ id: f.id, label: f.label, weight: w, reason })
    }
  }
  return { byFeature, missing, missingWeight, totalWeight }
}

/** "A", "A & B", "A, B & C". */
export function joinLabels(labels) {
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
}

/** One-sentence notice for Explore, or null when every selected criterion has data. */
export function availabilityNotice(avail) {
  if (!avail.missing.length) return null
  const names = joinLabels(avail.missing.map((m) => m.label))
  const verb = avail.missing.length === 1 ? 'has' : 'have'
  const pts = `${avail.missingWeight} of ${avail.totalWeight} weight points`
  if (avail.missingWeight === avail.totalWeight) {
    return `${names} — ${pts} — ${verb} no data for this target or its sites: no site can be scored with these weights.`
  }
  return `${names} — ${pts} — ${verb} no data for this target or its sites: the ranking uses the other criteria only.`
}

/**
 * Evidence coverage of one score, by WEIGHT share: weight of selected criteria with
 * data on both sides / weight of all selected criteria.
 * level: 'low' (< 50 % or fewer than 3 criteria), 'medium' (< 80 %), 'high' otherwise;
 * null when no selected criterion has data.
 */
export function evidenceCoverage(target, site, weights, features) {
  let usedWeight = 0
  let selectedWeight = 0
  let used = 0
  let selected = 0
  for (const f of features) {
    const w = weights[f.id] || 0
    if (w <= 0) continue
    selected += 1
    selectedWeight += w
    if (similarity(f, site.norm[f.id], target.norm[f.id]) !== null) {
      used += 1
      usedWeight += w
    }
  }
  const share = selectedWeight > 0 ? usedWeight / selectedWeight : 0
  let level = null
  if (used > 0) level = used < 3 || share < 0.5 ? 'low' : share < 0.8 ? 'medium' : 'high'
  return { usedWeight, selectedWeight, used, selected, share, level }
}

/** "range 49–77" when the score could move with missing site data, else null. */
export function scoreRangeText(score, range) {
  if (score === null || score === undefined || !Array.isArray(range)) return null
  const [lo, hi] = range
  if (lo === hi) return null
  return `range ${lo}–${hi}`
}

export const SCORE_RANGE_HELP =
  'Possible score if the criteria missing for this site were a total mismatch (low end) or a perfect match (high end). ' +
  'A wide range means the rank depends on data we do not have yet.'

/**
 * Points (out of 100) a criterion costs the site: w * (1 - s) / Σw_usable * 100.
 * Σw_usable = sum of weights of selected criteria with data. null when not computable.
 */
export function pointsLost(weight, s, usableWeight) {
  if (!(weight > 0) || s === null || s === undefined || !(usableWeight > 0)) return null
  return (100 * weight * (1 - s)) / usableWeight
}

/** Sum of weights of selected criteria whose similarity is known (from a scoreSite result's sims). */
export function usableWeightFromSims(sims, weights) {
  let total = 0
  for (const [fid, s] of Object.entries(sims || {})) {
    const w = weights[fid] || 0
    if (w > 0 && s !== null && s !== undefined) total += w
  }
  return total
}

const STRONGEST = 'Strongest match: '

/**
 * Compact "why it ranks here": the strongest match and the biggest shortfall.
 * Returns { match: string|null, short: string|null }.
 */
export function whyGapSummary(why, gap, score) {
  if (score === null || score === undefined) return { match: null, short: gap || null }
  const first = why?.[0] || null
  const match = first ? (first.startsWith(STRONGEST) ? first.slice(STRONGEST.length) : first) : null
  const short = gap && gap !== NO_GAP ? gap : null
  return { match, short }
}

/** Short unit + Earth normalization bounds, e.g. "mm/yr · Earth scale 0–2000 · inverted". */
export function featureScaleText(feature) {
  if (feature.kind !== 'numeric') return null
  const unit = (feature.unit || '').trim().split(/\s+/)[0]
  const parts = []
  if (unit) parts.push(unit)
  if (feature.earthMin !== undefined && feature.earthMax !== undefined) {
    const fmt = (v) => String(v).replace(/^-/, '−')
    parts.push(`Earth scale ${fmt(feature.earthMin)} to ${fmt(feature.earthMax)}`)
  }
  if (feature.invert) parts.push('inverted')
  return parts.join(' · ') || null
}

// URLs and "doi:10.xxxx/..." inside free citation text.
const LINK_RE = /(https?:\/\/[^\s<>"]+)|(doi:\s*(10\.\d{4,9}\/[^\s<>"]+))/gi
const TRAILING = /[.,;:)\]]+$/

/**
 * Split citation text into [{ text }, { text, href }] segments, linking URLs and DOIs.
 * Trailing punctuation stays outside the link.
 */
export function linkifyCitation(text) {
  if (!text) return []
  const out = []
  let last = 0
  for (const m of String(text).matchAll(LINK_RE)) {
    let raw = m[0]
    const trail = raw.match(TRAILING)
    // keep a closing parenthesis that belongs to the identifier, e.g. "...(02)00027-1"
    let cut = trail ? trail[0] : ''
    if (cut) raw = raw.slice(0, raw.length - cut.length)
    // give back closing parentheses that are balanced by an opener inside the identifier,
    // e.g. "...(02)00027-1)" or "wiki/Mars_(planet))" — one at a time
    const count = (str, ch) => str.split(ch).length - 1
    while (cut.startsWith(')') && count(raw, '(') > count(raw, ')')) {
      raw += ')'
      cut = cut.slice(1)
    }
    const start = m.index
    if (start > last) out.push({ text: text.slice(last, start) })
    const href = m[1]
      ? raw
      : `https://doi.org/${raw
          .replace(/^doi:\s*/i, '')
          .split('/')
          .map((part) => encodeURIComponent(part))
          .join('/')}`
    out.push({ text: raw, href })
    last = start + raw.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** Criteria with no value for any site (e.g. a dataset not yet acquired). */
export function featuresMissingEverywhere(sites, features) {
  return features.filter((f) => !sites.some((s) => !isMissing(s.norm?.[f.id])))
}

/** "2026-11-13" from an ISO timestamp; passes through non-ISO labels (e.g. "MOCK"). */
export function shortDate(iso) {
  if (!iso) return 'unknown'
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : String(iso)
}

/**
 * Does any item (site or target) have a value for `featureId` whose provenance or
 * source text mentions `pattern` (case-insensitive)? Used to label dataset lists
 * honestly ("in this bundle" vs "not in this bundle yet").
 */
export function bundleUsesDataset(items, featureId, pattern) {
  // whole-word, case-sensitive: "EMIT" must not match "emitted", "CTX" not "context"
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`)
  return items.some((x) => {
    if (isMissing(x.norm?.[featureId])) return false
    const src = x.provenance?.[featureId] ?? x.sources?.[featureId] ?? x.refs?.[featureId] ?? ''
    return re.test(JSON.stringify(src))
  })
}

/**
 * Order ranking entries. rankBy 'score' keeps scoring.js order (score desc, name).
 * rankBy 'min' orders by the guaranteed minimum — the lower end of scoreRange, i.e. the
 * score a site keeps if every missing criterion were a total mismatch — then score, name,
 * id (code-point order). Unscored sites stay last. Pure; returns a new array.
 */
export function orderRanking(entries, rankBy, siteById) {
  if (rankBy !== 'min') return [...entries]
  const name = (e) => siteById?.[e.site]?.name ?? e.site
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  return [...entries].sort((a, b) => {
    if (a.score === null || b.score === null) return (a.score === null) - (b.score === null)
    const la = a.scoreRange?.[0] ?? a.score
    const lb = b.scoreRange?.[0] ?? b.score
    return lb - la || b.score - a.score || cmp(name(a), name(b)) || cmp(a.site, b.site)
  })
}
