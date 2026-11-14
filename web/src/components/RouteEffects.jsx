import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useBundle } from '../data/useBundle.js'

const APP = 'Earth Analog Finder'
const TITLES = { '/': 'Discover', '/explore': 'Explore', '/compare': 'Compare', '/mirror': 'Planetary Mirror', '/about': 'About' }

/**
 * On a PATHNAME change (not on query-only changes, so slider drags and URL sync are
 * unaffected): set the page title, scroll to the top and move focus to #main so
 * keyboard and screen-reader users start at the new page. The first render keeps focus.
 */
export default function RouteEffects() {
  const { pathname, hash } = useLocation()
  const { data } = useBundle()
  const first = useRef(true)

  useEffect(() => {
    const site = pathname.startsWith('/site/') ? data.siteById[decodeURIComponent(pathname.slice(6))] : null
    const page = site ? site.name : TITLES[pathname] || 'Page not found'
    document.title = `${page} – ${APP}`
    if (first.current) {
      first.current = false
      return
    }
    // A hash (e.g. /site/x#evidence) means the page scrolls to its own section.
    if (!window.location.hash) window.scrollTo(0, 0)
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname, data])

  // In-page sections reached from the rail (e.g. /about#data): scroll once the page has rendered.
  useEffect(() => {
    if (!hash) return
    const id = decodeURIComponent(hash.slice(1))
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [pathname, hash])

  return null
}
