import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TargetSelect from '../components/TargetSelect.jsx'
import { EvidenceTag, MockTag } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { featuresMissingEverywhere, shortDate } from '../lib/explain.js'
import { bodyLabel, describeSiteValue, describeTargetValue, formatCoord, pct } from '../lib/format.js'
import { MISSION_CAVEAT, MISSIONS, missionLabel } from '../lib/missions.js'
import { RANK_METHODS } from '../lib/rankMethods.js'
import { SCENARIO_LIMITATION } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE, NO_GAP, similarity } from '../lib/scoring.js'
import { entrySummary, plainComparison } from '../lib/summary.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/report.css'

/**
 * Scientific report: the current mission configuration, research priorities and ranking,
 * written out as one printable document (Print / Save as PDF) plus CSV and JSON downloads.
 *
 * Everything here is read from the loaded data bundle and the current app state (the same
 * scoring the map and lists use); nothing is recomputed differently, fetched or invented.
 * The report is reproducible: it carries the link that restores the same state.
 */

const csvCell = (v) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const shortName = (name) => name.split(' — ')[0]

/** Largest difference, without implying "nothing missing" when criteria lack data (as on Site details). */
function gapText(r) {
  const missing = r.coverage.selected - r.coverage.used
  if (r.gap === NO_GAP && missing > 0) return `None where data exist (${missing} not measured)`
  return r.gap || ''
}

export default function Report() {
  const { data } = useBundle()
  const app = useAppState()
  const target = app.target

  useEffect(() => {
    document.title = target ? `Report: ${shortName(target.name)} – Earth Analog Finder` : 'Report – Earth Analog Finder'
  }, [target])

  // When the report was opened (stable across re-renders).
  const [opened] = useState(() => new Date())

  if (!target) {
    return (
      <section className="page empty-state">
        <h1>Scientific report</h1>
        <p className="muted">Choose a Moon or Mars site first; the report describes that search.</p>
        <TargetSelect id="report-target" label="Target site" targets={data.targets} value={null} onChange={app.setTarget} />
      </section>
    )
  }

  const features = data.features
  const used = features.filter((f) => (app.weights[f.id] || 0) > 0)
  const totalW = used.reduce((s, f) => s + app.weights[f.id], 0)
  const scored = app.ranking.filter((r) => r.score !== null)
  const unscored = app.ranking.filter((r) => r.score === null)
  // Focus sites: the comparison shortlist, otherwise the top three of the current ranking.
  const focusIds = app.shortlist.length ? app.shortlist : scored.slice(0, 3).map((r) => r.site)
  const focus = focusIds.map((id) => data.siteById[id])
  const focusFromShortlist = app.shortlist.length > 0
  const method = RANK_METHODS[app.rankBy] || RANK_METHODS.score
  const missionId = app.isCustom ? app.basePresetId : app.presetId
  const mission = MISSIONS[missionId] || MISSIONS.balanced
  const missingEverywhere = featuresMissingEverywhere(data.sites, features)
  const reproduce = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${app.linkTo('/explore')}`
  const plain = focus.length >= 2 ? plainComparison(focus, focus.map((s) => app.rankBySite[s.id])) : []

  // Sources actually behind the values in this report (target citations + focus-site provenance).
  const sourceRows = []
  const seen = new Set()
  const addSource = (who, f, text) => {
    if (!text) return
    const key = `${f.id}|${text}`
    if (seen.has(key)) return
    seen.add(key)
    sourceRows.push({ who, f, text })
  }
  for (const f of used) {
    const tp = target.provenance?.[f.id]
    addSource(shortName(target.name), f, tp?.citation || target.refs?.[f.id])
    for (const s of focus) {
      const p = s.provenance?.[f.id]
      if (p && p.status !== 'unavailable') {
        addSource('Earth places', f, [p.dataset, p.parameter && `(${p.parameter})`, p.period].filter(Boolean).join(' ') || p.citation)
      }
    }
  }

  const downloadCsv = () => {
    const head = [
      'rank',
      'site_id',
      'site',
      'country',
      'lat',
      'lon',
      'score',
      'score_range_low',
      'score_range_high',
      'criteria_used',
      'criteria_selected',
      'catalogued_analog',
      'km_to_nearest_catalogued_analog',
      'strongest_match',
      'largest_gap',
    ]
    const lines = app.ranking.map((r) => {
      const s = data.siteById[r.site]
      return [
        r.rank ?? '',
        s.id,
        s.name,
        s.country,
        s.lat,
        s.lon,
        r.score ?? '',
        r.scoreRange?.[0] ?? '',
        r.scoreRange?.[1] ?? '',
        r.coverage.used,
        r.coverage.selected,
        s.knownAnalog ? 'yes' : 'no',
        s.novelKm,
        r.why?.[0]?.replace(/^Strongest match: /, '') ?? '',
        gapText(r),
      ]
        .map(csvCell)
        .join(',')
    })
    const meta = [
      `# Earth Analog Finder ranking - target: ${target.name} (${bodyLabel(target.body)}); objective: ${missionLabel(app)}`,
      `# weights (0-5): ${features.map((f) => `${f.id}=${app.weights[f.id] || 0}`).join(' ')}; order: ${method.label}`,
      `# data bundle: ${data.manifest?.kind || 'unknown'} ${data.manifest?.generatedAt || ''}; exported ${opened.toISOString()}`,
      `# scores = resemblance on the selected criteria, not mission suitability. ${LIMITATIONS_NOTE}`,
    ]
    download(`earth-analogs-${target.id}-${missionId}.csv`, `${[...meta, head.join(','), ...lines].join('\n')}\n`, 'text/csv')
  }

  const downloadJson = () => {
    const out = {
      report: 'Earth Analog Finder - scientific report',
      exportedAt: opened.toISOString(),
      reproduceUrl: reproduce,
      dataBundle: { kind: data.manifest?.kind, generatedAt: data.manifest?.generatedAt, contract: data.manifest?.contract },
      mission: {
        target: { id: target.id, name: target.name, body: target.body, lat: target.lat, lon: target.lon, coordSource: target.coord?.source },
        objective: missionLabel(app),
        objectivePreset: missionId,
        customWeights: app.isCustom,
        rankBy: app.rankBy,
        minCriteriaForScore: data.minCriteria,
      },
      priorities: Object.fromEntries(features.map((f) => [f.id, app.weights[f.id] || 0])),
      ranking: app.ranking.map((r) => ({
        rank: r.rank,
        site: r.site,
        name: data.siteById[r.site].name,
        score: r.score,
        scoreRange: r.scoreRange,
        coverage: r.coverage,
        contrib: r.contrib,
        why: r.why,
        gap: r.gap,
      })),
      limitations: [LIMITATIONS_NOTE, MISSION_CAVEAT, SCENARIO_LIMITATION],
    }
    download(`earth-analogs-${target.id}-${missionId}.json`, `${JSON.stringify(out, null, 2)}\n`, 'application/json')
  }

  return (
    <article className="page report">
      <div className="report__toolbar no-print">
        <Link to={app.linkTo('/explore')}>← Back to results</Link>
        <div className="report__actions">
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button type="button" className="btn btn--ghost" onClick={downloadCsv}>
            Download ranking (CSV)
          </button>
          <button type="button" className="btn btn--ghost" onClick={downloadJson}>
            Download data (JSON)
          </button>
        </div>
      </div>

      <header className="report__head">
        <p className="kicker">Earth Analog Finder · scientific report</p>
        <h1>
          Earth analogs for {shortName(target.name)} <span className="muted">({bodyLabel(target.body)})</span>
        </h1>
        <p className="report__sub">
          Objective: <strong>{missionLabel(app)}</strong> · {scored.length} of {app.ranking.length} Earth places scored ·
          generated {opened.toLocaleString()} from data bundle {data.manifest?.kind || '—'}{' '}
          {shortDate(data.manifest?.generatedAt)}
          {data.isMock && (
            <>
              {' '}
              · <MockTag /> synthetic placeholder data — not measurements
            </>
          )}
        </p>
        <p className="report__claim">
          A screening of Earth places by resemblance to the selected site on the selected criteria — a decision aid for
          choosing where to look, <strong>not</strong> a statement of mission suitability.
        </p>
      </header>

      <section className="report__sec" aria-labelledby="r-config">
        <h2 id="r-config">1. Mission configuration</h2>
        <dl className="report__dl">
          <div>
            <dt>Target site</dt>
            <dd>
              {target.name} ({bodyLabel(target.body)}) · {formatCoord(target.lat, target.lon)}
              {target.coord?.source && <span className="report__fine"> — coordinates: {target.coord.source}</span>}
            </dd>
          </div>
          {target.summary && (
            <div>
              <dt>Site character</dt>
              <dd>{target.summary}</dd>
            </div>
          )}
          <div>
            <dt>Research objective</dt>
            <dd>
              {missionLabel(app)} — {mission.question}
            </dd>
          </div>
          <div>
            <dt>Ranking order</dt>
            <dd>{method.help}</dd>
          </div>
          <div>
            <dt>Minimum evidence</dt>
            <dd>A place needs data on at least {data.minCriteria} selected criteria to receive a score.</dd>
          </div>
        </dl>
      </section>

      <section className="report__sec" aria-labelledby="r-prio">
        <h2 id="r-prio">2. Research priorities</h2>
        <p className="report__note">
          Weights (0–5) express the research team’s priorities. They are not scientifically validated mission
          requirements; changing them changes the ranking.
          {app.isCustom && ' These weights were adjusted from the objective’s defaults.'}
        </p>
        <table className="report__table report__table--prio">
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">Weight</th>
              <th scope="col">Share of the score</th>
              <th scope="col">{shortName(target.name)} value</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => {
              const w = app.weights[f.id] || 0
              const tv = describeTargetValue(f, target)
              return (
                <tr key={f.id} className={w ? '' : 'is-off'}>
                  <th scope="row">{f.label}</th>
                  <td className="report__nowrap">
                    <span className="report__wbar" aria-hidden="true">
                      <span style={{ width: `${(w / 5) * 100}%` }} />
                    </span>{' '}
                    {w} / 5
                  </td>
                  <td>{w && totalW ? `${Math.round((100 * w) / totalW)}%` : 'not used'}</td>
                  <td>{tv.text ?? <span className="muted">no verified value — not scored</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="report__sec" aria-labelledby="r-rank">
        <h2 id="r-rank">3. Ranked analog locations</h2>
        <p className="report__note">
          {method.short} Coverage = selected criteria with data for that place.
        </p>
        <div className="report__scroll">
          <table className="report__table report__table--rank">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Earth place</th>
                <th scope="col">Score</th>
                <th scope="col">Coverage</th>
                <th scope="col">Strongest match</th>
                <th scope="col">Largest difference</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...scored, ...unscored].map((r) => {
                const s = data.siteById[r.site]
                const e = entrySummary(r)
                return (
                  <tr key={s.id} className={focusIds.includes(s.id) ? 'is-focus' : ''}>
                    <td>{r.rank ?? '—'}</td>
                    <th scope="row">
                      {s.name}
                      <span className="report__fine"> · {s.country}</span>
                    </th>
                    <td className="report__num">
                      {e.scored ? (
                        <>
                          <strong>{e.score}</strong>
                          {e.hasRange && (
                            <span className="report__fine">
                              {' '}
                              ({e.min}–{e.max})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="muted">no score</span>
                      )}
                    </td>
                    <td>
                      {r.coverage.used}/{r.coverage.selected}
                    </td>
                    <td>{r.why?.[0]?.replace(/^Strongest match: /, '') || '—'}</td>
                    <td>{gapText(r) || '—'}</td>
                    <td>{s.knownAnalog ? 'Catalogued analog' : s.isNewCandidate ? 'Uncatalogued candidate' : 'Not catalogued'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report__sec" aria-labelledby="r-cmp">
        <h2 id="r-cmp">4. Parameter comparison</h2>
        <p className="report__note">
          {focusFromShortlist ? 'The places selected for comparison' : 'The three top-ranked places'}, criterion by
          criterion: the measured or cited value, its evidence type, and similarity to {shortName(target.name)}. “—” = no
          value; missing data is left out of a score, never counted as zero.
        </p>
        {plain.length > 0 && <p className="report__lede">{plain[0]}</p>}
        <div className="report__scroll">
          <table className="report__table report__table--cmp">
            <thead>
              <tr>
                <th scope="col">Criterion (weight)</th>
                <th scope="col">{shortName(target.name)}</th>
                {focus.map((s) => (
                  <th key={s.id} scope="col">
                    {s.name}
                    <span className="report__fine"> · #{app.rankBySite[s.id]?.rank ?? '—'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {used.map((f) => {
                const tv = describeTargetValue(f, target)
                return (
                  <tr key={f.id}>
                    <th scope="row">
                      {f.label} <span className="report__fine">({app.weights[f.id]})</span>
                    </th>
                    <td>
                      {tv.text ?? '—'} {tv.status && <EvidenceTag status={tv.status} />}
                    </td>
                    {focus.map((s) => {
                      const v = describeSiteValue(f, s)
                      const sim = similarity(f, s.norm[f.id], target.norm[f.id])
                      return (
                        <td key={s.id}>
                          {v.text && !v.excluded ? v.text : '—'} {v.status && !v.excluded && <EvidenceTag status={v.status} />}
                          <span className={`report__sim${sim == null ? ' is-none' : sim >= 0.7 ? ' is-match' : ' is-differ'}`}>
                            {sim == null ? 'not scored' : `${pct(sim)} similar`}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr className="report__total">
                <th scope="row">Overall score</th>
                <td>—</td>
                {focus.map((s) => {
                  const e = entrySummary(app.rankBySite[s.id])
                  return <td key={s.id}>{e.scored ? `${e.score}/100${e.hasRange ? ` (${e.min}–${e.max})` : ''}` : 'no score'}</td>
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="report__sec" aria-labelledby="r-method">
        <h2 id="r-method">5. Similarity method</h2>
        <ol className="report__list">
          <li>
            Each Earth value is normalised to 0–1 with fixed Earth bounds (never the sample’s own min/max). Moon/Mars values
            beyond Earth’s range are clipped to the nearest bound (“as close as Earth gets”).
          </li>
          <li>
            Per criterion, similarity = 1 − |site − target| for numbers; for categories 1 = same class, 0.5 = related class,
            0 = different.
          </li>
          <li>
            Score = 100 × Σ(weight × similarity) / Σ(weight) over criteria with data on both sides, rounded half-up. Fewer
            than {data.minCriteria} usable criteria → no score.
          </li>
          <li>Score range = the score if every criterion missing for that place were a total mismatch or a perfect match.</li>
          <li>The same calculation runs in the Python pipeline and in the browser; a shared test fixture checks they agree.</li>
        </ol>
        <p className="report__fine">Full method and decisions: docs/methodology.md in the project repository.</p>
      </section>

      <section className="report__sec" aria-labelledby="r-src">
        <h2 id="r-src">6. Data sources</h2>
        <p className="report__note">Dataset used for each selected criterion, then the specific sources behind the values above.</p>
        <ul className="report__list">
          {used.map((f) => (
            <li key={f.id}>
              <strong>{f.label}:</strong> {f.source}
            </li>
          ))}
        </ul>
        {sourceRows.length > 0 && (
          <div className="report__scroll">
            <table className="report__table report__table--src">
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  <th scope="col">For</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((row) => (
                  <tr key={`${row.f.id}|${row.who}|${row.text}`}>
                    <td>{row.f.label}</td>
                    <td>{row.who}</td>
                    <td className="report__cite">{row.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="report__sec" aria-labelledby="r-lim">
        <h2 id="r-lim">7. Limitations and uncertainties</h2>
        <ul className="report__list">
          <li>{LIMITATIONS_NOTE}</li>
          <li>{MISSION_CAVEAT}</li>
          <li>{SCENARIO_LIMITATION}</li>
          <li>
            Climate values are NASA POWER reanalysis for a ~50 km grid cell; terrain relief is a 10 km-scale statistic.
            Neither describes a specific test traverse.
          </li>
          {missingEverywhere.length > 0 && (
            <li>No Earth place has data yet for: {missingEverywhere.map((f) => f.label).join(', ')} — not scored anywhere.</li>
          )}
          {unscored.length > 0 && (
            <li>
              {unscored.length} place{unscored.length === 1 ? '' : 's'} could not be scored (too few criteria with data):{' '}
              {unscored.map((r) => data.siteById[r.site].name).join(', ')}. Missing data is not a poor match.
            </li>
          )}
          <li>
            “Uncatalogued candidate” means far from every catalogued analog site — a lead for field checking, not a
            validated analog.
          </li>
        </ul>
      </section>

      <footer className="report__foot">
        <p>
          Reproduce this search: <span className="report__url">{reproduce}</span>
        </p>
        <p>
          Earth Analog Finder — independent NASA Space Apps Challenge 2026 project; not affiliated with or endorsed by NASA.
          Values come from the cited datasets and publications.
        </p>
      </footer>
    </article>
  )
}
