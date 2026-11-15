import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useBundle } from '../data/useBundle.js'
import { DEMO_STEPS, DEMO_TOTAL_SECS, demoTarget, readStep, writeStep } from '../lib/demoSteps.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/demo.css'

/** Bring an element into view and outline it briefly; waits up to ~2 s for it to render. */
function spotlight(selector) {
  if (!selector) return
  let tries = 0
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const tick = () => {
    const el = document.querySelector(selector)
    if (!el) {
      if (++tries < 40) setTimeout(tick, 50)
      return
    }
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    el.classList.remove('demo-spot')
    void el.offsetWidth // restart the outline animation
    el.classList.add('demo-spot')
    setTimeout(() => el.classList.remove('demo-spot'), 2600)
  }
  setTimeout(tick, 80)
}

/**
 * Presenter's guide for the 2–3 minute live demo: a small docked card with the current step,
 * a line to say, and Back / Next. Next performs the step with ordinary app actions (choose the
 * target, the objective, a weight, the shortlist; open a screen) — nothing is simulated, every
 * number on screen is the real ranking. Off unless started (Home "Demo mode" or ?demo=1);
 * the step survives a reload (sessionStorage). Collapses to a pill.
 */
export default function DemoGuide() {
  const { data } = useBundle()
  const app = useAppState()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(readStep)
  const [min, setMin] = useState(false)

  // Listen for starts first, then handle ?demo=1 (which dispatches a start).
  useEffect(() => {
    const on = () => {
      setStep(readStep())
      setMin(false)
    }
    window.addEventListener('eaf-demo', on)
    return () => window.removeEventListener('eaf-demo', on)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('demo') === '1') {
      params.delete('demo')
      writeStep(0)
      window.dispatchEvent(new Event('eaf-demo'))
      const s = params.toString()
      navigate({ pathname: location.pathname, search: s ? `?${s}` : '' }, { replace: true })
    }
  }, [location.search, location.pathname, navigate])
  const go = useCallback(
    (i) => {
      const s = DEMO_STEPS[i]
      if (!s) return
      writeStep(i)
      setStep(i)
      const to = s.go({ app, data, target: demoTarget(data.targets) })
      // Navigate after AppState's debounced URL write (150 ms) for any state this step set:
      // that write would otherwise replace a navigation still waiting on a lazy page (Compare).
      setTimeout(() => {
        if (to) navigate({ pathname: to.pathname, search: to.search || '' })
        spotlight(s.spot)
      }, 220)
    },
    [app, data, navigate],
  )

  if (step === null) return null
  const s = DEMO_STEPS[step]
  const elapsed = DEMO_STEPS.slice(0, step).reduce((n, x) => n + x.secs, 0)
  const end = () => {
    writeStep(null)
    setStep(null)
  }

  if (min) {
    return (
      <button type="button" className="demo-pill" onClick={() => setMin(false)}>
        Demo · step {step + 1}/{DEMO_STEPS.length}
        <span className="sr-only"> — show the demo guide</span>
      </button>
    )
  }

  return (
    <aside className="demo-guide" aria-label="Live demo guide">
      <div className="demo-guide__top">
        <span className="demo-guide__kicker">
          Live demo · {step + 1}/{DEMO_STEPS.length}
        </span>
        <span className="demo-guide__time" title="Suggested pacing">
          ~{Math.round(elapsed / 6) / 10}–{Math.round((elapsed + s.secs) / 6) / 10} of {Math.round(DEMO_TOTAL_SECS / 6) / 10} min
        </span>
        <button type="button" className="demo-guide__icon" onClick={() => setMin(true)} title="Minimise">
          <span aria-hidden="true">–</span>
          <span className="sr-only">Minimise demo guide</span>
        </button>
        <button type="button" className="demo-guide__icon" onClick={end} title="End demo">
          <span aria-hidden="true">×</span>
          <span className="sr-only">End demo</span>
        </button>
      </div>
      <ol className="demo-guide__dots" aria-hidden="true">
        {DEMO_STEPS.map((x, i) => (
          <li key={x.id} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} />
        ))}
      </ol>
      <h2 className="demo-guide__title">{s.title}</h2>
      <p className="demo-guide__say">“{s.say}”</p>
      <div className="demo-guide__actions">
        <button type="button" className="btn btn--small btn--ghost" disabled={step === 0} onClick={() => go(step - 1)}>
          ← Back
        </button>
        <button type="button" className="btn btn--small" onClick={() => go(step)} title="Open this step’s screen again">
          Show
        </button>
        {s.action && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              s.action.run({ app, data })
              spotlight(s.spot)
            }}
          >
            {s.action.label}
          </button>
        )}
        {step < DEMO_STEPS.length - 1 ? (
          <button type="button" className="btn btn--small btn--primary" onClick={() => go(step + 1)}>
            Next: {DEMO_STEPS[step + 1].title.split(' — ')[0]} →
          </button>
        ) : (
          <button type="button" className="btn btn--small btn--primary" onClick={end}>
            Finish
          </button>
        )}
      </div>
    </aside>
  )
}
