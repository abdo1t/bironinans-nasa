import { Link } from 'react-router-dom'
import { MISSIONS, missionEmphasis, missionTitle } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { SCENARIO_LIMITATION } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { IconEvidence } from './Icons.jsx'

/** Distinct datasets behind the site's used values (from provenance), most frequent first. */
function datasetsOf(site, features, weights) {
  const counts = new Map()
  for (const f of features) {
    if (!(weights[f.id] > 0)) continue
    const p = site?.provenance?.[f.id]
    if (!p || p.status === 'unavailable' || !p.dataset) continue
    const name = String(p.dataset).split(/[,(]/)[0].trim()
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

/**
 * Panel C — Mission & scientific evidence: what the research mission asks, why the selected
 * place may be relevant, the main limitations, where the values come from, and next actions.
 */
export default function MissionEvidence({ app, site, entry, features, scenario, linkTo, isMock }) {
  const presetId = app.isCustom ? app.basePresetId : app.presetId
  const question = MISSIONS[presetId]?.question
  const emphasis = missionEmphasis(presetId, features)
  const sets = datasetsOf(site, features, app.weights)
  const why = entry?.why?.length ? entry.why : null
  return (
    <section className="mc-panel mevid" aria-labelledby="mevid-title">
      <header className="mc-panel__head">
        <h2 id="mevid-title" className="mc-panel__title">
          <IconEvidence />
          Mission &amp; scientific evidence
        </h2>
      </header>
      <div className="mc-panel__body">
        <dl className="mevid__facts">
          <div>
            <dt className="hud-label">Research mission</dt>
            <dd>
              <strong>{app.isCustom ? `Custom weights (from ${PRESETS[presetId].label})` : missionTitle(presetId)}</strong>
              {question && <span className="mevid__q">{scenario?.screening || question}</span>}
              {emphasis.length > 0 && <span className="mevid__emph">Emphasises {emphasis.join(', ').toLowerCase()}.</span>}
            </dd>
          </div>
          {site && (
            <div>
              <dt className="hud-label">Why {site.name} may be relevant</dt>
              <dd>
                {why ? (
                  <ul className="mevid__why">
                    {why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <span>No criterion reaches 70 % similarity under this mission.</span>
                )}
                {entry?.gap && <span className="mevid__gap">Largest shortfall: {entry.gap}</span>}
              </dd>
            </div>
          )}
          <div>
            <dt className="hud-label">Main limitations</dt>
            <dd className="mevid__limit">
              {SCENARIO_LIMITATION} {LIMITATIONS_NOTE}
            </dd>
          </div>
          <div>
            <dt className="hud-label">Dataset provenance</dt>
            <dd>
              {isMock ? (
                <span>Synthetic placeholder values — not measurements.</span>
              ) : sets.length ? (
                <span>{sets.join(' · ')}</span>
              ) : (
                <span>No measured values for this place under this mission.</span>
              )}{' '}
              <Link to="/about#data">All sources</Link>
            </dd>
          </div>
        </dl>
        <div className="manalysis__actions">
          {site && (
            <Link className="btn btn--small" to={linkTo(`/site/${site.id}`) + '#evidence'}>
              Inspect evidence
            </Link>
          )}
          <Link className="btn btn--small" to={linkTo('/compare')}>
            Compare sites{app.shortlist.length ? ` (${app.shortlist.length})` : ''}
          </Link>
        </div>
      </div>
    </section>
  )
}
