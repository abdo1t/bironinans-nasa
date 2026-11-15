import { Link } from 'react-router-dom'
import { CoverageBadge, EvidenceCoverageTag, NoveltyTag, ScoreBar, ScoreRange } from './Tags.jsx'
import Term from './Term.jsx'
import WhyGap from './WhyGap.jsx'

export default function ResultsList({
  ranking,
  siteById,
  target,
  weights,
  features,
  shortlist,
  shortlistFull,
  onToggleShortlist,
  linkTo,
}) {
  return (
    <div className="results">
      <table className="results__table">
        <caption className="sr-only">
          Earth sites ranked by similarity to {target.name}. Missing data is excluded from a score, not counted as zero; the range shows how far missing data could move it.
        </caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Site</th>
            <th scope="col">
              <Term id="score">Score</Term>
            </th>
            <th scope="col">
              <Term id="evidence">Evidence</Term>
            </th>
            <th scope="col">Why it ranks here</th>
            <th scope="col">
              <Term id="catalogued">Known analog?</Term>
            </th>
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
                  <ScoreRange score={r.score} range={r.scoreRange} />
                </td>
                <td>
                  <CoverageBadge coverage={r.coverage} />
                  {r.score !== null && (
                    <>
                      <br />
                      <EvidenceCoverageTag target={target} site={site} weights={weights} features={features} />
                    </>
                  )}
                </td>
                <td className="results__why">
                  <WhyGap entry={r} />
                </td>
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
                    aria-label={`Compare ${site.name}`}
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
