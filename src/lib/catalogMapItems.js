import { normalizeCatalogCuisine } from './catalogFilters.js'

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
