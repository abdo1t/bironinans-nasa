// Small, three.js-free helpers shared by the 3D views, so pages can decide whether to load 3D at
// all without pulling the three.js chunk.

let webglCache = null

/** True when the browser can create a WebGL context (cached; false on any error). */
export function hasWebGL() {
  if (webglCache !== null) return webglCache
  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('no3d') === '1') {
      // Test hook: ?no3d=1 forces the static fallback (verifies the no-WebGL path).
      webglCache = false
      return webglCache
    }
    const c = document.createElement('canvas')
    webglCache = Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webglCache = false
  }
  return webglCache
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/** Ease for short user-triggered transitions. */
export const easeOutCubic = (t) => 1 - (1 - t) ** 3

/** Unit vector for a planetocentric lat/lon (deg) on a three.js SphereGeometry with an
 *  equirectangular map centred on 0° longitude: lon 0 → +X, lon +90° E → −Z, north → +Y. */
export function latLonToVec(latDeg, lonDeg) {
  const la = (latDeg * Math.PI) / 180
  const lo = (lonDeg * Math.PI) / 180
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]
}

/** Globe yaw/pitch (rad) that bring a lat/lon to face the camera (+Z). Pitch is clamped so a
 *  polar site sits near the lower or upper limb instead of the globe flipping over. */
export function faceAngles(latDeg, lonDeg, maxPitchDeg = 58) {
  const yaw = (-90 - lonDeg) * (Math.PI / 180)
  const pitch = Math.max(-maxPitchDeg, Math.min(maxPitchDeg, latDeg)) * (Math.PI / 180)
  return { yaw, pitch }
}
