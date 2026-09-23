import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { AttributionControl, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import { API_BASE } from '@/config/api'
import { useAuth } from '@/store/auth'
import { useFavoriteRestaurantsStore } from '@/store/favoriteRestaurants'
import MetroFilter from './MetroFilter'
import MapCuisineFilter from './MapCuisineFilter'
import MapCityFilter from './MapCityFilter'
import { saveCatalogCity } from '@/lib/cityPreference'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const defaultCenter = [55.751244, 37.618423]
const defaultZoom = 10
const defaultMarkerIconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png'
const metroFilterRadiusM = 1200
const earthRadiusM = 6371000

const favoriteMarkerIcon = L.divIcon({
  className: 'map-fav-marker-wrapper',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  html: `
    <div class="map-fav-marker">
      <img src="${defaultMarkerIconUrl}" alt="" />
      <span class="map-fav-marker__heart" aria-hidden="true">❤</span>
    </div>
  `,
})

function normalizeRestaurantLinkUrl(rawUrl) {
  if (!rawUrl) return null
  const text = String(rawUrl).trim()
  if (!text || text === '-' || text === '—') return null

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`
  try {
    const url = new URL(withProtocol)
    if (!/^https?:$/i.test(url.protocol) || !url.hostname.includes('.')) return null
    return url.toString()
  } catch (_) {
    return null
  }
}

function normalizeStationName(value) {
  return String(value || '').trim().toLowerCase()
}

function getMetroNames(restaurant) {
  const rawNames = Array.isArray(restaurant?.metroNames)
    ? restaurant.metroNames
    : Array.isArray(restaurant?.metros)
      ? restaurant.metros
      : []

  const names = rawNames
    .map((name) => normalizeStationName(name))
    .filter(Boolean)

  const nearestName = normalizeStationName(restaurant?.metro)
  if (nearestName) names.push(nearestName)

  return Array.from(new Set(names))
}

function getStationPoints(station) {
  const points = Array.isArray(station?.points) ? station.points : []
  const normalizedPoints = points
    .map((point) => ({
      lat: Number(point?.lat),
      lon: Number(point?.lon),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))

  if (normalizedPoints.length > 0) return normalizedPoints

  const lat = Number(station?.lat)
  const lon = Number(station?.lon)
  if (Number.isFinite(lat) && Number.isFinite(lon)) return [{ lat, lon }]

  return []
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function getDistanceMeters(from, to) {
  const dLat = toRadians(to.lat - from.lat)
  const dLon = toRadians(to.lon - from.lon)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a))
}

function isRestaurantNearStation(restaurant, stationPoints) {
  const lat = Number(restaurant?.lat)
  const lon = Number(restaurant?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || stationPoints.length === 0) return false

  return stationPoints.some((point) => getDistanceMeters({ lat, lon }, point) <= metroFilterRadiusM)
}

function ClusterLayer({ restaurants, favoriteSlugs }) {
  const map = useMap()
  const clusterGroupRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!clusterGroupRef.current) {
      clusterGroupRef.current = L.markerClusterGroup({ chunkedLoading: true })
      map.addLayer(clusterGroupRef.current)
    }

    const group = clusterGroupRef.current
    group.clearLayers()

    const markers = restaurants
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
      .map((r) => {
        const slugKey = String(r.slug || '').trim().toLowerCase()
        const isFavoriteRestaurant = slugKey && favoriteSlugs.has(slugKey)
        const marker = L.marker(
          [Number(r.lat), Number(r.lon)],
          isFavoriteRestaurant ? { icon: favoriteMarkerIcon } : undefined,
        )
        const restaurantLinkUrl = normalizeRestaurantLinkUrl(r.instagramUrl)
        const restaurantLink = restaurantLinkUrl
          ? `<a href="${restaurantLinkUrl}" target="_blank" rel="noopener noreferrer" class="popup-web" title="Ссылка ресторана">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9.25" />
                <path d="M3 12h18" />
                <path d="M12 2.75c2.35 2.55 3.55 5.63 3.55 9.25s-1.2 6.7-3.55 9.25" />
                <path d="M12 2.75C9.65 5.3 8.45 8.38 8.45 12s1.2 6.7 3.55 9.25" />
              </svg>
            </a>`
          : ''

        const popupContent = document.createElement('div')
        popupContent.className = 'map-popup'
        popupContent.innerHTML = `
          <strong>${r.name}</strong><br/>
          ${r.cuisine || ''}<br/>
          <div class="popup-links">
            <a href="/restaurants/${r.slug}/menu/" class="popup-link">Перейти к меню</a>
            ${restaurantLink}
          </div>
        `

        const link = popupContent.querySelector('.popup-link')
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault()
            navigate(`/restaurants/${r.slug}/menu/`)
          })
        }

        marker.bindPopup(popupContent)
        return marker
      })

    group.addLayers(markers)
  }, [map, restaurants, favoriteSlugs, navigate])

  useEffect(() => {
    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current)
      }
    }
  }, [map])

  return null
}

function MapViewportController({ focusTarget }) {
  const map = useMap()

  useEffect(() => {
    if (!focusTarget) return
    const nextZoom = Number.isFinite(focusTarget.zoom) ? focusTarget.zoom : 13
    map.flyTo([focusTarget.lat, focusTarget.lon], nextZoom, { duration: 0.8 })
  }, [map, focusTarget])

  return null
}

function ViewportChangeListener({ onViewportChange }) {
  const map = useMapEvents({
    moveend: () => {
      const center = map.getCenter()
      onViewportChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() })
    },
    zoomend: () => {
      const center = map.getCenter()
      onViewportChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() })
    },
  })

  useEffect(() => {
    const center = map.getCenter()
    onViewportChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() })
  }, [map, onViewportChange])

  return null
}

function MapResizeController({ watch }) {
  const map = useMap()

  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 120)
    return () => window.clearTimeout(id)
  }, [map, watch])

  return null
}

function parseTimestamp(value) {
  if (!value) return NaN
  const direct = Date.parse(value)
  if (Number.isFinite(direct)) return direct
  if (typeof value === 'string') {
    const normalized = value.trim().replace(' ', 'T')
    const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`
    const fallback = Date.parse(withTimezone)
    if (Number.isFinite(fallback)) return fallback
  }
  return NaN
}

function getRestaurantKey(item) {
  const raw =
    item?.slug ??
    item?.restaurantSlug ??
    item?.restaurant_slug ??
    item?.name
  if (raw === null || raw === undefined || raw === '') return null
  return String(raw).trim().toLowerCase()
}

function isFastFoodCuisine(cuisineRaw) {
  if (!cuisineRaw) return false
  const normalized = String(cuisineRaw).toLowerCase().replace(/\s+/g, '')
  return (
    normalized.includes('фастфуд') ||
    normalized.includes('быстроепитание') ||
    normalized.includes('fastfood') ||
    normalized.includes('fast-food') ||
    normalized.includes('quickservice')
  )
}

function calculateRestaurantStats(restaurants) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const byRestaurant = new Map()

  for (const item of restaurants) {
    const key = getRestaurantKey(item)
    if (!key) continue

    const createdRaw = item?.menu_added_at ?? item?.menuAddedAt ?? item?.created_at ?? item?.createdAt
    const createdMs = parseTimestamp(createdRaw)
    const isRecent = Number.isFinite(createdMs) && createdMs >= weekAgo

    const prev = byRestaurant.get(key)
    if (!prev) {
      byRestaurant.set(key, { isRecent })
    } else if (!prev.isRecent && isRecent) {
      prev.isRecent = true
    }
  }

  const restaurantCount = byRestaurant.size
  let weeklyAdded = 0
  for (const row of byRestaurant.values()) {
    if (row.isRecent) weeklyAdded += 1
  }

  return {
    restaurants: restaurantCount,
    weeklyAdded: Math.min(weeklyAdded, restaurantCount),
  }
}

export default function RestaurantMap({
  themeMode = 'day',
  onStatsChange,
  showSummaryHeader = true,
  openFullscreenSignal = 0,
  selectedCity: controlledCity,
}) {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [metroData, setMetroData] = useState({ lines: [], stations: [] })
  const [cuisines, setCuisines] = useState([])
  const [filters, setFilters] = useState({ cuisines: [], excludeFastFood: false })
  const [selectedCity, setSelectedCity] = useState(() => controlledCity || localStorage.getItem('catalog_city') || 'Москва')
  const [cityOptions, setCityOptions] = useState([])
  const [selectedMetroStation, setSelectedMetroStation] = useState(null)
  const [focusTarget, setFocusTarget] = useState(null)
  const [isDefaultView, setIsDefaultView] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const accessToken = useAuth((state) => state.accessToken)
  const { favoriteLookup, loadFavoriteRestaurants } = useFavoriteRestaurantsStore((state) => ({
    favoriteLookup: state.lookup,
    loadFavoriteRestaurants: state.load,
  }))
  const favoriteSlugs = useMemo(
    () => new Set(Array.from(favoriteLookup || []).map((slug) => String(slug).trim().toLowerCase())),
    [favoriteLookup],
  )
  // # Several real metro systems reuse the same station name (Автозаводская: Moscow,
  // # Minsk, Nizhny Novgorod), so the picker needs one city at a time to stay
  // # unambiguous - "Москва" as the default since that's where the catalog's
  // # restaurants actually are today.
  const availableCities = useMemo(() => cityOptions.map((city) => city.id), [cityOptions])
  const selectedCityMeta = cityOptions.find((city) => city.id === selectedCity)
  const cityCenter = selectedCityMeta?.center
    ? [selectedCityMeta.center.lat, selectedCityMeta.center.lon]
    : defaultCenter
  const cityMetroData = useMemo(
    () => ({ stations: metroData.stations.filter((s) => s.city === selectedCity) }),
    [metroData.stations, selectedCity],
  )
  const handleSelectCity = useCallback((city) => {
    setSelectedCity(city)
    saveCatalogCity(city, 'manual', accessToken)
    setSelectedMetroStation(null)
    const meta = cityOptions.find((item) => item.id === city)
    if (meta?.center) setFocusTarget({ lat: meta.center.lat, lon: meta.center.lon, zoom: meta.recommendedZoom || defaultZoom, key: `city-${city}` })
  }, [accessToken, cityOptions])
  const selectedMetroStationName = useMemo(
    () => normalizeStationName(selectedMetroStation?.name_ru),
    [selectedMetroStation],
  )
  const selectedMetroStationPoints = useMemo(
    () => getStationPoints(selectedMetroStation),
    [selectedMetroStation],
  )
  const visibleRestaurants = useMemo(() => {
    return restaurants.filter((restaurant) => {
      if (filters.excludeFastFood && isFastFoodCuisine(restaurant?.cuisine)) return false
      if (!selectedMetroStationName) return true

      const metroNames = getMetroNames(restaurant)
      if (metroNames.includes(selectedMetroStationName)) return true

      return isRestaurantNearStation(restaurant, selectedMetroStationPoints)
    })
  }, [restaurants, filters.excludeFastFood, selectedMetroStationName, selectedMetroStationPoints])
  const { restaurants: uniqueRestaurantCount, weeklyAdded } = calculateRestaurantStats(visibleRestaurants)
  const isNight = themeMode === 'night'
  const hasOverlayMapButton = !showSummaryHeader

  const cityZoom = selectedCityMeta?.recommendedZoom || defaultZoom

  const handleViewportChange = useCallback(({ lat, lon, zoom }) => {
    const sameZoom = Math.abs(zoom - cityZoom) < 0.01
    const sameLat = Math.abs(lat - cityCenter[0]) < 0.001
    const sameLon = Math.abs(lon - cityCenter[1]) < 0.001
    setIsDefaultView(sameZoom && sameLat && sameLon)
  }, [cityCenter, cityZoom])

  useEffect(() => {
    if (!controlledCity || controlledCity === selectedCity) return
    setSelectedCity(controlledCity)
    setSelectedMetroStation(null)
    setFilters({ cuisines: [], excludeFastFood: false })
  }, [controlledCity, selectedCity])

  useEffect(() => {
    if (!selectedCityMeta?.center) return
    setFocusTarget({
      lat: selectedCityMeta.center.lat,
      lon: selectedCityMeta.center.lon,
      zoom: cityZoom,
      key: `city-${selectedCity}`,
    })
  }, [cityZoom, selectedCity, selectedCityMeta])

  useEffect(() => {
    loadFavoriteRestaurants(accessToken || '')
  }, [accessToken, loadFavoriteRestaurants])

  useEffect(() => {
    async function fetchMetro() {
      try {
        const res = await fetch(`${API_BASE}/metro`)
        if (res.ok) {
          const data = await res.json()
          setMetroData(data)
        }
      } catch (err) {
        console.error('Failed to load metro data', err)
      }
    }

    async function fetchCities() {
      try {
        const res = await fetch(`${API_BASE}/cities`)
        if (res.ok) setCityOptions((await res.json()).items || [])
      } catch (err) {
        console.error('Failed to load cities', err)
      }
    }

    async function fetchCuisines() {
      try {
        const res = await fetch(`${API_BASE}/filters?city=${encodeURIComponent(selectedCity)}`)
        if (res.ok) {
          const data = await res.json()
          setCuisines(data.cuisines || [])
        }
      } catch (err) {
        console.error('Failed to load cuisines data', err)
      }
    }

    fetchMetro()
    fetchCities()
    fetchCuisines()
  }, [selectedCity])

  useEffect(() => {
    async function fetchRestaurants() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('city', selectedCity)
        if (filters.cuisines && filters.cuisines.length > 0) {
          filters.cuisines.forEach((cuisine) => params.append('cuisine', cuisine))
        }

        const res = await fetch(`${API_BASE}/restaurants/map?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setRestaurants(data.items || [])
        }
      } catch (err) {
        console.error('Failed to load map data', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurants()
  }, [filters.cuisines, selectedCity])

  useEffect(() => {
    if (typeof onStatsChange !== 'function') return
    onStatsChange({
      restaurants: uniqueRestaurantCount,
      points: visibleRestaurants.length,
      weeklyAdded,
    })
  }, [onStatsChange, visibleRestaurants, uniqueRestaurantCount, weeklyAdded])

  useEffect(() => {
    if (!isFullscreen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!openFullscreenSignal) return
    setIsFullscreen(true)
  }, [openFullscreenSignal])

  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  return (
    <div className={`restaurant-map-container ${showSummaryHeader ? '' : 'is-landing'} ${isNight ? 'is-night' : 'is-day'} ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {showSummaryHeader && (
        <div className="map-header">
          <div className="header-left">
            <h3>Карта ресторанов</h3>
            <span className="badge">{uniqueRestaurantCount} ресторанов • {visibleRestaurants.length} точек</span>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="map-expand-btn"
              onClick={() => setIsFullscreen((prev) => !prev)}
            >
              {isFullscreen ? 'Свернуть карту' : 'Развернуть карту'}
            </button>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="fullscreen-topbar">
          <div className="filters-row">
            <MapCityFilter
              cities={availableCities}
              selectedCity={selectedCity}
              onChange={handleSelectCity}
            />
            <MetroFilter
              metroData={cityMetroData}
              selectedStationName={selectedMetroStation?.name_ru || ''}
              onSelectStation={(station) => setSelectedMetroStation(station)}
              onClearStation={() => setSelectedMetroStation(null)}
              onJumpToStation={(station) =>
                setFocusTarget({
                  lat: station.lat,
                  lon: station.lon,
                  key: `${station.name_ru}-${Date.now()}`,
                })
              }
            />
            <MapCuisineFilter
              cuisines={cuisines}
              selectedCuisines={filters.cuisines}
              onChange={(f) => setFilters((prev) => ({ ...prev, cuisines: f.cuisines }))}
            />
            <label className="map-fastfood-filter" htmlFor="exclude-fastfood-checkbox">
              <input
                id="exclude-fastfood-checkbox"
                type="checkbox"
                checked={filters.excludeFastFood}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, excludeFastFood: event.target.checked }))
                }
              />
              <span>Исключить сети фастфуд</span>
            </label>
          </div>
          <button
            type="button"
            className="map-close-btn"
            aria-label="Свернуть карту"
            onClick={() => setIsFullscreen(false)}
          >
            ×
          </button>
        </div>
      )}

      <div className="map-wrapper">
        {!isFullscreen && !showSummaryHeader && (
          <button
            type="button"
            className="map-expand-btn map-expand-btn--overlay"
            onClick={() => setIsFullscreen(true)}
          >
            Развернуть карту
          </button>
        )}
        {loading && <div className="map-overlay">Загрузка...</div>}
        {!isDefaultView && (
          <button
            type="button"
            className={`show-city-btn ${hasOverlayMapButton && !isFullscreen ? 'show-city-btn--stacked' : ''}`}
            onClick={() =>
              setFocusTarget({
                lat: cityCenter[0],
                lon: cityCenter[1],
                zoom: cityZoom,
                key: `default-${Date.now()}`,
              })
            }
          >
            Показать весь город
          </button>
        )}

        <MapContainer
          center={cityCenter}
          zoom={cityZoom}
          scrollWheelZoom={isFullscreen}
          className="restaurant-map"
          attributionControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url={tileUrl}
          />
          <AttributionControl prefix={false} />
          <MapViewportController focusTarget={focusTarget} />
          <ViewportChangeListener onViewportChange={handleViewportChange} />
          <MapResizeController watch={`${isFullscreen}-${themeMode}`} />
          <ClusterLayer restaurants={visibleRestaurants} favoriteSlugs={favoriteSlugs} />
        </MapContainer>
      </div>

      <style>{`
        .restaurant-map-container {
          margin-top: 12px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid var(--line, #e2e8f0);
          background: var(--card, #fff);
          position: relative;
        }

        .restaurant-map-container.is-landing {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        .restaurant-map-container.is-night {
          background: #10141b;
          border-color: rgba(148, 163, 184, 0.24);
        }

        .map-header {
          padding: 10px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .map-header h3 {
          margin: 0;
          font-size: 15px;
          white-space: nowrap;
        }

        .restaurant-map-container.is-night .map-header h3 {
          color: #e2e8f0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .map-expand-btn {
          border: 1px solid rgba(255, 255, 255, 0.72);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.82) 0%, rgba(248, 250, 252, 0.68) 100%);
          color: #0f172a;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          padding: 8px 12px;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 8px 20px rgba(148, 163, 184, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.72);
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
        }

        .map-expand-btn:hover {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.78) 100%);
          border-color: rgba(255, 255, 255, 0.84);
          transform: translateY(-1px);
        }

        .map-expand-btn--overlay {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 80;
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.18);
        }

        .restaurant-map-container.is-night .map-expand-btn {
          background: rgba(71, 85, 105, 0.42);
          border-color: rgba(148, 163, 184, 0.45);
          color: #e2e8f0;
        }

        .filters-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 0 10px 10px;
          align-items: flex-start;
        }

        .fullscreen-topbar {
          position: relative;
          z-index: 1201;
          padding: 10px 12px 8px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .fullscreen-topbar .filters-row {
          padding: 0;
          padding-right: 52px;
        }

        .map-close-btn {
          position: absolute;
          top: 10px;
          right: 12px;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(255, 255, 255, 0.92);
          color: #0f172a;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          box-shadow: 0 8px 20px rgba(148, 163, 184, 0.24);
        }

        .map-close-btn:hover {
          background: rgba(255, 255, 255, 1);
        }

        .filters-row .metro-filter-container,
        .filters-row .cuisine-filter-container {
          margin: 0 !important;
          width: 260px;
        }

        .filters-row .city-filter-container {
          margin: 0 !important;
          width: 160px;
        }

        .map-fastfood-filter {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 40px;
          padding: 8px 12px;
          border-radius: 12px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: rgba(255, 255, 255, 0.88);
          box-shadow: 0 6px 16px rgba(148, 163, 184, 0.18);
          color: #0f172a;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.2;
          user-select: none;
        }

        .map-fastfood-filter input {
          width: 16px;
          height: 16px;
          accent-color: #2f8f5b;
          margin: 0;
          flex-shrink: 0;
        }

        .restaurant-map-container.is-night .map-fastfood-filter {
          background: rgba(30, 41, 59, 0.84);
          border-color: rgba(148, 163, 184, 0.38);
          color: #dbe7f8;
          box-shadow: 0 8px 20px rgba(2, 6, 23, 0.32);
        }

        .badge {
          background: var(--brand, #2f8f5b);
          color: #fff;
          padding: 3px 8px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .map-wrapper {
          position: relative;
          border-top: 1px solid var(--line, #e2e8f0);
        }

        .restaurant-map-container.is-landing .map-wrapper {
          flex: 1;
          min-height: 0;
        }

        .restaurant-map-container > .map-wrapper:first-child {
          border-top: 0;
        }

        .restaurant-map-container.is-night .map-wrapper {
          border-top-color: rgba(148, 163, 184, 0.24);
        }

        .map-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.65);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
        }

        .show-city-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 79;
          border: 1px solid rgba(255, 255, 255, 0.72);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.82) 0%, rgba(248, 250, 252, 0.68) 100%);
          color: #0f172a;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
          padding: 8px 10px;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 8px 20px rgba(148, 163, 184, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.72);
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
        }

        .show-city-btn:hover {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.78) 100%);
          border-color: rgba(255, 255, 255, 0.84);
          transform: translateY(-1px);
        }

        .show-city-btn--stacked {
          top: 54px;
        }

        .restaurant-map-container.is-night .map-overlay {
          background: rgba(8, 16, 30, 0.58);
          color: #dbe7f8;
        }

        .restaurant-map-container.is-night .show-city-btn {
          background: rgba(71, 85, 105, 0.42);
          border-color: rgba(148, 163, 184, 0.45);
          color: #e2e8f0;
        }

        .restaurant-map {
          height: min(20dvh, 180px);
          width: 100%;
          z-index: 1;
        }

        .restaurant-map-container.is-landing .restaurant-map {
          height: 100%;
          min-height: 180px;
        }

        .map-popup {
          font-size: 14px;
          text-align: center;
        }

        .popup-link {
          color: var(--brand, #2f8f5b);
          font-weight: 600;
          text-decoration: none;
          display: inline-flex;
          margin-top: 4px;
        }

        .popup-links {
          margin-top: 4px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .popup-web {
          display: inline-flex;
          width: 18px;
          height: 18px;
          color: #4d463e;
        }

        .popup-web svg {
          width: 18px;
          height: 18px;
        }

        .map-fav-marker-wrapper {
          background: transparent;
          border: 0;
        }

        .map-fav-marker {
          position: relative;
          width: 25px;
          height: 41px;
        }

        .map-fav-marker img {
          width: 25px;
          height: 41px;
          display: block;
        }

        .map-fav-marker__heart {
          position: absolute;
          top: -6px;
          right: -9px;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #fff;
          color: #e11d48;
          font-size: 10px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 7px rgba(15, 23, 42, 0.3);
        }

        .restaurant-map-container.is-fullscreen {
          position: fixed;
          inset: 0;
          z-index: 1400;
          border-radius: 0;
          border: none;
          margin: 0;
          width: 100vw;
          height: 100dvh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
        }

        .restaurant-map-container.is-night .fullscreen-topbar {
          background: rgba(15, 23, 42, 0.9);
          border-bottom-color: rgba(148, 163, 184, 0.3);
        }

        .restaurant-map-container.is-night .map-close-btn {
          background: rgba(71, 85, 105, 0.42);
          border-color: rgba(148, 163, 184, 0.45);
          color: #e2e8f0;
        }

        .restaurant-map-container.is-fullscreen .map-wrapper {
          flex: 1;
          min-height: 0;
          border-top: 0;
        }

        .restaurant-map-container.is-fullscreen .restaurant-map {
          height: 100%;
          min-height: 0;
        }

        @media (max-width: 768px) {
          .map-header {
            padding: 8px 10px;
          }

          .map-header h3 {
            font-size: 14px;
          }

          .badge {
            font-size: 11px;
          }

          .map-expand-btn {
            font-size: 12px;
            padding: 7px 10px;
          }

          .filters-row {
            flex-direction: column;
          }

          .fullscreen-topbar .filters-row {
            padding-right: 0;
            padding-top: 40px;
          }

          .filters-row .metro-filter-container,
          .filters-row .cuisine-filter-container,
          .filters-row .city-filter-container,
          .filters-row .map-fastfood-filter {
            width: 100%;
          }

          .restaurant-map {
            height: min(20dvh, 170px);
          }

          .restaurant-map-container.is-landing .restaurant-map {
            height: 100%;
            min-height: 190px;
          }

          .restaurant-map-container.is-fullscreen .restaurant-map {
            height: 100%;
          }
        }
      `}</style>
    </div>
  )
}
