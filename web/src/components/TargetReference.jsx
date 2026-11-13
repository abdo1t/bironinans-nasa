import { describeTargetValue } from '../lib/format.js'
import { ClippedTag, EvidenceTag, MockTag } from './Tags.jsx'

/** The target's reference values, each with evidence type, citation and caveat. */
export default function TargetReference({ target, features, isMock, open = false }) {
  const usable = features.filter((f) => target.norm[f.id] !== null && target.norm[f.id] !== undefined).length
  return (
    <details className="target-ref" open={open}>
      <summary>
        Target reference values for {target.name}{' '}
        <span className="muted">
          ({usable} of {features.length} criteria {isMock ? 'set' : 'verified; the rest are excluded from scores'})
        </span>{' '}
        {isMock && <MockTag />}
      </summary>
      <div className="table-scroll">
        <table className="target-ref__table">
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">Value used</th>
              <th scope="col">Evidence</th>
              <th scope="col">Source and caveat</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => {
              const tv = describeTargetValue(f, target)
              const p = tv.provenance
              return (
                <tr key={f.id} className={tv.status === 'unavailable' ? 'is-unselected' : undefined}>
                  <th scope="row">{f.label}</th>
                  <td>
                    {tv.text ?? <span className="muted">Unavailable — excluded</span>} <ClippedTag direction={tv.clipped} />
                  </td>
                  <td>{tv.status ? <EvidenceTag status={tv.status} /> : isMock ? <MockTag /> : null}</td>
                  <td className="target-ref__src">
                    {p?.citation &&
                      (p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.citation}
                        </a>
                      ) : (
                        p.citation
                      ))}
                    {p?.note && <span className="cell-note">{p.note}</span>}
                    {!p && <span className="muted">{target.refs?.[f.id] || '—'}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {target.coord?.source && (
        <p className="hint">
          Reference point {target.lat}°, {target.lon}° — {target.coord.source}. {target.coord.note}
        </p>
      )}
    </details>
  )
}
