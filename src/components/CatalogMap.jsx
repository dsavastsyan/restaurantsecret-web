import { useEffect, useMemo, useRef, useState } from 'react'
import { AttributionControl, MapContainer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import { API_BASE } from '@/config/api'
import './catalog-map.css'
import CleanMapBaseLayer from './map/CleanMapBaseLayer'
import MetroStationsLayer from './map/MetroStationsLayer'

const MOSCOW_CENTER = [55.751244, 37.618423]
const DEFAULT_ZOOM = 10

const getRestaurantKey = (restaurant) => String(
  restaurant?.slug || restaurant?.restaurantSlug || restaurant?.restaurant_slug || restaurant?.name || '',
).trim().toLowerCase()

const getRestaurantPoint = (restaurant) => {
  const lat = Number(restaurant?.lat)
  const lon = Number(restaurant?.lon ?? restaurant?.lng)
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null
}

const createPinIcon = (selected = false) => L.divIcon({
  className: 'catalog-map-pin-wrapper',
  iconSize: selected ? [40, 48] : [34, 42],
  iconAnchor: selected ? [20, 47] : [17, 41],
  html: `
    <svg class="catalog-map-pin${selected ? ' is-selected' : ''}" viewBox="0 0 34 42" aria-hidden="true">
      <path class="catalog-map-pin__body" d="M17 1.5C8.7 1.5 2 8 2 16c0 10.5 11.4 22.2 14.1 24.8a1.3 1.3 0 0 0 1.8 0C20.6 38.2 32 26.5 32 16 32 8 25.3 1.5 17 1.5Z" />
      <circle class="catalog-map-pin__center" cx="17" cy="16" r="5.25" />
    </svg>
  `,
})

function CatalogMapMarkers({ restaurants, selectedKey, onSelectRestaurant }) {
  const map = useMap()
  const clusterRef = useRef(null)

  useEffect(() => {
    if (!clusterRef.current) {
      clusterRef.current = L.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        maxClusterRadius: 42,
      })
      map.addLayer(clusterRef.current)
    }

    const cluster = clusterRef.current
    cluster.clearLayers()

    restaurants.forEach((restaurant) => {
      const point = getRestaurantPoint(restaurant)
      if (!point) return

      const key = getRestaurantKey(restaurant)
      const marker = L.marker(point, {
        icon: createPinIcon(Boolean(selectedKey && key === selectedKey)),
        keyboard: true,
        riseOnHover: true,
        title: restaurant?.name || 'Ресторан',
      })

      marker.on('click', () => onSelectRestaurant(restaurant))
      marker.bindTooltip(restaurant?.name || 'Ресторан', {
        direction: 'top',
        offset: [0, -32],
        opacity: 0.92,
      })
      cluster.addLayer(marker)
    })

    return () => cluster.clearLayers()
  }, [map, onSelectRestaurant, restaurants, selectedKey])

  useEffect(() => () => {
    if (clusterRef.current) map.removeLayer(clusterRef.current)
  }, [map])

  return null
}

function CatalogMapViewport({ restaurants, center, zoom }) {
  const map = useMap()
  const points = useMemo(
    () => restaurants.map(getRestaurantPoint).filter(Boolean),
    [restaurants],
  )
  const pointsKey = points.map(([lat, lon]) => `${lat}:${lon}`).join('|')
  const centerLat = Number(center?.[0])
  const centerLon = Number(center?.[1])

  useEffect(() => {
    map.invalidateSize()

    if (!points.length) {
      const fallback = Number.isFinite(centerLat) && Number.isFinite(centerLon)
        ? [centerLat, centerLon]
        : MOSCOW_CENTER
      map.setView(fallback, zoom || DEFAULT_ZOOM, { animate: false })
      return
    }

    if (points.length === 1) {
      map.setView(points[0], Math.max(13, zoom || DEFAULT_ZOOM), { animate: false })
      return
    }

    map.fitBounds(points, {
      animate: false,
      maxZoom: 14,
      paddingTopLeft: [44, 72],
      paddingBottomRight: [44, 190],
    })
  }, [centerLat, centerLon, map, pointsKey, zoom])

  return null
}

const LocationIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 21s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.3" />
  </svg>
)

export default function CatalogMap({
  restaurants,
  city,
  center,
  zoom,
  loading,
  error,
  totalResults,
  isFavorite,
  onToggleFavorite,
  onOpenRestaurant,
  onShowList,
}) {
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [metroStations, setMetroStations] = useState([])
  const selectedKey = getRestaurantKey(selectedRestaurant)

  useEffect(() => {
    const controller = new AbortController()
    setMetroStations([])

    async function loadMetroStations() {
      try {
        const response = await fetch(`${API_BASE}/metro`, { signal: controller.signal })
        if (!response.ok) return
        const data = await response.json()
        setMetroStations(
          (Array.isArray(data?.stations) ? data.stations : []).filter((station) => station?.city === city),
        )
      } catch (error) {
        if (error?.name !== 'AbortError') console.error('Failed to load metro stations', error)
      }
    }

    if (city) loadMetroStations()
    return () => controller.abort()
  }, [city])

  useEffect(() => {
    if (!selectedKey) return
    const updated = restaurants.find((restaurant) => getRestaurantKey(restaurant) === selectedKey)
    if (updated) setSelectedRestaurant(updated)
    else setSelectedRestaurant(null)
  }, [restaurants, selectedKey])

  const safeCenter = Number.isFinite(Number(center?.[0])) && Number.isFinite(Number(center?.[1]))
    ? [Number(center[0]), Number(center[1])]
    : MOSCOW_CENTER
  const pointCount = restaurants.filter(getRestaurantPoint).length
  const hasListResultsWithoutPoints = !loading && !error && totalResults > 0 && pointCount === 0
  const hasNoResults = !loading && !error && totalResults === 0 && pointCount === 0

  return (
    <section className="catalog-map-panel" aria-label="Карта ресторанов">
      <div className="catalog-map-panel__count" role="status">
        {loading ? 'Загружаем точки…' : `${pointCount.toLocaleString('ru-RU')} на карте`}
      </div>

      <MapContainer
        center={safeCenter}
        zoom={zoom || DEFAULT_ZOOM}
        minZoom={2}
        maxZoom={20}
        scrollWheelZoom
        className="catalog-map-panel__map rs-clean-map"
        attributionControl={false}
      >
        <CleanMapBaseLayer />
        <AttributionControl prefix={false} />
        <MetroStationsLayer stations={metroStations} />
        <CatalogMapViewport restaurants={restaurants} center={safeCenter} zoom={zoom} />
        <CatalogMapMarkers
          restaurants={restaurants}
          selectedKey={selectedKey}
          onSelectRestaurant={setSelectedRestaurant}
        />
      </MapContainer>

      {loading && <div className="catalog-map-panel__loading" aria-hidden="true" />}

      {(error || hasListResultsWithoutPoints || hasNoResults) && (
        <div className="catalog-map-panel__empty" role="status">
          <strong>
            {error
              ? 'Карта временно недоступна'
              : hasListResultsWithoutPoints
                ? 'У найденных ресторанов пока нет координат'
                : 'По этим фильтрам ничего не найдено'}
          </strong>
          <span>{error ? 'Все рестораны по-прежнему доступны списком.' : 'Попробуйте изменить фильтры или открыть список.'}</span>
          <button type="button" onClick={onShowList}>Посмотреть списком</button>
        </div>
      )}

      {selectedRestaurant && (
        <article className="catalog-map-card" aria-label={selectedRestaurant.name}>
          <button
            type="button"
            className="catalog-map-card__close"
            aria-label="Закрыть карточку ресторана"
            onClick={() => setSelectedRestaurant(null)}
          >
            ×
          </button>
          <div className="catalog-map-card__heading">
            <span className="catalog-map-card__mark" aria-hidden="true">
              {String(selectedRestaurant.name || 'Р').trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <h2>{selectedRestaurant.name}</h2>
              {selectedRestaurant.cuisine && <p>{selectedRestaurant.cuisine}</p>}
            </div>
          </div>
          {(selectedRestaurant.metro || selectedRestaurant.address) && (
            <div className="catalog-map-card__location">
              <LocationIcon />
              <span>{selectedRestaurant.metro || selectedRestaurant.address}</span>
            </div>
          )}
          <div className="catalog-map-card__actions">
            <button
              type="button"
              className={`catalog-map-card__favorite${isFavorite(selectedRestaurant.slug) ? ' is-active' : ''}`}
              aria-label={isFavorite(selectedRestaurant.slug) ? 'Удалить из избранного' : 'Добавить в избранное'}
              onClick={() => onToggleFavorite(selectedRestaurant.slug, selectedRestaurant.name)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3A5.9 5.9 0 0 1 12 5.09 5.9 5.9 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54Z" />
              </svg>
            </button>
            <button
              type="button"
              className="catalog-map-card__open"
              onClick={() => onOpenRestaurant(selectedRestaurant.slug)}
            >
              Открыть меню
            </button>
          </div>
        </article>
      )}
    </section>
  )
}
