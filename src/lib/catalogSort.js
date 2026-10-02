export const DEFAULT_CATALOG_SORT = 'name'

export const CATALOG_SORT_OPTIONS = [
  { value: 'name', label: 'По названию' },
  { value: 'matching_dishes', label: 'По количеству подходящих блюд' },
  { value: 'rating', label: 'По рейтингу' },
  { value: 'metro_distance', label: 'По расстоянию от метро' },
]

const SORT_VALUES = new Set(CATALOG_SORT_OPTIONS.map((option) => option.value))

export function normalizeCatalogSort(value) {
  const normalized = String(value || '').trim()
  return SORT_VALUES.has(normalized) ? normalized : DEFAULT_CATALOG_SORT
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function compareNullableNumbers(left, right, direction) {
  const leftValue = numericValue(left)
  const rightValue = numericValue(right)
  if (leftValue === null && rightValue === null) return 0
  if (leftValue === null) return 1
  if (rightValue === null) return -1
  return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue
}

function getMetroDistance(item) {
  const directDistance = numericValue(item?.metroDistanceMeters ?? item?.metro_distance_m)
  if (directDistance !== null) return directDistance

  const distances = (Array.isArray(item?.metroStations) ? item.metroStations : [])
    .map((station) => numericValue(station?.distanceMeters ?? station?.distance_meters))
    .filter((distance) => distance !== null)
  return distances.length ? Math.min(...distances) : null
}

export function sortCatalogItems(items, sortBy = DEFAULT_CATALOG_SORT, getMatchingCount = () => null) {
  const normalizedSort = normalizeCatalogSort(sortBy)
  if (normalizedSort === DEFAULT_CATALOG_SORT) return items

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      let result = 0
      if (normalizedSort === 'matching_dishes') {
        result = compareNullableNumbers(getMatchingCount(left.item), getMatchingCount(right.item), 'desc')
      } else if (normalizedSort === 'rating') {
        result = compareNullableNumbers(
          left.item?.googleRating ?? left.item?.google_rating ?? left.item?.rating,
          right.item?.googleRating ?? right.item?.google_rating ?? right.item?.rating,
          'desc',
        )
      } else if (normalizedSort === 'metro_distance') {
        result = compareNullableNumbers(getMetroDistance(left.item), getMetroDistance(right.item), 'asc')
      }

      return result || String(left.item?.name || '').localeCompare(String(right.item?.name || ''), 'ru')
        || left.index - right.index
    })
    .map(({ item }) => item)
}
