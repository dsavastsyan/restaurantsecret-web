// Lightweight Leaflet map for a chain hub's location list — deliberately
// smaller than RestaurantMap.jsx (no favorites/filters/bounds-fetch): the hub
// already has every location's coordinates in hand from the hub payload, so
// this just plots them and links each pin to its menu page.
import { useEffect, useMemo, useRef } from 'react'
import { AttributionControl, MapContainer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import CleanMapBaseLayer from './map/CleanMapBaseLayer'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function FitToPoints({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    // # The map sits in a CSS grid column whose height depends on its sibling
    // # (the location list), so Leaflet can measure a stale (often 0px)
    // # container size at first paint — invalidateSize() forces a remeasure
    // # before fitting bounds, or fitBounds computes the wrong zoom/pan
    // # against that stale size.
    map.invalidateSize()
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 14)
      return
    }
    map.fitBounds(points.map((p) => [p.lat, p.lon]), { padding: [32, 32], maxZoom: 15 })
  }, [map, points])
  return null
}

function MarkersLayer({ points }) {
  const map = useMap()
  const groupRef = useRef(null)

  useEffect(() => {
    const group = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 44 })
    for (const point of points) {
      const marker = L.marker([point.lat, point.lon])
      marker.bindPopup(
        `<div class="chain-hub-map__popup"><strong>${escapeHtml(point.location.name)}</strong><br/>${point.location.dishesCount} блюд с КБЖУ</div>`,
      )
      group.addLayer(marker)
    }
    group.addTo(map)
    groupRef.current = group
    return () => {
      map.removeLayer(group)
    }
  }, [map, points])

  return null
}

export default function ChainLocationsMap({ locations }) {
  const points = useMemo(
    () =>
      locations.flatMap((loc) =>
        (loc.coordinates || []).map((c) => ({ lat: c.lat, lon: c.lon, location: loc })),
      ),
    [locations],
  )

  if (!points.length) {
    return <div className="chain-hub-map__empty">Для этого города пока нет координат на карте.</div>
  }

  return (
    <div className="chain-hub-map">
      <MapContainer
        center={[points[0].lat, points[0].lon]}
        zoom={12}
        minZoom={2}
        maxZoom={20}
        scrollWheelZoom={false}
        attributionControl={false}
        className="rs-clean-map"
      >
        <CleanMapBaseLayer />
        <AttributionControl prefix={false} />
        <FitToPoints points={points} />
        <MarkersLayer points={points} />
      </MapContainer>
    </div>
  )
}
