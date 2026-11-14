import { pointsLost, usableWeightFromSims } from '../lib/explain.js'
import { describeSiteValue, describeTargetValue, pct } from '../lib/format.js'
import { similarity } from '../lib/scoring.js'
import { ClippedTag, EvidenceTag, SourceTag } from './Tags.jsx'

/**
 * Per-criterion breakdown for one site vs one target.
 * Distinguishes: not selected (weight 0) · data pending (null) · not scored
 * (value shown but excluded, e.g. unrepresentative grid cell) · measured (incl. 0%).
 */
export default function ScoreBars({ site, target, weights, features, result }) {
  const usable = usableWeightFromSims(result.sims, weights)
  const scored = result.score !== null && result.score !== undefined
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
          <th scope="col" title="Points (of 100) this criterion costs the site: weight × (1 − similarity) ÷ total weight of criteria with data. Score + all points lost ≈ 100 (rounding).">
            Points lost
          </th>
        </tr>
      </thead>
      <tbody>
        {features.map((f) => {
          const w = weights[f.id] || 0
          const selected = w > 0
          const s = selected ? result.sims[f.id] : similarity(f, site.norm[f.id], target.norm[f.id])
          const contrib = result.contrib[f.id]
          const lost = selected && scored ? pointsLost(w, s, usable) : null
          const sv = describeSiteValue(f, site)
          const tv = describeTargetValue(f, target)
          return (
            <tr key={f.id} className={selected ? undefined : 'is-unselected'}>
              <th scope="row">{f.label}</th>
              <td>{selected ? w : <span className="muted">off</span>}</td>
              <td>
                {s === null || s === undefined ? (
                  <span className="tag tag--pending">{sv.excluded ? 'Not scored' : 'Data pending'}</span>
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
                {sv.text ?? <span className="muted">—</span>}{' '}
                {sv.status ? (
                  <EvidenceTag status={sv.status} />
                ) : (
                  <SourceTag source={sv.text ? site.sources?.[f.id] : null} />
                )}
                {sv.excluded && (
                  <span className="tag tag--excluded" title={sv.excluded}>
                    Not used in score
                  </span>
                )}
                {(sv.excluded || (sv.status === 'unavailable' && sv.note)) && (
                  <span className="cell-note">{sv.excluded || sv.note}</span>
                )}
              </td>
              <td>
                {tv.text ?? <span className="muted">—</span>}{' '}
                {tv.status ? <EvidenceTag status={tv.status} /> : <SourceTag source={tv.text ? target.refs?.[f.id] : null} />}
                <ClippedTag direction={tv.clipped} />
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
              <td>
                {lost === null ? (
                  <span className="muted">—</span>
                ) : (
                  <span className={lost >= 10 ? 'pts-lost pts-lost--big' : 'pts-lost'}>−{lost.toFixed(1)} pts</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
