// Pure helpers to read/write the shareable app state in the URL query.
// Query keys: target, preset | w (custom weights), sites (shortlist).
// Other keys (e.g. Explore's `view`) are preserved untouched.
import { DEFAULT_PRESET, PRESETS, WEIGHT_MAX, WEIGHT_MIN } from './presets.js'

export const SHORTLIST_MAX = 3
export const CUSTOM_PRESET = 'custom'
const OWN_KEYS = ['target', 'preset', 'w', 'sites', 'rank']

export function defaultState() {
  return {
    targetId: null,
    presetId: DEFAULT_PRESET,
    basePresetId: DEFAULT_PRESET, // what "Reset" returns to
    rankBy: 'score', // 'score' | 'min' (guaranteed minimum = lower end of scoreRange)
    weights: { ...PRESETS[DEFAULT_PRESET].weights },
    shortlist: [],
  }
}

export function weightsEqual(a, b, features) {
  return features.every((f) => (a[f.id] || 0) === (b[f.id] || 0))
}

/** Name of the preset whose weights equal `weights`, else 'custom'. */
export function presetFor(weights, features) {
  const hit = Object.keys(PRESETS).find((id) => weightsEqual(PRESETS[id].weights, weights, features))
  return hit || CUSTOM_PRESET
}

export function encodeWeights(weights, features) {
  return features.map((f) => weights[f.id] || 0).join('-')
}

export function decodeWeights(text, features) {
  const parts = String(text).split('-')
  if (parts.length !== features.length) return null
  const out = {}
  for (const [i, f] of features.entries()) {
    const n = Number(parts[i])
    if (!Number.isInteger(n) || n < WEIGHT_MIN || n > WEIGHT_MAX) return null
    out[f.id] = n
  }
  return out
}

/**
 * Merge URL params into `prev`. Params that are absent leave `prev` unchanged, so
 * plain links (e.g. "/about") never wipe the current selection.
 */
export function parseQuery(search, bundle, prev = defaultState()) {
  const params = new URLSearchParams(search)
  const { features, targetById, siteById } = bundle
  const next = { ...prev }

  if (params.has('target')) {
    const id = params.get('target')
    next.targetId = targetById[id] ? id : null
  }

  const w = params.has('w') ? decodeWeights(params.get('w'), features) : null
  if (w) {
    next.weights = w
    next.presetId = presetFor(w, features)
    if (next.presetId !== CUSTOM_PRESET) next.basePresetId = next.presetId
    // custom weights remember the test type they started from (preset= beside w=)
    else if (PRESETS[params.get('preset')]) next.basePresetId = params.get('preset')
  } else if (params.has('preset') && PRESETS[params.get('preset')]) {
    next.presetId = params.get('preset')
    next.basePresetId = next.presetId
    next.weights = { ...PRESETS[next.presetId].weights }
  }

  if (params.has('rank')) next.rankBy = params.get('rank') === 'min' ? 'min' : 'score'

  if (params.has('sites')) {
    const ids = params
      .get('sites')
      .split(',')
      .filter((id) => siteById[id])
    next.shortlist = [...new Set(ids)].slice(0, SHORTLIST_MAX)
  }
  return next
}

/** The query params this state should produce (only our own keys). */
export function stateToParams(state, features) {
  const out = {}
  if (state.targetId) out.target = state.targetId
  if (state.presetId === CUSTOM_PRESET) {
    out.preset = state.basePresetId // the test type the custom weights started from
    out.w = encodeWeights(state.weights, features)
  } else out.preset = state.presetId
  if (state.shortlist.length) out.sites = state.shortlist.join(',')
  if (state.rankBy === 'min') out.rank = 'min'
  return out
}

/** Rewrite `search` so our keys reflect `state`; other keys are kept. Returns "?..." or "". */
export function applyStateToSearch(search, state, features) {
  const params = new URLSearchParams(search)
  for (const key of OWN_KEYS) params.delete(key)
  for (const [key, value] of Object.entries(stateToParams(state, features))) params.set(key, value)
  const text = params.toString().replace(/%2C/g, ',')
  return text ? `?${text}` : ''
}

/**
 * Canonical string of just our own keys in `search`. Used to tell whether a URL
 * change touched the app state at all (e.g. a `view=` toggle must not re-apply
 * stale weights from the URL over newer in-memory state).
 */
export function ownQuery(search) {
  const params = new URLSearchParams(search)
  return OWN_KEYS.map((k) => `${k}=${params.get(k) ?? ''}`).join('&')
}

export function sameState(a, b, features) {
  return (
    a.targetId === b.targetId &&
    a.presetId === b.presetId &&
    a.basePresetId === b.basePresetId &&
    weightsEqual(a.weights, b.weights, features) &&
    a.shortlist.join(',') === b.shortlist.join(',') &&
    (a.rankBy || 'score') === (b.rankBy || 'score')
  )
}
