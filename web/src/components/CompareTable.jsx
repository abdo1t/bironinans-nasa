import { Link } from 'react-router-dom'
import { SERIES_COLORS, describeSiteValue, pct } from '../lib/format.js'
import { similarity } from '../lib/scoring.js'
import { guaranteedMin, hasOpenRange } from '../lib/summary.js'
import { CoverageBadge, EvidenceCoverageTag, NoveltyTag, ScoreBadge } from './Tags.jsx'

export default function CompareTable({ sites, target, features, weights, rankBySite, linkTo }) {
  return (
    <div className="compare-table-wrap">
      <table className="compare-table">
        <caption className="sr-only">Criteria by site for {target.name}. Each cell shows similarity to the target and the site’s measured value. The site closest to the target on each criterion is marked “closest”. Data pending means the value is missing and left out of the score, not zero.</caption>
        <thead>
          <tr>
            <th scope="col">Criterion (weight)</th>
            {sites.map((s, i) => (
              <th scope="col" key={s.id}>
                <span className="swatch" style={{ background: SERIES_COLORS[i] }} aria-hidden="true" />
                <Link to={linkTo(`/site/${s.id}`)}>{s.name}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((f) => {
            const sims = sites.map((s) => similarity(f, s.norm[f.id], target.norm[f.id]))
            const present = sims.filter((v) => v !== null)
            const best = present.length > 1 ? Math.max(...present) : null
            const w = weights[f.id] || 0
            return (
              <tr key={f.id} className={w === 0 ? 'is-unselected' : undefined}>
                <th scope="row">
                  {f.label}{' '}
                  <span className="muted">{w === 0 ? '(off — not in this mission)' : `(weight ${w})`}</span>
                </th>
                {sites.map((s, i) => {
                  const v = sims[i]
                  if (v === null) {
                    return (
                      <td key={s.id}>
                        <span className="tag tag--pending">Data pending</span>
                      </td>
                    )
                  }
                  const isBest = best !== null && v === best && present.some((p) => p !== best)
                  const value = describeSiteValue(f, s).text
                  return (
                    <td key={s.id} className={isBest ? 'is-best' : undefined}>
                      {pct(v)}
                      {value && <span className="muted"> · {value}</span>}
                      {isBest && <span className="best-mark"> closest</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr className="compare-table__overall">
            <th scope="row">Overall score</th>
            {sites.map((s) => (
              <td key={s.id}>
                <ScoreBadge score={rankBySite[s.id]?.score ?? null} />
                {rankBySite[s.id]?.rank && <span className="muted"> #{rankBySite[s.id].rank}</span>}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Conservative lower bound</th>
            {sites.map((s) => {
              const e = rankBySite[s.id]
              const lo = guaranteedMin(e)
              return (
                <td key={s.id}>
                  {lo === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <>
                      {lo}
                      <span className="muted">
                        {hasOpenRange(e) ? ` (possible range ${e.scoreRange[0]}–${e.scoreRange[1]})` : ' (no missing site data)'}
                      </span>
                    </>
                  )}
                </td>
              )
            })}
          </tr>
          <tr>
            <th scope="row">Evidence coverage</th>
            {sites.map((s) => (
              <td key={s.id}>
                <CoverageBadge coverage={rankBySite[s.id]?.coverage} />{' '}
                {rankBySite[s.id]?.score !== null && (
                  <EvidenceCoverageTag target={target} site={s} weights={weights} features={features} />
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Known analog?</th>
            {sites.map((s) => (
              <td key={s.id}>
                <NoveltyTag site={s} />
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Largest limitation</th>
            {sites.map((s) => (
              <td key={s.id} className="muted">
                {rankBySite[s.id]?.gap}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
