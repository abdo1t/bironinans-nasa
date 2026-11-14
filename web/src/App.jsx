import { Suspense, lazy } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import RouteEffects from './components/RouteEffects.jsx'
import { MockTag } from './components/Tags.jsx'
import { useBundle } from './data/useBundle.js'
import { featuresMissingEverywhere, joinLabels, shortDate } from './lib/explain.js'
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
function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="11" fill="none" stroke="#c3c2b7" strokeWidth="2" />
      <ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke="#e8743b" strokeWidth="2" transform="rotate(-25 16 16)" />
      <circle cx="16" cy="16" r="3.5" fill="#e8743b" />
    </svg>
  )
}

function Header() {
  const app = useAppState()
  const n = app.shortlist.length
  return (
    <header className="app-header">
      <NavLink to={app.linkTo('/')} className="brand" end>
        <BrandMark />
        <span>Earth Analog Finder</span>
      </NavLink>
      <nav className="app-nav" aria-label="Main">
        <NavLink to={app.linkTo('/')} end>
          Start
        </NavLink>
        <NavLink to={app.linkTo('/explore')}>Explore</NavLink>
        <NavLink to={app.linkTo('/compare')}>
          Compare{n ? ` (${n})` : ''}
          {n > 0 && <span className="sr-only"> sites selected</span>}
        </NavLink>
        <NavLink to={app.linkTo('/mirror')}>Mirror</NavLink>
        <NavLink to={app.linkTo('/about')}>About</NavLink>
      </nav>
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
    <header className="app-header">
      <span className="brand">
        <BrandMark />
        <span>Earth Analog Finder</span>
      </span>
    </header>
  )
}

export default function App() {
  const { status, error, data } = useBundle()

  return (
    <div className="app">
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
          <Header />
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
        </AppStateProvider>
      )}
    </div>
  )
}
