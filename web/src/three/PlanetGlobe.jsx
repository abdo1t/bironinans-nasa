import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { easeOutCubic, faceAngles, latLonToVec, reducedMotion } from './support.js'

/**
 * Home hero: an interactive Moon or Mars globe (three.js, lazy-loaded by HeroPlanet).
 *
 * Surfaces are real global mosaics (credited in HeroPlanet): NASA LRO WAC colour for the Moon,
 * the USGS/NASA Ames Viking MDIM 2.1 colour mosaic for Mars. Lighting is staged for depth — a
 * warm key light from the upper left and a soft world-coloured rim — and is NOT a real
 * illumination geometry. Drag or swipe rotates; the arrow keys rotate when the globe has focus.
 *
 * Switching worlds crossfades the two globes and their rim colour while the globe turns to the
 * selected site (≈0.6 s); under prefers-reduced-motion both happen instantly and the idle drift
 * is off. The scene renders only while visible on screen and something changes.
 */

const TEXTURES = {
  moon: 'textures/moon-lroc-wac-2k.webp',
  mars: 'textures/mars-viking-mdim21-1k.webp',
}
const RIM = { moon: new THREE.Color('#6fe3f4'), mars: new THREE.Color('#f39a52') }
const SWITCH_MS = 600
const TURN_MS = 900
const DRIFT_AMP = 0.28 // rad: idle sway around the site, never far enough to hide it
const DRIFT_PERIOD_S = 22
const IDLE_RESUME_MS = 5000

// Soft fresnel rim on a shell just outside the globe: brightest at the silhouette.
const RIM_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const RIM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - max(dot(vN, vView), 0.0), 3.2);
    gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
  }
`
// Halo: back faces of a larger shell. Bright just outside the limb, fading to nothing at the
// shell's own silhouette (where the back-face normal turns side-on to the viewer).
const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float f = pow(clamp(-dot(vN, vView), 0.0, 1.0), 4.0);
    gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
  }
`

function makeGlobe(texture, maxAniso) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(8, maxAniso)
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0, transparent: true })
  return new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat)
}

function shortName(name) {
  return name.split(' — ')[0].split(' (')[0]
}

function coordText(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`
}

export default function PlanetGlobe({ world, target, onReady, onFail }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const labelRef = useRef(null)
  const api = useRef(null)
  const [ready, setReady] = useState(false)
  const marker = target && target.coord && Number.isFinite(target.lat) && Number.isFinite(target.lon) ? target : null

  // ---- scene setup (once) ----------------------------------------------------------------
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      onFail?.()
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    camera.position.set(0, 0, 4.4)

    const key = new THREE.DirectionalLight(0xfff4e6, 2.9)
    key.position.set(-3.2, 1.6, 2.6)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x8fb4ff, 0.18)
    fill.position.set(3, -1, -1.5)
    scene.add(fill)
    scene.add(new THREE.AmbientLight(0xffffff, 0.06))

    const pivot = new THREE.Group() // yaw/pitch from the user and the site focus
    scene.add(pivot)

    const rimMat = new THREE.ShaderMaterial({
      vertexShader: RIM_VERT,
      fragmentShader: RIM_FRAG,
      uniforms: { uColor: { value: RIM[world].clone() }, uStrength: { value: 1.25 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    })
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), rimMat)
    scene.add(rim) // not in the pivot: the rim stays with the light, not the surface

    // Halo behind the globe (back faces of a larger shell) for depth against the starfield.
    const haloMat = new THREE.ShaderMaterial({
      vertexShader: RIM_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: { uColor: { value: RIM[world].clone() }, uStrength: { value: 0.7 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    })
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 48, 32), haloMat)
    scene.add(halo)

    // Site marker: a bright dot and a ring, parented to the surface so it turns with it.
    const markerGroup = new THREE.Group()
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }),
    )
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.034, 0.046, 40),
      new THREE.MeshBasicMaterial({ color: RIM[world].clone(), transparent: true, side: THREE.DoubleSide }),
    )
    markerGroup.add(dot, ring)
    markerGroup.visible = false

    const globes = {}
    const loader = new THREE.TextureLoader()
    const maxAniso = renderer.capabilities.getMaxAnisotropy()
    const base = import.meta.env.BASE_URL

    const state = {
      world,
      mix: world === 'mars' ? 1 : 0, // 0 = Moon fully shown, 1 = Mars
      mixFrom: 0,
      mixTo: 0,
      mixStart: 0,
      yaw: 0,
      pitch: 0.3,
      turn: null, // { fromYaw, fromPitch, toYaw, toPitch, start }
      focus: { yaw: 0, pitch: 0.3 },
      lastInput: -Infinity,
      dragging: false,
      dirty: true,
      visible: true,
      raf: 0,
      size: [1, 1],
      markerOn: false,
    }

    const applyMix = (m) => {
      const ease = easeOutCubic(m)
      if (globes.moon) {
        globes.moon.material.opacity = 1 - ease
        globes.moon.visible = ease < 0.999
        globes.moon.scale.setScalar(1 - 0.06 * ease)
      }
      if (globes.mars) {
        globes.mars.material.opacity = ease
        globes.mars.visible = ease > 0.001
        globes.mars.scale.setScalar(0.94 + 0.06 * ease)
      }
      const c = RIM.moon.clone().lerp(RIM.mars, ease)
      rimMat.uniforms.uColor.value.copy(c)
      haloMat.uniforms.uColor.value.copy(c)
      ring.material.color.copy(c)
    }

    const setPivot = () => {
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw)
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.pitch)
      pivot.quaternion.copy(qx.multiply(qy))
    }

    const placeLabel = () => {
      const el = labelRef.current
      if (!el) return
      if (!state.markerOn || !markerGroup.visible) {
        el.style.opacity = '0'
        return
      }
      const p = new THREE.Vector3()
      dot.getWorldPosition(p)
      const n = p.clone().normalize()
      const toCam = camera.position.clone().sub(p).normalize()
      const facing = n.dot(toCam)
      p.project(camera)
      const [w, h] = state.size
      el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`
      el.style.opacity = facing > 0.15 ? '1' : '0'
      // Put the label on whichever side of the marker has room on screen (the globe can sit
      // against the viewport edge on phones).
      const box = wrap.getBoundingClientRect()
      const sx = box.left + ((p.x + 1) / 2) * w
      const room = window.innerWidth - sx
      el.dataset.side = room < el.offsetWidth + 24 ? 'left' : 'right'
    }

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width))
      const h = Math.max(1, Math.round(r.height))
      state.size = [w, h]
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      state.dirty = true
    }

    const frame = (now) => {
      state.raf = 0
      const reduce = reducedMotion()
      let animating = false

      if (state.mixStart) {
        const t = Math.min(1, (now - state.mixStart) / SWITCH_MS)
        state.mix = state.mixFrom + (state.mixTo - state.mixFrom) * t
        if (t >= 1) state.mixStart = 0
        else animating = true
        state.dirty = true
      }
      if (state.turn) {
        const t = Math.min(1, (now - state.turn.start) / TURN_MS)
        const e = easeOutCubic(t)
        state.yaw = state.turn.fromYaw + (state.turn.toYaw - state.turn.fromYaw) * e
        state.pitch = state.turn.fromPitch + (state.turn.toPitch - state.turn.fromPitch) * e
        if (t >= 1) state.turn = null
        else animating = true
        state.dirty = true
      } else if (!reduce && !state.dragging && now - state.lastInput > IDLE_RESUME_MS) {
        // Idle sway around the focused site (off under reduced motion).
        const s = Math.sin((now / 1000) * ((2 * Math.PI) / DRIFT_PERIOD_S))
        const target = state.focus.yaw + DRIFT_AMP * s
        state.yaw += (target - state.yaw) * 0.02
        animating = true
        state.dirty = true
      }

      if (state.dirty) {
        applyMix(state.mix)
        setPivot()
        renderer.render(scene, camera)
        placeLabel()
        state.dirty = false
      }
      if (state.visible && (animating || state.dragging)) state.raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      state.dirty = true
      if (!state.raf && state.visible) state.raf = requestAnimationFrame(frame)
    }

    const loadWorld = (w) =>
      new Promise((resolve, reject) => {
        loader.load(
          `${base}${TEXTURES[w]}`,
          (tex) => {
            const g = makeGlobe(tex, maxAniso)
            globes[w] = g
            pivot.add(g)
            resolve()
          },
          undefined,
          reject,
        )
      })

    // ---- input: drag / swipe / keys -----------------------------------------------------
    let last = null
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return
      state.dragging = true
      state.turn = null
      last = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture?.(e.pointerId)
      wrap.classList.add('is-dragging')
      kick()
    }
    const onMove = (e) => {
      if (!state.dragging || !last) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      state.yaw += dx * 0.0085
      state.pitch = Math.max(-1.35, Math.min(1.35, state.pitch + dy * 0.0085))
      state.focus.yaw = state.yaw // the sway resumes around wherever the user left it
      state.lastInput = performance.now()
      kick()
    }
    const onUp = () => {
      state.dragging = false
      last = null
      state.lastInput = performance.now()
      wrap.classList.remove('is-dragging')
      kick()
    }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    const onKey = (e) => {
      const step = 0.18
      if (e.key === 'ArrowLeft') state.yaw -= step
      else if (e.key === 'ArrowRight') state.yaw += step
      else if (e.key === 'ArrowUp') state.pitch = Math.max(-1.35, state.pitch - step)
      else if (e.key === 'ArrowDown') state.pitch = Math.min(1.35, state.pitch + step)
      else return
      e.preventDefault()
      state.turn = null
      state.focus.yaw = state.yaw
      state.lastInput = performance.now()
      kick()
    }
    wrap.addEventListener('keydown', onKey)

    const ro = new ResizeObserver(() => {
      resize()
      kick()
    })
    ro.observe(wrap)
    const io = new IntersectionObserver(([en]) => {
      state.visible = en.isIntersecting && document.visibilityState === 'visible'
      if (state.visible) kick()
    })
    io.observe(wrap)
    const onVis = () => {
      state.visible = document.visibilityState === 'visible'
      if (state.visible) kick()
    }
    document.addEventListener('visibilitychange', onVis)

    resize()
    let alive = true
    // The current world first (the hero becomes usable sooner), then the other in the background.
    const first = world
    const second = world === 'mars' ? 'moon' : 'mars'
    loadWorld(first)
      .then(() => {
        if (!alive) return
        applyMix(state.mix)
        setReady(true)
        onReady?.()
        kick()
        return loadWorld(second).then(() => alive && kick())
      })
      .catch(() => alive && onFail?.())

    api.current = {
      setWorld(w) {
        if (w === state.world) return
        state.world = w
        const to = w === 'mars' ? 1 : 0
        if (reducedMotion()) {
          state.mix = to
          state.mixStart = 0
        } else {
          state.mixFrom = state.mix
          state.mixTo = to
          state.mixStart = performance.now()
        }
        kick()
      },
      setMarker(t) {
        if (!t) {
          state.markerOn = false
          markerGroup.visible = false
          kick()
          return
        }
        const [x, y, z] = latLonToVec(t.lat, t.lon)
        const n = new THREE.Vector3(x, y, z)
        markerGroup.position.copy(n.clone().multiplyScalar(1.004))
        markerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
        if (markerGroup.parent !== pivot) pivot.add(markerGroup)
        markerGroup.visible = true
        state.markerOn = true
        const f = faceAngles(t.lat, t.lon)
        // shortest way round to the new yaw
        let toYaw = f.yaw
        while (toYaw - state.yaw > Math.PI) toYaw -= 2 * Math.PI
        while (toYaw - state.yaw < -Math.PI) toYaw += 2 * Math.PI
        state.focus = { yaw: toYaw, pitch: f.pitch }
        if (reducedMotion()) {
          state.yaw = toYaw
          state.pitch = f.pitch
          state.turn = null
        } else {
          state.turn = { fromYaw: state.yaw, fromPitch: state.pitch, toYaw, toPitch: f.pitch, start: performance.now() }
        }
        state.lastInput = -Infinity
        kick()
      },
      kick,
    }

    return () => {
      alive = false
      api.current = null
      cancelAnimationFrame(state.raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      wrap.removeEventListener('keydown', onKey)
      scene.traverse((o) => {
        o.geometry?.dispose?.()
        const m = o.material
        if (m) {
          m.map?.dispose?.()
          m.dispose?.()
        }
      })
      renderer.dispose()
    }
    // Scene is built once; world and marker changes go through api below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.current?.setWorld(world)
  }, [world])

  const markerKey = marker ? `${marker.id}:${marker.lat}:${marker.lon}` : ''
  useEffect(() => {
    api.current?.setMarker(marker)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, ready])

  return (
    <div
      ref={wrapRef}
      className={`globe${ready ? ' is-ready' : ''}`}
      tabIndex={0}
      role="img"
      aria-roledescription="interactive globe"
      aria-label={`${world === 'mars' ? 'Mars' : 'The Moon'}, global image mosaic${
        marker ? `, marker at ${shortName(marker.name)} (${coordText(marker.lat, marker.lon)})` : ''
      }. Drag, swipe or use the arrow keys to rotate.`}
    >
      <canvas ref={canvasRef} className="globe__canvas" />
      {marker && (
        <div ref={labelRef} className="globe__label" aria-hidden="true">
          <span className="globe__label-name">{shortName(marker.name)}</span>
          <span className="globe__label-coord">{coordText(marker.lat, marker.lon)}</span>
        </div>
      )}
    </div>
  )
}
