import { Link } from 'react-router-dom'
import { CoverageBadge, NoveltyTag, ScoreBar } from './Tags.jsx'

export default function ResultsList({ ranking, siteById, target, shortlist, shortlistFull, onToggleShortlist, linkTo }) {
  return (
    <div className="results">
      <table className="results__table">
        <caption className="sr-only">
          Earth sites ranked by similarity to {target.name}. Missing data is excluded from a score, not counted as zero.
        </caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Site</th>
            <th scope="col">Score</th>
            <th scope="col">Coverage</th>
            <th scope="col">Why it ranks here</th>
            <th scope="col">Status</th>
            <th scope="col">Compare</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r) => {
            const site = siteById[r.site]
            const listed = shortlist.includes(site.id)
            const disabled = !listed && shortlistFull
            return (
              <tr key={site.id} className={listed ? 'is-listed' : undefined}>
                <td className="results__rank">{r.rank ?? '—'}</td>
                <td>
                  <Link to={linkTo(`/site/${site.id}`)} className="results__name">
                    {site.name}
                  </Link>
                  <span className="results__country">{site.country}</span>
                </td>
                <td className="results__score">
                  <ScoreBar score={r.score} />
                </td>
                <td>
                  <CoverageBadge coverage={r.coverage} />
                </td>
                <td className="results__why">{r.why[0] || <span className="muted">{r.gap}</span>}</td>
                <td>
                  <NoveltyTag site={site} />
                </td>
                <td className="results__check">
                  <input
                    type="checkbox"
                    id={`cmp-${site.id}`}
                    checked={listed}
                    disabled={disabled}
                    onChange={() => onToggleShortlist(site.id)}
                    aria-label={`Add ${site.name} to compare`}
                    title={disabled ? 'You can compare up to 3 sites' : undefined}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
