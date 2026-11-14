import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { evidenceCoverage } from '../lib/explain.js'
import { bodyLabel, pct } from '../lib/format.js'
import { MIRROR_STATUS, mirrorRows } from '../lib/mirror.js'
import { LIMITATIONS_NOTE, scoreSite } from '../lib/scoring.js'
import { entrySummary, plainReliability } from '../lib/summary.js'
import { IconAnalysis } from './Icons.jsx'
import ScoreBars from './ScoreBars.jsx'
import { EvidenceTag, MockTag, NoveltyTag } from './Tags.jsx'
import Term from './Term.jsx'

/** 0–100 scale: the score, its guaranteed minimum and the range missing data still allows. */
function ScoreScale({ s }) {
  const lo = s.min ?? s.score
  const hi = s.max ?? s.score
  return (
    <div className="mscale" aria-hidden="true">
      <div className="mscale__track">
        {s.hasRange && (
          <span className="mscale__range" style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 0.5)}%` }} />
        )}
        <span className="mscale__fill" style={{ width: `${lo}%` }} />
        <span className="mscale__mark" style={{ left: `${s.score}%` }} />
      </div>
      <div className="mscale__ticks">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  )
}

/** One cell per selected criterion: filled = measured on both worlds, hatched = missing. */
function CoverageCells({ rows }) {
  const used = rows.filter((r) => r.status !== 'unused')
  return (
    <ul className="mcells" aria-hidden="true">
      {used.map((r) => (
        <li key={r.feature.id} className={`mcells__cell mcells__cell--${r.status === 'missing' ? 'missing' : 'ok'}`} title={r.feature.label} />
      ))}
    </ul>
  )
}

function RowList({ rows, kind, empty }) {
  if (!rows.length) return <p className="manalysis__empty">{empty}</p>
  return (
    <ul className={`mrows mrows--${kind}`}>
      {rows.map((r) => (
        <li key={r.feature.id} className="mrows__row">
          <span className="mrows__sym" aria-hidden="true">
            {MIRROR_STATUS[r.status].symbol}
          </span>
          <span className="mrows__label">{r.feature.label}</span>
          {r.sim !== null ? (
            <>
              <span className="mrows__bar" aria-hidden="true">
                <span style={{ width: `${Math.round(r.sim * 100)}%` }} />
              </span>
              <span className="mrows__pct tabular">{pct(r.sim)}</span>
            </>
          ) : (
            <span className="mrows__missing">
              no {r.missingSide === 'target' ? 'target' : r.missingSide === 'both' ? '' : 'Earth'} value
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * "Planetary Match Analysis": the selected Earth candidate against the Moon/Mars target.
 * Quick: score, guaranteed minimum, evidence completeness, strongest similarities, important
 * differences, missing data. "Why this match?" opens the explanation and evidence; Research
 * mode adds the full per-criterion table (weights, values, units, points lost).
 * Display only — every number comes from the ranking entry and scoring.js `similarity`.
 */
export default function MatchAnalysis({ entry, site, target, weights, features, minCriteria, research, isMock, linkTo, onToggleShortlist, listed, shortlistFull }) {
  const [open, setOpen] = useState(false)
  const regionId = useId()
  if (!entry || !site) {
    return (
      <section className="mc-panel manalysis" aria-labelledby="manalysis-title">
        <header className="mc-panel__head">
          <h2 id="manalysis-title" className="mc-panel__title">
            <IconAnalysis />
            Planetary match analysis
          </h2>
        </header>
        <div className="mc-panel__body">
          <p className="manalysis__empty">Select a place on the map or in the list to see how it compares.</p>
        </div>
      </section>
    )
  }

  const s = entrySummary(entry)
  const rows = mirrorRows(target, site, weights, features)
  const byWeight = (score) => (a, b) => score(b) - score(a)
  const similar = rows.filter((r) => r.status === 'match').sort(byWeight((r) => r.weight * r.sim)).slice(0, 3)
  const differ = rows.filter((r) => r.status === 'differ').sort(byWeight((r) => r.weight * (1 - r.sim))).slice(0, 3)
  const missing = rows.filter((r) => r.status === 'missing')
  const ev = evidenceCoverage(target, site, weights, features)
  const evLabel = ev.level ? { high: 'High', medium: 'Medium', low: 'Low' }[ev.level] : null
  const world = bodyLabel(target.body)
  const used = rows.filter((r) => r.status !== 'unused')

  return (
    <section className="mc-panel manalysis" aria-labelledby="manalysis-title">
      <header className="mc-panel__head">
        <h2 id="manalysis-title" className="mc-panel__title">
          <IconAnalysis />
          Planetary match analysis
        </h2>
        {isMock && <MockTag />}
      </header>

      <div className="mc-panel__body manalysis__body">
        <p className="sr-only" aria-live="polite">
          Selected: {site.name}
          {s.scored ? `, rank ${entry.rank}, score ${s.score} of 100` : ', no score'}.
        </p>

        <div className="manalysis__pair">
          <div>
            <span className="hud-label">Earth candidate</span>
            <p className="manalysis__name">
              {entry.rank ? <span className="manalysis__rank">#{entry.rank}</span> : null}
              {site.name}
            </p>
            <p className="manalysis__sub">
              {site.country} <NoveltyTag site={site} />
            </p>
          </div>
          <div className="manalysis__ref">
            <span className="hud-label">{world} reference</span>
            <p className="manalysis__refname">
              <span className={`world-dot world-dot--${target.body}`} aria-hidden="true" />
              {target.name.split(' — ')[0]}
            </p>
          </div>
        </div>

        {s.scored ? (
          <div className="manalysis__score">
            <div className="manalysis__nums">
              <div>
                <span className="hud-label">
                  <Term id="score">Similarity</Term>
                </span>
                <p className="manalysis__big tabular">
                  {s.score}
                  <span>/100</span>
                </p>
              </div>
              <div>
                <span className="hud-label">
                  <Term id="range">Guaranteed min.</Term>
                </span>
                <p className="manalysis__mid tabular">
                  {s.min}
                  <span>{s.hasRange ? ` – ${s.max} possible` : ' · no data gaps'}</span>
                </p>
              </div>
            </div>
            <ScoreScale s={s} />
          </div>
        ) : (
          <p className="manalysis__noscore">
            <strong>No score — insufficient data.</strong> This is missing evidence, not a poor match.
          </p>
        )}

        <div className="manalysis__block">
          <div className="manalysis__blockhead">
            <span className="hud-label">Evidence completeness</span>
            <span className="manalysis__ev tabular">
              {entry.coverage.used} of {entry.coverage.selected} measured
              {evLabel && <span className={`tag tag--conf tag--conf-${ev.level}`}>{evLabel}</span>}
            </span>
          </div>
          <CoverageCells rows={rows} />
          <p className="manalysis__note">{plainReliability(entry, minCriteria)}</p>
        </div>

        <div className="manalysis__block">
          <span className="hud-label">Strongest similarities</span>
          <RowList rows={similar} kind="match" empty="No criterion reaches 70 % similarity." />
        </div>
        <div className="manalysis__block">
          <span className="hud-label">Important differences</span>
          <RowList rows={differ} kind="differ" empty="No selected criterion falls below 70 % similarity." />
        </div>
        {missing.length > 0 && (
          <div className="manalysis__block">
            <span className="hud-label">Missing data · not scored</span>
            <RowList rows={missing} kind="missing" empty="" />
          </div>
        )}

        <button
          type="button"
          className={`btn manalysis__why${open ? ' is-open' : ''}`}
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((o) => !o)}
        >
          <span>Why this match?</span>
          <span className="manalysis__chev" aria-hidden="true">
            {open ? '–' : '+'}
          </span>
        </button>

        <div id={regionId} className="manalysis__explain" hidden={!open}>
          {open && (
            <>
              <p>
                {s.scored ? (
                  <>
                    {site.name} {entry.rank ? `ranks #${entry.rank}` : 'is listed'} because its measured characteristics
                    {similar.length ? (
                      <> are closest to {target.name.split(' — ')[0]} on {similar.map((r) => r.feature.label.toLowerCase()).join(', ')}</>
                    ) : (
                      <> reach no 70 % match</>
                    )}
                    {differ.length ? <>, while {differ[0].feature.label.toLowerCase()} differs most</> : null}. The score
                    is a weighted average of per-criterion similarity under the current research mission.
                  </>
                ) : (
                  <>Too few criteria have values on both worlds to compute a score.</>
                )}
              </p>
              {research ? (
                // Full scoreSite result (adds per-criterion `sims`); the same call Site details uses.
                <ScoreBars
                  site={site}
                  target={target}
                  weights={weights}
                  features={features}
                  result={scoreSite(target, site, weights, features, minCriteria)}
                />
              ) : (
                <ul className="mevidence">
                  {used.map((r) => (
                    <li key={r.feature.id} className={`mevidence__row mevidence__row--${r.status}`}>
                      <span className="mevidence__label">
                        <span aria-hidden="true">{MIRROR_STATUS[r.status].symbol} </span>
                        {r.feature.label}
                        <span className="sr-only">: {MIRROR_STATUS[r.status].label}</span>
                      </span>
                      <span className="mevidence__vals">
                        <span>
                          <span className="mevidence__who">Earth</span> {r.site.text ?? 'no value'}{' '}
                          {r.site.status && <EvidenceTag status={r.site.status} />}
                        </span>
                        <span>
                          <span className="mevidence__who">{world}</span> {r.target.text ?? 'no value'}{' '}
                          {r.target.status && <EvidenceTag status={r.target.status} />}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="manalysis__limit">
                <strong>Limits:</strong> resemblance on these criteria only, not mission suitability. {LIMITATIONS_NOTE}
              </p>
              <p className="manalysis__links">
                <Link to={linkTo(`/site/${site.id}`, {}) + '#evidence'}>Full evidence and citations</Link>
                {!research && <span className="muted"> · Research mode shows weights, units and points lost.</span>}
              </p>
            </>
          )}
        </div>

        <div className="manalysis__actions">
          <Link className="btn btn--small" to={linkTo(`/site/${site.id}`)}>
            Research dossier<span className="sr-only"> for {site.name}</span>
          </Link>
          {s.scored && (
            <Link className="btn btn--small" to={linkTo('/mirror', { site: site.id })}>
              Planetary Mirror<span className="sr-only">: {site.name} beside {target.name}</span>
            </Link>
          )}
          <button
            type="button"
            className={`btn btn--small${listed ? ' is-on' : ''}`}
            aria-pressed={listed}
            disabled={!listed && shortlistFull}
            onClick={() => onToggleShortlist(site.id)}
          >
            {listed ? '✓ In compare' : shortlistFull ? 'Compare full (3)' : '+ Compare'}
            <span className="sr-only"> {site.name}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
