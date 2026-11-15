import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MissionPicker from '../components/MissionPicker.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import Term from '../components/Term.jsx'
import WorldCard from '../components/WorldCard.jsx'
import TARGET_PREVIEWS from '../data/terrainPreviews.json'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel } from '../lib/format.js'
import { missionTitle } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS } from '../lib/rankMethods.js'
import { SCENARIOS, matchScenario, scenarioQuery } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { selectionParts } from '../lib/selection.js'
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

/** The validated terrain preview for a target, else the first one of that world (Moon by default). */
function previewFor(target, body) {
  if (target && TARGET_PREVIEWS[target.id]) return TARGET_PREVIEWS[target.id]
  const world = body || 'moon'
  return Object.values(TARGET_PREVIEWS).find((p) => p.targetId.startsWith(`${world}-`)) || null
}

/**
 * Hero visual: the shaded-relief terrain image rendered offline from the same elevation
 * model the terrain score uses (pipeline/make_target_preview.py), with its credit. Keyed by
 * target, so choosing another world fades the new terrain in (CSS, ~200 ms).
 */
function HeroTerrain({ entry }) {
  if (!entry) return null
  const km = Math.round(entry.windowKm)
  return (
    <figure className="home-terrain">
      <div className="home-terrain__frame">
        <img
          key={entry.targetId}
          className="home-terrain__img"
          src={`${import.meta.env.BASE_URL}${entry.image}`}
          width={entry.widthPx}
          height={entry.heightPx}
          decoding="async"
          alt={`Shaded-relief elevation map, ${km} km across: ${entry.title.toLowerCase()}. ${entry.description}`}
        />
      </div>
      <figcaption className="home-terrain__credit">
        {entry.title} · {km} km across · elevation from{' '}
        <a href={entry.source.landingUrl} target="_blank" rel="noreferrer">
          {entry.source.shortName}
          <span className="sr-only"> (opens in new tab)</span>
        </a>{' '}
        · synthetic shading, not a photograph
      </figcaption>
    </figure>
  )
}

/**
 * First screen: what you can find here, the current selection (Moon · South Pole · Ice
 * Exploration) with one way to change it, and one primary action. A deep link arrives with
 * the selection made, so results are one click away; a fresh visit opens the chooser.
 */
export default function Home() {
  const { data } = useBundle()
  const app = useAppState()
  const navigate = useNavigate()
  const ctaRef = useRef(null)
  // A chosen target decides the world; `pickedBody` only matters while no target is chosen yet.
  const [pickedBody, setPickedBody] = useState(null)
  const body = app.target?.body ?? pickedBody
  const bodyTargets = body ? data.targets.filter((t) => t.body === body) : []
  // The chooser starts open only when there is nothing chosen yet.
  const [chooserOpen, setChooserOpen] = useState(() => !app.target)
  const [nudge, setNudge] = useState(false)

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

  const findAnalogs = () => {
    if (!app.target) {
      // The button stays focusable when nothing is chosen: a click says what is missing.
      setNudge(true)
      setChooserOpen(true)
      requestAnimationFrame(() => document.querySelector(body ? '#home-target' : '.world-card')?.focus())
      return
    }
    navigate(app.linkTo('/explore', { rank }))
  }

  const openChooser = () => {
    setChooserOpen(true)
    requestAnimationFrame(() => {
      const el = document.getElementById('home-chooser')
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      el?.querySelector('.world-card.is-selected, .world-card')?.focus({ preventScroll: true })
    })
  }
  const closeChooser = () => {
    setChooserOpen(false)
    requestAnimationFrame(() => ctaRef.current?.focus())
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
  const parts = selectionParts(app.target, app.presetId, app.isCustom)

  let ctaHint
  if (!body) ctaHint = 'Choose the Moon or Mars first.'
  else if (!app.target) ctaHint = 'Choose which site to compare with.'
  else {
    ctaHint = `You’ll see a map and a short ranked list of ${plural(data.sites.length, 'Earth place')}, each with a reason.`
    if (rank === 'min') ctaHint += ` Most complete evidence first (${RANK_METHODS.min.label}).`
  }

  return (
    <section className={`page home home--${body || 'none'}`}>
      <header className="home-lead">
        <div className="home-lead__text">
          <p className="kicker">NASA Space Apps Challenge 2026 · research prototype</p>
          <h1>Find places on Earth that are like the Moon or Mars</h1>
          <p className="home-lead__lede">
            Rank {plural(data.sites.length, 'Earth place')} by how closely their terrain, climate, bare ground, rock and
            ground ice match a Moon or Mars site — and see the evidence behind every match.
          </p>

          <div className="home-pick">
            <div className="home-pick__now" aria-live="polite">
              <span className="home-pick__label" id="home-pick-label">
                Your selection
              </span>
              {parts.length ? (
                <span className="home-pick__value" aria-labelledby="home-pick-label">
                  {parts.map((p, i) => (
                    <span key={p} className="home-pick__part">
                      {i === 0 && <span className={`world-dot world-dot--${body}`} aria-hidden="true" />}
                      {p}
                      {i < parts.length - 1 && (
                        <span className="home-pick__sep" aria-hidden="true">
                          {' '}
                          ·{' '}
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="home-pick__value home-pick__value--empty">Nothing chosen yet</span>
              )}
            </div>
            <button
              type="button"
              className="btn btn--small home-pick__change"
              aria-expanded={chooserOpen}
              aria-controls="home-chooser"
              onClick={chooserOpen ? closeChooser : openChooser}
            >
              {chooserOpen ? 'Done' : parts.length ? 'Change' : 'Choose'}
              <span className="sr-only"> world, site and research objective</span>
            </button>
          </div>

          <div className="home-go">
            <button
              ref={ctaRef}
              type="button"
              className="btn btn--primary btn--large home-go__btn"
              aria-disabled={!app.target}
              aria-describedby="home-go-hint"
              onClick={findAnalogs}
            >
              Find places on Earth
            </button>
            <p id="home-go-hint" className={`home-go__hint${nudge ? ' is-nudge' : ''}`} role={nudge ? 'alert' : undefined}>
              {ctaHint}
            </p>
          </div>

          <p className="home-lead__scope">
            Shows resemblance, not mission readiness. {LIMITATIONS_NOTE}{' '}
            <Link to={app.linkTo('/about')}>How it works</Link>
          </p>
        </div>
        <HeroTerrain entry={previewFor(app.target, body)} />
      </header>

      <div id="home-chooser" className="home-chooser" hidden={!chooserOpen}>
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
              {/* Polite live region: choosing a world announces the site it will be compared with. */}
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
                <Term id="weight">An objective only changes what counts most</Term> in the ranking. It is not a
                validated set of mission requirements.
              </p>
            </section>
            <p className="home-chooser__done">
              <button type="button" className="btn btn--ghost" onClick={closeChooser}>
                Done — use this selection
              </button>
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
