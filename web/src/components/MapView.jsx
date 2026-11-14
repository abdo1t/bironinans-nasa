import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { NO_SCORE_COLOR, SCORE_BINS, scoreColor } from '../lib/format.js'
import { CoverageBadge, EvidenceCoverageTag, MockTag, NoveltyTag, ScoreRange } from './Tags.jsx'
import WhyGap from './WhyGap.jsx'

// Basemap tiles are the only external requests the app makes (no API key).
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const TILE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function pinSize(score) {
  return score === null ? 24 : 26 + Math.round((score / 100) * 8) // 26–34 px: size repeats the colour cue
}

// One Leaflet DivIcon per distinct look. The marker says the same things as its
// list card: rank number (text), score band (ring colour + size), "uncatalogued
// candidate" (dashed outer ring), "no score" (hollow dashed, "–"), in compare (dot).
const iconCache = new Map()
function pinIcon({ rank, score, uncatalogued, listed, label }) {
  const key = [rank, score, uncatalogued, listed, label].join('|')
  let icon = iconCache.get(key)
  if (!icon) {
    const size = pinSize(score)
    const cls = ['pin', score === null && 'pin--none', uncatalogued && 'pin--uncat', listed && 'pin--listed']
      .filter(Boolean)
      .join(' ')
    icon = L.divIcon({
      className: 'pin-wrap',
      html:
        `<span class="${cls}" style="--pin:${scoreColor(score)}">` +
        `<span aria-hidden="true">${rank ?? '–'}</span>` +
        `<span class="sr-only">${escapeHtml(label)}</span></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    })
    iconCache.set(key, icon)
  }
  return icon
}

/** Flies to a site and opens its popup when the list asks for it ("Show on map"). */
function FocusController({ focus, markers }) {
  const map = useMap()
  useEffect(() => {
    const marker = focus ? markers.current[focus.id] : null
    if (!marker) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const zoom = Math.max(map.getZoom(), 4)
    if (reduce) map.setView(marker.getLatLng(), zoom, { animate: false })
    else map.flyTo(marker.getLatLng(), zoom, { duration: 0.6 })
    marker.openPopup()
  }, [focus, map, markers])
  return null
}

/** Leaflet measures its container once; re-measure when the layout around it changes. */
function ResizeWatcher() {
  const map = useMap()
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

export default function MapView({
  ranking,
  siteById,
  target,
  weights,
  features,
  shortlist,
  shortlistFull,
  onToggleShortlist,
  linkTo,
  isMock,
  active,
  onActive,
  focus,
}) {
  const markers = useRef({})
  // Stacking order: best matches on top, the active marker above everything.
  const baseZ = Object.fromEntries(ranking.map((r, i) => [r.site, (ranking.length - i) * 10]))

  // Highlight the active marker without swapping its icon (keeps hover stable).
  // Runs after every render because a re-rank replaces icons (and their classes).
  useEffect(() => {
    for (const [id, marker] of Object.entries(markers.current)) {
      const on = id === active?.id
      marker?.getElement()?.classList.toggle('is-active', on)
      marker?.setZIndexOffset(on ? 2000 : baseZ[id] || 0)
    }
  })

  // Start with every candidate site in view, whatever the map's size.
  const bounds = useMemo(() => {
    const lats = ranking.map((r) => siteById[r.site].lat)
    const lons = ranking.map((r) => siteById[r.site].lon)
    if (!lats.length) return null
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial view only; re-ranking must not move the map
  }, [])

  return (
    <div className="map-col">
      <div
        className="map-wrap"
        role="region"
        aria-label="Map of Earth candidate sites. Each marker shows the site's rank; the list beside the map gives the same ranking."
      >
      <MapContainer
        {...(bounds ? { bounds, boundsOptions: { padding: [28, 28] } } : { center: [20, 10], zoom: 2 })}
        minZoom={0}
        maxZoom={10}
        zoomSnap={0.25}
        worldCopyJump
        className="map"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxNativeZoom={16} />
        <FocusController focus={focus} markers={markers} />
        <ResizeWatcher />
        {ranking.map((r) => {
          const site = siteById[r.site]
          const hasScore = r.score !== null
          const listed = shortlist.includes(site.id)
          const status = site.isNewCandidate ? 'uncatalogued candidate' : 'catalogued analog'
          const label = hasScore
            ? `Rank ${r.rank}: ${site.name}, score ${r.score} of 100, ${status}`
            : `${site.name}: no score, insufficient data, ${status}`
          return (
            <Marker
              key={site.id}
              position={[site.lat, site.lon]}
              icon={pinIcon({ rank: r.rank, score: r.score, uncatalogued: site.isNewCandidate, listed, label })}
              title={site.name}
              zIndexOffset={baseZ[site.id]}
              ref={(m) => {
                if (m) markers.current[site.id] = m
                else delete markers.current[site.id]
              }}
              eventHandlers={{
                mouseover: () => onActive?.(site.id, 'map-hover'),
                mouseout: () => onActive?.(null, 'map-hover'),
                popupopen: () => onActive?.(site.id, 'map'),
              }}
            >
              <Popup>
                <div className="popup">
                  <strong className="popup__name">{site.name}</strong>
                  <span className="popup__country">{site.country}</span>
                  <span className="popup__score">
                    {hasScore ? `Score ${r.score}/100 · #${r.rank}` : 'No score — insufficient data'}
                    <ScoreRange score={r.score} range={r.scoreRange} />
                  </span>
                  <span>
                    <CoverageBadge coverage={r.coverage} />{' '}
                    {hasScore && <EvidenceCoverageTag target={target} site={site} weights={weights} features={features} />}
                  </span>
                  <WhyGap entry={r} className="popup__why" />
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
            </Marker>
          )
        })}
      </MapContainer>
      </div>

      {/* Key sits under the map so it never hides a marker. */}
      <ul className="map-key" aria-label="Map key">
        <li className="map-key__head">
          Number = rank · ring = score {isMock && <MockTag />}
        </li>
        {SCORE_BINS.map((b) => (
          <li key={b.label}>
            <span className="swatch swatch--hollow" style={{ borderColor: b.color }} aria-hidden="true" />
            {b.label}
          </li>
        ))}
        <li>
          <span className="swatch swatch--dashed" style={{ borderColor: NO_SCORE_COLOR }} aria-hidden="true" />
          No score
        </li>
        <li>
          <span className="swatch swatch--ring" aria-hidden="true" />
          Uncatalogued candidate
        </li>
        <li>
          <span className="swatch swatch--dot" aria-hidden="true" />
          In compare
        </li>
      </ul>
    </div>
  )
}
