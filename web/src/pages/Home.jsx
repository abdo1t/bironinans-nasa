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
function StepTitle({ n, done, children }) {
  return (
    <h2 className="home-step__title">
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
 * Guided start: world -> target site -> mission objective -> "Find Earth analogs".
 * All three steps are visible from the start so a first-time visitor sees the whole path;
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
    const list = data.targets.filter((t) => t.body === b)
    // One target for this world: nothing to choose, so select it (no one-option dropdown).
    if (list.length === 1) app.setTarget(list[0].id)
    else if (app.target && app.target.body !== b) app.setTarget(null)
  }

  // The documented Jezero + Rover testing scenario opens in the conservative order; everything
  // else opens by score. `rank` is always written so no earlier ranking method sticks.
  const scenario = app.isCustom ? null : matchScenario(app.targetId, app.presetId)
  const rank = scenario?.rankBy === 'min' ? 'min' : 'score'
  const findAnalogs = () => navigate(app.linkTo('/explore', { rank }))

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
  if (!body) ctaHint = 'Choose a world (step 1) to continue.'
  else if (!app.target) ctaHint = 'Choose a target site (step 2) to continue.'
  else {
    ctaHint = 'Opens a map and a ranked list of Earth sites for this target site and mission objective.'
    if (rank === 'min') {
      ctaHint += ` This pairing opens in the conservative order (ranked by ${RANK_METHODS.min.label}); you can switch to ${RANK_METHODS.score.label} there.`
    }
  }

  return (
    <section className="page home">
      <header className="home-hero">
        <p className="kicker">NASA Space Apps Challenge 2026 · hackathon project</p>
        <h1>Find places on Earth that resemble a Moon or Mars site</h1>
        <p className="home-hero__lede">
          Mission teams rehearse at Earth <Term id="analog">analog sites</Term> before they fly. This tool compares
          Earth sites with one Moon or Mars site on a common scale — terrain, climate, bare ground, rock type and
          ground ice — and shows why each one ranks where it does.
        </p>
        <p className="home-hero__scope">
          <strong>Research screening prototype:</strong> currently {plural(data.sites.length, 'Earth site')} compared
          with {plural(data.targets.length, 'target site')} on up to{' '}
          {plural(data.features.length, 'criterion', 'criteria')}.{' '}
          {LIMITATIONS_NOTE} <Link to={app.linkTo('/about')}>Method and limitations</Link>
        </p>
      </header>

      <div className="home-flow">
        <div className="home-flow__col">
          <section className={`home-step${body ? ' is-done' : ''}`}>
            <StepTitle n={1} done={Boolean(body)}>
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
          </section>

          <section className={`home-step${app.target ? ' is-done' : ''}`}>
            <StepTitle n={2} done={Boolean(app.target)}>
              Target site
            </StepTitle>
            {/* polite live region: choosing a world announces the target that was selected with it */}
            <div className="home-target" aria-live="polite">
              {!body ? (
                <p className="home-target__empty">Choose the Moon or Mars first — its target site appears here.</p>
              ) : bodyTargets.length === 1 && app.target ? (
                <div className="home-target__card card card--raised card--accent">
                  <p className="eyebrow">{bodyLabel(body)} target site</p>
                  <h3 className="home-target__name">{app.target.name}</h3>
                  <p className="home-target__summary">{app.target.summary}</p>
                  <p className="home-target__note">
                    <strong>✓ Selected</strong> — the only {bodyLabel(body)} target site in this prototype’s data.
                  </p>
                </div>
              ) : (
                <>
                  <TargetSelect
                    id="home-target"
                    label={`${bodyLabel(body)} target site`}
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
          <section className="home-step is-done">
            <StepTitle n={3} done>
              Mission objective
            </StepTitle>
            <MissionPicker name="home-mission" value={app.presetId} onChange={app.setPreset} features={data.features} />
            <div className="home-notes" aria-live="polite">
              {app.isCustom && (
                <p className="home-note home-note--custom">
                  <strong>Custom weights</strong> are active. Choosing a mission objective here replaces them.
                </p>
              )}
              {iceFreeTarget && (
                <p className="home-note">
                  This target site has no ground ice, so with {missionTitle('ice')} the ground-ice criterion will
                  favour ice-free Earth sites: it rewards matching the target, not ice itself.
                </p>
              )}
            </div>
            <p className="hint home-caveat">{MISSION_CAVEAT}</p>
          </section>

          <div className="home-cta">
            <button
              type="button"
              className="btn btn--primary btn--large"
              disabled={!app.target}
              aria-describedby="home-cta-hint"
              onClick={findAnalogs}
            >
              Find Earth analogs
            </button>
            <p id="home-cta-hint" className="home-cta__hint">
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
              An example opens with a target site and a mission objective already chosen. Rankings show resemblance,
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
