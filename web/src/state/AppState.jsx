import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useBundle } from '../data/useBundle.js'
import { PRESETS } from '../lib/presets.js'
import { orderRanking } from '../lib/explain.js'
import { rankSites } from '../lib/scoring.js'
import {
  CUSTOM_PRESET,
  SHORTLIST_MAX,
  applyStateToSearch,
  defaultState,
  ownQuery,
  parseQuery,
  presetFor,
  sameState,
} from '../lib/urlState.js'

// Selected target, weights and shortlist live here (React context) and are
// mirrored into the URL query so every screen can be shared or reloaded.
// Re-ranking is synchronous (useMemo) so a weight change re-ranks in one frame;
// only the URL write is debounced.
const AppStateContext = createContext(null)
const URL_WRITE_DELAY_MS = 150

export function AppStateProvider({ children }) {
  const { data } = useBundle()
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState(() => parseQuery(location.search, data, defaultState()))
  // Our own keys as last seen in / written to the URL. A location change that
  // leaves them unchanged (e.g. Explore's view toggle) must not re-apply the
  // URL over newer in-memory state while the debounced write is pending.
  const lastOwnQuery = useRef(ownQuery(location.search))

  // Adopt URL changes that did not come from us (back/forward, shared links).
  useEffect(() => {
    const own = ownQuery(location.search)
    if (own === lastOwnQuery.current) return
    lastOwnQuery.current = own
    setState((prev) => {
      const next = parseQuery(location.search, data, prev)
      return sameState(prev, next, data.features) ? prev : next
    })
  }, [location.search, data])

  // Mirror state into the URL (debounced, replace — no history spam while dragging).
  useEffect(() => {
    const id = setTimeout(() => {
      const current = window.location.search
      const next = applyStateToSearch(current, state, data.features)
      if (next !== current) {
        lastOwnQuery.current = ownQuery(next)
        navigate({ search: next }, { replace: true })
      }
    }, URL_WRITE_DELAY_MS)
    return () => clearTimeout(id)
  }, [state, location.pathname, location.search, data.features, navigate])

  const target = state.targetId ? data.targetById[state.targetId] : null

  const ranking = useMemo(() => {
    if (!target) return []
    const ranked = rankSites(target, data.sites, state.weights, data.features, data.minCriteria)
    return orderRanking(ranked, state.rankBy, data.siteById).map((r, i) => ({
      ...r,
      rank: r.score === null ? null : i + 1,
    }))
  }, [target, state.weights, state.rankBy, data])

  const rankBySite = useMemo(() => Object.fromEntries(ranking.map((r) => [r.site, r])), [ranking])

  const setTarget = useCallback((targetId) => setState((s) => ({ ...s, targetId })), [])

  const setPreset = useCallback(
    (presetId) =>
      setState((s) => ({ ...s, presetId, basePresetId: presetId, weights: { ...PRESETS[presetId].weights } })),
    [],
  )

  const setWeight = useCallback(
    (featureId, value) =>
      setState((s) => {
        const weights = { ...s.weights, [featureId]: value }
        return { ...s, weights, presetId: presetFor(weights, data.features) }
      }),
    [data.features],
  )

  const resetWeights = useCallback(
    () =>
      setState((s) => ({ ...s, presetId: s.basePresetId, weights: { ...PRESETS[s.basePresetId].weights } })),
    [],
  )

  const toggleShortlist = useCallback(
    (siteId) =>
      setState((s) => {
        if (s.shortlist.includes(siteId)) return { ...s, shortlist: s.shortlist.filter((id) => id !== siteId) }
        if (s.shortlist.length >= SHORTLIST_MAX) return s
        return { ...s, shortlist: [...s.shortlist, siteId] }
      }),
    [],
  )

  /** Replace the shortlist (guided demo); unknown ids dropped, capped at SHORTLIST_MAX. */
  const setShortlist = useCallback(
    (ids) => setState((s) => ({ ...s, shortlist: [...new Set(ids.filter((id) => data.siteById[id]))].slice(0, SHORTLIST_MAX) })),
    [data.siteById],
  )

  const clearShortlist = useCallback(() => setState((s) => ({ ...s, shortlist: [] })), [])

  const setRankBy = useCallback((rankBy) => setState((s) => ({ ...s, rankBy })), [])

  /** Build a link that carries the current target/weights/shortlist. */
  const linkTo = useCallback(
    (pathname, extra = {}) => {
      const params = new URLSearchParams(applyStateToSearch('', state, data.features))
      for (const [k, v] of Object.entries(extra)) params.set(k, v)
      const text = params.toString().replace(/%2C/g, ',')
      return text ? `${pathname}?${text}` : pathname
    },
    [state, data.features],
  )

  const value = {
    ...state,
    isCustom: state.presetId === CUSTOM_PRESET,
    shortlistFull: state.shortlist.length >= SHORTLIST_MAX,
    target,
    ranking,
    rankBySite,
    setTarget,
    setPreset,
    setWeight,
    resetWeights,
    toggleShortlist,
    clearShortlist,
    setShortlist,
    setRankBy,
    linkTo,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
