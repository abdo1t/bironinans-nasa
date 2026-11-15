import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { easeOutCubic, reducedMotion } from './support.js'

/**
 * Planetary Mirror, 3D: the Moon/Mars reference area and the Earth place as two terrain meshes
 * built from their real elevation grids (pipeline/make_terrain_mesh.py: the same heights the 2D
 * preview images shade, 180 m cells), cropped to the same ground width and drawn at the same
 * horizontal scale. ONE camera serves both views, so rotation and zoom are always in sync.
 *
 * Honesty rules: heights are measured from each area's own lowest point (the two bodies use
 * different height references), vertical exaggeration is chosen by the user and always stated,
 * and colours stretch to each preview's own range exactly as in the 2D images.
 */

const SPLIT_MIN_W = 720 // side by side at or above this width, stacked below
const FOV = 34
const DEFAULT_VIEW = { theta: 0.35, phi: 0.98 } // a little east of south, ~56° from vertical
const WINDOW_COLOR = { off: 0xffffff, on: 0x9ee0c4 }

async function loadGrid(meta) {
  const res = await fetch(`${import.meta.env.BASE_URL}${meta.file}`)
  if (!res.ok) throw new Error(`${meta.file}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  if (crypto?.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', buf)
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hex !== meta.sha256) throw new Error(`${meta.file}: checksum mismatch`)
  }
  const grid = new Int16Array(buf)
  if (grid.length !== meta.rows * meta.cols) throw new Error(`${meta.file}: unexpected size`)
  return grid
}

/** Central square of `km` ground width (whole cells), as a Float32 height grid (NaN = nodata). */
function crop(meta, grid, km) {
  const cellX = meta.cellM[1]
  const n = Math.max(2, Math.min(meta.cols, meta.rows, Math.round((km * 1000) / cellX)))
  const offC = Math.floor((meta.cols - n) / 2)
  const offR = Math.floor((meta.rows - n) / 2)
  const z = new Float32Array(n * n)
  let min = Infinity
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const v = grid[(r + offR) * meta.cols + (c + offC)]
      const h = v === meta.nodata ? NaN : v
      z[r * n + c] = h
      if (h < min) min = h
    }
  }
  const [l, t, rr, b] = meta.scoringWindowCells
  return {
    n,
    z,
    min,
    cellKm: cellX / 1000,
    window: [l - offC, t - offR, rr - offC, b - offR],
    marker: [meta.markerCells[0] - offC, meta.markerCells[1] - offR],
  }
}

function rampColor(ramp, t, out) {
  const k = Math.max(0, Math.min(1, t)) * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(k))
  const f = k - i
  out.copy(ramp[i]).lerp(ramp[i + 1], f)
  return out
}

/** One terrain: mesh + 10 km window outline + reference pin + 10 km scale bar. */
function buildSide(data, ramp, rampRange, resolution) {
  const { n, z, min, cellKm } = data
  const w = (n - 1) * cellKm
  const geo = new THREE.PlaneGeometry(w, w, n - 1, n - 1)
  geo.rotateX(-Math.PI / 2) // first grid row (north / image top) ends up at −Z, away from the default camera
  const colors = new Float32Array(n * n * 3)
  const c = new THREE.Color()
  const rampCols = ramp.map(([, hex]) => new THREE.Color(hex))
  for (let i = 0; i < n * n; i += 1) {
    const h = Number.isNaN(z[i]) ? min : z[i]
    rampColor(rampCols, (h - rampRange[0]) / (rampRange[1] - rampRange[0] || 1), c)
    if (Number.isNaN(z[i])) c.setRGB(0.25, 0.25, 0.28)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geo, mat)

  const group = new THREE.Group()
  group.add(mesh)

  const lineMat = (color, width) =>
    new LineMaterial({ color, linewidth: width, worldUnits: false, resolution, transparent: true, depthTest: true })
  const outline = new Line2(new LineGeometry(), lineMat(WINDOW_COLOR.off, 2))
  const pin = new Line2(new LineGeometry(), lineMat(0xffffff, 2))
  const bar = new Line2(new LineGeometry(), lineMat(0xffffff, 3))
  const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  group.add(outline, pin, bar, pinHead)

  const toX = (col) => -w / 2 + col * cellKm // col in cell-centre units
  const toZ = (row) => -w / 2 + row * cellKm
  const sample = (col, row) => {
    const x = Math.max(0, Math.min(n - 1, col))
    const y = Math.max(0, Math.min(n - 1, row))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(n - 1, x0 + 1)
    const y1 = Math.min(n - 1, y0 + 1)
    const fx = x - x0
    const fy = y - y0
    const g = (cc, rr) => {
      const v = z[rr * n + cc]
      return Number.isNaN(v) ? min : v
    }
    return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy
  }

  const setExag = (exag) => {
    const pos = geo.attributes.position
    for (let i = 0; i < n * n; i += 1) {
      const h = Number.isNaN(z[i]) ? min : z[i]
      pos.setY(i, ((h - min) / 1000) * exag)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    const lift = 0.04 + 0.02 * exag
    // window outline (edge-based cell coordinates → centre-based by −0.5)
    const [l, t, r, b] = data.window.map((v) => v - 0.5)
    const pts = []
    const edge = (c0, r0, c1, r1) => {
      const steps = Math.max(2, Math.ceil(Math.hypot(c1 - c0, r1 - r0) * 2))
      for (let s = 0; s < steps; s += 1) {
        const f = s / steps
        const cc = c0 + (c1 - c0) * f
        const rr = r0 + (r1 - r0) * f
        pts.push(toX(cc), ((sample(cc, rr) - min) / 1000) * exag + lift, toZ(rr))
      }
    }
    edge(l, t, r, t)
    edge(r, t, r, b)
    edge(r, b, l, b)
    edge(l, b, l, t)
    pts.push(pts[0], pts[1], pts[2])
    outline.geometry.dispose()
    outline.geometry = new LineGeometry().setPositions(pts)
    // reference pin
    const [mc, mr] = data.marker.map((v) => v - 0.5)
    const base = ((sample(mc, mr) - min) / 1000) * exag
    const top = base + 1.6
    pin.geometry.dispose()
    pin.geometry = new LineGeometry().setPositions([toX(mc), base, toZ(mr), toX(mc), top, toZ(mr)])
    pinHead.position.set(toX(mc), top, toZ(mr))
    // 10 km scale bar along the front (south) edge, with end ticks
    const zf = w / 2 + 0.9
    const x0 = -w / 2
    const x1 = x0 + 10
    bar.geometry.dispose()
    bar.geometry = new LineGeometry().setPositions([x0, 0.6, zf, x0, 0, zf, x1, 0, zf, x1, 0.6, zf])
  }

  return {
    group,
    width: w,
    setExag,
    setWindowOn(on) {
      outline.material.color.setHex(on ? WINDOW_COLOR.on : WINDOW_COLOR.off)
      outline.material.linewidth = on ? 4 : 2
      outline.material.opacity = on ? 1 : 0.75
    },
    lineMats: [outline.material, pin.material, bar.material],
  }
}

function makeScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#05080f')
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.75))
  const sun = new THREE.DirectionalLight(0xffffff, 2.2) // from the north-west, like the 2D hillshade
  sun.position.set(-20, 26, -16)
  scene.add(sun)
  return scene
}

export default function TerrainPair3D({ left, right, sharedKm, terrainSelected, exag, onExag, onFail }) {
  const viewRef = useRef(null)
  const canvasRef = useRef(null)
  const api = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [split, setSplit] = useState(true)
  const [height, setHeight] = useState(420)

  useEffect(() => {
    const view = viewRef.current
    const canvas = canvasRef.current
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch {
      onFail?.()
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setScissorTest(true)

    const scenes = [makeScene(), makeScene()]
    const sides = [null, null]
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000)
    const resolution = new THREE.Vector2(1, 1)
    const st = {
      ...DEFAULT_VIEW,
      radius: 40,
      baseRadius: 40,
      exag,
      split: true,
      size: [1, 1],
      anim: null,
      raf: 0,
      pointers: new Map(),
      pinch: null,
      alive: true,
    }

    const fitRadius = () => {
      const w = Math.max(sides[0]?.width || 27, sides[1]?.width || 27)
      const [W, H] = st.size
      const vw = st.split ? W / 2 : W
      const vh = st.split ? H : H / 2
      const aspect = vw / vh
      const half = Math.tan(((FOV / 2) * Math.PI) / 180)
      const needH = (w * 0.78) / half
      const needW = (w * 0.8) / (half * aspect)
      return Math.max(needH, needW)
    }

    const placeCamera = () => {
      const r = st.radius
      const sp = Math.sin(st.phi)
      const target = new THREE.Vector3(0, (0.3 * st.exag * 1000) / 1000, 0)
      camera.position.set(target.x + r * sp * Math.sin(st.theta), target.y + r * Math.cos(st.phi), target.z + r * sp * Math.cos(st.theta))
      camera.lookAt(target)
    }

    const render = () => {
      st.raf = 0
      if (!st.alive) return
      const now = performance.now()
      let again = false
      if (st.anim) {
        const t = Math.min(1, (now - st.anim.start) / st.anim.ms)
        const e = easeOutCubic(t)
        for (const k of ['theta', 'phi', 'radius']) st[k] = st.anim.from[k] + (st.anim.to[k] - st.anim.from[k]) * e
        if (t >= 1) st.anim = null
        else again = true
      }
      placeCamera()
      const [W, H] = st.size
      const halves = st.split
        ? [
            [0, 0, W / 2, H],
            [W / 2, 0, W / 2, H],
          ]
        : [
            [0, H / 2, W, H / 2], // WebGL y is bottom-up: the first (planet) view on top
            [0, 0, W, H / 2],
          ]
      for (let i = 0; i < 2; i += 1) {
        const [x, y, w, h] = halves[i]
        renderer.setViewport(x, y, w, h)
        renderer.setScissor(x, y, w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        resolution.set(w, h)
        renderer.render(scenes[i], camera)
      }
      if (again) st.raf = requestAnimationFrame(render)
    }
    const kick = () => {
      if (!st.raf) st.raf = requestAnimationFrame(render)
    }

    const resize = () => {
      const W = Math.max(1, Math.round(view.getBoundingClientRect().width))
      const isSplit = W >= SPLIT_MIN_W
      const H = isSplit ? Math.round(Math.min(560, (W / 2) * 0.86)) : Math.round(Math.min(W * 0.8, 420) * 2)
      st.split = isSplit
      st.size = [W, H]
      renderer.setSize(W, H, false)
      canvas.style.height = `${H}px`
      setSplit(isSplit)
      setHeight(H)
      const before = st.baseRadius
      st.baseRadius = fitRadius()
      st.radius *= st.baseRadius / before
      kick()
    }

    // ---- input ---------------------------------------------------------------------------
    const clampPhi = (p) => Math.max(0.12, Math.min(1.45, p))
    const clampR = (r) => Math.max(st.baseRadius * 0.35, Math.min(st.baseRadius * 2.2, r))
    const onDown = (e) => {
      view.setPointerCapture?.(e.pointerId)
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      st.anim = null
      if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()]
        st.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: st.radius }
      }
      view.classList.add('is-dragging')
    }
    const onMove = (e) => {
      const p = st.pointers.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (st.pointers.size === 2 && st.pinch) {
        const [a, b] = [...st.pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        st.radius = clampR((st.pinch.r * st.pinch.d) / Math.max(d, 1))
      } else if (st.pointers.size === 1) {
        st.theta -= dx * 0.008
        st.phi = clampPhi(st.phi - dy * 0.008)
      }
      kick()
    }
    const onUp = (e) => {
      st.pointers.delete(e.pointerId)
      if (st.pointers.size < 2) st.pinch = null
      if (!st.pointers.size) view.classList.remove('is-dragging')
    }
    const onWheel = (e) => {
      // Zoom only on a pinch gesture (ctrlKey) or once the 3D view has focus: never trap page scroll.
      if (!e.ctrlKey && document.activeElement !== view) return
      e.preventDefault()
      st.anim = null
      st.radius = clampR(st.radius * Math.exp(e.deltaY * 0.0015))
      kick()
    }
    const onKey = (e) => {
      const step = 0.12
      if (e.key === 'ArrowLeft') st.theta += step
      else if (e.key === 'ArrowRight') st.theta -= step
      else if (e.key === 'ArrowUp') st.phi = clampPhi(st.phi - step)
      else if (e.key === 'ArrowDown') st.phi = clampPhi(st.phi + step)
      else if (e.key === '+' || e.key === '=') st.radius = clampR(st.radius * 0.85)
      else if (e.key === '-' || e.key === '_') st.radius = clampR(st.radius / 0.85)
      else if (e.key === '0') api.current?.reset()
      else return
      e.preventDefault()
      st.anim = null
      kick()
    }
    view.addEventListener('pointerdown', onDown)
    view.addEventListener('pointermove', onMove)
    view.addEventListener('pointerup', onUp)
    view.addEventListener('pointercancel', onUp)
    view.addEventListener('wheel', onWheel, { passive: false })
    view.addEventListener('keydown', onKey)
    const ro = new ResizeObserver(resize)
    ro.observe(view)

    api.current = {
      reset() {
        const to = { ...DEFAULT_VIEW, radius: st.baseRadius }
        if (reducedMotion()) {
          Object.assign(st, to)
          st.anim = null
        } else {
          st.anim = { from: { theta: st.theta, phi: st.phi, radius: st.radius }, to, start: performance.now(), ms: 420 }
        }
        kick()
      },
      zoom(f) {
        st.anim = null
        st.radius = clampR(st.radius * f)
        kick()
      },
      setExag(x) {
        st.exag = x
        sides.forEach((s) => s?.setExag(x))
        kick()
      },
      setWindowOn(on) {
        sides.forEach((s) => s?.setWindowOn(on))
        kick()
      },
    }

    Promise.all([loadGrid(left.meta), loadGrid(right.meta)])
      .then(([gl, gr]) => {
        if (!st.alive) return
        ;[
          [left, gl],
          [right, gr],
        ].forEach(([side, grid], i) => {
          const data = crop(side.meta, grid, sharedKm)
          const s = buildSide(data, side.ramp, side.rampRange, resolution)
          s.setExag(st.exag)
          sides[i] = s
          scenes[i].add(s.group)
        })
        resize()
        st.radius = st.baseRadius
        api.current.setWindowOn(terrainSelected)
        setStatus('ready')
        kick()
      })
      .catch((err) => {
        if (!st.alive) return
        setError(err.message)
        setStatus('error')
      })

    resize()
    return () => {
      st.alive = false
      cancelAnimationFrame(st.raf)
      ro.disconnect()
      view.removeEventListener('pointerdown', onDown)
      view.removeEventListener('pointermove', onMove)
      view.removeEventListener('pointerup', onUp)
      view.removeEventListener('pointercancel', onUp)
      view.removeEventListener('wheel', onWheel)
      view.removeEventListener('keydown', onKey)
      scenes.forEach((sc) =>
        sc.traverse((o) => {
          o.geometry?.dispose?.()
          o.material?.dispose?.()
        }),
      )
      renderer.dispose()
      api.current = null
    }
    // Built once per pair; exaggeration and highlight go through api.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left.meta.file, right.meta.file, sharedKm])

  useEffect(() => {
    api.current?.setExag(exag)
  }, [exag])
  useEffect(() => {
    api.current?.setWindowOn(terrainSelected)
  }, [terrainSelected, status])

  const reset = useCallback(() => api.current?.reset(), [])

  const half = (side, kind) => (
    <div className={`t3d__half t3d__half--${kind}`}>
      <p className="t3d__side">{side.sideLabel}</p>
      <p className="t3d__name">{side.name}</p>
      {side.crit && (
        <p key={side.crit.id} className={`t3d__crit t3d__crit--${side.crit.status}`}>
          <span className="t3d__crit-label">{side.crit.label}</span>
          <strong>{side.crit.text ?? 'no value'}</strong>
          {terrainSelected && side.crit.text && <span className="t3d__crit-label">outlined: its 10 × 10 km window</span>}
        </p>
      )}
    </div>
  )

  return (
    <div className="t3d">
      <div
        ref={viewRef}
        className="t3d__view"
        tabIndex={0}
        role="img"
        aria-roledescription="interactive 3D terrain comparison"
        aria-label={`3D terrain: ${left.name} beside ${right.name}, same ground width, vertical exaggeration ${exag} times. Drag to rotate both together; arrow keys rotate, plus and minus zoom, 0 resets.`}
        style={{ height }}
      >
        <canvas ref={canvasRef} className="t3d__canvas" />
        <div className={`t3d__halves t3d__halves--${split ? 'row' : 'col'}`} aria-hidden="true">
          {half(left, 'planet')}
          {half(right, 'earth')}
        </div>
        {status !== 'ready' && (
          <p className="t3d__status" role={status === 'error' ? 'alert' : 'status'}>
            {status === 'error'
              ? `3D terrain could not be loaded (${error}). The images and evidence remain available — switch back to Images.`
              : 'Building terrain from elevation data…'}
          </p>
        )}
      </div>
      <div className="t3d__bar">
        <div className="t3d__controls" role="group" aria-label="Vertical exaggeration">
          <span className="t3d__exag-label">Vertical exaggeration</span>
          <div className="seg">
            {[1, 2, 4].map((x) => (
              <button key={x} type="button" aria-pressed={exag === x} onClick={() => onExag(x)}>
                {x}×
              </button>
            ))}
          </div>
        </div>
        <div className="t3d__controls">
          <button type="button" className="btn btn--small btn--ghost" onClick={() => api.current?.zoom(0.8)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => api.current?.zoom(1.25)} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="btn btn--small" onClick={reset}>
            Reset view
          </button>
        </div>
      </div>
      <p className="t3d__cap">
        <strong>
          Same ground on both: {sharedKm.toFixed(0)} km across · 180 m cells · vertical exaggeration {exag}×
          {exag === 1 ? ' (true proportions)' : ''}
        </strong>
        . Drag (or swipe) rotates both views together; pinch, Ctrl + scroll or +/− zooms. The white bar along the front
        edge is 10 km; the pin marks the reference point. Heights start at each area’s own lowest point — {left.name}:{' '}
        {left.heightRef}; {right.name}: {right.heightRef} — and colours stretch to each area’s own range, as in the
        images. Sources: {left.source}; {right.source}.
      </p>
    </div>
  )
}
