import { Link } from 'react-router-dom'
import { whyGapSummary } from '../lib/explain.js'
import { CoverageBadge, EvidenceCoverageTag, NoveltyTag, ScoreBar, ScoreRange } from './Tags.jsx'

function WhyCell({ r }) {
  const { match, short } = whyGapSummary(r.why, r.gap, r.score)
  if (r.score === null) return <span className="muted">{short}</span>
  return (
    <span className="why-gap">
      {match && (
        <span className="why-gap__match">
          <span aria-hidden="true">✓ </span>
          <span className="sr-only">Closest match: </span>
          {match}
        </span>
      )}
      {match && short && <span aria-hidden="true"> · </span>}
      {short && (
        <span className="why-gap__short">
          <span aria-hidden="true">✗ </span>
          <span className="sr-only">Largest shortfall: </span>
          {short}
        </span>
      )}
      {!match && !short && <span className="muted">No criterion reaches 70% similarity</span>}
    </span>
  )
}

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
                  <WhyCell r={r} />
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
