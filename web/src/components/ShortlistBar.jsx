import { Link } from 'react-router-dom'
import { SHORTLIST_MAX } from '../lib/urlState.js'

export default function ShortlistBar({ shortlist, siteById, onRemove, onClear, linkTo }) {
  const n = shortlist.length
  return (
    <div className="shortlist" aria-label="Compare shortlist">
      <span className="shortlist__label">
        Shortlist {n}/{SHORTLIST_MAX}
      </span>
      {n === 0 && <span className="muted">Tick up to 3 sites to compare.</span>}
      <ul className="shortlist__chips">
        {shortlist.map((id) => (
          <li key={id} className="chip">
            {siteById[id].name}
            <button type="button" className="chip__x" onClick={() => onRemove(id)} aria-label={`Remove ${siteById[id].name}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {n > 0 && (
        <button type="button" className="btn btn--ghost btn--small" onClick={onClear}>
          Clear
        </button>
      )}
      {n >= 2 ? (
        <Link className="btn btn--primary" to={linkTo('/compare')}>
          Compare ({n})
        </Link>
      ) : (
        <span className="btn btn--primary is-disabled" aria-disabled="true" title="Pick at least 2 sites">
          Compare ({n})
        </span>
      )}
    </div>
  )
}
