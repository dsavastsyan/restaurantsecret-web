import { getSearchQueryScore, matchesSearchQuery } from './text.ts'

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
  { query = '', cuisines = [], metro = '', sortByRelevance = false } = {},
) {
  const normalizedQuery = String(query).trim()
  const normalizedCuisines = cuisines
    .map((cuisine) => String(cuisine || '').trim().toLowerCase())
    .filter(Boolean)
  const normalizedMetro = String(metro).trim().toLowerCase()

  const matches = items.filter((item) => {
    const itemCuisines = String(item?.cuisine || '')
      .toLowerCase()
      .split(',')
      .map((cuisine) => cuisine.trim())
      .filter(Boolean)
    const matchesQuery = !normalizedQuery || matchesSearchQuery(item?.name, normalizedQuery)
    const matchesCuisine = !normalizedCuisines.length || normalizedCuisines.some((selectedCuisine) => (
      itemCuisines.some((itemCuisine) => itemCuisine.includes(selectedCuisine))
    ))
    const matchesMetro = !normalizedMetro
      || getCatalogRestaurantMetroNames(item).includes(normalizedMetro)

    return matchesQuery && matchesCuisine && matchesMetro
  })

  if (!normalizedQuery || !sortByRelevance) return matches

  return matches
    .map((item, index) => ({ item, index, score: getSearchQueryScore(item?.name, normalizedQuery) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item)
}
