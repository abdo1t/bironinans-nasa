import { Link } from 'react-router-dom'
import CompareTable from '../components/CompareTable.jsx'
import RadarCompare from '../components/RadarCompare.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import Term from '../components/Term.jsx'
import { CoverageBadge, EvidenceCoverageTag, MockTag, NoveltyTag, ScoreBadge } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { SERIES_COLORS, bodyLabel, pct } from '../lib/format.js'
import { missionTitle } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS, RANK_ORDER } from '../lib/rankMethods.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { entrySummary, guaranteedMin, keyDifferences } from '../lib/summary.js'
import { compareVerdict } from '../lib/verdict.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/compare.css'

/** Ids of the compared sites that lead under the selected ranking method (ties: all of them). */
function leaders(sites, rankBySite, rankBy) {
  const scored = sites.filter((s) => rankBySite[s.id]?.score !== null && rankBySite[s.id]?.score !== undefined)
  if (!scored.length) return []
  const key = (s) => (rankBy === 'min' ? guaranteedMin(rankBySite[s.id]) : rankBySite[s.id].score)
  const best = Math.max(...scored.map(key))
  return scored.filter((s) => key(s) === best).map((s) => s.id)
}

function SummaryCard({ site, index, entry, target, weights, features, isLeader, leadLabel, onRemove, linkTo }) {
  const s = entrySummary(entry)
  const missing = entry ? entry.coverage.selected - entry.coverage.used : 0
  const closedRange = missing === 0 ? 'no data gaps' : 'no missing site data'
  // "No gaps" only speaks for criteria with data; say how many were left out.
  const limitation =
    s.short ||
    (missing > 0
      ? `No gaps among criteria with data — ${missing} selected criteri${missing === 1 ? 'on has' : 'a have'} no data`
      : 'No gaps on the selected criteria')
  return (
    <li className={`cmp-card${isLeader ? ' is-leader' : ''}`}>
      <div className="cmp-card__head">
        <span className="cmp-card__swatch" style={{ background: SERIES_COLORS[index] }} aria-hidden="true" />
        <div className="cmp-card__id">
          <h3 className="cmp-card__name">
            <Link to={linkTo(`/site/${site.id}`)}>{site.name}</Link>
          </h3>
          <span className="cmp-card__country">{site.country}</span>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--small cmp-card__remove"
          onClick={() => onRemove(site.id)}
          aria-label={`Remove ${site.name} from compare`}
        >
          Remove
        </button>
      </div>
      {isLeader && <p className="cmp-card__lead">{leadLabel}</p>}
      <p className="cmp-card__status">
        <NoveltyTag site={site} />
      </p>
      <dl className="cmp-card__stats">
        <div>
          <dt>Score</dt>
          <dd>
            <ScoreBadge score={s.score} />
          </dd>
        </div>
        <div>
          <dt>Guaranteed minimum</dt>
          <dd className="cmp-card__num">{s.scored ? s.min : '—'}</dd>
        </div>
        <div>
          <dt>Possible range</dt>
          <dd className="cmp-card__num">{!s.scored ? '—' : s.hasRange ? `${s.min}–${s.max}` : closedRange}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            {s.scored && <EvidenceCoverageTag target={target} site={site} weights={weights} features={features} />}{' '}
            <CoverageBadge coverage={entry?.coverage} />
          </dd>
        </div>
      </dl>
      {s.scored ? (
        <dl className="cmp-card__why">
          <div>
            <dt>Strongest match</dt>
            <dd className="cmp-card__match">{s.match || 'No criterion reaches 70% similarity'}</dd>
          </div>
          <div>
            <dt>Largest limitation</dt>
            <dd className="cmp-card__short">{limitation}</dd>
          </div>
        </dl>
      ) : (
        <p className="cmp-card__short">{s.short || 'Data pending'}</p>
      )}
    </li>
  )
}

export default function Compare() {
  const { data } = useBundle()
  const app = useAppState()
  const sites = app.shortlist.map((id) => data.siteById[id])

  if (!app.target) {
    return (
      <section className="page empty-state">
        <h1>Compare Earth sites</h1>
        <p className="muted">Pick a target site first.</p>
        <TargetSelect id="compare-target" label="Target site" targets={data.targets} value={null} onChange={app.setTarget} />
      </section>
    )
  }

  if (sites.length < 2) {
    const top = app.ranking.filter((r) => r.score !== null).slice(0, 3)
    return (
      <section className="page empty-state">
        <h1>Compare Earth sites for {app.target.name}</h1>
        <p>
          Pick two or three Earth sites to compare them side by side.
          {sites.length === 1 && <> So far: {sites[0].name}.</>}
        </p>
        <p className="cmp-empty__actions">
          {top.length >= 2 && sites.length === 0 && (
            <Link className="btn btn--primary" to={app.linkTo('/compare', { sites: top.map((r) => r.site).join(',') })}>
              Compare the top {top.length}
            </Link>
          )}
          <Link className="btn btn--ghost" to={app.linkTo('/explore')}>
            Choose sites on the map
          </Link>
        </p>
      </section>
    )
  }

  const method = RANK_METHODS[app.rankBy] || RANK_METHODS.score
  const missionLabel = app.isCustom
    ? `Custom weights (based on ${PRESETS[app.basePresetId].label})`
    : missionTitle(app.presetId)
  const lines = compareVerdict(sites, app.target, data.features, app.weights, app.rankBySite, app.rankBy)
  const leadIds = leaders(sites, app.rankBySite, app.rankBy)
  const leadLabel = app.rankBy === 'min' ? 'Leads by guaranteed minimum' : 'Leads by score'
  const { differences, notComparable } = keyDifferences(sites, app.target, data.features, app.weights)

  return (
    <section className="page compare">
      <header className="compare__head">
        <div>
          <h1>
            Compare Earth sites for {app.target.name} <span className="muted">({bodyLabel(app.target.body)})</span>
          </h1>
          <p className="compare__sub">
            Mission objective: <strong>{missionLabel}</strong>
            {data.isMock && (
              <>
                {' '}
                · <MockTag /> all values are synthetic placeholders
              </>
            )}
          </p>
        </div>
        <div className="compare__controls">
          <div className="rankby">
            <span id="cmp-rankby-label" className="rankby__label">
              <Term id="rankBy">Rank by</Term>
            </span>
            <div className="seg" role="group" aria-labelledby="cmp-rankby-label">
              {RANK_ORDER.map((id) => (
                <button key={id} type="button" aria-pressed={app.rankBy === id} onClick={() => app.setRankBy(id)}>
                  {RANK_METHODS[id].label}
                </button>
              ))}
            </div>
          </div>
          <Link className="btn btn--ghost btn--small" to={app.linkTo('/explore')}>
            Change sites
          </Link>
        </div>
      </header>

      <p className="cmp-key">
        How to read: <Term id="score">Score</Term> <Term id="min">Guaranteed minimum</Term>{' '}
        <Term id="range">Possible range</Term> <Term id="evidence">Evidence</Term>
      </p>
      <ul className={`cmp-cards cmp-cards--${sites.length}`} aria-label="Compared sites">
        {sites.map((site, i) => (
          <SummaryCard
            key={site.id}
            site={site}
            index={i}
            entry={app.rankBySite[site.id]}
            target={app.target}
            weights={app.weights}
            features={data.features}
            isLeader={leadIds.includes(site.id)}
            leadLabel={leadLabel}
            onRemove={app.toggleShortlist}
            linkTo={app.linkTo}
          />
        ))}
      </ul>

      <div className="cmp-findings">
        <section className="card verdict" aria-labelledby="cmp-verdict-title">
          <h2 id="cmp-verdict-title">What the comparison shows</h2>
          <p className="hint">
            {method.short} This holds under the selected ranking method and the data available — it describes
            resemblance on the selected criteria, not mission suitability.
          </p>
          <ul>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="cmp-diff-title">
          <h2 id="cmp-diff-title">Where they differ most</h2>
          {differences.length ? (
            <ul className="cmp-diff">
              {differences.map((d) => (
                <li key={d.feature.id}>
                  <strong>{d.feature.label}:</strong> {d.best.site.name} is closest to the target ({pct(d.best.sim)}{' '}
                  similar{d.best.text ? `, ${d.best.text}` : ''}); {d.worst.site.name} is furthest ({pct(d.worst.sim)}
                  {d.worst.text ? `, ${d.worst.text}` : ''}).
                </li>
              ))}
            </ul>
          ) : (
            <p>These sites are similar on every selected criterion that has data for at least two of them.</p>
          )}
          {notComparable.length > 0 && (
            <p className="cmp-diff__missing">
              <strong>Not comparable:</strong>{' '}
              {notComparable
                .map(({ feature, missing }) => `${feature.label} (no data for ${missing.map((s) => s.name).join(', ')})`)
                .join('; ')}
              . Missing values are left out, not treated as zero.
            </p>
          )}
        </section>
      </div>

      <p className="card card--accent cmp-limit" role="note">
        <strong>Limitation:</strong> {LIMITATIONS_NOTE} Terrain is 10 km-scale relief and climate a ~50 km grid cell —
        not rover-scale slopes, rocks or soil strength.
      </p>

      <div className="compare__grid">
        <section className="card" aria-labelledby="cmp-radar-title">
          <h2 id="cmp-radar-title">Similarity profile</h2>
          <RadarCompare sites={sites} target={app.target} features={data.features} />
        </section>
        <section className="card" aria-labelledby="cmp-table-title">
          <h2 id="cmp-table-title">Side by side</h2>
          <CompareTable
            sites={sites}
            target={app.target}
            features={data.features}
            weights={app.weights}
            rankBySite={app.rankBySite}
            linkTo={app.linkTo}
          />
        </section>
      </div>
    </section>
  )
}
