export function normalizeCatalogCuisine(value) {
  if (!value) return ''

  const normalized = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === 'nan') return 'Другое'
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })

  return Array.from(new Set(normalized)).join(', ')
}

export const CATALOG_VENUE_TYPES = [
  { id: 'restaurant', name: 'Рестораны' },
  { id: 'cafe', name: 'Кафе' },
  { id: 'coffee_tea', name: 'Кофе и чай' },
  { id: 'fast_food', name: 'Быстрая еда' },
]

export function getCatalogRestaurantVenueType(restaurant) {
  const value = restaurant?.primary_venue_type ?? restaurant?.primaryVenueType
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return CATALOG_VENUE_TYPES.some((option) => option.id === normalized) ? normalized : ''
}

export function getCatalogRestaurantMetroNames(restaurant) {
  const values = [
    restaurant?.metro,
    restaurant?.metro_name,
    restaurant?.metroName,
    restaurant?.metro_station,
    restaurant?.metroStation,
    ...(Array.isArray(restaurant?.metroNames) ? restaurant.metroNames : []),
    ...(Array.isArray(restaurant?.metros) ? restaurant.metros : []),
  ]

  return Array.from(new Set(
    values
      .map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
      .filter(Boolean),
  ))
}

export function filterCatalogRestaurants(
  items,
  {
    query = '',
    cuisines = [],
    metro = '',
    venueType = '',
    sortByRelevance = false,
    matchesQuery = (candidate, value) => String(candidate || '').toLowerCase().includes(String(value).toLowerCase()),
    getQueryScore = () => 0,
  } = {},
) {
  const normalizedQuery = String(query).trim()
  const normalizedCuisines = cuisines
    .map((cuisine) => String(cuisine || '').trim().toLowerCase())
    .filter(Boolean)
  const normalizedMetro = String(metro).trim().toLowerCase()
  const normalizedVenueType = String(venueType).trim().toLowerCase()

  const matches = items.filter((item) => {
    const itemCuisines = String(item?.cuisine || '')
      .toLowerCase()
      .split(',')
      .map((cuisine) => cuisine.trim())
      .filter(Boolean)
    const queryMatches = !normalizedQuery || matchesQuery(item?.name, normalizedQuery)
    const matchesCuisine = !normalizedCuisines.length || normalizedCuisines.some((selectedCuisine) => (
      itemCuisines.some((itemCuisine) => itemCuisine.includes(selectedCuisine))
    ))
    const matchesMetro = !normalizedMetro
      || getCatalogRestaurantMetroNames(item).includes(normalizedMetro)
    const matchesVenueType = !normalizedVenueType
      || getCatalogRestaurantVenueType(item) === normalizedVenueType

    return queryMatches && matchesCuisine && matchesMetro && matchesVenueType
  })

  if (!normalizedQuery || !sortByRelevance) return matches

  return matches
    .map((item, index) => ({ item, index, score: getQueryScore(item?.name, normalizedQuery) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item)
}
