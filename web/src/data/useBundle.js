import { createContext, createElement, useContext, useEffect, useState } from 'react'

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

  return {
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
