// Display helpers shared by components. Display rounding only — scoring lives in scoring.js.

/** Classify a source / ref label: 'mock' (synthetic), 'seed' (unverified class), 'real', or 'none'. */
export function sourceKind(source) {
  if (!source) return 'none'
  if (source.startsWith('MOCK')) return 'mock'
  if (source.startsWith('Seed')) return 'seed'
  return 'real'
}

export function pct(similarity) {
  return `${Math.round(similarity * 100)}%`
}

export function formatValue(feature, value) {
  if (value === null || value === undefined || value === '') return null
  return feature.kind === 'numeric' ? Number(value).toFixed(2) : String(value)
}

export function formatCoord(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`
}

// Sequential single-hue (blue) ramp for score magnitude, stepped for the dark
// surface: low scores recede toward the background, high scores are brightest.
// Absolute bins so a colour always means the same score range.
export const SCORE_BINS = [
  { min: 80, color: '#cde2fb', label: '80–100' },
  { min: 70, color: '#86b6ef', label: '70–79' },
  { min: 60, color: '#5598e7', label: '60–69' },
  { min: 50, color: '#2a78d6', label: '50–59' },
  { min: 0, color: '#1c5cab', label: '0–49' },
]
export const NO_SCORE_COLOR = '#6b6a66'

export function scoreColor(score) {
  if (score === null || score === undefined) return NO_SCORE_COLOR
  return SCORE_BINS.find((b) => score >= b.min).color
}

// Categorical slots 1–3 (dark mode) — validated all-pairs for up to 3 series.
// One colour per compared place; the first three are the original palette. Extra entries keep
// the charts working if SHORTLIST_MAX is ever raised (cycle beyond the list rather than undefined).
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#b45fd0', '#c9a227', '#3fb5b5']

function fmtNumber(v) {
  const a = Math.abs(v)
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)
}

/**
 * How to show a site's value for one criterion.
 * Real bundle: measured value + units from provenance; mock: the normalised value.
 * Returns { text|null, status, excluded (reason)|null, note|null, provenance|null }.
 */
export function describeSiteValue(feature, site) {
  const p = site.provenance?.[feature.id]
  if (!p) {
    return { text: formatValue(feature, site.norm[feature.id]), status: null, excluded: null, note: null, provenance: null }
  }
  if (p.status === 'unavailable') {
    return { text: null, status: 'unavailable', excluded: null, note: p.note || null, provenance: p }
  }
  const text =
    typeof p.value === 'number' ? `${fmtNumber(p.value)} ${p.units || ''}`.trim() : p.value != null ? String(p.value) : null
  return { text, status: p.status, excluded: p.excluded || null, note: p.note || null, provenance: p }
}

/** How to show a target's value: the cited display text when present, else the normalised value. */
export function describeTargetValue(feature, target) {
  const p = target.provenance?.[feature.id]
  if (!p) return { text: formatValue(feature, target.norm[feature.id]), status: null, clipped: null, provenance: null }
  if (p.status === 'unavailable') return { text: null, status: 'unavailable', clipped: null, provenance: p }
  return { text: p.display || formatValue(feature, target.norm[feature.id]), status: p.status, clipped: target.clipped?.[feature.id] || null, provenance: p }
}

// Evidence type of a value (real bundle `provenance[fid].status`).
export const EVIDENCE = {
  reanalysis: { label: 'Reanalysis', title: 'NASA POWER / MERRA-2: model + assimilated observations, ~50 km grid cell' },
  measurement: { label: 'Measured', title: 'Derived from a measured dataset (e.g. DEM)' },
  'in-situ': { label: 'In-situ', title: 'Measured on the surface by a lander/rover/probe' },
  orbital: { label: 'Orbital', title: 'Measured from orbit' },
  model: { label: 'Model', title: 'Model result' },
  literature: { label: 'Literature', title: 'Published interpretation (see citation)' },
  definitional: { label: 'Definitional', title: 'Follows from basic physical facts (e.g. no liquid water), not a measurement' },
  unavailable: { label: 'Unavailable', title: 'No verified value — excluded from scores' },
  // Ready for the final methodology (not used by the current bundle):
  measured: { label: 'Measured', title: 'Derived from a measured dataset' },
  estimated: { label: 'Estimated', title: 'Estimated value (e.g. interpolated or proxy-derived) — see its note and citation' },
}

/**
 * Evidence label for any provenance status. Unknown statuses are shown as-is (never hidden),
 * so a new pipeline status cannot silently remove a value's evidence label.
 */
export function evidenceInfo(status) {
  if (!status) return null
  return EVIDENCE[status] || { label: String(status), title: `Evidence type “${status}” (not yet described in the app)`, unknown: true }
}

// Evidence coverage (High / Medium / Low by weight share) lives in explain.js.

export function bodyLabel(body) {
  return body === 'moon' ? 'Moon' : body === 'mars' ? 'Mars' : body
}
