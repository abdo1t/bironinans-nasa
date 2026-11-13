import { NavLink, Route, Routes } from 'react-router-dom'
import { useBundle } from './data/useBundle.js'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import SiteDetails from './pages/SiteDetails.jsx'
import Compare from './pages/Compare.jsx'
import About from './pages/About.jsx'

function BundleGate({ children }) {
  const { status, error } = useBundle()
  if (status === 'loading') return <p className="status">Loading data…</p>
  if (status === 'error') {
    return (
      <p className="status status--error" role="alert">
        Could not load the data bundle: {error.message}
      </p>
    )
  }
  return children
}

export default function App() {
  const { data } = useBundle()

  return (
    <div className="app">
      <header className="app-header">
        <NavLink to="/" className="brand">
          Earth Analog Finder
        </NavLink>
        <nav className="app-nav">
          <NavLink to="/explore">Explore</NavLink>
          <NavLink to="/compare">Compare</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
      </header>

      {data?.isMock && (
        <div className="mock-banner" role="note">
          Mock data: values are placeholders, not measurements.
        </div>
      )}

      <main className="app-main">
        <BundleGate>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/site/:id" element={<SiteDetails />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<p className="status">Page not found.</p>} />
          </Routes>
        </BundleGate>
      </main>
    </div>
  )
}
