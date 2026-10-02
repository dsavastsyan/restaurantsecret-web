const FAST_FOOD_QUERY_VALUES = [
  'Фастфуд',
  'Быстрое питание',
  'Фаст-фуд',
  'Фаст фуд',
  'Быстрая еда',
  'Хот-доги',
  'Хотдоги',
  'Бургер',
]

const FAST_FOOD_ALIASES = new Set([
  'фастфуд',
  'фастфудсэндвичи',
  'фастфудсандвичи',
  'быстроепитание',
  'быстроепитаниесэндвичи',
  'быстроепитаниесандвичи',
  'быстраяеда',
  'хотдог',
  'хотдоги',
  'бургер',
  'бургеры',
  'бургерная',
  'сэндвич',
  'сэндвичи',
  'fastfood',
  'fastfoodsandwiches',
  'quickservice',
  'streetfood',
])

function cuisineKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[\s\p{Pd}_/\\()[\]{}.,;:!?]+/gu, '')
}

function normalizeCuisinePart(value) {
  const part = String(value || '')
    .trim()
    .replace(/^[\s()[\]{}.,;:!?]+|[\s()[\]{}.,;:!?]+$/gu, '')
  if (!part) return ''
  if (cuisineKey(part) === 'nan') return 'Другое'
  if (FAST_FOOD_ALIASES.has(cuisineKey(part))) return 'Фастфуд'
  return part.charAt(0).toLocaleUpperCase('ru-RU') + part.slice(1).toLocaleLowerCase('ru-RU')
}

export function normalizeCatalogCuisine(value) {
  if (!value) return ''

  const normalized = String(value)
    .split(',')
    .map(normalizeCuisinePart)
    .filter(Boolean)

  return Array.from(new Set(normalized)).join(', ')
}

export function getCatalogCuisineFilterValues(values = []) {
  const selected = Array.isArray(values) ? values : [values]
  const normalized = selected
    .flatMap((value) => normalizeCatalogCuisine(value).split(', '))
    .filter(Boolean)

  const aliases = normalized.flatMap((cuisine) => (
    cuisine === 'Фастфуд' ? FAST_FOOD_QUERY_VALUES : []
  ))

  // Keep every selected canonical value before the compatibility aliases. The
  // backend bounds repeated query values, so multi-selects must not lose a
  // second selected cuisine just because FastFood has legacy spellings.
  return Array.from(new Set([...normalized, ...aliases]))
}

export const CATALOG_VENUE_TYPES = [
  { id: 'restaurant', name: 'Рестораны' },
  { id: 'cafe', name: 'Кафе' },
  { id: 'coffee_tea', name: 'Кофе и чай' },
  { id: 'fast_food', name: 'Быстрая еда' },
  { id: 'bar', name: 'Бары' },
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
    metro = [],
    venueType = '',
    sortByRelevance = false,
    matchesQuery = (candidate, value) => String(candidate || '').toLowerCase().includes(String(value).toLowerCase()),
    getQueryScore = () => 0,
  } = {},
) {
  const normalizedQuery = String(query).trim()
  const normalizedCuisines = cuisines
    .flatMap((cuisine) => normalizeCatalogCuisine(cuisine).split(', '))
    .map((cuisine) => cuisine.trim().toLowerCase())
    .filter(Boolean)
  const normalizedMetro = (Array.isArray(metro) ? metro : [metro])
    .map((station) => String(station || '').trim().toLowerCase())
    .filter(Boolean)
  const normalizedVenueTypes = (Array.isArray(venueType) ? venueType : [venueType])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)

  const matches = items.filter((item) => {
    const itemCuisines = normalizeCatalogCuisine(item?.cuisine)
      .toLowerCase()
      .split(',')
      .map((cuisine) => cuisine.trim())
      .filter(Boolean)
    const queryMatches = !normalizedQuery
      || matchesQuery(item?.name, normalizedQuery)
      || matchesQuery(item?.chainName, normalizedQuery)
    const matchesCuisine = !normalizedCuisines.length || normalizedCuisines.some((selectedCuisine) => (
      itemCuisines.some((itemCuisine) => itemCuisine.includes(selectedCuisine))
    ))
    const restaurantMetroNames = getCatalogRestaurantMetroNames(item)
    const matchesMetro = !normalizedMetro.length
      || normalizedMetro.some((station) => restaurantMetroNames.includes(station))
    const matchesVenueType = !normalizedVenueTypes.length
      || normalizedVenueTypes.includes(getCatalogRestaurantVenueType(item))

    return queryMatches && matchesCuisine && matchesMetro && matchesVenueType
  })

  if (!normalizedQuery || !sortByRelevance) return matches

  return matches
    .map((item, index) => ({ item, index, score: getQueryScore(item?.name, normalizedQuery) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item)
}
