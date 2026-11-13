import { Fragment } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { NO_SCORE_COLOR, SCORE_BINS, scoreColor } from '../lib/format.js'
import { ConfidenceTag, CoverageBadge, MockTag, NoveltyTag } from './Tags.jsx'

// Basemap tiles are the only external requests the app makes (no API key).
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const TILE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'

function radiusFor(score) {
  return score === null ? 6 : 6 + (score / 100) * 6 // 6–12 px: size repeats the colour cue
}

export default function MapView({ ranking, siteById, shortlist, shortlistFull, onToggleShortlist, linkTo, isMock }) {
  // Draw low scores first so the best matches sit on top.
  const drawOrder = [...ranking].reverse()

  return (
    <div className="map-wrap">
      <MapContainer
        center={[20, 10]}
        zoom={2}
        minZoom={2}
        maxZoom={10}
        worldCopyJump
        className="map"
        aria-label="Map of Earth candidate sites coloured by score"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxNativeZoom={16} />
        {drawOrder.map((r) => {
          const site = siteById[r.site]
          const hasScore = r.score !== null
          const listed = shortlist.includes(site.id)
          return (
            <Fragment key={site.id}>
              {site.isNewCandidate && (
                <CircleMarker
                  center={[site.lat, site.lon]}
                  radius={radiusFor(r.score) + 4}
                  interactive={false}
                  pathOptions={{ color: '#f0efec', weight: 1.5, dashArray: '3 3', fill: false }}
                />
              )}
              <CircleMarker
                center={[site.lat, site.lon]}
                radius={radiusFor(r.score)}
                pathOptions={{
                  color: hasScore ? '#0b0b0b' : NO_SCORE_COLOR,
                  weight: hasScore ? 1.5 : 2,
                  fillColor: scoreColor(r.score),
                  fillOpacity: hasScore ? 0.95 : 0,
                }}
              >
                <Popup>
                  <div className="popup">
                    <strong className="popup__name">{site.name}</strong>
                    <span className="popup__country">{site.country}</span>
                    <span className="popup__score">
                      {hasScore ? `Score ${r.score}/100 · #${r.rank}` : 'No score — data pending'}
                    </span>
                    <span>
                      <CoverageBadge coverage={r.coverage} /> {hasScore && <ConfidenceTag coverage={r.coverage} />}
                    </span>
                    {!hasScore && <span className="popup__gap">{r.gap}</span>}
                    <span className="popup__tags">
                      <NoveltyTag site={site} />
                      {isMock && <MockTag />}
                    </span>
                    <span className="popup__actions">
                      <Link to={linkTo(`/site/${site.id}`)}>View details</Link>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => onToggleShortlist(site.id)}
                        disabled={!listed && shortlistFull}
                      >
                        {listed ? 'Remove from compare' : shortlistFull ? 'Compare full (3)' : 'Add to compare'}
                      </button>
                    </span>
                  </div>
                </Popup>
              </CircleMarker>
            </Fragment>
          )
        })}
      </MapContainer>

      <div className="legend" aria-label="Map legend">
        <p className="legend__title">Score {isMock && <MockTag />}</p>
        <ul>
          {SCORE_BINS.map((b) => (
            <li key={b.label}>
              <span className="swatch" style={{ background: b.color }} aria-hidden="true" />
              {b.label}
            </li>
          ))}
          <li>
            <span className="swatch swatch--hollow" style={{ borderColor: NO_SCORE_COLOR }} aria-hidden="true" />
            No score (insufficient data)
          </li>
          <li>
            <span className="swatch swatch--ring" aria-hidden="true" />
            Uncatalogued candidate
          </li>
        </ul>
      </div>
      <p className="sr-only">Map markers are not keyboard-focusable; the List view shows the same ranking as a table.</p>
    </div>
  )
}
