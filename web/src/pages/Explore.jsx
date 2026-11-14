import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CriteriaPanel from '../components/CriteriaPanel.jsx'
import Disclosure from '../components/Disclosure.jsx'
import MapView from '../components/MapView.jsx'
import ResultsList from '../components/ResultsList.jsx'
import ShortlistBar from '../components/ShortlistBar.jsx'
import SiteCards from '../components/SiteCards.jsx'
import TargetReference from '../components/TargetReference.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import Term from '../components/Term.jsx'
import { MockTag } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { availabilityNotice, dataAvailability } from '../lib/explain.js'
import { bodyLabel } from '../lib/format.js'
import { missionTitle } from '../lib/missions.js'
import { RANK_METHODS, RANK_ORDER } from '../lib/rankMethods.js'
import { SCENARIO_LIMITATION, matchScenario } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/explore.css'

/** One-line scenario framing; the full brief (what carries the ranking, limits) is one click away. */
function MissionBrief({ scenario, features, availability }) {
  const labels = scenario.carriedBy
    .map((id) => {
      const f = features.find((x) => x.id === id)
      if (!f) return null
      return availability.byFeature[id] ? `${f.label} (no data yet — no effect)` : f.label
    })
    .filter(Boolean)
  return (
    <Disclosure
      className="mission-brief"
      title={`Mission brief: ${scenario.label}`}
      hint="ranks resemblance, not mission suitability"
    >
      <p>
        <strong>Screening for:</strong> {scenario.screening}
      </p>
      <p>
        <strong>Carried by:</strong> {labels.join(', ')} (highest weights in this mission; open Advanced to test other
        priorities).
      </p>
      <p className="mission-brief__limit">
        <strong>Limitation:</strong> {SCENARIO_LIMITATION} A high score means “resembles the target on these criteria”,
        not “suitable for the mission”. {LIMITATIONS_NOTE}
      </p>
    </Disclosure>
  )
}

export default function Explore() {
  const { data } = useBundle()
  const app = useAppState()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'list' ? 'list' : 'map'
  // Advanced (weight sliders) is collapsed by default; custom weights or adv=1 open it.
  const advParam = params.get('adv')
  const advancedOpen = advParam === '1' || (advParam === null && app.isCustom)
  // Controls start open on desktop, collapsed on small screens.
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia?.('(min-width: 901px)').matches ?? true)
  // Site highlighted on both the map and the list, and the last "Show on map" request.
  const [active, setActive] = useState({ id: null, source: null })
  const [focus, setFocus] = useState(null)

  const setParam = useCallback(
    (key, value) =>
      setParams(
        (prev) => {
          if ((prev.get(key) ?? null) === value) return prev
          const next = new URLSearchParams(prev)
          if (value === null) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const setView = (v) => setParam('view', v === 'map' ? null : v)
  const onAdvancedToggle = (open) => {
    if (open === advancedOpen) return
    setParam('adv', open ? '1' : app.isCustom ? '0' : null)
  }
  const onActive = useCallback((id, source) => setActive((a) => (a.id === id && a.source === source ? a : { id, source })), [])
  const onShowOnMap = useCallback((id) => setFocus({ id, n: Date.now() }), [])

  if (!app.target) {
    return (
      <section className="page empty-state">
        <h1>Pick a target site to start</h1>
        <p className="muted">Choose a Moon or Mars site to find Earth places that resemble it.</p>
        <TargetSelect id="explore-target" label="Target site" targets={data.targets} value={null} onChange={app.setTarget} />
        <p>
          <Link to="/">← Guided start</Link>
        </p>
      </section>
    )
  }

  const top = app.ranking.find((r) => r.score !== null)
  const avail = dataAvailability(app.target, data.sites, app.weights, data.features)
  const notice = availabilityNotice(avail)
  const scenario = app.isCustom ? null : matchScenario(app.targetId, app.presetId)
  const scoredCount = app.ranking.filter((r) => r.score !== null).length
  const missionLabel = app.isCustom ? 'Custom weights' : missionTitle(app.presetId)
  const method = RANK_METHODS[app.rankBy] || RANK_METHODS.score
  const tray = (
    <ShortlistBar
      shortlist={app.shortlist}
      siteById={data.siteById}
      onRemove={app.toggleShortlist}
      onClear={app.clearShortlist}
      linkTo={app.linkTo}
    />
  )
  const shared = {
    ranking: app.ranking,
    siteById: data.siteById,
    target: app.target,
    weights: app.weights,
    features: data.features,
    shortlist: app.shortlist,
    shortlistFull: app.shortlistFull,
    onToggleShortlist: app.toggleShortlist,
    linkTo: app.linkTo,
  }

  return (
    <div className={`explore${panelOpen ? '' : ' explore--collapsed'}`}>
      <aside id="explore-panel" className="explore__panel" aria-label="Mission and criteria" hidden={!panelOpen}>
        <div className="explore__panel-inner">
          <div className="explore__panel-head">
            <h2>Mission</h2>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setPanelOpen(false)}>
              Hide<span className="sr-only"> mission controls</span>
            </button>
          </div>
          <CriteriaPanel advancedOpen={advancedOpen} onAdvancedToggle={onAdvancedToggle} />
        </div>
      </aside>

      <section className="explore__main" aria-labelledby="explore-title">
        <header className="explore__head">
          <div className="explore__title">
            <h1 id="explore-title">
              Earth analogs for {app.target.name} <span className="muted">({bodyLabel(app.target.body)})</span>
            </h1>
            <p className="explore__sub">
              {!panelOpen && (
                <button
                  type="button"
                  className="btn btn--small"
                  aria-expanded={false}
                  aria-controls="explore-panel"
                  onClick={() => setPanelOpen(true)}
                >
                  Change mission
                </button>
              )}
              <span>
                Mission: <strong>{missionLabel}</strong>
              </span>
              <span className="muted">
                {scoredCount} of {data.sites.length} sites scored
              </span>
              {data.isMock && (
                <span>
                  <MockTag /> scores from synthetic data
                </span>
              )}
            </p>
          </div>
          <div className="explore__controls">
            <div className="rankby">
              <span id="rankby-label" className="rankby__label">
                <Term id="rankBy">Rank by</Term>
              </span>
              <div className="seg" role="group" aria-labelledby="rankby-label" aria-describedby="rankby-help">
                {RANK_ORDER.map((id) => (
                  <button key={id} type="button" aria-pressed={app.rankBy === id} onClick={() => app.setRankBy(id)}>
                    {RANK_METHODS[id].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="seg" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                Map
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                Table
              </button>
            </div>
          </div>
        </header>

        {scenario && <MissionBrief scenario={scenario} features={data.features} availability={avail} />}

        {notice && (
          <p className="avail-notice" role="note">
            <strong>Data availability:</strong> {notice}
          </p>
        )}

        <p className="sr-only" aria-live="polite">
          {top ? `Ranking updated. Top site: ${data.siteById[top.site].name}, score ${top.score}.` : 'No site could be scored.'}
        </p>

        {view === 'map' ? (
          <div className="explore__body">
            <MapView {...shared} isMock={data.isMock} active={active} onActive={onActive} focus={focus} />
            <section className="explore__results" aria-labelledby="results-title">
              <header className="explore__results-head">
                <h2 id="results-title">Recommended sites</h2>
                <p id="rankby-help" className="hint">
                  {method.short}
                  <span className="sr-only"> {method.help}</span>
                </p>
                <p className="explore__key">
                  <span>How to read:</span>
                  <Term id="score">Score</Term>
                  <Term id="range">Range</Term>
                  <Term id="evidence">Evidence</Term>
                  <Term id="catalogued">Catalogued</Term>
                </p>
              </header>
              <SiteCards {...shared} rankBy={app.rankBy} active={active} onActive={onActive} onShowOnMap={onShowOnMap} />
              {tray}
            </section>
          </div>
        ) : (
          <>
            <p id="rankby-help" className="hint explore__table-help">
              {method.help}
            </p>
            <ResultsList {...shared} />
            {tray}
          </>
        )}

        <TargetReference target={app.target} features={data.features} isMock={data.isMock} />
      </section>
    </div>
  )
}
