import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Base styles first, so page-level stylesheets imported by components can override them.
import './index.css'
import './styles/system.css'
import './styles/mission.css'
import { BundleProvider } from './data/useBundle.js'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <BundleProvider>
        <App />
      </BundleProvider>
    </BrowserRouter>
  </StrictMode>,
)
