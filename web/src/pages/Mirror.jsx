import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CitationText, EvidenceTag, MockTag, NoveltyTag } from '../components/Tags.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import Term from '../components/Term.jsx'
import SITE_PREVIEWS from '../data/sitePreviews.json'
import TERRAIN_MESHES from '../data/terrainMeshes.json'
import TARGET_PREVIEWS from '../data/terrainPreviews.json'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel, formatCoord, pct } from '../lib/format.js'
import { MIRROR_STATUS, SHARED_KM, cropOf, defaultCriterion, mirrorRows } from '../lib/mirror.js'
import { missionLabel } from '../lib/missions.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { entrySummary, plainReliability } from '../lib/summary.js'
import { useAppState } from '../state/AppState.jsx'
import { hasWebGL } from '../three/support.js'
import '../styles/mirror.css'
import '../styles/three.css'

// three.js and the elevation grids load only when someone opens the 3D terrain view.
const TerrainPair3D = lazy(() => import('../three/TerrainPair3D.jsx'))
const EXAGS = [1, 2, 4]

const fmtM = (v) => `${Math.round(v).toLocaleString('en-US')} m`

/** One side of the mirror: a real shaded-relief image with its scale, legend and source. */
function TerrainPanel({ side, world, name, entry, isMock, highlight, notes, sourceLine, crit, orientation = 'north up' }) {
  const sideLabel = side === 'planet' ? `${world} · planetary reference` : 'Earth · candidate place'
  if (isMock || !entry) {
    return (
      <figure className={`mirror-panel mirror-panel--${side}`}>
        <figcaption className="mirror-panel__head">
          <span className="mirror-panel__side">{sideLabel}</span>
          <span className="mirror-panel__name">{name}</span>
        </figcaption>
        <div className="mirror-panel__frame mirror-panel__frame--missing">
          <p>{isMock ? 'Terrain images are shown only with the real data bundle.' : 'No terrain image for this place yet.'}</p>
          <CritBadge crit={crit} />
        </div>
      </figure>
    )
  }
  const c = cropOf(entry)
  const ramp = entry.elevation.ramp
  const gradient = ramp.map(([, hex], i) => `${hex} ${Math.round((i / (ramp.length - 1)) * 100)}%`).join(', ')
  return (
    <figure className={`mirror-panel mirror-panel--${side}`}>
      <figcaption className="mirror-panel__head">
        <span className="mirror-panel__side">{sideLabel}</span>
        <span className="mirror-panel__name">{name}</span>
      </figcaption>
      <div className="mirror-panel__frame">
        <img
          className="mirror-panel__img"
          src={`${import.meta.env.BASE_URL}${entry.image}`}
          style={c.img}
          alt={`Shaded-relief elevation map, ${c.km.toFixed(0)} km across, centred on ${name}. A ring marks the point, a square the 10 by 10 km window where terrain relief is measured, and a bar 10 km.`}
          decoding="async"
        />
        <span className={`mirror-panel__square${highlight ? ' is-on' : ''}`} style={c.square} aria-hidden="true" />
        <CritBadge crit={crit} />
      </div>
      <div className="mirror-panel__cap">
        <p className="mirror-panel__scale">
          {c.km.toFixed(0)} km across · square = 10 × 10 km · {entry.metresPerPixel} m per pixel · {orientation} · no
          vertical exaggeration
        </p>
        <div className="mirror-legend">
          <span>{fmtM(entry.elevation.minM)}</span>
          <span className="mirror-legend__ramp" style={{ background: `linear-gradient(to right, ${gradient})` }} aria-hidden="true" />
          <span>{fmtM(entry.elevation.maxM)}</span>
          <span className="sr-only"> is the elevation range of the colours in this image</span>
        </div>
        <p className="mirror-panel__src">{sourceLine}</p>
        {notes.filter(Boolean).map((n) => (
          <p key={n} className="mirror-panel__note">
            {n}
          </p>
        ))}
      </div>
    </figure>
  )
}

/**
 * The selected characteristic's value on this side, pinned to the picture so both sides light up
 * together. Re-keyed per criterion so the reveal replays on every change.
 */
function CritBadge({ crit }) {
  if (!crit) return null
  return (
    <p key={crit.id} className={`mirror-panel__crit mirror-panel__crit--${crit.status} reveal`}>
      <span className="mirror-panel__crit-label">{crit.label}</span>
      <strong>{crit.text ?? 'no value'}</strong>
    </p>
  )
}

/** Value + provenance for one side of the selected criterion. */
function ValueBlock({ side, name, value, missing }) {
  const p = value.provenance
  return (
    <div className={`mirror-value mirror-value--${side}`}>
      <p className="mirror-value__who">{name}</p>
      {value.text && !missing ? (
        <p className="mirror-value__text">
          {value.text} {value.status && <EvidenceTag status={value.status} />}
        </p>
      ) : (
        <p className="mirror-value__text mirror-value__text--missing">No value — not used in the score</p>
      )}
      {value.excluded && <p className="mirror-value__note">Shown but not scored: {value.excluded}</p>}
      {p && (
        <ul className="mirror-value__src">
          {p.dataset && (
            <li>
              <strong>Source:</strong> {p.dataset}
              {p.parameter && ` (${p.parameter})`}
              {p.period && `, ${p.period}`}
            </li>
          )}
          {p.resolution && (
            <li>
              <strong>Resolution:</strong> {p.resolution}
            </li>
          )}
          {p.method && (
            <li>
              <strong>Method:</strong> {p.method}
            </li>
          )}
          {p.citation && (
            <li>
              <strong>Citation:</strong> <CitationText text={p.citation} />
            </li>
          )}
          {p.note && !value.excluded && (
            <li>
              <strong>Note:</strong> {p.note}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Planetary Mirror — two worlds, one comparison. A Moon/Mars target and one Earth place side by
 * side: real shaded-relief images at one shared ground scale, the scored characteristics between
 * them, and the evidence for the selected one below. Display only: every number is the existing
 * score, similarity or provenance; nothing is re-scored or exaggerated.
 */
export default function Mirror() {
  const { data } = useBundle()
  const app = useAppState()
  const [params, setParams] = useSearchParams()
  const [webgl] = useState(hasWebGL)
  const [failed3d, setFailed3d] = useState(false)

  const setParam = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const target = app.target
  const scored = app.ranking.filter((r) => r.score !== null)
  const siteParam = params.get('site')
  const site = data.siteById[siteParam] || (scored[0] && data.siteById[scored[0].site]) || null
  const isDefaultSite = !data.siteById[siteParam]

  useEffect(() => {
    if (site && target) document.title = `Mirror: ${target.name} ↔ ${site.name} – Earth Analog Finder`
  }, [site, target])

  if (!target) {
    return (
      <section className="page empty-state">
        <h1>Planetary Mirror</h1>
        <p className="muted">Choose a Moon or Mars site to mirror against Earth.</p>
        <TargetSelect id="mirror-target-empty" label="Moon or Mars site" targets={data.targets} value={null} onChange={app.setTarget} />
      </section>
    )
  }
  if (!site) {
    return (
      <section className="page empty-state">
        <h1>Planetary Mirror</h1>
        <p>No Earth place can be scored with these weights yet.</p>
        <Link to={app.linkTo('/explore')}>← Back to the map</Link>
      </section>
    )
  }

  const entry = app.rankBySite[site.id]
  const summary = entrySummary(entry)
  const rows = mirrorRows(target, site, app.weights, data.features)
  const critId = rows.some((r) => r.feature.id === params.get('crit')) ? params.get('crit') : defaultCriterion(rows)
  const crit = rows.find((r) => r.feature.id === critId)
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})
  // Three-question summary: matches by points earned, differences by points lost, then gaps.
  const matches = rows.filter((r) => r.status === 'match').sort((a, b) => b.weight * b.sim - a.weight * a.sim)
  const differs = rows.filter((r) => r.status === 'differ').sort((a, b) => b.weight * (1 - b.sim) - a.weight * (1 - a.sim))
  const missing = rows.filter((r) => r.status === 'missing')
  const world = bodyLabel(target.body)
  const tPrev = TARGET_PREVIEWS[target.id]
  const sPrev = SITE_PREVIEWS[site.id]
  const missingTargetSide = crit?.missingSide === 'target' || crit?.missingSide === 'both'
  const missingSiteSide = crit?.missingSide === 'site' || crit?.missingSide === 'both'
  const terrainSelected = crit?.feature.id === 'terrain'
  // The selected characteristic pinned to each picture (value or "no value").
  const critSide = (side, missingHere) =>
    crit && { id: crit.feature.id, label: crit.feature.label, status: crit.status, text: missingHere ? null : side.text }
  // One short sentence that links the highlighted values to the full evidence below.
  const critExplain = !crit
    ? null
    : crit.status === 'unused'
      ? `${crit.feature.label} has weight 0 in this objective, so it does not affect the score.`
      : crit.sim === null
        ? `${crit.feature.label} is not scored here: a value is missing, and missing data is never counted as zero.`
        : `${crit.feature.label}: ${crit.site.text ?? '—'} here vs ${crit.target.text ?? '—'} on ${world} — ${pct(crit.sim)} similar.`

  // 3D terrain: only where both sides have an exported elevation grid (real bundle only).
  const meshT = !data.isMock && TERRAIN_MESHES[`target:${target.id}`]
  const meshS = !data.isMock && TERRAIN_MESHES[`site:${site.id}`]
  const can3d = Boolean(meshT && meshS && tPrev && sPrev)
  const want3d = params.get('view') === '3d'
  const show3d = can3d && want3d && webgl && !failed3d
  const exag = EXAGS.includes(Number(params.get('vx'))) ? Number(params.get('vx')) : 2
  const side3d = (meta, prev, name, sideLabel, heightRef, source, c) => ({
    meta,
    ramp: prev.elevation.ramp,
    rampRange: [prev.elevation.minM, prev.elevation.maxM],
    name,
    sideLabel,
    heightRef,
    source,
    crit: c,
  })

  const options = app.ranking.map((r) => {
    const s = data.siteById[r.site]
    const e = entrySummary(r)
    // With "most complete evidence first" a high score can rank low; its range says why.
    const score = !e.scored ? ' — no score' : ` — ${e.score}/100${e.hasRange ? ` (could be ${e.min}–${e.max})` : ''}`
    return { id: s.id, label: `${r.rank ? `#${r.rank} ` : ''}${s.name}${score}` }
  })

  return (
    <article className={`page mirror mirror--${target.body}`}>
      <header className="mirror__head">
        <div className="mirror__intro">
          <p className="kicker">Planetary Mirror</p>
          <h1>Two worlds, one comparison</h1>
          <p className="mirror__lede">
            {target.name} on {world}, beside {site.name} on Earth: the same {SHARED_KM.toFixed(0)} km of ground on each
            side, drawn from the elevation data the score was measured on. Choose a characteristic between them to see
            its evidence.
          </p>
        </div>
        <div className="mirror__controls">
          <TargetSelect id="mirror-target" label="Moon or Mars site" targets={data.targets} value={app.targetId} onChange={app.setTarget} />
          <div className="field">
            <label htmlFor="mirror-site">Earth place</label>
            <select id="mirror-site" value={site.id} onChange={(e) => setParam('site', e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mirror__context">
            Objective: <strong>{missionLabel(app)}</strong> ·{' '}
            {app.rankBy === 'min' ? 'most complete evidence first' : 'best match first'}
            {isDefaultSite && ' · showing the top-ranked place'}
            {data.isMock && (
              <>
                {' '}
                · <MockTag /> synthetic data
              </>
            )}
          </p>
        </div>
      </header>

      {can3d && (
        <div className="mirror-view">
          <div className="seg" role="group" aria-label="Terrain view">
            <button type="button" aria-pressed={!show3d} onClick={() => setParam('view', null)}>
              Images
            </button>
            <button
              type="button"
              aria-pressed={show3d}
              disabled={!webgl || failed3d}
              onClick={() => setParam('view', '3d')}
            >
              3D terrain
            </button>
          </div>
          <p className="mirror-view__note">
            {!webgl || failed3d
              ? '3D terrain needs WebGL, which this browser does not provide — the images below show the same elevation data.'
              : show3d
                ? 'Built from the same elevation grids as the images. Switch back to Images at any time.'
                : 'Both places have elevation grids: open them as 3D surfaces you can rotate together.'}
          </p>
        </div>
      )}

      <div className={`mirror__stage${show3d ? ' mirror__stage--3d' : ''}`}>
        {show3d ? (
          <Suspense fallback={<p className="t3d t3d__loading status">Loading 3D terrain…</p>}>
            <TerrainPair3D
              left={side3d(
                meshT,
                tPrev,
                target.name.split(' — ')[0],
                `${world} · planetary reference`,
                tPrev.source.heightReference,
                meshT.source,
                critSide(crit?.target ?? {}, missingTargetSide),
              )}
              right={side3d(
                meshS,
                sPrev,
                `${site.name}, ${site.country}`,
                'Earth · candidate place',
                sPrev.projection.heightReference,
                meshS.source.split(' (')[0],
                critSide(crit?.site ?? {}, missingSiteSide),
              )}
              sharedKm={SHARED_KM}
              terrainSelected={terrainSelected}
              exag={exag}
              onExag={(x) => setParam('vx', x === 2 ? null : String(x))}
              onFail={() => setFailed3d(true)}
            />
          </Suspense>
        ) : (
          <TerrainPanel
            side="planet"
            world={world}
            name={target.name}
            entry={tPrev}
            isMock={data.isMock}
            highlight={terrainSelected}
            crit={critSide(crit?.target ?? {}, missingTargetSide)}
            orientation={target.body === 'moon' ? 'up = toward 0° E (polar view, no single north)' : 'north up'}
            sourceLine={tPrev ? `${tPrev.source.shortName.replace(/^the /, '')} · heights: ${tPrev.source.heightReference}` : ''}
            notes={[]}
          />

        )}

        <section className="mirror-bridge" aria-labelledby="mirror-bridge-title">
          <h2 id="mirror-bridge-title" className="sr-only">
            How the two places compare
          </h2>
          <div className="mirror-bridge__score">
            {summary.scored ? (
              <>
                <span className="mirror-bridge__num">{summary.score}</span>
                <span className="mirror-bridge__of">
                  <Term id="score">match score</Term> / 100
                </span>
                {summary.hasRange && (
                  <span className="mirror-bridge__range">
                    could be {summary.min}–{summary.max}
                  </span>
                )}
                {entry?.rank && (
                  <span className="mirror-bridge__rank">
                    #{entry.rank} of {scored.length} places
                  </span>
                )}
              </>
            ) : (
              <span className="mirror-bridge__none">No score — insufficient data</span>
            )}
          </div>
          <p className="mirror-bridge__rel">{plainReliability(entry, data.minCriteria)}</p>
          <p className="mirror-bridge__tally">
            <span className="tally tally--match">✓ {counts.match || 0} similar</span>
            <span className="tally tally--differ">✗ {counts.differ || 0} different</span>
            <span className="tally tally--missing">– {counts.missing || 0} no data</span>
          </p>
          <ul className="mirror-crit" aria-label="Characteristics — choose one to see its evidence">
            {rows.map((r) => {
              const st = MIRROR_STATUS[r.status]
              return (
                <li key={r.feature.id}>
                  <button
                    type="button"
                    className={`mirror-crit__btn mirror-crit__btn--${r.status}${r.feature.id === critId ? ' is-active' : ''}`}
                    aria-pressed={r.feature.id === critId}
                    aria-controls="mirror-detail"
                    onClick={() => setParam('crit', r.feature.id)}
                  >
                    <span className="mirror-crit__sym" aria-hidden="true">
                      {st.symbol}
                    </span>
                    <span className="mirror-crit__label">{r.feature.label}</span>
                    <span className="mirror-crit__val">
                      {r.status === 'unused' ? 'not used' : r.sim === null ? 'no data' : `${pct(r.sim)}`}
                    </span>
                    <span className="mirror-crit__track" aria-hidden="true">
                      {r.sim !== null && <span className="mirror-crit__fill" style={{ width: pct(r.sim) }} />}
                    </span>
                    <span className="sr-only">
                      {' '}
                      — {st.label} ({st.help}){r.weight > 0 ? `, weight ${r.weight}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {critExplain && (
            <p key={critId} className={`mirror-bridge__explain mirror-bridge__explain--${crit.status} reveal`} aria-live="polite">
              {critExplain}{' '}
              {terrainSelected && 'The glowing squares are the 10 km windows where relief was measured. '}
              <a href="#mirror-detail">Evidence ↓</a>
            </p>
          )}
          <p className="mirror-bridge__key">
            ✓ similar (≥ 70%) · ✗ different · – no data (never counted as 0) · · not used
          </p>
        </section>

        {!show3d && (

            <TerrainPanel
            side="earth"
            world="Earth"
            name={`${site.name}, ${site.country}`}
            entry={sPrev}
            isMock={data.isMock}
            highlight={terrainSelected}
            crit={critSide(crit?.site ?? {}, missingSiteSide)}
            sourceLine={sPrev ? `${sPrev.source.dataset.split(' (')[0]} · heights: ${sPrev.projection.heightReference}` : ''}
            notes={[
              sPrev && sPrev.elevation.nearSeaLevelFrac > 0.05
                ? `${Math.round(sPrev.elevation.nearSeaLevelFrac * 100)}% of this view is sea surface (about 0 m), not land.`
                : null,
              sPrev ? 'Surface model: ice, vegetation and buildings count as height.' : null,
            ]}
          />
        )}
      </div>

      <p className="mirror__honesty" role="note">
        <strong>Reading the pictures:</strong> same ground width and pixel size on both sides, but the colours stretch to
        each image’s own height range (equal colours ≠ equal heights), heights use different references, and the shading
        is synthetic light, not a photograph. Only terrain is visible here; the other characteristics come from climate,
        vegetation and geology data.
      </p>

      {/* The three questions follow the pictures; each claim opens its own evidence below. */}
      <section className="mirror-q" aria-label="What the comparison shows">
        {[
          ['match', 'What matches?', matches, 'No selected characteristic is at least 70% similar.'],
          ['differ', 'What’s different?', differs, 'No selected characteristic with data is under 70% similar.'],
          ['missing', 'What still needs measuring?', missing, 'Every selected characteristic has data on both sides.'],
        ].map(([kind, title, list, none]) => (
          <div key={kind} className={`mirror-q__col mirror-q__col--${kind}`}>
            <h2 className="mirror-q__title">{title}</h2>
            {list.length ? (
              <ul className="mirror-q__list">
                {list.map((r) => (
                  <li key={r.feature.id}>
                    <button
                      type="button"
                      className={`mirror-q__item${r.feature.id === critId ? ' is-active' : ''}`}
                      aria-controls="mirror-detail"
                      aria-pressed={r.feature.id === critId}
                      onClick={() => setParam('crit', r.feature.id)}
                    >
                      <span aria-hidden="true">{MIRROR_STATUS[r.status].symbol} </span>
                      <strong>{r.feature.label}</strong>
                      {kind === 'missing' ? (
                        <span className="mirror-q__val">
                          {' '}
                          — no value {r.missingSide === 'target' ? `for ${target.name.split(' — ')[0]}` : r.missingSide === 'both' ? 'on either side' : `for ${site.name}`}
                        </span>
                      ) : (
                        <span className="mirror-q__val">
                          {' '}
                          — {r.site.text ?? '—'} here vs {r.target.text ?? '—'} ({pct(r.sim)})
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted mirror-q__none">{none}</p>
            )}
          </div>
        ))}
        <p className="mirror-q__more">
          <Link className="btn btn--small" to={`${app.linkTo(`/site/${site.id}`)}#evidence`}>
            View evidence<span className="sr-only">: units, coverage and sources for {site.name}</span>
          </Link>
        </p>
      </section>

      {crit && (
        <section id="mirror-detail" className={`mirror-detail mirror-detail--${crit.status}`} aria-labelledby="mirror-detail-title">
          <header className="mirror-detail__head">
            <h2 id="mirror-detail-title">
              <span aria-hidden="true">{MIRROR_STATUS[crit.status].symbol} </span>
              {crit.feature.label}: {MIRROR_STATUS[crit.status].label.toLowerCase()}
            </h2>
            <p>
              {crit.status === 'unused'
                ? 'This objective gives it weight 0, so it does not affect the score.'
                : crit.sim === null
                  ? `Not scored: no ${missingTargetSide && missingSiteSide ? 'value on either side' : missingTargetSide ? `verified value for ${target.name}` : `usable value for ${site.name}`}. Missing data is never counted as zero.`
                  : `${pct(crit.sim)} similar (${MIRROR_STATUS[crit.status].help}) · weight ${crit.weight} of 5 in this objective.`}{' '}
              {terrainSelected
                ? 'The highlighted squares on both pictures are the 10 km windows where relief was measured.'
                : 'This characteristic cannot be seen in the terrain pictures.'}
            </p>
            {crit.target.clipped && (
              <p className="mirror-detail__clip">
                The {world} value lies beyond anything on Earth, so this measures how close Earth gets to its extreme.
              </p>
            )}
          </header>
          <div className="mirror-detail__cols">
            <ValueBlock side="planet" name={`${target.name} (${world})`} value={crit.target} missing={missingTargetSide} />
            <ValueBlock side="earth" name={`${site.name} (Earth)`} value={crit.site} missing={missingSiteSide} />
          </div>
          <p className="mirror-detail__more">
            <Link className="btn btn--small" to={`${app.linkTo(`/site/${site.id}`)}#evidence`}>
              Full evidence for {site.name}
            </Link>
            {!app.shortlist.includes(site.id) && !app.shortlistFull && (
              <button type="button" className="btn btn--small btn--ghost" onClick={() => app.toggleShortlist(site.id)}>
                + Add to compare
              </button>
            )}
            <Link className="btn btn--small btn--ghost" to={app.linkTo('/explore')}>
              ← Back to the map
            </Link>
          </p>
        </section>
      )}

      <footer className="mirror__foot">
        <p>
          <NoveltyTag site={site} /> {formatCoord(site.lat, site.lon)} · {LIMITATIONS_NOTE} A high score means resemblance
          on these characteristics, not suitability for a mission.
        </p>
        {sPrev && (
          <p className="mirror__attr">
            Earth elevation: <CitationText text={sPrev.source.citation} />. {sPrev.source.attribution}.
          </p>
        )}
      </footer>
    </article>
  )
}
