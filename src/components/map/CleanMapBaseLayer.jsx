import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import './clean-map.css'
import { simplifyMapStyle } from './mapStyle'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const MAP_ATTRIBUTION = [
  '<a href="https://openfreemap.org/">OpenFreeMap</a>',
  '<a href="https://openmaptiles.org/">OpenMapTiles</a>',
  'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
].join(' &copy; ')

const FALLBACK_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const FALLBACK_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export default function CleanMapBaseLayer() {
  const map = useMap()

  useEffect(() => {
    let layer
    let maplibreMap
    let onStyleLoad

    try {
      layer = maplibreGL({
        style: MAP_STYLE_URL,
        attributionControl: { customAttribution: MAP_ATTRIBUTION },
      }).addTo(map)

      maplibreMap = layer.getMaplibreMap()
      onStyleLoad = () => simplifyMapStyle(maplibreMap)
      maplibreMap.on('style.load', onStyleLoad)
    } catch (error) {
      console.warn('Vector map is unavailable; using the raster fallback.', error)
      layer = L.tileLayer(FALLBACK_TILE_URL, { attribution: FALLBACK_ATTRIBUTION }).addTo(map)
    }

    return () => {
      if (maplibreMap && onStyleLoad) {
        maplibreMap.off('style.load', onStyleLoad)
      }
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer)
      }
    }
  }, [map])

  return null
}
