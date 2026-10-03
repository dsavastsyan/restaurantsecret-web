import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
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
const VECTOR_MAP_LOAD_TIMEOUT_MS = 7000

// Vite rewrites the main MapLibre module URL, so its default sibling-worker
// lookup points at a non-existent dependency cache path unless set explicitly.
setWorkerUrl(maplibreWorkerUrl)

export default function CleanMapBaseLayer() {
  const map = useMap()

  useEffect(() => {
    let vectorLayer
    let maplibreMap
    let onStyleLoad
    let onMapLoad
    let onMapError
    let onContextLost
    let fallbackLayer
    let fallbackTimer
    let fallbackTask
    let disposed = false

    const clearVectorListeners = () => {
      if (!maplibreMap) return
      if (onStyleLoad) maplibreMap.off('style.load', onStyleLoad)
      if (onMapLoad) maplibreMap.off('load', onMapLoad)
      if (onMapError) maplibreMap.off('error', onMapError)
      if (onContextLost) maplibreMap.off('webglcontextlost', onContextLost)
    }

    const clearFallbackTimer = () => {
      if (!fallbackTimer) return
      window.clearTimeout(fallbackTimer)
      fallbackTimer = undefined
    }

    const useRasterFallback = (error) => {
      if (disposed || fallbackLayer) return

      clearFallbackTimer()
      clearVectorListeners()
      if (vectorLayer && map.hasLayer(vectorLayer)) map.removeLayer(vectorLayer)

      fallbackLayer = L.tileLayer(FALLBACK_TILE_URL, {
        attribution: FALLBACK_ATTRIBUTION,
        subdomains: 'abc',
        maxNativeZoom: 19,
      }).addTo(map)
      console.warn('Vector map is unavailable; using the raster fallback.', error)
    }

    const queueRasterFallback = (error) => {
      if (disposed || fallbackLayer || fallbackTask) return
      fallbackTask = window.setTimeout(() => {
        fallbackTask = undefined
        useRasterFallback(error)
      }, 0)
    }

    try {
      vectorLayer = maplibreGL({
        style: MAP_STYLE_URL,
        attributionControl: { customAttribution: MAP_ATTRIBUTION },
      }).addTo(map)

      maplibreMap = vectorLayer.getMaplibreMap()
      onStyleLoad = () => simplifyMapStyle(maplibreMap)
      onMapLoad = () => clearFallbackTimer()
      onMapError = (event) => queueRasterFallback(event?.error || event)
      onContextLost = () => queueRasterFallback(new Error('WebGL context was lost.'))
      maplibreMap.on('style.load', onStyleLoad)
      maplibreMap.on('load', onMapLoad)
      maplibreMap.on('error', onMapError)
      maplibreMap.on('webglcontextlost', onContextLost)
      fallbackTimer = window.setTimeout(
        () => useRasterFallback(new Error('Vector map did not load in time.')),
        VECTOR_MAP_LOAD_TIMEOUT_MS,
      )
    } catch (error) {
      useRasterFallback(error)
    }

    return () => {
      disposed = true
      clearFallbackTimer()
      if (fallbackTask) window.clearTimeout(fallbackTask)
      clearVectorListeners()
      if (fallbackLayer && map.hasLayer(fallbackLayer)) map.removeLayer(fallbackLayer)
      if (vectorLayer && map.hasLayer(vectorLayer)) map.removeLayer(vectorLayer)
    }
  }, [map])

  return null
}
