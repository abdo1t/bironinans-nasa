import { useMemo } from 'react'
import { useBundle } from '../data/useBundle.js'
import { MISSION_ORDER, missionTitle } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { leadersByObjective } from '../lib/rankShift.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/ranking.css'

/**
 * Same target, every research objective: the top places for each preset, side by side. Each
 * column is the app's normal ranking (scoring.js) run with that objective's weights — nothing
 * else changes. Makes the core point visible at a glance: the best analog depends on the
 * research objective. "Use" switches the mission to that objective.
 */
export default function ObjectiveLeaders({ limit = 3 }) {
  const { data } = useBundle()
  const app = useAppState()
  const cols = useMemo(
    () =>
      app.target
        ? leadersByObjective(app.target, data.sites, data.features, data.minCriteria, app.rankBy, data.siteById, PRESETS, MISSION_ORDER, limit)
        : [],
    [app.target, app.rankBy, data, limit],
  )
  if (!app.target || !cols.length) return null
  const currentId = app.isCustom ? null : app.presetId
  const leaders = new Set(cols.map((c) => c.top[0]?.site).filter(Boolean))
  const inTop = new Set(cols.flatMap((c) => c.top.map((r) => r.site)))
  const name = (id) => data.siteById[id]?.name ?? id
  const isMin = app.rankBy === 'min'
  const open = (r) => Array.isArray(r.scoreRange) && r.scoreRange[0] !== r.scoreRange[1]
  const partialLeader = cols.some((c) => c.top[0] && open(c.top[0]))
  const summary =
    leaders.size > 1
      ? `${leaders.size} different places come out on top, and ${inTop.size} different places appear in the top ${limit}s.`
      : `The same place leads every objective, but the places behind it change: ${inTop.size} different places appear in the top ${limit}s.`

  return (
    <section className="objlead" aria-labelledby="objlead-title">
      <header className="objlead__head">
        <h2 id="objlead-title">Same target, different research objectives</h2>
        <p>
          Each column ranks the same {data.sites.length} places for {app.target.name.split(' — ')[0]} with one objective’s
          weights. {summary}
          {isMin
            ? ' Ordered by the conservative lower bound (the score if every missing measurement were a total mismatch).'
            : partialLeader &&
              ' ◐ marks a score that rests on incomplete data; switch to “Most complete evidence first” to see evidence-backed leaders.'}
        </p>
      </header>
      <ol className="objlead__grid">
        {cols.map((c) => {
          const isCur = c.presetId === currentId
          return (
            <li key={c.presetId} className={`objlead__col${isCur ? ' is-current' : ''}`}>
              <div className="objlead__col-head">
                <h3 className="objlead__col-title">{missionTitle(c.presetId)}</h3>
                {isCur && <span className="objlead__cur">current</span>}
              </div>
              {c.top.length ? (
                <ol className="objlead__list">
                  {c.top.map((r) => (
                    <li key={r.site} className="objlead__item">
                      <span className="objlead__n">{r.rank}</span>
                      <span className="objlead__site" title={name(r.site)}>
                        {name(r.site)}
                      </span>
                      <span
                        className="objlead__score"
                        title={
                          open(r)
                            ? `Similarity ${r.score}; could be ${r.scoreRange[0]}–${r.scoreRange[1]} once missing data is measured`
                            : `Similarity ${r.score}; no missing site data`
                        }
                      >
                        {open(r) && <span aria-hidden="true">◐ </span>}
                        {isMin ? `≥${r.scoreRange?.[0] ?? r.score}` : r.score}
                        <span className="sr-only">
                          {isMin ? ` conservative lower bound, similarity ${r.score}` : ' of 100'}
                          {open(r) ? `, incomplete data, range ${r.scoreRange[0]} to ${r.scoreRange[1]}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="hint objlead__list">No place can be scored with these weights.</p>
              )}
              {!isCur && (
                <button type="button" className="btn btn--small btn--ghost objlead__use" onClick={() => app.setPreset(c.presetId)}>
                  Use this objective
                </button>
              )}
            </li>
          )
        })}
      </ol>
      <p className="objlead__foot">
        Scores are similarity on the weighted criteria, not mission suitability. Weights are the team’s screening
        priorities, not validated requirements.
      </p>
    </section>
  )
}
