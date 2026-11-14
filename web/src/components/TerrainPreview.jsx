import { useState } from 'react'
import PREVIEWS from '../data/terrainPreviews.json'
import { CitationText } from './Tags.jsx'
import '../styles/terrain.css'

const fmtM = (v) => `${Math.round(v).toLocaleString('en-US')} m`

/**
 * Offline-generated shaded-relief preview of a target site (pipeline/make_target_preview.py).
 * The image lives in the REAL public dir only, so a mock build or an unknown target renders
 * nothing. The image is drawn in the dataset's own map projection (lunar polar stereographic /
 * Mars equirectangular) — it is not placed on the Earth basemap.
 */
export default function TerrainPreview({ targetId, isMock }) {
  const entry = PREVIEWS[targetId]
  const [failed, setFailed] = useState(false)
  if (isMock || !entry || failed) return null

  const { elevation, relief, source, hillshade, projection } = entry
  const ramp = elevation?.ramp || []
  const gradient = ramp.map(([, hex], i) => `${hex} ${Math.round((i / Math.max(ramp.length - 1, 1)) * 100)}%`).join(', ')
  const [lat, lon] = entry.target ? [entry.target.lat, entry.target.lon] : [null, null]

  return (
    <figure className="terrain-preview">
      <img
        className="terrain-preview__img"
        src={`${import.meta.env.BASE_URL}${entry.image}`}
        width={entry.widthPx}
        height={entry.heightPx}
        loading="lazy"
        decoding="async"
        alt={`Shaded-relief elevation map of the ${entry.windowKm} km wide area around the ${entry.title.replace(/^Terrain around the /, '')}, with a ring marking the reference point, a square marking the ${entry.scoringWindowKm} by ${entry.scoringWindowKm} km window where terrain relief is measured, and a ${entry.scaleBarKm} km scale bar. ${entry.description}`}
        onError={() => setFailed(true)}
      />
      <figcaption className="terrain-preview__cap">
        <p className="terrain-preview__title">{entry.title}</p>
        <p>
          {entry.description} The <strong>ring</strong> is the reference point
          {lat !== null && (
            <>
              {' '}
              ({Math.abs(lat)}° {lat < 0 ? 'S' : 'N'}, {Math.abs(lon)}° {lon < 0 ? 'W' : 'E'})
            </>
          )}
          ; the <strong>square</strong> is the {entry.scoringWindowKm} × {entry.scoringWindowKm} km window where terrain
          relief is measured ({fmtM(relief.valueM)}
          {relief.rangeM && `, range ${fmtM(relief.rangeM[0])}–${fmtM(relief.rangeM[1])}`}); the bar is{' '}
          {entry.scaleBarKm} km.
        </p>
        {ramp.length > 1 && (
          <div className="terrain-preview__legend">
            <span className="terrain-preview__legend-label">Elevation</span>
            <span className="terrain-preview__lo">{fmtM(elevation.minM)} (low)</span>
            <span className="terrain-preview__ramp" style={{ background: `linear-gradient(to right, ${gradient})` }} aria-hidden="true" />
            <span className="terrain-preview__hi">{fmtM(elevation.maxM)} (high)</span>
          </div>
        )}
        <p className="terrain-preview__warn">
          <strong>Synthetic illumination</strong>, not a photograph: {hillshade.note.replace(/^synthetic illumination, not real lighting\s*[—-]\s*/i, '')}.
        </p>
        <details className="terrain-preview__more">
          <summary>Data source and projection</summary>
          <ul>
            <li>
              <strong>Source:</strong> {source.dataset}, {source.release}.{' '}
              {source.landingUrl && (
                <a href={source.landingUrl} target="_blank" rel="noreferrer">
                  Data archive<span className="sr-only"> (opens in new tab)</span>
                  <span aria-hidden="true"> ↗</span>
                </a>
              )}
            </li>
            <li>
              <strong>Resolution:</strong> {source.nativePostingM} m native posting, shown at {entry.metresPerPixel} m
              per pixel ({source.aggregation}); {entry.windowKm} km across.
              {entry.windowNote && <> {entry.windowNote}</>}
            </li>
            <li>
              <strong>Heights:</strong> {source.heightReference}.
            </li>
            <li>
              <strong>Projection:</strong> <code>{projection.proj4}</code>. {entry.orientation}
            </li>
            <li>
              <strong>Citation:</strong> <CitationText text={source.citation} />
            </li>
            {entry.crossCheck && (
              <li>
                <strong>Cross-check:</strong> <CitationText text={entry.crossCheck} />
              </li>
            )}
            <li>
              Generated offline by <code>pipeline/{String(entry.script || 'make_target_preview.py').replace(/^.*[\\/]/, '')}</code>;
              the browser only loads this {Math.round(entry.bytes / 1024)} KB image.
            </li>
          </ul>
        </details>
      </figcaption>
    </figure>
  )
}
