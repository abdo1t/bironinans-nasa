import { Component, Suspense, lazy, useState } from 'react'
import { hasWebGL } from '../three/support.js'
import PlanetArt from './PlanetArt.jsx'
import '../styles/three.css'

// three.js is only downloaded when a WebGL-capable browser shows the hero.
const PlanetGlobe = lazy(() => import('../three/PlanetGlobe.jsx'))

const CREDIT = {
  moon: 'Moon: NASA LRO Wide Angle Camera colour mosaic (NASA/GSFC/ASU, via the NASA SVS CGI Moon Kit)',
  mars: 'Mars: Viking MDIM 2.1 colour mosaic (NASA Ames / USGS Astrogeology)',
}

/** Any failure inside the 3D chunk falls back to the static illustration. */
class Fallback extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * The Home hero planet. With WebGL: an interactive, textured globe (lazy chunk) that fades in
 * over the static SVG illustration once its first texture loads, so the hero never shows an
 * empty frame and the selector and "Find places on Earth" stay usable throughout. Without
 * WebGL (or if the 3D view fails): the existing SVG illustration, unchanged.
 */
export default function HeroPlanet({ world, target, className = '' }) {
  const [webgl] = useState(hasWebGL)
  const [state, setState] = useState('loading') // loading | ready | failed
  const art = <PlanetArt world={world} className="hero-planet__art" />
  const use3d = webgl && state !== 'failed'
  return (
    <figure className={`hero-planet hero-planet--${state}${use3d ? '' : ' hero-planet--static'} ${className}`.trim()}>
      <div className="hero-planet__stage">
        {art}
        {use3d && (
          <Fallback fallback={null}>
            <Suspense fallback={null}>
              <PlanetGlobe
                world={world}
                target={target}
                onReady={() => setState('ready')}
                onFail={() => setState('failed')}
              />
            </Suspense>
          </Fallback>
        )}
      </div>
      <figcaption className="hero-planet__cap">
        {use3d && state === 'ready' ? (
          <>
            <span className="hero-planet__hint">Drag to rotate</span>
            <span className="hero-planet__credit">{CREDIT[world === 'mars' ? 'mars' : 'moon']} · lighting and glow are staged, not to scale</span>
          </>
        ) : (
          <span className="hero-planet__credit">{world === 'mars' ? 'Mars' : 'Moon'} · illustration, not to scale</span>
        )}
      </figcaption>
    </figure>
  )
}
