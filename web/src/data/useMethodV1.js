import { useEffect, useState } from 'react'
import { METHOD_V1_URL, validateMethodV1 } from '../lib/methodV1.js'

// Loads the method v1 results once per page session (static file, no API call) and validates
// its structure. Kept separate from the main bundle (useBundle.js): the two methods have
// different data contracts and must never be mixed.
let cache = null

function load() {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}${METHOD_V1_URL}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${METHOD_V1_URL}: HTTP ${res.status}`)
        return res.json()
      })
      .then((d) => {
        const problems = validateMethodV1(d)
        if (problems.length) throw new Error(`analog_results.json failed its structure check: ${problems.join('; ')}`)
        return d
      })
      .catch((err) => {
        cache = null // allow a retry
        throw err
      })
  }
  return cache
}

/** { status: 'loading' | 'ready' | 'error', data, error, retry } */
export function useMethodV1() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    load().then(
      (data) => alive && setState({ status: 'ready', data, error: null }),
      (error) => alive && setState({ status: 'error', data: null, error }),
    )
    return () => {
      alive = false
    }
  }, [attempt])
  return { ...state, retry: () => setAttempt((n) => n + 1) }
}
