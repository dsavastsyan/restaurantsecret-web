import { normalizeDish } from './nutrition.js'

export const DEFAULT_CALORIE_RANGES = [
  { key: 'lt300', label: 'До 300 ккал', min: 0, max: 299 },
  { key: '300to600', label: '300–600 ккал', min: 300, max: 600 },
  { key: 'gt600', label: 'Больше 600 ккал', min: 601, max: 5000 },
]

const NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs']

function getNutritionCriteriaEntries(criteria = {}) {
  return NUTRITION_FIELDS.map((field) => {
    const value = criteria[field] || {}
    const min = value.min === '' || value.min == null ? null : Number(value.min)
    const max = value.max === '' || value.max == null ? null : Number(value.max)
    return {
      field: field === 'calories' ? 'kcal' : field,
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    }
  }).filter(({ min, max }) => min !== null || max !== null)
}

export function hasCatalogNutritionCriteria(criteria = {}) {
  return getNutritionCriteriaEntries(criteria).length > 0
}

function matchesNutritionDish(dish, entries) {
  return entries.every(({ field, min, max }) => {
    const value = Number(dish?.[field])
    // Keep restaurants visible when the API has not embedded that macro yet;
    // the server/card can still provide the nutrition information later.
    if (!Number.isFinite(value)) return true
    if (min !== null && value < min) return false
    if (max !== null && value > max) return false
    return true
  })
}

export function getCatalogNutritionStatsForCriteria(restaurant, criteria = {}) {
  const dishes = getCatalogNutritionDishes(restaurant)
  const total = Number.isFinite(Number(restaurant?.dishesCount)) ? Number(restaurant.dishesCount) : dishes.length
  const entries = getNutritionCriteriaEntries(criteria)

  if (!entries.length) return { total, matching: total, hasData: dishes.length > 0 || total > 0 }
  const backendMatching = Number(restaurant?.matchingDishesCount)
  if (!dishes.length && Number.isFinite(backendMatching)) {
    return { total, matching: backendMatching, hasData: true }
  }
  if (!dishes.length) return { total, matching: null, hasData: false }

  return {
    total,
    matching: dishes.filter((dish) => matchesNutritionDish(dish, entries)).length,
    hasData: true,
  }
}

export function matchesCatalogNutritionCriteria(restaurant, criteria = {}) {
  const entries = getNutritionCriteriaEntries(criteria)
  if (!entries.length) return true

  const dishes = getCatalogNutritionDishes(restaurant)
  if (!dishes.length) return true
  return dishes.some((dish) => matchesNutritionDish(dish, entries))
}

const DISH_LIST_KEYS = ['dishes', 'menu_preview', 'popular_dishes', 'topDishes', 'top_dishes']
const SUMMARY_KEYS = ['nutritionCounts', 'nutrition_counts', 'kbjuCounts', 'kbju_counts', 'calorieCounts', 'calorie_counts']

export function getCatalogNutritionDishes(restaurant) {
  for (const key of DISH_LIST_KEYS) {
    if (Array.isArray(restaurant?.[key])) {
      return restaurant[key].map((dish) => normalizeDish(typeof dish === 'string' ? { name: dish } : dish))
    }
  }
  return []
}

function getNutritionSummary(restaurant, rangeKey) {
  for (const key of SUMMARY_KEYS) {
    const summary = restaurant?.[key]
    if (!summary || typeof summary !== 'object') continue
    const value = summary[rangeKey]
    if (Number.isFinite(Number(value))) return Number(value)
  }

  const ranges = restaurant?.calorieRanges || restaurant?.calorie_ranges
  if (ranges && typeof ranges === 'object' && Number.isFinite(Number(ranges[rangeKey]))) {
    return Number(ranges[rangeKey])
  }

  return null
}

export function getCatalogNutritionStats(restaurant, range) {
  const dishes = getCatalogNutritionDishes(restaurant)
  const total = Number.isFinite(Number(restaurant?.dishesCount)) ? Number(restaurant.dishesCount) : dishes.length

  if (!range) return { total, matching: total, hasData: dishes.length > 0 || total > 0 }

  const summaryCount = getNutritionSummary(restaurant, range.key)
  if (summaryCount !== null) return { total, matching: summaryCount, hasData: true }

  if (dishes.length > 0) {
    const matching = dishes.filter((dish) => {
      const kcal = Number(dish.kcal)
      return Number.isFinite(kcal) && kcal >= Number(range.min) && kcal <= Number(range.max)
    }).length
    return { total, matching, hasData: true }
  }

  return { total, matching: null, hasData: false }
}

export function matchesCatalogNutritionFilter(restaurant, range) {
  if (!range) return true
  const stats = getCatalogNutritionStats(restaurant, range)
  return stats.matching === null || stats.matching > 0
}

export function formatRestaurantPriceRange(restaurant) {
  const raw = restaurant?.priceRange ?? restaurant?.price_range ?? restaurant?.priceRangeRub ?? restaurant?.price_range_rub
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') {
    const min = Number(raw.min ?? raw.from ?? raw.startPrice?.units ?? raw.start_price?.units)
    const max = Number(raw.max ?? raw.to ?? raw.endPrice?.units ?? raw.end_price?.units)
    const currency = raw.currency ?? raw.currencyCode ?? raw.startPrice?.currencyCode ?? raw.start_price?.currencyCode ?? 'RUB'
    const currencyLabel = currency === 'RUB' ? '₽' : currency
    if (Number.isFinite(min) && Number.isFinite(max)) return `${min}–${max} ${currencyLabel}`
    if (Number.isFinite(min)) return `от ${min} ${currencyLabel}`
  }
  return null
}

export function getRestaurantGoogleRating(restaurant) {
  const value = Number(restaurant?.googleRating ?? restaurant?.google_rating ?? restaurant?.rating)
  return Number.isFinite(value) && value > 0 ? value.toFixed(1) : null
}
