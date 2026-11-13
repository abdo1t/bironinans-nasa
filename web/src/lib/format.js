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
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70']

export function bodyLabel(body) {
  return body === 'moon' ? 'Moon' : body === 'mars' ? 'Mars' : body
}
