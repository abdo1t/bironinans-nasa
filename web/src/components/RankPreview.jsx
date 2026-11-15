import { useMemo } from 'react'
import { useBundle } from '../data/useBundle.js'
import { orderRanking } from '../lib/explain.js'
import { PRESETS } from '../lib/presets.js'
import { rankSites } from '../lib/scoring.js'
import { useAppState } from '../state/AppState.jsx'

/**
 * Live ranking preview beside the research-priority sliders: the current top places and how far
 * each moved compared with the objective's default priorities. Same scoring as everywhere else
 * (AppState ranking); the comparison ranking uses the same function with the preset weights.
 */
export default function RankPreview({ limit = 5 }) {
  const { data } = useBundle()
  const app = useAppState()
  const baseId = app.isCustom ? app.basePresetId : app.presetId
  const baseRanks = useMemo(() => {
    if (!app.target || !PRESETS[baseId]) return {}
    const ranked = orderRanking(
      rankSites(app.target, data.sites, PRESETS[baseId].weights, data.features, data.minCriteria),
      app.rankBy,
      data.siteById,
    )
    const out = {}
    let n = 0
    for (const r of ranked) if (r.score !== null) out[r.site] = ++n
    return out
  }, [app.target, baseId, app.rankBy, data])

  if (!app.target) return null
  const top = app.ranking.filter((r) => r.score !== null).slice(0, limit)
  return (
    <section className="rank-preview" aria-labelledby="rank-preview-title">
      <h3 id="rank-preview-title" className="rank-preview__title">
        Live ranking
        <span className="rank-preview__sub">{app.isCustom ? ' · change vs the objective’s defaults' : ' · objective defaults'}</span>
      </h3>
      {top.length ? (
        <ol className="rank-preview__list" aria-live="polite">
          {top.map((r) => {
            const was = baseRanks[r.site]
            const moved = app.isCustom && was ? was - r.rank : 0
            return (
              <li key={r.site} className="rank-preview__item">
                <span className="rank-preview__rank">{r.rank}</span>
                <span className="rank-preview__name">{data.siteById[r.site].name}</span>
                <span className="rank-preview__score">{r.score}</span>
                <span
                  className={`rank-preview__move${moved > 0 ? ' is-up' : moved < 0 ? ' is-down' : ''}`}
                  title={was ? `Rank ${was} with the objective’s defaults` : 'Not scored with the defaults'}
                >
                  {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : app.isCustom && !was ? 'new' : '–'}
                  <span className="sr-only">{moved > 0 ? ` up ${moved}` : moved < 0 ? ` down ${-moved}` : ' unchanged'}</span>
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="hint">No place can be scored with these priorities — give weight to criteria that have data.</p>
      )}
    </section>
  )
}
