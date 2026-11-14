import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WorldCard from '../components/WorldCard.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel } from '../lib/format.js'
import { PRESETS } from '../lib/presets.js'
import { SCENARIOS, scenarioQuery } from '../lib/scenarios.js'
import { useAppState } from '../state/AppState.jsx'

export default function Home() {
  const { data } = useBundle()
  const app = useAppState()
  const navigate = useNavigate()
  const [body, setBody] = useState(app.target?.body ?? null)

  const scenarios = SCENARIOS.filter((sc) => data.targetById[sc.targetId] && PRESETS[sc.presetId])
  const openScenario = (sc) => {
    // Plain preset link (not linkTo): custom weights in the current URL must not override the scenario preset.
    const params = new URLSearchParams(scenarioQuery(sc))
    if (app.shortlist.length) params.set('sites', app.shortlist.join(','))
    navigate(`/explore?${params.toString().replace(/%2C/g, ',')}`)
  }

  const chooseBody = (b) => {
    setBody(b)
    if (app.target && app.target.body !== b) app.setTarget(null)
  }

  return (
    <section className="page home">
      <h1>Find places on Earth that resemble a Moon or Mars base site</h1>
      <p className="lede">
        Pick a world and a base site, choose what matters, and get a ranked, explainable list of Earth analog sites to
        rehearse on.
      </p>

      <h2 className="step">1 · Choose a world</h2>
      <div className="world-cards" role="group" aria-label="World">
        {['moon', 'mars'].map((b) => (
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

      <h2 className="step">2 · Choose a base site</h2>
      {body ? (
        <div className="home__target">
          <TargetSelect
            id="home-target"
            label={`${bodyLabel(body)} base site`}
            targets={data.targets}
            body={body}
            value={app.targetId}
            onChange={app.setTarget}
          />
          {app.target && <p className="home__summary">{app.target.summary}</p>}
        </div>
      ) : (
        <p className="muted">Choose the Moon or Mars first.</p>
      )}

      <button
        type="button"
        className="btn btn--primary btn--large"
        disabled={!app.target}
        onClick={() => navigate(app.linkTo('/explore'))}
      >
        Find Earth analogs
      </button>

      {scenarios.length > 0 && (
        <section className="scenarios" aria-labelledby="scenarios-title">
          <h2 id="scenarios-title" className="step">
            Mission scenarios
          </h2>
          <div className="scenarios__list">
            {scenarios.map((sc) => (
              <button key={sc.id} type="button" className="scenario-card" onClick={() => openScenario(sc)}>
                <span className="scenario-card__title">{sc.label}</span>
                <span className="scenario-card__meta">
                  {data.targetById[sc.targetId].name} · {PRESETS[sc.presetId].label} preset
                </span>
              </button>
            ))}
          </div>
          <p className="hint">
            Scenarios pre-select a target and weights for a screening question. They rank resemblance, not mission
            suitability.
          </p>
        </section>
      )}
    </section>
  )
}
