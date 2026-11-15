import { pointsLost, usableWeightFromSims } from '../lib/explain.js'
import { describeSiteValue, describeTargetValue, pct } from '../lib/format.js'
import { similarity } from '../lib/scoring.js'
import { ClippedTag, EvidenceTag, SourceTag } from './Tags.jsx'
import Term from './Term.jsx'

/**
 * Per-criterion breakdown for one site vs one target, in its own horizontal scroller,
 * followed by visible notes that explain the columns and row states.
 * Distinguishes: not selected (weight 0) · data pending (null) · not scored
 * (value shown but excluded, e.g. unrepresentative grid cell) · measured (incl. 0%).
 */
export default function ScoreBars({ site, target, weights, features, result }) {
  const usable = usableWeightFromSims(result.sims, weights)
  const scored = result.score !== null && result.score !== undefined
  return (
    <>
      <div className="table-scroll bars-wrap">
        <table className="bars">
          <caption className="sr-only">
            Per-criterion similarity of {site.name} to {target.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">
                <Term id="weight">Weight</Term>
              </th>
              <th scope="col">
                <Term id="similarity">Similarity to target</Term>
              </th>
              <th scope="col">Site value</th>
              <th scope="col">Target value</th>
              <th scope="col">Share of score</th>
              <th scope="col">Points lost</th>
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
                    {sv.excluded && <span className="tag tag--excluded">Not used in score</span>}
                    {/* the reason is always printed, never left to a hover tooltip */}
                    {(sv.excluded || (sv.status === 'unavailable' && sv.note)) && (
                      <span className="cell-note">{sv.excluded || sv.note}</span>
                    )}
                  </td>
                  <td>
                    {tv.text ?? <span className="muted">—</span>}{' '}
                    {tv.status ? (
                      <EvidenceTag status={tv.status} />
                    ) : (
                      <SourceTag source={tv.text ? target.refs?.[f.id] : null} />
                    )}
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
      </div>
      <ul className="bars__notes">
        <li>
          <strong>Share of score:</strong> the points (of 100) this criterion adds to the score. The shares add up to
          the score (rounding).
        </li>
        <li>
          <strong>Points lost:</strong> the points (of 100) this criterion costs the site: weight × (1 − similarity) ÷
          total weight of the criteria with data. Score + all points lost ≈ 100 (rounding).
        </li>
        <li>
          <strong>off</strong> = weight 0, so the criterion is not part of the score; its similarity is shown for
          reference only. <strong>Data pending</strong> = no value yet for this site or for the target.{' '}
          <strong>Not scored</strong> / <strong>Not used in score</strong> = a value exists but is left out, for the
          reason printed under it. <strong>excluded</strong> (share of score) = selected, but left out because data are
          missing. Missing data is never counted as zero.
        </li>
        <li>
          <strong>Beyond Earth range</strong> = the target’s value lies outside anything on Earth, so similarity measures
          how close the site comes to Earth’s extreme.
        </li>
      </ul>
    </>
  )
}
