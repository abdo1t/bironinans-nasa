import { NavLink, Route, Routes } from 'react-router-dom'
import { MockTag } from './components/Tags.jsx'
import { useBundle } from './data/useBundle.js'
import { featuresMissingEverywhere, joinLabels, shortDate } from './lib/explain.js'
import { AppStateProvider, useAppState } from './state/AppState.jsx'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import SiteDetails from './pages/SiteDetails.jsx'
import Compare from './pages/Compare.jsx'
import About from './pages/About.jsx'

function Header() {
  const app = useAppState()
  const n = app.shortlist.length
  return (
    <header className="app-header">
      <NavLink to={app.linkTo('/')} className="brand">
        Earth Analog Finder
      </NavLink>
      <nav className="app-nav" aria-label="Main">
        <NavLink to={app.linkTo('/explore')}>Explore</NavLink>
        <NavLink to={app.linkTo('/compare')}>Compare{n ? ` (${n})` : ''}</NavLink>
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
      <strong>Research prototype.</strong> Climate: NASA POWER reanalysis (2001–2025, ~50 km cells). Targets: cited
      Perseverance / LRO results.{' '}
      {missing.length > 0 && (
        <>
          {joinLabels(missing.map((f) => f.label))}: no site data yet — excluded from scores.{' '}
        </>
      )}
      <NavLink to="/about">Method &amp; limitations</NavLink>
    </div>
  )
}

function Footer({ manifest }) {
  if (!manifest) return null
  return (
    <footer className="app-footer">
      Data bundle {manifest.kind || 'unknown'} · generated {shortDate(manifest.generatedAt)} · contract{' '}
      {manifest.contract || 'unknown'}
    </footer>
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
          <header className="app-header">
            <span className="brand">Earth Analog Finder</span>
          </header>
          <main id="main" className="app-main">
            {status === 'loading' ? (
              <p className="status">Loading data…</p>
            ) : (
              <p className="status status--error" role="alert">
                Could not load the data bundle: {error.message}
              </p>
            )}
          </main>
        </>
      ) : (
        <AppStateProvider>
          <Header />
          {data.isMock ? <MockBanner /> : <DataBanner data={data} />}
          <main id="main" className="app-main" tabIndex={-1}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/site/:id" element={<SiteDetails />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<p className="status">Page not found.</p>} />
            </Routes>
          </main>
          <Footer manifest={data.manifest} />
        </AppStateProvider>
      )}
    </div>
  )
}
