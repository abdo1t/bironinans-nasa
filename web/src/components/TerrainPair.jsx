import { Link } from 'react-router-dom'
import SITE_PREVIEWS from '../data/sitePreviews.json'
import TARGET_PREVIEWS from '../data/terrainPreviews.json'
import { bodyLabel } from '../lib/format.js'
import { SHARED_KM, cropOf } from '../lib/mirror.js'
import { IconTerrain } from './Icons.jsx'
import { CitationText } from './Tags.jsx'
import '../styles/terrain-pair.css'

const fmtM = (v) => `${Math.round(v).toLocaleString('en-US')} m`

/** One shaded-relief tile, cropped to the shared ground width around its reference point. */
function Tile({ entry, side, label, name }) {
  if (!entry) {
    return (
      <figure className={`tpair__tile tpair__tile--${side}`}>
        <figcaption className="tpair__cap">
          <span className="hud-label">{label}</span>
          <span className="tpair__name">{name}</span>
        </figcaption>
        <div className="tpair__frame tpair__frame--missing">
          <p>No terrain image for this place yet (missing evidence, not a flat surface).</p>
        </div>
      </figure>
    )
  }
  const c = cropOf(entry)
  const ramp = entry.elevation.ramp
  const gradient = ramp.map(([, hex], i) => `${hex} ${Math.round((i / (ramp.length - 1)) * 100)}%`).join(', ')
  return (
    <figure className={`tpair__tile tpair__tile--${side}`}>
      <figcaption className="tpair__cap">
        <span className="hud-label">{label}</span>
        <span className="tpair__name">{name}</span>
      </figcaption>
      <div className="tpair__frame">
        <img
          className="tpair__img"
          src={`${import.meta.env.BASE_URL}${entry.image}`}
          style={c.img}
          loading="lazy"
          decoding="async"
          alt={`Shaded-relief elevation map, ${c.km.toFixed(0)} km across, centred on ${name}; the square is the 10 by 10 km window where terrain relief is measured.`}
        />
        <span className="tpair__square" style={c.square} aria-hidden="true" />
      </div>
      <div className="tpair__legend">
        <span className="tabular">{fmtM(entry.elevation.minM)}</span>
        <span className="tpair__ramp" style={{ background: `linear-gradient(to right, ${gradient})` }} aria-hidden="true" />
        <span className="tabular">{fmtM(entry.elevation.maxM)}</span>
        <span className="sr-only"> elevation range of this image's colours</span>
      </div>
    </figure>
  )
}

/**
 * Panel B — Planetary terrain. The validated Moon/Mars terrain preview beside the selected Earth
 * candidate's, both at the same ground width (SHARED_KM) and 60 m pixels, no vertical exaggeration.
 * Images were rendered offline from the DEMs the terrain score uses (pipeline/make_*_preview.py).
 */
export default function TerrainPair({ target, site, isMock, linkTo }) {
  const tEntry = TARGET_PREVIEWS[target.id]
  const sEntry = site ? SITE_PREVIEWS[site.id] : null
  const world = bodyLabel(target.body)
  return (
    <section className="mc-panel tpair" aria-labelledby="tpair-title">
      <header className="mc-panel__head">
        <h2 id="tpair-title" className="mc-panel__title">
          <IconTerrain />
          Planetary terrain
        </h2>
        {site && !isMock && tEntry && (
          <Link className="btn btn--small btn--ghost" to={linkTo('/mirror', { site: site.id })}>
            Open Mirror
          </Link>
        )}
      </header>
      <div className="mc-panel__body">
        {isMock || !tEntry ? (
          <p className="manalysis__empty">
            {isMock ? 'Terrain images are shown only with the real data bundle.' : 'No terrain image for this target yet.'}
          </p>
        ) : (
          <>
            <div className="tpair__grid">
              <Tile entry={tEntry} side="planet" label={`${world} · reference`} name={target.name.split(' — ')[0]} />
              <Tile entry={sEntry} side="earth" label="Earth · candidate" name={site?.name ?? 'No place selected'} />
            </div>
            <p className="tpair__scale">
              Same ground on both: {SHARED_KM.toFixed(0)} km across · 60 m per pixel · square = 10 × 10 km relief window ·
              no vertical exaggeration. Colours stretch to each image’s own range, so equal colours ≠ equal heights.
            </p>
            <details className="tpair__more">
              <summary>Datasets, projections and limits</summary>
              <ul>
                <li>
                  <strong>{world}:</strong> {tEntry.source.dataset}, {tEntry.source.release}; {tEntry.source.nativePostingM} m
                  native posting. {tEntry.orientation} <CitationText text={tEntry.source.citation} />
                </li>
                {sEntry ? (
                  <li>
                    <strong>Earth:</strong> {sEntry.source.dataset}; heights above the {sEntry.projection.heightReference}.{' '}
                    {sEntry.projection.frame}. <CitationText text={sEntry.source.citation} />
                  </li>
                ) : (
                  <li>
                    <strong>Earth:</strong> no preview was generated for this place, so only its scored relief value is
                    available.
                  </li>
                )}
                <li>
                  Shaded relief uses synthetic illumination (not a photograph). The two worlds use different map
                  projections and height references; the images show shape at one scale, not identical conditions.
                </li>
              </ul>
            </details>
          </>
        )}
      </div>
    </section>
  )
}
