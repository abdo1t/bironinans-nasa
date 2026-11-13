import { createContext, createElement, useContext, useEffect, useState } from 'react'
import { PRESETS } from '../lib/presets.js'
import { rankSites } from '../lib/scoring.js'

// Loads the static data bundle (CLAUDE.md §4) once at startup.
// The browser never calls NASA APIs: everything comes from public/data/.
const FILES = {
  features: 'features.json',
  targets: 'targets.json',
  sites: 'sites.geojson',
  scores: 'scores.json',
}

const BundleContext = createContext(null)

async function fetchJson(name) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!res.ok) throw new Error(`Failed to load ${name}: HTTP ${res.status}`)
  return res.json()
}

function indexBy(list, key = 'id') {
  return Object.fromEntries(list.map((item) => [item[key], item]))
}

export async function loadBundle() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, name]) => [key, await fetchJson(name)]),
  )
  const raw = Object.fromEntries(entries)

  // Flatten GeoJSON into plain site objects with lat/lon for easy use in lists.
  const siteList = raw.sites.features.map((f) => ({
    ...f.properties,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }))

  const bundle = {
    features: raw.features,
    targets: raw.targets,
    sites: siteList,
    sitesGeojson: raw.sites,
    scores: raw.scores,
    featureById: indexBy(raw.features),
    targetById: indexBy(raw.targets),
    siteById: indexBy(siteList),
    isMock: raw.scores.generatedAt === 'MOCK',
  }
  if (import.meta.env.DEV) warnOnScoreMismatch(bundle)
  return bundle
}

/**
 * Dev-only parity check (CLAUDE.md §5): recompute the default ranking in JS and
 * console.warn on any difference from the precomputed scores.json.
 * Returns the number of mismatching targets.
 */
export function warnOnScoreMismatch(bundle) {
  const preset = PRESETS[bundle.scores.defaultPreset]
  if (!preset) {
    console.warn(`[scoring parity] unknown defaultPreset "${bundle.scores.defaultPreset}"`)
    return 1
  }
  let mismatches = 0
  for (const t of bundle.targets) {
    const expected = bundle.scores.byTarget[t.id] || []
    const got = rankSites(t, bundle.sites, preset.weights, bundle.features)
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      mismatches += 1
      const i = got.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(expected[k]))
      console.warn(`[scoring parity] ${t.id}: JS ranking differs from scores.json at rank ${i + 1}`, {
        js: got[i],
        python: expected[i],
      })
    }
  }
  return mismatches
}

export function BundleProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let cancelled = false
    loadBundle()
      .then((data) => !cancelled && setState({ status: 'ready', data, error: null }))
      .catch((error) => !cancelled && setState({ status: 'error', data: null, error }))
    return () => {
      cancelled = true
    }
  }, [])

  return createElement(BundleContext.Provider, { value: state }, children)
}

/** Returns { status: 'loading' | 'ready' | 'error', data, error }. */
export function useBundle() {
  const ctx = useContext(BundleContext)
  if (!ctx) throw new Error('useBundle must be used inside <BundleProvider>')
  return ctx
}
