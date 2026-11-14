import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import {
  IconCompare,
  IconData,
  IconDataset,
  IconDiscover,
  IconMap,
  IconMenu,
  IconMethod,
  IconMirror,
} from './components/Icons.jsx'
import RouteEffects from './components/RouteEffects.jsx'
import { MockTag } from './components/Tags.jsx'
import { useBundle } from './data/useBundle.js'
import { featuresMissingEverywhere, joinLabels, shortDate } from './lib/explain.js'
import { bodyLabel } from './lib/format.js'
import { missionTitle } from './lib/missions.js'
import { AppStateProvider, useAppState } from './state/AppState.jsx'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import SiteDetails from './pages/SiteDetails.jsx'
import About from './pages/About.jsx'
import './styles/app.css'

// The radar chart (Recharts) is only needed on Compare: load it on demand.
const Compare = lazy(() => import('./pages/Compare.jsx'))
// Planetary Mirror (terrain images, evidence panel): also on demand, off the main journey.
const Mirror = lazy(() => import('./pages/Mirror.jsx'))

/** Original mark: a target point on an orbit ring (no agency insignia). */
function BrandMark({ size = 30 }) {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#b4c4dc" strokeWidth="1.75" />
      <ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke="#2fd6f0" strokeWidth="1.75" transform="rotate(-25 16 16)" />
      <circle cx="16" cy="16" r="3.25" fill="#2fd6f0" />
    </svg>
  )
}

/** Left navigation rail. Desktop: always visible; small screens: a drawer opened from the top bar. */
function Rail({ open, onClose }) {
  const app = useAppState()
  const location = useLocation()
  const n = app.shortlist.length
  const onAbout = location.pathname === '/about'
  const items = [
    { to: '/', label: 'Discover', Icon: IconDiscover, end: true },
    { to: '/explore', label: 'Explore Map', Icon: IconMap },
    { to: '/mirror', label: 'Planetary Mirror', Icon: IconMirror },
    { to: '/compare', label: 'Compare Sites', Icon: IconCompare, count: n },
    { to: '/about', hash: 'data', label: 'Scientific Data', Icon: IconData, active: onAbout && location.hash === '#data' },
    { to: '/about', label: 'Methodology', Icon: IconMethod, active: onAbout && location.hash !== '#data' },
  ]
  return (
    <nav id="rail" className={`rail${open ? ' is-open' : ''}`} aria-label="Main">
      <Link to={app.linkTo('/')} className="rail__brand" title="Earth Analog Finder — start">
        <BrandMark />
        <span className="sr-only">Earth Analog Finder — start</span>
      </Link>
      <div className="rail__nav">
        {items.map((it) => {
          const href = app.linkTo(it.to) + (it.hash ? `#${it.hash}` : '')
          const content = (
            <>
              <it.Icon />
              <span>{it.label}</span>
              {it.count > 0 && (
                <span className="rail__count">
                  {it.count}
                  <span className="sr-only"> sites selected</span>
                </span>
              )}
            </>
          )
          if (it.active !== undefined) {
            return (
              <Link
                key={it.label}
                to={href}
                className={`rail__item${it.active ? ' is-active' : ''}`}
                aria-current={it.active ? 'page' : undefined}
                onClick={onClose}
              >
                {content}
              </Link>
            )
          }
          return (
            <NavLink
              key={it.label}
              to={href}
              end={it.end}
              className={({ isActive }) => `rail__item${isActive ? ' is-active' : ''}`}
              onClick={onClose}
            >
              {content}
            </NavLink>
          )
        })}
      </div>
      <div className="rail__spacer" />
      <p className="rail__foot">Space Apps 2026 research prototype</p>
    </nav>
  )
}

/** Top bar: brand, the current mission context, one action to change it, and the data mode. */
function TopBar({ menuOpen, onMenu, manifest, isMock }) {
  const app = useAppState()
  const location = useLocation()
  const navigate = useNavigate()
  const t = app.target
  const mission = app.isCustom ? 'Custom weights' : missionTitle(app.presetId)
  const changeMission = () => {
    if (!t) return navigate(app.linkTo('/'))
    if (location.pathname === '/explore') {
      const params = new URLSearchParams(location.search)
      params.set('panel', '1')
      return navigate({ search: params.toString().replace(/%2C/g, ',') }, { replace: true })
    }
    navigate(app.linkTo('/explore', { panel: '1' }))
  }
  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn--ghost topbar__menu"
        aria-expanded={menuOpen}
        aria-controls="rail"
        onClick={onMenu}
      >
        <IconMenu size={20} />
        <span className="sr-only">Menu</span>
      </button>
      <Link to={app.linkTo('/')} className="topbar__brand">
        <span className="topbar__name">Earth Analog Finder</span>
        <span className="topbar__tag">Planetary analog research console</span>
      </Link>

      {t ? (
        <dl className="mission-strip" aria-label="Current search">
          <div className="mission-strip__cell">
            <dt>Reference world</dt>
            <dd>
              <span className={`world-dot world-dot--${t.body}`} aria-hidden="true" />
              {bodyLabel(t.body)}
            </dd>
          </div>
          <div className="mission-strip__cell">
            <dt>Planetary target</dt>
            <dd title={t.name}>{t.name.split(' — ')[0]}</dd>
          </div>
          <div className="mission-strip__cell mission-strip__cell--mission">
            <dt>Research mission</dt>
            <dd>{mission}</dd>
          </div>
        </dl>
      ) : null}
      <button type="button" className="btn btn--small topbar__change" onClick={changeMission}>
        <span className="btn__long">{t ? 'Change mission' : 'Choose a world'}</span>
        <span className="btn__short">{t ? 'Change' : 'Start'}</span>
      </button>

      <span className="topbar__spacer" />
      <Link
        to="/about#data"
        className={`data-mode${isMock ? ' data-mode--mock' : ''}`}
        aria-label={isMock ? 'Mock data — not measurements. About the data' : `Scientific dataset: static bundle, ${shortDate(manifest?.generatedAt)}. About the data`}
        title={
          isMock
            ? 'Synthetic placeholder bundle — not measurements'
            : 'A static, validated data bundle prepared offline. The app makes no live connection to NASA or other data services.'
        }
      >
        <IconDataset className="data-mode__icon" size={14} />
        <span className="data-mode__label">{isMock ? 'Mock data' : 'Scientific dataset'}</span>
        <span className="data-mode__text">
          {isMock ? '· not measurements' : `· static bundle, ${shortDate(manifest?.generatedAt)}`}
        </span>
      </Link>
    </header>
  )
}

function MockBanner() {
  return (
    <div className="mock-banner" role="note">
      <MockTag /> <strong>Mock data.</strong> All scores and site values are synthetic placeholders — not NASA
      observations. Do not use for planning.
    </div>
  )
}

function DataBanner({ data }) {
  const missing = featuresMissingEverywhere(data.sites, data.features)
  return (
    <div className="data-banner" role="note">
      <strong>Research prototype</strong> — ranks resemblance, not mission suitability.{' '}
      {missing.length > 0 && <>{joinLabels(missing.map((f) => f.label))}: no site data yet (not scored). </>}
      <Link to="/about">Method &amp; limitations</Link>
    </div>
  )
}

function Footer({ manifest }) {
  return (
    <footer className="app-footer">
      {manifest && (
        <span>
          Data bundle: {manifest.kind || 'unknown'}, generated {shortDate(manifest.generatedAt)}.{' '}
        </span>
      )}
      <span>Independent NASA Space Apps Challenge 2026 project — not affiliated with or endorsed by NASA.</span>
    </footer>
  )
}

function NotFound() {
  return (
    <section className="page empty-state">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the start</Link> · <Link to="/explore">Explore</Link>
      </p>
    </section>
  )
}

function StartupHeader() {
  return (
    <header className="topbar">
      <BrandMark />
      <span className="topbar__brand">
        <span className="topbar__name">Earth Analog Finder</span>
        <span className="topbar__tag">Planetary analog research console</span>
      </span>
    </header>
  )
}

/** Shell for a loaded bundle: rail + top bar; the drawer closes on navigation and Escape. */
function Shell({ data, children }) {
  // The drawer is open only for the page it was opened on, so any navigation closes it.
  const location = useLocation()
  const here = location.pathname + location.hash
  const [openAt, setOpenAt] = useState(null)
  const menuOpen = openAt === here
  const setMenuOpen = (open) => setOpenAt(typeof open === 'function' ? (open(menuOpen) ? here : null) : open ? here : null)
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => e.key === 'Escape' && setOpenAt(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])
  return (
    <>
      <Rail open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && (
        <button type="button" className="rail-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      )}
      <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} manifest={data.manifest} isMock={data.isMock} />
      {children}
    </>
  )
}

export default function App() {
  const { status, error, data } = useBundle()

  return (
    <div className={`app${status !== 'ready' ? ' app--startup' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {status !== 'ready' ? (
        <>
          <StartupHeader />
          <main id="main" className="app-main">
            {status === 'loading' ? (
              <p className="status" role="status">
                Loading and verifying the data bundle…
              </p>
            ) : (
              <section className="page empty-state" role="alert">
                <h1>Data could not be loaded</h1>
                <p>The data bundle could not be loaded or failed its integrity check, so the app will not show results.</p>
                <details>
                  <summary>Technical details</summary>
                  <pre className="app-error__pre">{error?.message}</pre>
                </details>
                <p className="app-error__actions">
                  <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
                    Reload
                  </button>
                </p>
              </section>
            )}
          </main>
        </>
      ) : (
        <AppStateProvider>
          <RouteEffects />
          <Shell data={data}>
          {data.isMock ? <MockBanner /> : <DataBanner data={data} />}
          <main id="main" className="app-main" tabIndex={-1}>
            <ErrorBoundary>
              <Suspense
                fallback={
                  <p className="status" role="status">
                    Loading…
                  </p>
                }
              >
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/site/:id" element={<SiteDetails />} />
                  <Route path="/compare" element={<Compare />} />
                  <Route path="/mirror" element={<Mirror />} />
                  <Route path="/about" element={<About />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
          <Footer manifest={data.manifest} />
          </Shell>
        </AppStateProvider>
      )}
    </div>
  )
}
