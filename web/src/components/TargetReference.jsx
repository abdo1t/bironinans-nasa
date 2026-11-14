import { describeTargetValue } from '../lib/format.js'
import Disclosure from './Disclosure.jsx'
import { CitationText, ClippedTag, EvidenceTag, MockTag } from './Tags.jsx'
import '../styles/site.css'

/**
 * The target's reference values, each with evidence type, citation and caveat.
 * Collapsed by default (`open` starts it expanded); `className` passes a Disclosure
 * variant such as "disclosure--flush" when it sits inside another section.
 */
export default function TargetReference({ target, features, isMock, open = false, className = '' }) {
  const usable = features.filter((f) => target.norm[f.id] !== null && target.norm[f.id] !== undefined).length
  return (
    <Disclosure
      className={`target-ref ${className}`.trim()}
      defaultOpen={open}
      title={`Target reference values for ${target.name}`}
      hint={
        <>
          {usable} of {features.length} criteria {isMock ? 'set' : 'verified; the rest are excluded from scores'}{' '}
          {isMock && <MockTag />}
        </>
      }
    >
      <div className="table-scroll">
        <table className="target-ref__table">
          <caption className="sr-only">Reference values used for {target.name}</caption>
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
                    {p?.citation && <CitationText text={p.citation} />}
                    {p?.url && !p.citation?.includes(p.url) && (
                      <>
                        {' '}
                        <a href={p.url} target="_blank" rel="noreferrer">
                          source<span className="sr-only"> for {f.label} (opens in new tab)</span>
                          <span aria-hidden="true"> ↗</span>
                        </a>
                      </>
                    )}
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
        <p className="hint target-ref__point">
          Reference point {target.lat}°, {target.lon}° — {target.coord.source}. {target.coord.note}
        </p>
      )}
    </Disclosure>
  )
}
