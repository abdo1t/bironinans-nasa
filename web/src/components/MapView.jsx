import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { NO_SCORE_COLOR, SCORE_BINS, scoreColor } from '../lib/format.js'
import { MockTag } from './Tags.jsx'

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
function pinIcon({ rank, score, uncatalogued, listed, selected, label }) {
  const key = [rank, score, uncatalogued, listed, selected, label].join('|')
  let icon = iconCache.get(key)
  if (!icon) {
    const size = pinSize(score)
    const cls = ['pin', score === null && 'pin--none', uncatalogued && 'pin--uncat', listed && 'pin--listed']
      .filter(Boolean)
      .join(' ')
    icon = L.divIcon({
      className: selected ? 'pin-wrap is-selected' : 'pin-wrap',
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

/** Flies to a site when the list selects it (instant under reduced motion). */
function FocusController({ focus, markers }) {
  const map = useMap()
  useEffect(() => {
    const marker = focus ? markers.current[focus.id] : null
    if (!marker) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const zoom = Math.max(map.getZoom(), 3.5)
    if (reduce) map.setView(marker.getLatLng(), zoom, { animate: false })
    else map.flyTo(marker.getLatLng(), zoom, { duration: 0.6 })
  }, [focus, map, markers])
  return null
}

/** "Show all sites": return to the view that holds every candidate (keyboard reachable). */
function FitAllButton({ bounds }) {
  const map = useMap()
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current)
      L.DomEvent.disableScrollPropagation(ref.current)
    }
  }, [])
  if (!bounds) return null
  const fit = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    map.fitBounds(bounds, { padding: [28, 28], animate: !reduce })
  }
  return (
    <button ref={ref} type="button" className="map-fit" onClick={fit}>
      Show all sites
    </button>
  )
}

/**
 * Leaflet measures its container once; re-measure when the layout around it changes. If the
 * map was created before its container had a size (stylesheet not applied yet), fit every
 * candidate once the container gets one, so the first view is never empty.
 */
function ResizeWatcher({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const startSize = map.getSize()
    let needsFit = !(startSize.x > 50 && startSize.y > 50)
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
      const size = map.getSize()
      if (needsFit && bounds && size.x > 50 && size.y > 50) {
        needsFit = false
        map.fitBounds(bounds, { padding: [28, 28], animate: false })
      }
    })
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map, bounds])
  return null
}

export default function MapView({
  ranking,
  siteById,
  shortlist,
  isMock,
  active,
  onActive,
  focus,
  selectedId,
  onSelect,
}) {
  const markers = useRef({})
  // Stacking order: best matches on top, the active marker above everything.
  const baseZ = Object.fromEntries(ranking.map((r, i) => [r.site, (ranking.length - i) * 10]))

  // Highlight the hovered (active) and the selected marker without swapping icons (keeps
  // hover stable). Runs after every render because a re-rank replaces icons (and classes).
  useEffect(() => {
    for (const [id, marker] of Object.entries(markers.current)) {
      const on = id === active?.id
      const sel = id === selectedId
      marker?.getElement()?.classList.toggle('is-active', on)
      marker?.setZIndexOffset(on ? 3000 : sel ? 2000 : baseZ[id] || 0)
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
        aria-label="Map of Earth candidate sites. Each marker shows the site's rank; select one to analyse it. The ranked list gives the same ranking."
      >
      <p className="map-hud" aria-hidden="true">
        <span className="map-hud__label">Earth · candidate sites</span>
        <span className="map-hud__count">{ranking.filter((r) => r.score !== null).length} ranked</span>
      </p>
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
        <FitAllButton bounds={bounds} />
        <ResizeWatcher bounds={bounds} />
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
              icon={pinIcon({ rank: r.rank, score: r.score, uncatalogued: site.isNewCandidate, listed, selected: site.id === selectedId, label: site.id === selectedId ? `${label} (selected)` : label })}
              title={label}
              alt={label}
              keyboard
              zIndexOffset={site.id === selectedId ? 2000 : baseZ[site.id]}
              ref={(m) => {
                if (m) markers.current[site.id] = m
                else delete markers.current[site.id]
              }}
              eventHandlers={{
                mouseover: () => onActive?.(site.id, 'map-hover'),
                mouseout: () => onActive?.(null, 'map-hover'),
                click: () => onSelect?.(site.id, 'map'),
                // Leaflet maps Enter on a marker to "open popup" only; markers here select instead.
                keydown: (e) => {
                  const key = e.originalEvent?.key
                  if (key === 'Enter' || key === ' ') {
                    e.originalEvent.preventDefault()
                    onSelect?.(site.id, 'map')
                  }
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -pinSize(r.score) / 2]} className="pin-tip">
                <strong>{site.name}</strong>
                <span>{hasScore ? ` · #${r.rank} · ${r.score}/100` : ' · no score'}</span>
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>
      </div>

      {/* Key sits under the map so it never hides a marker. */}
      <ul className="map-key" aria-label="Map key">
        <li className="map-key__head">
          Number = rank · ring colour = score {isMock && <MockTag />}
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
          <span className="swatch swatch--sel" aria-hidden="true" />
          Selected
        </li>
        <li>
          <span className="swatch swatch--dot" aria-hidden="true" />
          In compare
        </li>
      </ul>
    </div>
  )
}
