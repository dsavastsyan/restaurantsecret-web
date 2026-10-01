import { normalizeDish } from './nutrition.js'

export const DEFAULT_CALORIE_RANGES = [
  { key: 'lt300', label: 'До 300 ккал', min: 0, max: 299 },
  { key: '300to600', label: '300–600 ккал', min: 300, max: 600 },
  { key: 'gt600', label: 'Больше 600 ккал', min: 601, max: 5000 },
]

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
    const min = Number(raw.min ?? raw.from)
    const max = Number(raw.max ?? raw.to)
    if (Number.isFinite(min) && Number.isFinite(max)) return `${min}–${max} ₽`
    if (Number.isFinite(min)) return `от ${min} ₽`
  }
  return null
}

export function getRestaurantGoogleRating(restaurant) {
  const value = Number(restaurant?.googleRating ?? restaurant?.google_rating ?? restaurant?.rating)
  return Number.isFinite(value) && value > 0 ? value.toFixed(1) : null
}
