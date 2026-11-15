// Display helpers for the analog method v1 results (public/method-v1/analog_results.json,
// produced by analysis/analog_method/score.py — see docs/method_v1_INTEGRATION.md).
// Scores are PRECOMPUTED by that method; nothing here computes or changes a score.
// The display rules in INTEGRATION.md are encoded here so every view applies them the same way:
//   * order only within one target + mission test, labelled "provisional similarity", never "ranking"/"best";
//   * score always with score_range and confidence (+ warning when sensitive_to_assumptions);
//   * status != scored -> the reason, never 0;
//   * negative controls visibly marked; lighting = geometry only; Moon target is regional;
//   * no averaging across tests or targets (no helper for that exists on purpose).

export const METHOD_V1_URL = 'method-v1/analog_results.json'
export const METHOD_V1_DOC_URL = 'method-v1/METHOD_ar.md'

export const PROVISIONAL_LABEL = { en: 'Provisional similarity for this test', ar: 'تشابه مبدئي لهذا الاختبار' }

/** Structural check of the file; returns a list of problems (empty = usable). */
export function validateMethodV1(d) {
  const problems = []
  if (!d || typeof d !== 'object') return ['not a JSON object']
  if (!d.meta?.method_version) problems.push('meta.method_version missing')
  for (const k of ['targets', 'mission_tests', 'results']) if (!Array.isArray(d[k])) problems.push(`${k} is not an array`)
  if (!d.parameters || typeof d.parameters !== 'object') problems.push('parameters missing')
  if (!d.earth_sites || typeof d.earth_sites !== 'object') problems.push('earth_sites missing')
  if (Array.isArray(d.results)) {
    const bad = d.results.filter((r) => r.status === 'scored' && !(typeof r.score === 'number' && Number.isFinite(r.score)))
    if (bad.length) problems.push(`${bad.length} scored results without a finite score`)
  }
  return problems
}

/** Mission tests offered for a target: only those whose `bodies` include the target's body. */
export function testsForTarget(d, targetId) {
  const t = d.targets.find((x) => x.id === targetId)
  if (!t) return []
  return d.mission_tests.filter((m) => (m.bodies || []).includes(t.body))
}

const nameOf = (r) => r.site_name_en || r.site_id

/**
 * Results of ONE target + mission test. Scored results first by score (desc; ties by name,
 * then id), then the others (insufficient data, target data unavailable) by name. This is a
 * display order inside one test only (meta.ranking_allowed is false).
 */
export function resultsFor(d, targetId, testId) {
  const rows = d.results.filter((r) => r.target_id === targetId && r.mission_test === testId)
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  return rows.sort((a, b) => {
    const sa = a.status === 'scored' && typeof a.score === 'number'
    const sb = b.status === 'scored' && typeof b.score === 'number'
    if (sa !== sb) return sa ? -1 : 1
    if (sa && b.score !== a.score) return b.score - a.score
    return cmp(nameOf(a), nameOf(b)) || cmp(a.site_id, b.site_id)
  })
}

/** Plain-language reason for a result without a score (never 0). null when scored. */
export function statusReason(r, meta, lang = 'en') {
  if (r.status === 'scored') return null
  if (r.status === 'target_data_unavailable') {
    const damaged = (r.contributions || []).some((c) => /DTM file damaged/i.test(c.note || ''))
    if (damaged) {
      return lang === 'ar'
        ? 'بيانات التضاريس غير متاحة — ملف DTM تالف، ويلزم تنزيله مرة أخرى'
        : 'Terrain data unavailable — DTM file damaged, re-download required'
    }
  }
  const summary = lang === 'ar' ? r.summary_ar : r.summary_en
  return summary || meta?.statuses?.[r.status] || r.status
}

export const CONFIDENCE = {
  medium: { en: 'Medium confidence', ar: 'ثقة متوسطة' },
  low: { en: 'Low confidence', ar: 'ثقة منخفضة' },
  insufficient: { en: 'Insufficient data', ar: 'بيانات غير كافية' },
}

export function confidenceLabel(c, lang = 'en') {
  return CONFIDENCE[c]?.[lang] || String(c ?? '—')
}

/** 0.8751 -> "0.88"; null -> null (callers show the status reason instead). */
export function fmtScore(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x.toFixed(2) : null
}

/** "0.29–0.94" or null. */
export function fmtRange(range) {
  if (!Array.isArray(range) || range.length !== 2 || range.some((v) => typeof v !== 'number')) return null
  return `${range[0].toFixed(2)}–${range[1].toFixed(2)}`
}

export function fmtPct(x, digits = 0) {
  return typeof x === 'number' && Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—'
}

function sig(v) {
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  if (a >= 0.1) return v.toFixed(2)
  return v.toPrecision(2)
}

/**
 * Value with its unit, or null when missing (callers write "not available" — never 0).
 * fraction -> percent; deg -> °; K, m kept; dimensionless "1" -> bare number.
 */
export function fmtValue(v, unit) {
  if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) return null
  switch (unit) {
    case 'fraction':
      return `${sig(v * 100)}%`
    case 'deg':
      return `${sig(v)}°`
    case 'K':
      return `${sig(v)} K`
    case 'm':
      return `${sig(v)} m`
    case 'kWh/m2/day':
      return `${sig(v)} kWh/m²/day`
    case '1':
    case '':
    case undefined:
      return sig(v)
    default:
      return `${sig(v)} ${unit}`
  }
}

/** Default v1 target for the app's current target (ids differ between the two data sets). */
const LEGACY_TARGET = { 'mars-jezero': 'mars_jezero', 'moon-south-pole': 'moon_south_polar_region' }
export function defaultTargetId(d, legacyId) {
  const mapped = LEGACY_TARGET[legacyId]
  if (mapped && d.targets.some((t) => t.id === mapped)) return mapped
  return d.targets[0]?.id ?? null
}

/** Pick the localized field: `${base}_${lang}` with English fallback. */
export function loc(obj, base, lang) {
  return obj?.[`${base}_${lang}`] || obj?.[`${base}_en`] || ''
}
