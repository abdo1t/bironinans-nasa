import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MissionSelector from '../components/MissionSelector.jsx'
import HeroPlanet from '../components/HeroPlanet.jsx'
import RankPreview from '../components/RankPreview.jsx'
import Term from '../components/Term.jsx'
import WeightSliders from '../components/WeightSliders.jsx'
import TARGET_PREVIEWS from '../data/terrainPreviews.json'
import { useBundle } from '../data/useBundle.js'
import { dataAvailability, joinLabels } from '../lib/explain.js'
import { MISSIONS, missionEmphasis, missionTitle } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS } from '../lib/rankMethods.js'
import { SCENARIOS, matchScenario, scenarioQuery } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { criteriaSummary } from '../lib/selection.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/home.css'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The validated terrain preview for a target, else the first one of that world (Moon by default). */
function previewFor(target) {
  if (target && TARGET_PREVIEWS[target.id]) return TARGET_PREVIEWS[target.id]
  const world = target?.body || 'moon'
  return Object.values(TARGET_PREVIEWS).find((p) => p.targetId.startsWith(`${world}-`)) || null
}

/**
 * Scientific inset: the shaded-relief image rendered offline from the same elevation model the
 * terrain score uses (pipeline/make_target_preview.py). Framed, tagged "Data" and captioned with
 * its source and scale, so it never reads as part of the decorative planet beside it.
 */
function HeroTerrain({ entry }) {
  if (!entry) return null
  const km = Math.round(entry.windowKm)
  return (
    <figure className="home2__terrain">
      <div className="home2__terrain-frame">
        <img
          key={entry.targetId}
          className="home2__terrain-img"
          src={`${import.meta.env.BASE_URL}${entry.image}`}
          width={entry.widthPx}
          height={entry.heightPx}
          decoding="async"
          alt={`Shaded-relief elevation map, ${km} km across: ${entry.title.toLowerCase()}. ${entry.description}`}
        />
        <span className="data-tag home2__terrain-tag">Data · elevation</span>
      </div>
      <figcaption className="home2__terrain-cap">
        <strong>{entry.title}</strong> · {km} km across · from{' '}
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
 * Home: a short headline, the world as a large (decorative) planet, the current search in one
 * compact selector and one primary action — all above the fold. Criteria and weights sit behind
 * "Adjust criteria"; the example scenarios follow below.
 */
export default function Home() {
  const { data } = useBundle()
  const app = useAppState()
  const navigate = useNavigate()
  const [critOpen, setCritOpen] = useState(false)
  const [nudge, setNudge] = useState(false)
  const world = app.target?.body || 'moon'

  // The documented Jezero + Rover testing scenario opens in the conservative order; everything
  // else opens by score. `rank` is always written so no earlier ranking method sticks.
  const scenario = app.isCustom ? null : matchScenario(app.targetId, app.presetId)
  const rank = scenario?.rankBy === 'min' ? 'min' : 'score'

  const findAnalogs = () => {
    if (!app.target) {
      // The button stays focusable when nothing is chosen: a click says what is missing.
      setNudge(true)
      requestAnimationFrame(() => document.querySelector('.mselect__world')?.focus())
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
  const criteria = criteriaSummary(app.weights, data.features)
  const avail = app.target ? dataAvailability(app.target, data.sites, app.weights, data.features) : null
  const missionId = app.isCustom ? app.basePresetId : app.presetId
  const emphasis = app.isCustom
    ? criteria.used.slice(0, 3).map((c) => c.feature.label)
    : missionEmphasis(missionId, data.features)
  const noData = avail ? criteria.used.filter((c) => avail.byFeature[c.feature.id]).map((c) => c.feature.label) : []

  let ctaHint
  if (!app.target) ctaHint = 'Choose the Moon or Mars first.'
  else {
    ctaHint = `Ranks ${plural(data.sites.length, 'Earth place')} with a match score, the reason and any missing data.`
    if (rank === 'min') ctaHint += ' Most complete evidence first.'
  }

  return (
    <section className={`page home2 home2--${world}`}>
      <div className="home2__hero">
        <div className="home2__copy">
          <p className="kicker">NASA Space Apps 2026 · research prototype</p>
          <h1 className="home2__title">
            Find the <span className="home2__accent">Moon</span> and{' '}
            <span className="home2__accent home2__accent--mars">Mars</span> on Earth
          </h1>
          <p className="home2__lede">
            Rank {plural(data.sites.length, 'Earth place')} by how closely their terrain, climate, bare ground, rock and
            ground ice resemble a Moon or Mars site — with the evidence behind every match.
          </p>

          <div className="home2__console" role="group" aria-labelledby="home-console-title">
            <h2 id="home-console-title" className="home2__console-title">
              Start a new mission
            </h2>
            <MissionSelector idPrefix="home" layout="hero" />
            {app.target && (
              <p className="home2__mission-q" aria-live="polite">
                {app.isCustom ? 'Custom criteria' : MISSIONS[missionId]?.question}
                {emphasis.length > 0 && <span className="muted"> · weighs {joinLabels(emphasis).toLowerCase()} most</span>}
              </p>
            )}
            <div className="home2__go">
              <button
                type="button"
                className="btn btn--primary home2__cta"
                aria-disabled={!app.target}
                aria-describedby="home-go-hint"
                onClick={findAnalogs}
              >
                Find places on Earth
                <span className="home2__cta-arrow" aria-hidden="true">
                  →
                </span>
              </button>
              <button
                type="button"
                className="btn btn--ghost home2__adjust"
                aria-expanded={critOpen}
                aria-controls="home-criteria"
                onClick={() => setCritOpen((o) => !o)}
              >
                Adjust criteria
                {app.isCustom && <span className="home2__custom"> · custom</span>}
              </button>
            </div>
            <p id="home-go-hint" className={`home2__hint${nudge ? ' is-nudge' : ''}`} role={nudge ? 'alert' : undefined}>
              {ctaHint}
            </p>
          </div>

          <div id="home-criteria" className="home2__criteria reveal" hidden={!critOpen}>
            {app.target ? (
              <>
                <div className="home2__notes" aria-live="polite">
                  {app.isCustom && (
                    <p className="home-note home-note--custom">
                      <strong>Custom weights</strong> are active. Choosing a mission above replaces them.
                    </p>
                  )}
                  {iceFreeTarget && (
                    <p className="home-note">
                      This site has no ground ice, so with {missionTitle('ice')} the ground-ice criterion will favour
                      ice-free Earth sites: it rewards matching the site, not ice itself.
                    </p>
                  )}
                  {noData.length > 0 && (
                    <p className="home-note">
                      No data yet for {joinLabels(noData).toLowerCase()}: {noData.length === 1 ? 'its' : 'their'} weight
                      cannot change the ranking.
                    </p>
                  )}
                </div>
                <div className="home2__prio">
                  <RankPreview />
                  <WeightSliders idPrefix="home-w" legend="Research priorities (0 = ignore, 5 = most important)" />
                </div>
                <p className="hint home2__caveat">
                  <Term id="weight">A mission only changes what counts most</Term> in the ranking. It is not a validated
                  set of mission requirements.
                </p>
              </>
            ) : (
              <p className="hint">Choose the Moon or Mars first; the criteria follow the mission you pick.</p>
            )}
          </div>

          <p className="home2__scope">
            Shows resemblance, not mission readiness. {LIMITATIONS_NOTE}{' '}
            <Link to={app.linkTo('/about')}>How it works</Link>
          </p>
        </div>

        <div className="home2__visual">
          <HeroPlanet world={world} target={app.target} className="home2__planet" />
          <HeroTerrain entry={previewFor(app.target)} />
        </div>
      </div>

      <section className="home2__how" aria-labelledby="home-how-title">
        <div className="home2__why">
          <h2 id="home-how-title">What makes an Earth analog useful?</h2>
          <p>
            No place on Earth is a copy of the Moon or Mars. An Earth analog is a place that resembles a planetary site{' '}
            <em>in the ways that matter for one research goal</em> — rover driving needs similar relief and bare ground,
            drilling trials need cold, frozen ground. So there is no single best analog: the right one depends on the
            objective. This tool ranks Earth places for the objective you choose and shows exactly why each one matches,
            where it differs and what has not been measured.
          </p>
        </div>
        <ol className="home2__steps">
          <li>
            <span className="home2__step-n">1</span>
            <strong>Choose a Moon or Mars site</strong>
            <span>Each has cited values for relief, climate, ground cover, geology and ice.</span>
          </li>
          <li>
            <span className="home2__step-n">2</span>
            <strong>Set the objective and priorities</strong>
            <span>Weights say what matters for your research; the ranking updates instantly.</span>
          </li>
          <li>
            <span className="home2__step-n">3</span>
            <strong>Review ranked Earth places</strong>
            <span>Map, scores, strongest match, key difference, missing data and sources.</span>
          </li>
          <li>
            <span className="home2__step-n">4</span>
            <strong>Compare and report</strong>
            <span>
              Up to three places side by side, then a{' '}
              {app.target ? <Link to={app.linkTo('/report')}>research report</Link> : 'research report'} to print or export.
            </span>
          </li>
        </ol>
      </section>

      {scenarios.length > 0 && (
        <section className="home2__examples" aria-labelledby="home-examples-title">
          <div className="home2__examples-head">
            <h2 id="home-examples-title">Or start from an example</h2>
            <p className="hint">
              Each opens with a site and a mission already chosen. Rankings show resemblance, not mission suitability.
            </p>
          </div>
          <ul className="home2__examples-list">
            {scenarios.map((sc) => {
              const t = data.targetById[sc.targetId]
              return (
                <li key={sc.id}>
                  <Link className="scenario2" to={scenarioHref(sc)}>
                    <span className={`world-dot world-dot--${t.body}`} aria-hidden="true" />
                    <span className="scenario2__text">
                      <span className="scenario2__title">{sc.label}</span>
                      <span className="scenario2__meta">
                        {missionTitle(sc.presetId)} · ranked by {RANK_METHODS[sc.rankBy === 'min' ? 'min' : 'score'].label}
                      </span>
                    </span>
                    <span className="scenario2__go" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </section>
  )
}
