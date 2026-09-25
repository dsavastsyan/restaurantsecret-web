import { useEffect, useMemo, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { groupMetroStations } from './metroStations'

const MIN_METRO_ZOOM = 10
const METRO_LABEL_ZOOM = 14
const METRO_PANE = 'rs-metro-stations'

function createMetroIcon(detailed) {
  return L.divIcon({
    className: 'rs-metro-marker-wrapper',
    iconSize: detailed ? [20, 20] : [16, 16],
    iconAnchor: detailed ? [10, 10] : [8, 8],
    html: `<span class="rs-metro-marker${detailed ? ' is-detailed' : ''}" aria-hidden="true">M</span>`,
  })
}

export default function MetroStationsLayer({ stations = [] }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  const groupedStations = useMemo(() => groupMetroStations(stations), [stations])

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom())
    map.on('zoomend', handleZoom)
    return () => map.off('zoomend', handleZoom)
  }, [map])

  useEffect(() => {
    if (!map.getPane(METRO_PANE)) {
      const pane = map.createPane(METRO_PANE)
      pane.style.zIndex = '550'
    }

    const layer = L.layerGroup().addTo(map)
    if (zoom < MIN_METRO_ZOOM) return () => map.removeLayer(layer)

    const detailed = zoom >= METRO_LABEL_ZOOM
    const icon = createMetroIcon(detailed)

    for (const station of groupedStations) {
      const marker = L.marker([station.lat, station.lon], {
        icon,
        pane: METRO_PANE,
        title: `Метро ${station.name}`,
        riseOnHover: true,
      })
      marker.bindTooltip(station.name, {
        className: 'rs-metro-label',
        direction: 'top',
        offset: [0, detailed ? -10 : -8],
        opacity: 0.96,
        permanent: detailed,
      })
      layer.addLayer(marker)
    }

    return () => map.removeLayer(layer)
  }, [groupedStations, map, zoom])

  return null
}
