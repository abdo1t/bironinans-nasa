import { formatValue, pct } from '../lib/format.js'
import { similarity } from '../lib/scoring.js'
import { SourceTag } from './Tags.jsx'

/**
 * Per-criterion breakdown for one site vs one target.
 * Distinguishes: not selected (weight 0) · data pending (null) · measured (incl. 0%).
 */
export default function ScoreBars({ site, target, weights, features, result }) {
  return (
    <table className="bars">
      <caption className="sr-only">Per-criterion similarity of {site.name} to {target.name}</caption>
      <thead>
        <tr>
          <th scope="col">Criterion</th>
          <th scope="col">Weight</th>
          <th scope="col">Similarity to target</th>
          <th scope="col">Site value</th>
          <th scope="col">Target value</th>
          <th scope="col">Share of score</th>
        </tr>
      </thead>
      <tbody>
        {features.map((f) => {
          const w = weights[f.id] || 0
          const selected = w > 0
          const siteVal = site.norm[f.id]
          const targetVal = target.norm[f.id]
          const s = selected ? result.sims[f.id] : similarity(f, siteVal, targetVal)
          const contrib = result.contrib[f.id]
          const siteShown = formatValue(f, siteVal)
          const targetShown = formatValue(f, targetVal)
          return (
            <tr key={f.id} className={selected ? undefined : 'is-unselected'}>
              <th scope="row">{f.label}</th>
              <td>{selected ? w : <span className="muted">off</span>}</td>
              <td>
                {s === null ? (
                  <span className="tag tag--pending">Data pending</span>
                ) : (
                  <span className="sim">
                    <span className="sim__track" aria-hidden="true">
                      <span className="sim__fill" style={{ width: pct(s) }} />
                    </span>
                    <span className="sim__value">{pct(s)}</span>
                    {!selected && <span className="muted"> (not scored)</span>}
                  </span>
                )}
              </td>
              <td>
                {siteShown ?? <span className="muted">—</span>} <SourceTag source={siteShown ? site.sources?.[f.id] : null} />
              </td>
              <td>
                {targetShown ?? <span className="muted">—</span>}{' '}
                <SourceTag source={targetShown ? target.refs?.[f.id] : null} />
              </td>
              <td>
                {!selected || contrib === undefined ? (
                  <span className="muted">—</span>
                ) : contrib === null ? (
                  <span className="muted">excluded</span>
                ) : (
                  `${(contrib * 100).toFixed(1)} pts`
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
