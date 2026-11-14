import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CitationText, EvidenceTag, MockTag, NoveltyTag } from '../components/Tags.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import Term from '../components/Term.jsx'
import SITE_PREVIEWS from '../data/sitePreviews.json'
import TARGET_PREVIEWS from '../data/terrainPreviews.json'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel, formatCoord, pct } from '../lib/format.js'
import { MIRROR_STATUS, SHARED_KM, cropOf, defaultCriterion, mirrorRows } from '../lib/mirror.js'
import { missionTitle } from '../lib/missions.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'
import { entrySummary, plainReliability } from '../lib/summary.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/mirror.css'

const fmtM = (v) => `${Math.round(v).toLocaleString('en-US')} m`

/** One side of the mirror: a real shaded-relief image with its scale, legend and source. */
function TerrainPanel({ side, world, name, entry, isMock, highlight, notes, sourceLine, orientation = 'north up' }) {
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
  const world = bodyLabel(target.body)
  const tPrev = TARGET_PREVIEWS[target.id]
  const sPrev = SITE_PREVIEWS[site.id]
  const missingTargetSide = crit?.missingSide === 'target' || crit?.missingSide === 'both'
  const missingSiteSide = crit?.missingSide === 'site' || crit?.missingSide === 'both'
  const terrainSelected = crit?.feature.id === 'terrain'

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
            Objective: <strong>{app.isCustom ? 'Custom weights' : missionTitle(app.presetId)}</strong> ·{' '}
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

      <div className="mirror__stage">
        <TerrainPanel
          side="planet"
          world={world}
          name={target.name}
          entry={tPrev}
          isMock={data.isMock}
          highlight={terrainSelected}
          orientation={target.body === 'moon' ? 'up = toward 0° E (polar view, no single north)' : 'north up'}
          sourceLine={tPrev ? `${tPrev.source.shortName.replace(/^the /, '')} · heights: ${tPrev.source.heightReference}` : ''}
          notes={[]}
        />

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
          <p className="mirror-bridge__key">
            ✓ similar (≥ 70%) · ✗ different · – no data (never counted as 0) · · not used
          </p>
        </section>

        <TerrainPanel
          side="earth"
          world="Earth"
          name={`${site.name}, ${site.country}`}
          entry={sPrev}
          isMock={data.isMock}
          highlight={terrainSelected}
          sourceLine={sPrev ? `${sPrev.source.dataset.split(' (')[0]} · heights: ${sPrev.projection.heightReference}` : ''}
          notes={[
            sPrev && sPrev.elevation.nearSeaLevelFrac > 0.05
              ? `${Math.round(sPrev.elevation.nearSeaLevelFrac * 100)}% of this view is sea surface (about 0 m), not land.`
              : null,
            sPrev ? 'Surface model: ice, vegetation and buildings count as height.' : null,
          ]}
        />
      </div>

      <p className="mirror__honesty" role="note">
        <strong>Reading the pictures:</strong> same ground width and pixel size on both sides, but the colours stretch to
        each image’s own height range (equal colours ≠ equal heights), heights use different references, and the shading
        is synthetic light, not a photograph. Only terrain is visible here; the other characteristics come from climate,
        vegetation and geology data.
      </p>

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
