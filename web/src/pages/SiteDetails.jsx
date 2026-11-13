import { Link, useParams } from 'react-router-dom'
import ScoreBars from '../components/ScoreBars.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import { CoverageBadge, MockTag, NoveltyTag, ScoreBadge, SourceTag } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel, formatCoord, sourceKind } from '../lib/format.js'
import { PRESETS } from '../lib/presets.js'
import { LIMITATIONS_NOTE, WHY_MIN_SIM, scoreSite } from '../lib/scoring.js'
import { useAppState } from '../state/AppState.jsx'

export default function SiteDetails() {
  const { id } = useParams()
  const { data } = useBundle()
  const app = useAppState()
  const site = data.siteById[id]

  if (!site) {
    return (
      <section className="page empty-state">
        <h1>Unknown site</h1>
        <p>
          No site with id “{id}”. <Link to={app.linkTo('/explore')}>Back to Explore</Link>
        </p>
      </section>
    )
  }

  const target = app.target
  const result = target ? scoreSite(target, site, app.weights, data.features) : null
  const ranked = target ? app.rankBySite[site.id] : null
  const listed = app.shortlist.includes(site.id)

  return (
    <article className="page site">
      <p className="crumbs">
        <Link to={app.linkTo('/explore')}>← Explore</Link>
      </p>

      <header className="site__head">
        <div>
          <h1>{site.name}</h1>
          <p className="muted">
            {site.country} · {formatCoord(site.lat, site.lon)} <span className="hint">(approximate — verify)</span>
          </p>
          <p className="site__tags">
            <NoveltyTag site={site} />
            <span className="muted">Nearest catalogued analog: {site.novelKm === 0 ? 'this site' : `${site.novelKm} km`}</span>
            {data.isMock && <MockTag />}
          </p>
        </div>
        <div className="site__actions">
          <button
            type="button"
            className={`btn ${listed ? 'btn--ghost' : 'btn--primary'}`}
            onClick={() => app.toggleShortlist(site.id)}
            disabled={!listed && app.shortlistFull}
          >
            {listed ? 'Remove from compare' : app.shortlistFull ? 'Compare is full (3)' : 'Add to compare'}
          </button>
          {app.shortlist.length >= 2 && (
            <Link className="btn btn--ghost" to={app.linkTo('/compare')}>
              Compare ({app.shortlist.length})
            </Link>
          )}
        </div>
      </header>

      {!target ? (
        <section className="panel">
          <h2>Pick a target to score this site</h2>
          <TargetSelect id="site-target" targets={data.targets} value={null} onChange={app.setTarget} />
        </section>
      ) : (
        <>
          <section className="panel site__score">
            <div>
              <p className="muted">
                Compared with <strong>{target.name}</strong> ({bodyLabel(target.body)}) ·{' '}
                {app.isCustom ? 'custom weights' : PRESETS[app.presetId].label}
              </p>
              <ScoreBadge score={result.score} large />
              {ranked?.rank && (
                <span className="muted">
                  {' '}
                  Rank #{ranked.rank} of {data.sites.length}
                </span>
              )}
            </div>
            <div>
              <CoverageBadge coverage={result.coverage} />
              <p className="hint">Criteria with missing data are left out of the score, not counted as zero.</p>
            </div>
          </section>

          <section className="panel">
            <h2>Score breakdown</h2>
            <div className="table-scroll">
              <ScoreBars site={site} target={target} weights={app.weights} features={data.features} result={result} />
            </div>
          </section>

          <div className="two-col">
            <section className="panel">
              <h2>Why it was selected</h2>
              {result.why.length ? (
                <ul className="why">
                  {result.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No selected criterion reaches {Math.round(WHY_MIN_SIM * 100)}% similarity.</p>
              )}
            </section>
            <section className="panel">
              <h2>Where it falls short</h2>
              <p>{result.gap}</p>
            </section>
          </div>
        </>
      )}

      <section className="panel limitations" aria-label="Limitations">
        <h2>Limitations</h2>
        <p>{LIMITATIONS_NOTE}</p>
        {data.isMock && (
          <p>
            <MockTag /> This build uses synthetic placeholder values. Scores, similarities and site values are not NASA
            observations and must not be used for planning.
          </p>
        )}
        {site.isNewCandidate && (
          <p>
            “Uncatalogued candidate” means only that this site is more than 300 km from every catalogued analog. It has
            not been validated as an analog.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Data sources</h2>
        <div className="table-scroll">
        <table className="sources">
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">This site’s value</th>
              <th scope="col">Planned source (real data)</th>
            </tr>
          </thead>
          <tbody>
            {data.features.map((f) => {
              const src = site.sources?.[f.id]
              return (
                <tr key={f.id}>
                  <th scope="row">{f.label}</th>
                  <td>
                    <SourceTag source={src} />{' '}
                    {sourceKind(src) === 'real' ? src : <span className="muted">{src || 'No value yet'}</span>}
                  </td>
                  <td className="muted">{f.source}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {target?.trekUrl && (
          <p>
            <a href={target.trekUrl} target="_blank" rel="noreferrer">
              View {target.name} in NASA {bodyLabel(target.body)} Trek ↗
            </a>
          </p>
        )}
      </section>
    </article>
  )
}
