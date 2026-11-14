import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CriteriaPanel from '../components/CriteriaPanel.jsx'
import MapView from '../components/MapView.jsx'
import ResultsList from '../components/ResultsList.jsx'
import ShortlistBar from '../components/ShortlistBar.jsx'
import TargetReference from '../components/TargetReference.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import { MockTag } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { availabilityNotice, dataAvailability } from '../lib/explain.js'
import { bodyLabel } from '../lib/format.js'
import { PRESETS } from '../lib/presets.js'
import { SCENARIO_LIMITATION, matchScenario } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { useAppState } from '../state/AppState.jsx'

function MissionBrief({ scenario, features, availability, onDismiss }) {
  const labels = scenario.carriedBy
    .map((id) => {
      const f = features.find((x) => x.id === id)
      if (!f) return null
      return availability.byFeature[id] ? `${f.label} (no data yet — no effect)` : f.label
    })
    .filter(Boolean)
  return (
    <section className="mission-brief" aria-labelledby="mission-brief-title">
      <div className="mission-brief__head">
        <h2 id="mission-brief-title">Mission brief: {scenario.label}</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={onDismiss}>
          Dismiss<span className="sr-only"> mission brief</span>
        </button>
      </div>
      <p>
        <strong>Screening for:</strong> {scenario.screening}
      </p>
      <p>
        <strong>Carried by:</strong> {labels.join(', ')} (highest weights in this preset; adjust the sliders to test
        other priorities).
      </p>
      <p className="mission-brief__limit">
        <strong>Limitation:</strong> {SCENARIO_LIMITATION} A high score means “resembles the target on these criteria”,
        not “suitable for the mission”. {LIMITATIONS_NOTE}
      </p>
    </section>
  )
}

export default function Explore() {
  const { data } = useBundle()
  const app = useAppState()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'list' ? 'list' : 'map'
  const [dismissedBrief, setDismissedBrief] = useState(null)

  const setView = (v) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === 'map') next.delete('view')
        else next.set('view', v)
        return next
      },
      { replace: true },
    )

  if (!app.target) {
    return (
      <section className="page empty-state">
        <h1>Pick a target to start</h1>
        <p className="muted">Choose a Moon or Mars base site to rank Earth analogs against.</p>
        <TargetSelect id="explore-target" targets={data.targets} value={null} onChange={app.setTarget} />
      </section>
    )
  }

  const top = app.ranking.find((r) => r.score !== null)
  const avail = dataAvailability(app.target, data.sites, app.weights, data.features)
  const notice = availabilityNotice(avail)
  const scenario = app.isCustom ? null : matchScenario(app.targetId, app.presetId)
  const scoredCount = app.ranking.filter((r) => r.score !== null).length
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
    <div className="explore">
      <aside className="explore__panel" aria-label="Criteria">
        <CriteriaPanel />
      </aside>

      <section className="explore__main" aria-labelledby="explore-title">
        <header className="explore__head">
          <div>
            <h1 id="explore-title">
              Earth analogs for {app.target.name}{' '}
              <span className="muted">({bodyLabel(app.target.body)})</span>
            </h1>
            <p className="muted">
              {scoredCount} of {data.sites.length} sites scored ·{' '}
              {app.isCustom ? 'Custom weights' : PRESETS[app.presetId].label}
              {data.isMock && (
                <>
                  {' '}
                  · <MockTag /> scores from synthetic data
                </>
              )}
            </p>
          </div>
          <div className="explore__controls">
            <label className="rankby">
              Rank by{' '}
              <select
                value={app.rankBy}
                onChange={(e) => app.setRankBy(e.target.value)}
                aria-describedby="rankby-help"
              >
                <option value="score">Score</option>
                <option value="min">Guaranteed minimum</option>
              </select>
            </label>
            <div className="toggle" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                Map
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                List
              </button>
            </div>
          </div>
        </header>
        <p id="rankby-help" className="hint rankby__help">
          {app.rankBy === 'min'
            ? 'Ranked by guaranteed minimum: the score each site keeps if every criterion missing for it were a total mismatch — favours evidence-backed sites.'
            : 'Ranked by score. Sites with missing data show a range; switch to “Guaranteed minimum” to rank by evidence-backed score.'}
        </p>

        {scenario && dismissedBrief !== scenario.id && (
          <MissionBrief
            scenario={scenario}
            features={data.features}
            availability={avail}
            onDismiss={() => setDismissedBrief(scenario.id)} />
        )}

        {notice && (
          <p className="avail-notice" role="note">
            <strong>Data availability:</strong> {notice}
          </p>
        )}

        <TargetReference target={app.target} features={data.features} isMock={data.isMock} />

        <p className="sr-only" aria-live="polite">
          {top ? `Ranking updated. Top site: ${data.siteById[top.site].name}, score ${top.score}.` : 'No site could be scored.'}
        </p>

        <ShortlistBar
          shortlist={app.shortlist}
          siteById={data.siteById}
          onRemove={app.toggleShortlist}
          onClear={app.clearShortlist}
          linkTo={app.linkTo}
        />

        {view === 'map' ? <MapView {...shared} isMock={data.isMock} /> : <ResultsList {...shared} />}
      </section>
    </div>
  )
}
