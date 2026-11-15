import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Disclosure from '../components/Disclosure.jsx'
import MatchLine from '../components/MatchLine.jsx'
import ScoreBars from '../components/ScoreBars.jsx'
import SITE_PREVIEWS from '../data/sitePreviews.json'
import TARGET_PREVIEWS from '../data/terrainPreviews.json'
import { mirrorRows, MIRROR_STATUS } from '../lib/mirror.js'
import TargetReference from '../components/TargetReference.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import MirrorTakeaway from '../components/MirrorTakeaway.jsx'
import TerrainPair from '../components/TerrainPair.jsx'
import TerrainPreview from '../components/TerrainPreview.jsx'
import Term from '../components/Term.jsx'
import {
  CitationText,
  ClippedTag,
  CoverageBadge,
  EvidenceCoverageTag,
  EvidenceTag,
  MockTag,
  NoveltyTag,
  ScoreBadge,
  SourceTag,
} from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { pointsLost, usableWeightFromSims } from '../lib/explain.js'
import { EVIDENCE, bodyLabel, describeSiteValue, describeTargetValue, formatCoord, pct, sourceKind } from '../lib/format.js'
import { MISSIONS, missionLabel as missionLabelOf } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS } from '../lib/rankMethods.js'
import { SCENARIO_LIMITATION, matchScenario } from '../lib/scenarios.js'
import { LIMITATIONS_NOTE, WHY_MAX_ITEMS, WHY_MIN_SIM, isMissing, scoreSite } from '../lib/scoring.js'
import { entrySummary, guaranteedMin, hasOpenRange, plainReliability } from '../lib/summary.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/site.css'

// Technical sections behind disclosures; each id is linkable (/site/:id#evidence).
const SECTIONS = ['evidence', 'similarity', 'limitations']

function sectionFromHash(hash) {
  const key = (hash || '').replace(/^#/, '')
  return SECTIONS.includes(key) ? key : null
}

const hasValue = (v) => v !== null && v !== undefined && v !== ''

/** "369.2–378.5 m" from a [low, high] pair; null unless both ends are known. */
function spanText(pair, units) {
  if (!Array.isArray(pair) || !hasValue(pair[0]) || !hasValue(pair[1])) return null
  return `${pair[0]}–${pair[1]}${units ? ` ${units}` : ''}`
}

// Provenance keys with their own row (or shown in the block head); anything else is listed generically.
const KNOWN_KEYS = new Set([
  'dataset',
  'parameter',
  'status',
  'value',
  'units',
  'period',
  'resolution',
  'method',
  'quality',
  'crossCheck',
  'nativeValue',
  'rangeAlignment',
  'range',
  'nComposites',
  'note',
  'excluded',
  'citation',
  'attribution',
  'url',
  'retrievedAt',
])

// Plain reading of the pipeline's DEM quality flag (docs/terrain_integration.md).
const QUALITY_NOTE = {
  primary: 'primary dataset for this criterion',
  'partner-fill': 'fill dataset, used where the primary dataset has no coverage',
}

/** "nComposites" -> "N composites" for provenance keys without a label of their own. */
function humanKey(key) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.slice(0, 1).toUpperCase() + words.slice(1)
}

/** Every provenance field that exists for one criterion, as [label, content] rows. */
function provenanceRows(f, p) {
  const rows = []
  const add = (label, content) => {
    if (hasValue(content)) rows.push([label, content])
  }
  // the head of the block carries the tag; this row spells the source type out
  const ev = EVIDENCE[p.status]
  add('Source type', ev ? `${ev.label} — ${ev.title}` : p.status)
  const link = p.url ? (
    <a href={p.url} target="_blank" rel="noreferrer">
      {p.dataset || `Source for ${f.label}`}
      <span className="sr-only"> (opens in new tab)</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : null
  add(p.dataset ? 'Dataset' : 'Source', link || p.dataset)
  add('Parameter', p.parameter)
  add('Period', p.period)
  add('Resolution', p.resolution)
  add('Method', p.method)
  add('Data quality', p.quality && (QUALITY_NOTE[p.quality] ? `${p.quality} — ${QUALITY_NOTE[p.quality]}` : p.quality))
  add('Cross-check', p.crossCheck)
  add('Value at native resolution', hasValue(p.nativeValue) ? `${p.nativeValue} ${p.units || ''}`.trim() : null)
  add(
    f.id === 'terrain' ? 'Lowest–highest across grid alignments' : 'Range across alignments',
    spanText(p.rangeAlignment, p.units),
  )
  add(f.id === 'veg' ? '10th–90th percentile of the composites' : 'Range', spanText(p.range, p.units))
  add('Composites used', p.nComposites)
  add('Note', p.note)
  add('Not used in score', p.excluded)
  add('Citation', p.citation && <CitationText text={p.citation} />)
  add('Attribution', p.attribution)
  add('Retrieved', p.retrievedAt && String(p.retrievedAt).slice(0, 10))
  for (const [key, value] of Object.entries(p)) {
    if (KNOWN_KEYS.has(key) || !hasValue(value)) continue
    add(humanKey(key), typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
  return rows
}

function Facts({ rows, className = '' }) {
  if (!rows.length) return null
  return (
    <dl className={`ev__facts ${className}`.trim()}>
      {rows.map(([label, content]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{content}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One block per criterion: the site's value, its source type and every provenance field. */
function SiteEvidence({ site, features, isMock }) {
  return (
    <ul className="ev-list">
      {features.map((f) => {
        const sv = describeSiteValue(f, site)
        const p = sv.provenance
        if (!p) {
          // mock / seed bundles: only a source label exists, plus the planned real source
          const src = site.sources?.[f.id]
          return (
            <li key={f.id} className="ev">
              <p className="ev__head">
                <span className="ev__name">{f.label}</span>
                <SourceTag source={src} />
                {sourceKind(src) === 'real' ? src : <span className="muted">{src || 'No value yet'}</span>}
              </p>
              <Facts rows={[[isMock ? 'Planned source (real data)' : 'Planned source', f.source]]} />
            </li>
          )
        }
        return (
          <li key={f.id} className="ev">
            <p className="ev__head">
              <span className="ev__name">{f.label}</span>
              {sv.text ? (
                <span className="ev__value">{sv.text}</span>
              ) : (
                <span className="tag tag--pending">Data pending</span>
              )}
              <EvidenceTag status={sv.status} />
              {sv.excluded && <span className="tag tag--excluded">Not used in score</span>}
            </p>
            <Facts rows={provenanceRows(f, p)} />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Display-only reading of a scoreSite result: which selected criteria cost the site
 * points and which were left out for lack of data. Uses the same similarities and
 * "points lost" as the breakdown table; nothing here changes a score.
 */
function readDifferences(result, site, target, weights, features) {
  const usable = usableWeightFromSims(result.sims, weights)
  const scored = result.score !== null && result.score !== undefined
  const losing = []
  const leftOut = []
  for (const f of features) {
    const w = weights[f.id] || 0
    if (w <= 0) continue
    const sim = result.sims[f.id]
    const row = { f, w, sim, sv: describeSiteValue(f, site), tv: describeTargetValue(f, target) }
    if (sim === null || sim === undefined) leftOut.push(row)
    else if (scored && sim < 1) losing.push({ ...row, lost: pointsLost(w, sim, usable) })
  }
  // The criterion the generated gap sentence is about (scoring.js: similarity under
  // WHY_MIN_SIM with the largest w × (1 − s); ties go to the first in feature order).
  let gapRow = null
  for (const r of losing) {
    if (r.sim < WHY_MIN_SIM && (gapRow === null || r.w * (1 - r.sim) > gapRow.w * (1 - gapRow.sim))) gapRow = r
  }
  const further = losing
    .filter((r) => r !== gapRow && r.lost >= 0.05) // would print as "−0.0 pts" below that
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 3)
  return { gapRow, further, leftOut }
}

/**
 * "Criterion: site value vs the target's value (−x.x pts)". Values without provenance
 * (mock / seed bundles) keep their MOCK / Unverified label, as in the breakdown table.
 */
function DifferenceLine({ row, site, target }) {
  const { f, sv, tv } = row
  return (
    <>
      <strong>{f.label}:</strong> {sv.text ?? '—'} {!sv.status && <SourceTag source={site.sources?.[f.id]} />}{' '}
      <span className="muted">vs the target’s</span> {tv.text ?? '—'}{' '}
      {!tv.status && <SourceTag source={target.refs?.[f.id]} />}
      <ClippedTag direction={tv.clipped} /> <span className="pts-lost">(−{row.lost.toFixed(1)} pts)</span>
    </>
  )
}

/**
 * Shown where no sourced terrain image exists for this place: every selected criterion with the
 * value here, the target's value, the scored similarity and the evidence type. Missing stays "—".
 */
function EvidenceTable({ site, target, weights, features, onEvidence }) {
  const rows = mirrorRows(target, site, weights, features).filter((r) => r.status !== 'unused')
  return (
    <section className="card site-evtable" aria-labelledby="site-evtable-title">
      <h2 id="site-evtable-title">Side by side: the measured values</h2>
      <p className="site-gap__detail">
        No terrain image exists for this place yet, so here are the values behind the score instead.
      </p>
      <div className="site-evtable__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">{site.name}</th>
              <th scope="col">Target ({bodyLabel(target.body)})</th>
              <th scope="col">Similarity</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.feature.id} className={`is-${r.status}`}>
                <th scope="row">{r.feature.label}</th>
                <td>{r.site.text ?? <span className="tag tag--pending">Data pending</span>}</td>
                <td>
                  {r.target.text ?? <span className="tag tag--pending">No value</span>}{' '}
                  <ClippedTag direction={r.target.clipped} />
                </td>
                <td>
                  {r.sim === null ? (
                    <span className="muted">not scored</span>
                  ) : (
                    <>
                      <span aria-hidden="true">{MIRROR_STATUS[r.status].symbol} </span>
                      {pct(r.sim)}
                    </>
                  )}
                </td>
                <td>{r.site.status ? <EvidenceTag status={r.site.status} /> : <SourceTag source={site.sources?.[r.feature.id]} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="site-summary__more">
        <a href="#evidence" onClick={onEvidence}>
          View evidence: units, coverage and sources
        </a>
      </p>
    </section>
  )
}

/** A selected criterion without a similarity: say why, never show it as a difference of 0. */
function LeftOutLine({ row, site }) {
  const { f, sv } = row
  if (sv.excluded) {
    return (
      <>
        <strong>{f.label}:</strong> {sv.text ?? '—'} <span className="tag tag--excluded">Not used in score</span>
        <span className="site-list__why">{sv.excluded}</span>
      </>
    )
  }
  if (isMissing(site.norm[f.id])) {
    return (
      <>
        <strong>{f.label}:</strong> <span className="tag tag--pending">Data pending</span> — not counted
        {sv.note && <span className="site-list__why">{sv.note}</span>}
      </>
    )
  }
  return (
    <>
      <strong>{f.label}:</strong> <span className="tag tag--pending">Data pending</span> — not counted
      <span className="site-list__why">The target site has no value for this criterion.</span>
    </>
  )
}

export default function SiteDetails() {
  const { id } = useParams()
  const { data } = useBundle()
  const app = useAppState()
  const location = useLocation()
  const site = data.siteById[id]

  // Which technical sections are open. A hash (#evidence, #similarity, #limitations)
  // opens its section; read once up front because AppState's URL sync may drop the hash.
  const [open, setOpen] = useState(() => {
    const key = sectionFromHash(location.hash)
    return key ? { [key]: true } : {}
  })
  const setSection = (key, isOpen) => setOpen((o) => (Boolean(o[key]) === isOpen ? o : { ...o, [key]: isOpen }))

  // A later hash change (in-app link, back/forward) opens its section too; it never closes one.
  const [seenHash, setSeenHash] = useState(location.hash)
  if (location.hash !== seenHash) {
    setSeenHash(location.hash)
    const key = sectionFromHash(location.hash)
    if (key) setSection(key, true)
  }

  useEffect(() => {
    const key = sectionFromHash(location.hash)
    if (!key) return undefined
    // scroll once the section has opened and been laid out
    const frame = requestAnimationFrame(() => document.getElementById(key)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [location.hash])

  if (!site) {
    return (
      <section className="page empty-state">
        <h1>Unknown site</h1>
        <p>No Earth site with id “{id}”.</p>
        <p>
          <Link to={app.linkTo('/explore')}>← Back to results</Link>
        </p>
      </section>
    )
  }

  // In-page jump: open the section, then move the view and keyboard focus to it.
  const jumpTo = (key) => (event) => {
    event.preventDefault()
    setSection(key, true)
    requestAnimationFrame(() => {
      const el = document.getElementById(key)
      el?.scrollIntoView({ block: 'start' })
      el?.querySelector('summary')?.focus({ preventScroll: true })
    })
  }
  const jump = (key, label) => (
    <a href={`#${key}`} onClick={jumpTo(key)}>
      {label}
    </a>
  )

  const target = app.target
  const result = target ? scoreSite(target, site, app.weights, data.features, data.minCriteria) : null
  const scored = Boolean(result) && result.score !== null && result.score !== undefined
  const ranked = target ? app.rankBySite[site.id] : null
  const listed = app.shortlist.includes(site.id)
  const scoredCount = app.ranking.filter((r) => r.score !== null).length
  const method = RANK_METHODS[app.rankBy] || RANK_METHODS.score
  // same wording as the Explore header
  const missionLabel = missionLabelOf(app)
  const scenario = target && !app.isCustom ? matchScenario(app.targetId, app.presetId) : null
  const diff = result ? readDifferences(result, site, target, app.weights, data.features) : null
  const openRange = scored && hasOpenRange(result)
  const summary = entrySummary(result)
  const fullCoverage = Boolean(result) && result.coverage.used === result.coverage.selected
  // "What matches": the criteria at least WHY_MIN_SIM similar that earn the most points (the same
  // rule and order as the scored `why`), each with its measured values and evidence type.
  const matchRows =
    target && scored
      ? mirrorRows(target, site, app.weights, data.features)
          .filter((r) => r.status === 'match')
          .sort((a, b) => b.weight * b.sim - a.weight * a.sim)
          .slice(0, WHY_MAX_ITEMS)
      : []
  // A criterion listed under "What matches" is not repeated as a difference (its % similar says how close).
  const matchIds = new Set(matchRows.map((r) => r.feature.id))
  const furtherRows = diff ? diff.further.filter((r) => !matchIds.has(r.f.id)) : []
  // Terrain imagery only where both sourced previews exist; otherwise the evidence table.
  const hasImagery = Boolean(target && !data.isMock && TARGET_PREVIEWS[target.id] && SITE_PREVIEWS[site.id])

  return (
    <article className="page site">
      <p className="crumbs">
        <Link to={app.linkTo('/explore')}>← Back to results</Link>
      </p>

      <p className="kicker site__kicker">Research dossier · Earth candidate</p>
      <header className="site__head">
        <div className="site__id">
          <h1>{site.name}</h1>
          <p className="site__where">
            {site.country} · {formatCoord(site.lat, site.lon)}{' '}
            <span className="hint">· coordinate precision: {site.coord?.precision || 'approximate — verify'}</span>
          </p>
          <p className="site__status">
            <Term id={site.isNewCandidate ? 'uncatalogued' : 'catalogued'}>
              <NoveltyTag site={site} />
            </Term>
            <span>
              {site.knownAnalog
                ? 'Published analog site'
                : site.isNewCandidate
                  ? `Nearest catalogued analog: ${site.novelKm} km away — a lead for field checking, not a validated analog`
                  : `Nearest catalogued analog: ${site.novelKm} km away`}
            </span>
            {data.isMock && <MockTag />}
          </p>
          {site.analogRef && (
            <p className="site__ref">
              Analog reference: <CitationText text={site.analogRef} />
            </p>
          )}
          {site.notes && (
            <p className="site__ref">
              Note: <CitationText text={site.notes} />
            </p>
          )}
        </div>
        <div className="site__actions">
          <a className="btn btn--ghost site__evidence-btn" href="#evidence" onClick={jumpTo('evidence')}>
            View evidence
            <span className="sr-only">: values, units, coverage and sources for {site.name}</span>
          </a>
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
          {app.target && (
            <Link className="btn btn--ghost" to={app.linkTo('/mirror', { site: site.id })}>
              Mirror with {app.target.body === 'moon' ? 'the Moon' : 'Mars'}
              <span className="sr-only">: see {site.name} beside {app.target.name}</span>
            </Link>
          )}
        </div>
      </header>

      {!target ? (
        <section className="card card--raised site__prompt" aria-labelledby="site-prompt-title">
          <h2 id="site-prompt-title">Pick a target site to score this Earth site</h2>
          <p className="muted">Choose the Moon or Mars site to compare it with.</p>
          <TargetSelect id="site-target" label="Target site" targets={data.targets} value={null} onChange={app.setTarget} />
        </section>
      ) : (
        <>
          <p className="site-result" aria-label="Result summary">
            {scored ? (
              <>
                {ranked?.rank && (
                  <span className="site-result__rank">
                    #{ranked.rank} <span className="muted">of {scoredCount}</span>
                  </span>
                )}
                <span>
                  <Term id="score">Similarity</Term> <strong>{result.score}</strong>
                  <span className="muted">/100</span>
                  {openRange && <span className="muted"> (could be {result.scoreRange[0]}–{result.scoreRange[1]})</span>}
                </span>
              </>
            ) : (
              <span>
                <strong>No score</strong> — insufficient data
              </span>
            )}
            <CoverageBadge coverage={result.coverage} />
            <span className="muted">
              vs {target.name.split(' — ')[0]} ({bodyLabel(target.body)}) · {missionLabel}
            </span>
          </p>

          <div className="site-three">
            <section className="card" aria-labelledby="site-match-title">
              <h2 id="site-match-title">What matches?</h2>
              {matchRows.length ? (
                <ul className="site-list site-list--match">
                  {matchRows.map((row) => (
                    <li key={row.feature.id}>
                      <MatchLine row={row} site={site} target={target} />
                    </li>
                  ))}
                </ul>
              ) : scored ? (
                <p className="muted">No selected criterion reaches {Math.round(WHY_MIN_SIM * 100)}% similarity.</p>
              ) : (
                <p className="muted">No score — insufficient data, so no matches are listed.</p>
              )}
            </section>

            <section className="card" aria-labelledby="site-differ-title">
              <h2 id="site-differ-title">What’s different?</h2>
              <p className="site-gap">
                {diff.gapRow && 'Largest shortfall: '}
                {/* Display only: "No gaps" would read as "nothing missing" when some criteria have no data. */}
                {scored && !diff.gapRow && diff.leftOut.length > 0 ? 'No large differences where data exist' : result.gap}
                {scored && !diff.gapRow && (
                  <span className="site-gap__detail">
                    Every selected criterion with data is at least {Math.round(WHY_MIN_SIM * 100)}% similar to the
                    target.
                    {diff.leftOut.length > 0 &&
                      ` But ${diff.leftOut.length} ${diff.leftOut.length === 1 ? 'characteristic was' : 'characteristics were'} not measured or not usable here (listed below), so differences there are unknown.`}
                  </span>
                )}
                {diff.gapRow && (
                  <span className="site-gap__detail">
                    <DifferenceLine row={diff.gapRow} site={site} target={target} />
                  </span>
                )}
              </p>
              {furtherRows.length > 0 && (
                <>
                  <h3>{diff.gapRow ? 'Also costing points' : 'Smaller differences'}</h3>
                  <ul className="site-list site-list--differ">
                    {furtherRows.map((row) => (
                      <li key={row.f.id}>
                        <DifferenceLine row={row} site={site} target={target} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="card" aria-labelledby="site-unknown-title">
              <h2 id="site-unknown-title">What still needs measuring?</h2>
              {diff.leftOut.length > 0 ? (
                <>
                  <p className="site-gap__detail">Not measured or not usable here, so left out of the score (never counted as zero):</p>
                  <ul className="site-list site-list--pending">
                    {diff.leftOut.map((row) => (
                      <li key={row.f.id}>
                        <LeftOutLine row={row} site={site} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="site-gap__detail">Every selected criterion has data for this place and the target.</p>
              )}
              <h3>In the field</h3>
              <p className="site-gap__detail">
                {(MISSIONS[app.isCustom ? 'balanced' : app.presetId] || MISSIONS.balanced).fieldMeasure} This tool
                compares landscape-scale values from global datasets only.
              </p>
              <p className="site-summary__more">{jump('evidence', 'View evidence')}</p>
            </section>
          </div>

          <section className="card card--raised site-summary" aria-labelledby="site-summary-title">
            <div className="site-summary__head">
              <h2 id="site-summary-title">
                Compared with {target.name} <span className="muted">({bodyLabel(target.body)})</span>
              </h2>
              <p className="site-summary__mission">
                Research objective: <strong>{missionLabel}</strong>
                {data.isMock && (
                  <>
                    {' '}
                    · <MockTag /> scores from synthetic data
                  </>
                )}
              </p>
            </div>

            {/* The plain questions come first; the expert figures follow in the same card. */}
            <div className="site-answers">
              <section className="site-answer" aria-labelledby="site-why-title">
                <h3 id="site-why-title">Why this match?</h3>
                <p>
                  {scored ? (
                    <>
                      {ranked?.rank ? `Ranked #${ranked.rank} of ${scoredCount}` : 'Scored'} with a match score of{' '}
                      <strong>{result.score}/100</strong>.{' '}
                      {summary.match ? (
                        <>
                          Strongest similarity: <strong>{summary.match}</strong>.
                        </>
                      ) : (
                        'No characteristic is a close match.'
                      )}
                    </>
                  ) : (
                    'It could not be scored, so it is listed but not recommended.'
                  )}{' '}
                  {site.knownAnalog
                    ? 'It is also a published analog site.'
                    : site.isNewCandidate
                      ? 'It is an uncatalogued candidate: a lead worth field checking, not a validated analog.'
                      : ''}
                </p>
              </section>
              <section className="site-answer site-answer--reliability" aria-labelledby="site-reliable-title">
                <h3 id="site-reliable-title">How reliable is this result?</h3>
                <p>{plainReliability(result, data.minCriteria)}</p>
              </section>
            </div>

            {scored ? (
              <dl className="site-stats">
                <div className="stat">
                  <dt className="stat__label">
                    <Term id="score">Similarity</Term>
                  </dt>
                  <dd className="stat__value">
                    <ScoreBadge score={result.score} large />
                  </dd>
                  <dd className="stat__note">how closely it resembles the target · not mission suitability</dd>
                </div>
                <div className={`stat${app.rankBy === 'min' ? ' is-key' : ''}`}>
                  <dt className="stat__label">
                    <Term id="min">Conservative lower bound</Term>
                  </dt>
                  <dd className="stat__value">
                    {guaranteedMin(result)}
                    <span className="site-stats__of">/100</span>
                  </dd>
                  <dd className="stat__note">
                    {openRange ? 'score if every missing value were a total mismatch' : 'equals the similarity: nothing missing'}
                    {app.rankBy === 'min' && ' · used for the ranking'}
                  </dd>
                </div>
                <div className="stat">
                  <dt className="stat__label">
                    <Term id="range">Possible range</Term>
                  </dt>
                  <dd className={`stat__value${openRange ? '' : ' stat__value--sm'}`}>
                    {openRange ? `${result.scoreRange[0]}–${result.scoreRange[1]}` : 'No data gaps'}
                  </dd>
                  <dd className="stat__note">
                    {openRange
                      ? 'depends on criteria with no data for this site'
                      : fullCoverage
                        ? 'every selected criterion has data'
                        : 'the criteria left out have no target value'}
                  </dd>
                </div>
                <div className="stat">
                  <dt className="stat__label">
                    <Term id="evidence">Evidence coverage</Term>
                  </dt>
                  <dd className="stat__value stat__value--sm">
                    <EvidenceCoverageTag target={target} site={site} weights={app.weights} features={data.features} />
                  </dd>
                  <dd className="stat__note">
                    <Term id="coverage">
                      <CoverageBadge coverage={result.coverage} />
                    </Term>
                  </dd>
                </div>
                {ranked?.rank && (
                  <div className="stat">
                    <dt className="stat__label">Rank</dt>
                    <dd className="stat__value">
                      #{ranked.rank}
                      <span className="site-stats__of">of {scoredCount} scored</span>
                    </dd>
                    <dd className="stat__note">
                      <Term id="rankBy">ranked by {method.label}</Term>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <>
                <p className="site-summary__none">
                  <Term id="noScore">
                    <ScoreBadge score={null} large />
                  </Term>
                  <Term id="coverage">
                    <CoverageBadge coverage={result.coverage} />
                  </Term>
                </p>
                <p className="site-summary__reason">{result.gap}</p>
                <p className="hint">
                  This is different from a low score: missing data is never counted as zero. A score needs at least{' '}
                  {data.minCriteria} criteria with data.
                </p>
              </>
            )}

            <p className="site-summary__more">
              {jump('similarity', 'How this score is calculated')}
              {jump('evidence', 'View evidence: values, units, sources')}
            </p>
          </section>


        </>
      )}

      {target && !hasImagery && (
        <EvidenceTable site={site} target={target} weights={app.weights} features={data.features} onEvidence={jumpTo('evidence')} />
      )}

      {target && hasImagery && (
        <div className="site__terrain">
          <TerrainPair target={target} site={site} isMock={data.isMock} linkTo={app.linkTo} />
          {!data.isMock && (
            <MirrorTakeaway
              target={target}
              site={site}
              weights={app.weights}
              features={data.features}
              presetId={app.presetId}
              isCustom={app.isCustom}
              scored={scored}
            />
          )}
        </div>
      )}

      {target && (
          <section className="card site-relevance" aria-labelledby="site-relevance-title">
            <h2 id="site-relevance-title">What this means for research</h2>
            {app.isCustom ? (
              <p>
                <strong>Custom weights:</strong> this comparison uses custom criterion weights, so it reflects those priorities rather
                than a preset research objective.
              </p>
            ) : (
              <p>
                <strong>Research objective — {missionLabel}:</strong> {PRESETS[app.presetId]?.rationale}
              </p>
            )}
            {scenario && (
              <p>
                <strong>Screening for:</strong> {scenario.screening}
              </p>
            )}
            {site.knownAnalog ? (
              <p>
                <strong>Catalogued analog:</strong>{' '}
                {site.analogRef ? (
                  <>
                    this site has a published analog reference — <CitationText text={site.analogRef} />. The reference
                    belongs to the site: it is the same whichever target site and research objective you choose, so
                    check what it actually studied.
                  </>
                ) : (
                  'this site is on this project’s reference list of known analog sites.'
                )}
              </p>
            ) : site.isNewCandidate ? (
              <p>
                <strong>Uncatalogued candidate:</strong> the nearest catalogued analog is {site.novelKm} km away and we
                found no peer-reviewed analog study of this site. Treat it as a lead for field checking, not a
                validated analog.
              </p>
            ) : (
              <p>
                <strong>Near a catalogued analog:</strong> the nearest catalogued analog is {site.novelKm} km away;
                this site itself is not on the reference list.
              </p>
            )}
            <p className="site-relevance__caveat">
              <strong>What the score means:</strong> a high score means this Earth site resembles the target site on
              the selected criteria — not that it is suitable for a mission. {SCENARIO_LIMITATION}
            </p>
          </section>
      )}

      <p className="card card--accent site-limit" role="note">
        <strong>Limitation:</strong> {LIMITATIONS_NOTE} {jump('limitations', 'More limitations')}
      </p>

      <h2 className="site__more-title">Full scientific detail</h2>

      <Disclosure
        id="evidence"
        className="site-detail"
        title="Scientific evidence"
        hint="measured values, units, sources"
        open={Boolean(open.evidence)}
        onToggle={(isOpen) => setSection('evidence', isOpen)}
      >
        <p className="site-detail__lead">
          {data.isMock ? (
            <>
              <MockTag /> This build uses synthetic placeholder values, so the entries below are labels, not
              measurements.
            </>
          ) : (
            <>
              The value used for this Earth site on each criterion, with its units, source type and where it came from.{' '}
              <Term id="reanalysis">Reanalysis</Term> values are averages for a grid cell, not a station at the exact
              point; <Term id="relief">terrain relief</Term> is measured over a 10 × 10 km window.
            </>
          )}
        </p>

        <h3>Values for {site.name}</h3>
        <SiteEvidence site={site} features={data.features} isMock={data.isMock} />

        {site.coord?.source && (
          <>
            <h3>Coordinates and elevation</h3>
            <Facts
              className="ev__facts--wide"
              rows={[
                ['Coordinates', formatCoord(site.lat, site.lon)],
                ['Source', <CitationText key="source" text={site.coord.source} />],
                ...(site.coord.precision ? [['Precision', site.coord.precision]] : []),
                ...(hasValue(site.coord.elevM)
                  ? [['Elevation', `${site.coord.elevM} m${site.coord.elevSource ? ` (${site.coord.elevSource})` : ''}`]]
                  : []),
              ]}
            />
          </>
        )}

        {target && (
          <>
            <TargetReference
              className="disclosure--flush"
              target={target}
              features={data.features}
              isMock={data.isMock}
              open
            />
            {!data.isMock && (
              <>
                <h3>Terrain of the target site</h3>
                <TerrainPreview targetId={target.id} isMock={data.isMock} />
              </>
            )}
            {target.trekUrl && (
              <p className="site-detail__links">
                <a href={target.trekUrl} target="_blank" rel="noreferrer">
                  View {target.name} in NASA {bodyLabel(target.body)} Trek
                  <span className="sr-only"> (opens in new tab)</span>
                  <span aria-hidden="true"> ↗</span>
                </a>
              </p>
            )}
          </>
        )}
      </Disclosure>

      {target && (
        <Disclosure
          id="similarity"
          className="site-detail"
          title="Similarity explanation"
          hint="per-criterion breakdown, missing data, range"
          open={Boolean(open.similarity)}
          onToggle={(isOpen) => setSection('similarity', isOpen)}
        >
          <p className="site-detail__lead">
            The similarity score is a weighted average. On each selected criterion the site gets a similarity to the
            target site from 0 % to 100 %; each similarity counts in proportion to its weight. Criteria with missing
            data are left out of the score, not counted as zero, and a score needs at least {data.minCriteria} criteria
            with data.
          </p>
          <p className="site-detail__lead">
            The possible range shows where the score could land if the criteria missing for this site were a total
            mismatch (low end) or a perfect match (high end). It comes from missing data — it is not a statistical
            confidence interval. Under “{RANK_METHODS.min.label}”, sites are ranked by the low end of that range.
          </p>
          <p className="site-detail__lead">
            <strong>This site:</strong>{' '}
            {scored ? (
              <>
                score {result.score} of 100
                {openRange
                  ? `, possible range ${result.scoreRange[0]}–${result.scoreRange[1]}`
                  : ', no data gaps that could move it'}
                , from {result.coverage.used} of {result.coverage.selected} selected criteria with data.
              </>
            ) : (
              <>
                No score — insufficient data ({result.coverage.used} of {result.coverage.selected} selected criteria
                have data).
              </>
            )}
          </p>
          <ScoreBars site={site} target={target} weights={app.weights} features={data.features} result={result} />
        </Disclosure>
      )}

      <Disclosure
        id="limitations"
        className="site-detail"
        title="Limitations"
        hint="what an Earth analog cannot reproduce"
        open={Boolean(open.limitations)}
        onToggle={(isOpen) => setSection('limitations', isOpen)}
      >
        <ul className="site-detail__list">
          <li>{LIMITATIONS_NOTE}</li>
          <li>
            An Earth analog resembles the real environment only in some respects. Gravity, the atmosphere (or vacuum),
            radiation, dust behaviour and illumination are either not reproduced on Earth or not assessed by this tool.
          </li>
          {data.isMock ? (
            <li>
              <MockTag /> This build uses synthetic placeholder values. Scores, similarities and site values are not
              NASA observations and must not be used for planning.
            </li>
          ) : (
            <>
              <li>
                Terrain relief is the height difference across a 10 × 10 km window: a landscape-scale measure, not a
                description of the ground under a rover or a habitat.
              </li>
              <li>
                Climate values are NASA POWER reanalysis averages for a ~50 km grid cell, not station measurements at
                this exact point. Target temperatures are surface (skin/regolith) temperatures, compared with Earth
                skin temperature.
              </li>
            </>
          )}
          <li>{SCENARIO_LIMITATION}</li>
          <li>
            Criteria without data are left out of the score, never counted as zero. A score range comes from that
            missing data; it is not a statistical confidence interval.
          </li>
          <li>
            The score measures resemblance on the selected criteria only. It does not justify a claim that this site is
            suitable for any mission.
          </li>
          {site.isNewCandidate && (
            <li>
              “Uncatalogued candidate” means only that this site is more than 300 km from every site in this project’s
              analog reference list and we found no peer-reviewed analog study of it. It has not been validated as an
              analog.
            </li>
          )}
        </ul>
        <p className="site-detail__links">
          <Link to={app.linkTo('/about')}>Method and limitations of the whole project</Link>
        </p>
      </Disclosure>
    </article>
  )
}
