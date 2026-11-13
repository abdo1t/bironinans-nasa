import { Link } from 'react-router-dom'
import { SERIES_COLORS, formatValue, pct } from '../lib/format.js'
import { similarity } from '../lib/scoring.js'
import { ConfidenceTag, CoverageBadge, NoveltyTag, ScoreBadge } from './Tags.jsx'

export default function CompareTable({ sites, target, features, weights, rankBySite, linkTo }) {
  return (
    <div className="compare-table-wrap">
      <table className="compare-table">
        <caption className="sr-only">Criteria by site for {target.name}. Best value per row is marked “best”.</caption>
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
                  {f.label} <span className="muted">({w === 0 ? 'off' : w})</span>
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
                  return (
                    <td key={s.id} className={isBest ? 'is-best' : undefined}>
                      {pct(v)}
                      <span className="muted"> · {formatValue(f, s.norm[f.id])}</span>
                      {isBest && <span className="best-mark"> best</span>}
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
            <th scope="row">Coverage</th>
            {sites.map((s) => (
              <td key={s.id}>
                <CoverageBadge coverage={rankBySite[s.id]?.coverage} />{' '}
                {rankBySite[s.id]?.score !== null && <ConfidenceTag coverage={rankBySite[s.id]?.coverage} />}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Status</th>
            {sites.map((s) => (
              <td key={s.id}>
                <NoveltyTag site={s} />
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Where it falls short</th>
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
