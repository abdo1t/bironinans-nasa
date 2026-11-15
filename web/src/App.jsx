import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import DemoGuide from './components/DemoGuide.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { IconAnalysis, IconCompare, IconDataset, IconDiscover, IconMap, IconMethod, IconMirror } from './components/Icons.jsx'
import MissionSelector from './components/MissionSelector.jsx'
import RouteEffects from './components/RouteEffects.jsx'
import { MockTag } from './components/Tags.jsx'
import { useBundle } from './data/useBundle.js'
import { featuresMissingEverywhere, joinLabels, shortDate } from './lib/explain.js'
import { bodyLabel } from './lib/format.js'
import { missionLabel } from './lib/missions.js'
import { AppStateProvider, useAppState } from './state/AppState.jsx'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import SiteDetails from './pages/SiteDetails.jsx'
import About from './pages/About.jsx'
import './styles/app.css'
// Redesign layer (world tokens, shell, shared components): after every eagerly loaded page sheet.
import './styles/theme.css'

// The radar chart (Recharts) is only needed on Compare: load it on demand.
const Compare = lazy(() => import('./pages/Compare.jsx'))
// Planetary Mirror (terrain images, evidence panel): also on demand, off the main journey.
const Mirror = lazy(() => import('./pages/Mirror.jsx'))
// Scientific report (print / CSV / JSON): on demand.
const Report = lazy(() => import('./pages/Report.jsx'))
// Analog method v1 mission tests (public/method-v1/analog_results.json) and its Arabic method page: on demand.
const MissionTests = lazy(() => import('./pages/MissionTests.jsx'))
const MethodAr = lazy(() => import('./pages/MethodAr.jsx'))

/** Original mark: a target point on an orbit ring (no agency insignia). */
function BrandMark({ size = 30 }) {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#b4c4dc" strokeWidth="1.75" />
      <ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.75" transform="rotate(-25 16 16)" />
      <circle cx="16" cy="16" r="3.25" fill="currentColor" />
    </svg>
  )
}

const NAV = [
  { to: '/', label: 'Home', Icon: IconDiscover, end: true },
  { to: '/explore', label: 'Explore', Icon: IconMap },
  { to: '/mirror', label: 'Mirror', Icon: IconMirror },
  { to: '/compare', label: 'Compare', Icon: IconCompare, count: true },
  { to: '/tests', label: 'Tests', Icon: IconAnalysis },
  { to: '/about', label: 'Method', Icon: IconMethod },
]

/**
 * Main navigation: five short labels. Desktop shows them in the top bar; phones show the same
 * links as a bottom tab bar. Active = aria-current plus an underline (top) / filled pill
 * (bottom), never colour alone. Site details count as part of Explore.
 */
function NavLinks({ variant }) {
  const app = useAppState()
  const { pathname } = useLocation()
  const n = app.shortlist.length
  return (
    <ul className={`nav nav--${variant}`}>
      {NAV.map((it) => {
        const forceActive = it.to === '/explore' && pathname.startsWith('/site/')
        return (
          <li key={it.to}>
            <NavLink
              to={app.linkTo(it.to)}
              end={it.end}
              className={({ isActive }) => `nav__item${isActive || forceActive ? ' is-active' : ''}`}
              aria-current={forceActive ? 'page' : undefined}
            >
              <it.Icon size={variant === 'tabs' ? 22 : 18} />
              <span className="nav__label">{it.label}</span>
              {it.count && n > 0 && (
                <span className="nav__count">
                  {n}
                  <span className="sr-only"> places selected</span>
                </span>
              )}
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The current mission in one compact control: "● Moon · Lunar South Pole · Ice exploration".
 * Opens a small popover with the same selector as Home (world, site, mission) and a link to the
 * full criteria. Escape, a click outside or navigating closes it.
 */
function MissionControl() {
  const app = useAppState()
  const location = useLocation()
  const [openAt, setOpenAt] = useState(null)
  const here = location.pathname
  const open = openAt === here
  const boxRef = useRef(null)
  const btnRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpenAt(null)
        btnRef.current?.focus()
      }
    }
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpenAt(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])
  const t = app.target
  const mission = missionLabel(app)
  return (
    <div className="mctl" ref={boxRef}>
      <button
        ref={btnRef}
        type="button"
        className="mctl__btn"
        aria-expanded={open}
        aria-controls="mctl-pop"
        onClick={() => setOpenAt(open ? null : here)}
      >
        <span className="sr-only">Current mission: </span>
        {t ? (
          <>
            <span className={`world-dot world-dot--${t.body}`} aria-hidden="true" />
            <span className="mctl__world">{bodyLabel(t.body)}</span>
            <span className="mctl__sep" aria-hidden="true">
              ·
            </span>
            <span className="mctl__target" title={t.name}>
              {t.name.split(' — ')[0]}
            </span>
            <span className="mctl__sep mctl__hide-sm" aria-hidden="true">
              ·
            </span>
            <span className="mctl__mission mctl__hide-sm">{mission}</span>
          </>
        ) : (
          <span className="mctl__target">Choose a world</span>
        )}
        <span className="mctl__chev" aria-hidden="true" />
        <span className="sr-only"> — change</span>
      </button>
      <div id="mctl-pop" className="mctl__pop" hidden={!open} role="group" aria-label="Change mission">
        <MissionSelector idPrefix="nav" layout="stack" />
        <div className="mctl__foot">
          <Link className="link-btn" to={app.linkTo('/explore', { adv: '1' })} onClick={() => setOpenAt(null)}>
            Adjust criteria and weights
          </Link>
          <Link className="link-btn" to={app.linkTo('/report')} onClick={() => setOpenAt(null)}>
            Research report
          </Link>
          <button type="button" className="btn btn--small" onClick={() => setOpenAt(null)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/** Top bar: brand, navigation, the current mission and the data mode. */
function TopBar({ manifest, isMock }) {
  const app = useAppState()
  const location = useLocation()
  return (
    <header className="topbar">
      <Link to={app.linkTo('/')} className="topbar__brand">
        <BrandMark size={26} />
        <span className="topbar__name">Earth Analog Finder</span>
      </Link>
      <nav className="topbar__nav" aria-label="Main">
        <NavLinks variant="top" />
      </nav>
      <span className="topbar__spacer" />
      {/* Home shows the same selector in its hero; one control per screen avoids two meanings. */}
      {location.pathname !== '/' && <MissionControl />}
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
        <span className="data-mode__label">{isMock ? 'Mock data' : 'Data'}</span>
        <span className="data-mode__text">{isMock ? '· not measurements' : `· ${shortDate(manifest?.generatedAt)}`}</span>
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
      <span>Independent NASA Space Apps Challenge 2026 project — not affiliated with or endorsed by NASA.</span>{' '}
      <Link to="/method/ar" lang="ar" dir="rtl">
        شرح المنهجية
      </Link>
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
      <span className="topbar__brand">
        <BrandMark size={26} />
        <span className="topbar__name">Earth Analog Finder</span>
      </span>
    </header>
  )
}

/**
 * Shell for a loaded bundle: top bar (desktop navigation), bottom tab bar (phones), and the
 * world theme: `data-world` on <html> switches the accent between lunar silver/cyan and
 * Martian copper/amber everywhere, map popups included.
 */
function Shell({ data, children }) {
  const app = useAppState()
  const world = app.target?.body || 'moon'
  useEffect(() => {
    document.documentElement.dataset.world = world
  }, [world])
  return (
    <>
      <TopBar manifest={data.manifest} isMock={data.isMock} />
      {children}
      <DemoGuide />
      <nav className="tabbar" aria-label="Main (bottom)">
        <NavLinks variant="tabs" />
      </nav>
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
                  <Route path="/report" element={<Report />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/tests" element={<MissionTests />} />
                  <Route path="/method/ar" element={<MethodAr />} />
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
