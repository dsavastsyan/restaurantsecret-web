import {
  getCatalogRestaurantMetroNames,
  normalizeCatalogCuisine,
} from './catalogFilters.js'

const EARTH_RADIUS_METERS = 6_371_000
export const NEARBY_METRO_RADIUS_METERS = 1_500

const CATALOG_METRO_FIELDS = new Set([
  'metro',
  'metro_name',
  'metroName',
  'metro_station',
  'metroStation',
  'metroNames',
  'metros',
])

function withoutCatalogMetroFields(catalogItem) {
  return Object.fromEntries(
    Object.entries(catalogItem || {}).filter(([key]) => !CATALOG_METRO_FIELDS.has(key)),
  )
}

function normalizeIdentity(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).trim().toLowerCase()
}

function addMetroNames(target, key, restaurant) {
  if (!key) return
  const names = getCatalogRestaurantMetroNames(restaurant)
  if (!names.length) return

  const current = target.get(key) || new Set()
  names.forEach((name) => current.add(name))
  target.set(key, current)
}

export function enrichCatalogItemsWithMapMetros(catalogItems = [], mapItems = []) {
  const catalogSlugCounts = new Map()
  for (const item of catalogItems) {
    const slug = normalizeIdentity(item?.slug)
    if (slug) catalogSlugCounts.set(slug, (catalogSlugCounts.get(slug) || 0) + 1)
  }

  const metrosByRestaurantId = new Map()
  const metrosBySlug = new Map()
  for (const point of mapItems) {
    const restaurantId = normalizeIdentity(point?.restaurantId ?? point?.restaurant_id)
    const slug = normalizeIdentity(point?.slug ?? point?.restaurantSlug ?? point?.restaurant_slug)
    addMetroNames(metrosByRestaurantId, restaurantId, point)
    addMetroNames(metrosBySlug, slug, point)
  }

  return catalogItems.map((item) => {
    const restaurantId = normalizeIdentity(item?.id ?? item?.restaurantId ?? item?.restaurant_id)
    const slug = normalizeIdentity(item?.slug)
    const pointMetroNames = metrosByRestaurantId.get(restaurantId)
      || (catalogSlugCounts.get(slug) === 1 ? metrosBySlug.get(slug) : null)

    if (!pointMetroNames?.size) return item

    return {
      ...item,
      metroNames: Array.from(new Set([
        ...getCatalogRestaurantMetroNames(item),
        ...pointMetroNames,
      ])),
    }
  })
}

export function enrichCatalogMapItems(mapItems = [], catalogItems = []) {
  const catalogBySlug = new Map(
    catalogItems.map((item) => [String(item?.slug || '').toLowerCase(), item]),
  )

  return mapItems.map((item) => {
    const slug = item?.slug || item?.restaurantSlug || item?.restaurant_slug || ''
    const catalogItem = catalogBySlug.get(String(slug).toLowerCase())
    const catalogDisplayFields = withoutCatalogMetroFields(catalogItem)

    return {
      ...catalogDisplayFields,
      ...item,
      slug,
      name: item?.name || catalogItem?.name,
      cuisine: normalizeCatalogCuisine(item?.cuisine || catalogItem?.cuisine),
      // Metro belongs to a physical point. Never fall back to the catalog item:
      // chain rows share a slug, so doing that assigns one branch's station to
      // every other branch in the city.
      metro: item?.metro || item?.metro_name || item?.metroName || null,
      primary_venue_type: item?.primary_venue_type
        ?? item?.primaryVenueType
        ?? catalogItem?.primary_venue_type
        ?? catalogItem?.primaryVenueType,
    }
  })
}

export function getCatalogMapPointKey(restaurant) {
  const pointId = restaurant?.id ?? restaurant?.pointId ?? restaurant?.point_id
  const restaurantId = restaurant?.restaurantId ?? restaurant?.restaurant_id
  const slug = restaurant?.slug ?? restaurant?.restaurantSlug ?? restaurant?.restaurant_slug ?? restaurant?.name
  const lat = Number(restaurant?.lat)
  const lon = Number(restaurant?.lon ?? restaurant?.lng)
  const identity = restaurantId ?? slug ?? ''
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon)
  if ((pointId === null || pointId === undefined || pointId === '') && !identity && !hasPoint) return ''

  return [pointId ?? '', identity, Number.isFinite(lat) ? lat : '', Number.isFinite(lon) ? lon : '']
    .join(':')
    .trim()
    .toLowerCase()
}

function getCoordinates(item) {
  const lat = Number(item?.lat)
  const lon = Number(item?.lon ?? item?.lng)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

function distanceInMeters(left, right) {
  const toRadians = (value) => value * (Math.PI / 180)
  const latitudeDelta = toRadians(right.lat - left.lat)
  const longitudeDelta = toRadians(right.lon - left.lon)
  const leftLatitude = toRadians(left.lat)
  const rightLatitude = toRadians(right.lat)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine))
}

export function getNearbyMetroStations(
  stations = [],
  restaurants = [],
  maxDistanceMeters = NEARBY_METRO_RADIUS_METERS,
) {
  if (!restaurants.length) return []

  const restaurantPoints = restaurants.map(getCoordinates).filter(Boolean)
  const restaurantMetroNames = new Set(
    restaurants.flatMap(getCatalogRestaurantMetroNames),
  )

  return stations.filter((station) => {
    const stationName = String(station?.name_ru || station?.name || '').trim().toLowerCase()
    if (stationName && restaurantMetroNames.has(stationName)) return true

    const stationPoint = getCoordinates(station)
    if (!stationPoint) return false
    return restaurantPoints.some((restaurantPoint) => (
      distanceInMeters(restaurantPoint, stationPoint) <= maxDistanceMeters
    ))
  })
}
