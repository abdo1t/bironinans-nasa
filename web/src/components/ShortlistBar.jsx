import { Link } from 'react-router-dom'
import { SHORTLIST_MAX } from '../lib/urlState.js'

/**
 * Compare tray: the sites picked for side-by-side comparison (max 3) and the Compare action.
 * With nothing picked it offers a one-click "Compare top 3" (`topIds` = the three best-ranked
 * scored sites under the current ranking).
 */
export default function ShortlistBar({ shortlist, siteById, onRemove, onClear, linkTo, topIds = [] }) {
  const n = shortlist.length
  const canQuick = n === 0 && topIds.length >= 2
  return (
    <section className="shortlist" aria-label="Compare shortlist">
      <span className="shortlist__label" aria-live="polite">
        Compare {n}/{SHORTLIST_MAX}
      </span>
      {n === 0 && <span className="muted shortlist__empty">Add 2–3 sites, or compare the leaders.</span>}
      {n === 1 && <span className="muted shortlist__empty">Add at least one more site.</span>}
      {n > 0 && (
        <ul className="shortlist__chips">
          {shortlist.map((id) => (
            <li key={id} className="chip">
              {siteById[id].name}
              <button type="button" className="chip__x" onClick={() => onRemove(id)} aria-label={`Remove ${siteById[id].name} from compare`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {n > 0 && (
        <button type="button" className="btn btn--ghost btn--small" onClick={onClear}>
          Clear
        </button>
      )}
      {n >= 2 ? (
        <Link className="btn btn--primary" to={linkTo('/compare')}>
          Compare {n} sites
        </Link>
      ) : canQuick ? (
        <Link className="btn btn--primary" to={linkTo('/compare', { sites: topIds.join(',') })}>
          Compare top {topIds.length}
        </Link>
      ) : (
        <button type="button" className="btn btn--primary" disabled aria-describedby="shortlist-need">
          Compare
          <span id="shortlist-need" className="sr-only">
            {' '}
            — pick at least 2 sites first
          </span>
        </button>
      )}
    </section>
  )
}
