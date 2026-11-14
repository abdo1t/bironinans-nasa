import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MissionPicker from '../components/MissionPicker.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import Term from '../components/Term.jsx'
import WorldCard from '../components/WorldCard.jsx'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel } from '../lib/format.js'
import { MISSION_CAVEAT, missionTitle } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS } from '../lib/rankMethods.js'
import { SCENARIOS, matchScenario, scenarioQuery } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/home.css'

const WORLDS = ['moon', 'mars']

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Numbered step heading; a finished step gets a filled badge and a check mark. */
function StepTitle({ n, done, id, children }) {
  return (
    <h2 className="home-step__title" id={id}>
      <span className="home-step__num" aria-hidden="true">
        {n}
      </span>
      <span className="sr-only">Step {n}: </span>
      {children}
      {done && (
        <span className="home-step__done">
          <span aria-hidden="true">✓</span>
          <span className="sr-only"> (done)</span>
        </span>
      )}
    </h2>
  )
}

/**
 * Guided start: world -> research objective -> "Find matching places on Earth". The Moon/Mars
 * reference (target) site is picked with the world and named under the world cards, so a
 * first-time visitor makes two choices; both steps are visible from the start;
 * the examples below the button are shortcuts to documented scenarios.
 */
export default function Home() {
  const { data } = useBundle()
  const app = useAppState()
  const navigate = useNavigate()
  // A chosen target decides the world; `pickedBody` only matters while no target is chosen yet.
  const [pickedBody, setPickedBody] = useState(null)
  const body = app.target?.body ?? pickedBody
  const bodyTargets = body ? data.targets.filter((t) => t.body === body) : []

  const chooseBody = (b) => {
    setPickedBody(b)
    setNudge(false)
    const list = data.targets.filter((t) => t.body === b)
    // One target for this world: nothing to choose, so select it (no one-option dropdown).
    if (list.length === 1) app.setTarget(list[0].id)
    else if (app.target && app.target.body !== b) app.setTarget(null)
  }

  // The documented Jezero + Rover testing scenario opens in the conservative order; everything
  // else opens by score. `rank` is always written so no earlier ranking method sticks.
  const scenario = app.isCustom ? null : matchScenario(app.targetId, app.presetId)
  const rank = scenario?.rankBy === 'min' ? 'min' : 'score'
  // The button stays focusable when nothing is chosen yet: a click explains what is missing
  // instead of a silent, greyed-out control.
  const [nudge, setNudge] = useState(false)
  const findAnalogs = () => {
    if (!app.target) {
      setNudge(true)
      document.querySelector(body ? '#home-target' : '.world-card')?.focus()
      return
    }
    navigate(app.linkTo('/explore', { rank }))
  }

  const scenarios = SCENARIOS.filter((sc) => data.targetById[sc.targetId] && PRESETS[sc.presetId])
  const scenarioHref = (sc) => {
    // Plain preset link (not linkTo): custom weights in the current URL must not override the scenario preset.
    const params = new URLSearchParams(scenarioQuery(sc))
    if (app.shortlist.length) params.set('sites', app.shortlist.join(','))
    return `/explore?${params.toString().replace(/%2C/g, ',')}`
  }

  // Display-only: the ice criterion rewards matching the target's ice state (see PRESETS.ice.rationale).
  const iceFreeTarget = app.presetId === 'ice' && app.target?.norm?.ice === 'no'

  let ctaHint
  if (!body) ctaHint = 'Choose the Moon or Mars first (step 1).'
  else if (!app.target) ctaHint = 'Choose which site to compare with (step 1).'
  else {
    ctaHint = 'You’ll see a map and a short list of the closest matches, each with a reason.'
    if (rank === 'min') {
      ctaHint += ` Sites with the most complete measurements come first (${RANK_METHODS.min.label}).`
    }
  }

  return (
    <section className="page home">
      <header className="home-hero">
        <p className="kicker">NASA Space Apps Challenge 2026 · research prototype</p>
        <h1>Find places on Earth that resemble the Moon and Mars</h1>
        <p className="home-hero__lede">
          Mission teams rehearse at <Term id="analog">Earth analog sites</Term> before they fly. Pick a world and a
          research goal: we rank {plural(data.sites.length, 'Earth location')} by how closely their terrain, climate,
          bare ground, rock type and ground ice match a Moon or Mars site — and show you why.
        </p>
        <p className="home-hero__scope">
          Shows resemblance, not mission readiness. {LIMITATIONS_NOTE}{' '}
          <Link to={app.linkTo('/about')}>How it works</Link>
        </p>
      </header>

      <div className="home-flow">
        <div className="home-flow__col">
          <section className={`home-step${body ? ' is-done' : ''}`} aria-labelledby="home-step-world">
            <StepTitle n={1} done={Boolean(body)} id="home-step-world">
              Choose a world
            </StepTitle>
            <div className="world-cards" role="group" aria-label="World">
              {WORLDS.map((b) => (
                <WorldCard
                  key={b}
                  body={b}
                  label={bodyLabel(b)}
                  count={data.targets.filter((t) => t.body === b).length}
                  selected={body === b}
                  onSelect={chooseBody}
                />
              ))}
            </div>
            {/* The Moon/Mars reference site works behind the scenes; it is named here and can be changed
                when a world has more than one. Polite live region: choosing a world announces it. */}
            <div className="home-target" aria-live="polite">
              {!body ? (
                <p className="home-target__empty">Start by choosing a world to explore.</p>
              ) : bodyTargets.length === 1 && app.target ? (
                <p className="home-target__line">
                  <span className="home-target__label">Compared with</span>{' '}
                  <strong className="home-target__name">{app.target.name}</strong>
                  <span className="home-target__summary"> — {app.target.summary}</span>
                </p>
              ) : (
                <>
                  <TargetSelect
                    id="home-target"
                    label={`Compare with this ${bodyLabel(body)} site`}
                    targets={data.targets}
                    body={body}
                    value={app.targetId}
                    onChange={app.setTarget}
                  />
                  {app.target && <p className="home-target__summary">{app.target.summary}</p>}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="home-flow__col">
          <section className="home-step is-done" aria-labelledby="home-step-goal">
            <StepTitle n={2} done id="home-step-goal">
              Choose a research objective
            </StepTitle>
            <MissionPicker name="home-mission" value={app.presetId} onChange={app.setPreset} features={data.features} />
            <div className="home-notes" aria-live="polite">
              {app.isCustom && (
                <p className="home-note home-note--custom">
                  <strong>Custom weights</strong> are active. Choosing a research objective here replaces them.
                </p>
              )}
              {iceFreeTarget && (
                <p className="home-note">
                  This site has no ground ice, so with {missionTitle('ice')} the ground-ice criterion will favour
                  ice-free Earth sites: it rewards matching the site, not ice itself.
                </p>
              )}
            </div>
            <p className="hint home-caveat">
              <Term id="weight">An objective only changes what counts most</Term> in the ranking. It is not a validated
              set of mission requirements.
            </p>
          </section>

          <div className="home-cta">
            <button
              type="button"
              className="btn btn--primary btn--large"
              aria-disabled={!app.target}
              aria-describedby="home-cta-hint"
              onClick={findAnalogs}
            >
              Find matching places on Earth
            </button>
            <p id="home-cta-hint" className={`home-cta__hint${nudge ? ' is-nudge' : ''}`} role={nudge ? 'alert' : undefined}>
              {ctaHint}
            </p>
          </div>
        </div>
      </div>

      {scenarios.length > 0 && (
        <section className="home-examples" aria-labelledby="home-examples-title">
          <div>
            <h2 id="home-examples-title" className="home-examples__title">
              Or try an example
            </h2>
            <p className="hint home-examples__hint">
              An example opens with a target site and a research objective already chosen. Rankings show resemblance,
              not mission suitability.
            </p>
          </div>
          <ul className="home-examples__list">
            {scenarios.map((sc) => (
              <li key={sc.id}>
                <Link className="scenario-card" to={scenarioHref(sc)}>
                  <span className="scenario-card__title">{sc.label}</span>
                  <span className="scenario-card__meta">
                    {missionTitle(sc.presetId)} · ranked by {RANK_METHODS[sc.rankBy === 'min' ? 'min' : 'score'].label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
