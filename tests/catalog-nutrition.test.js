import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_CALORIE_RANGES,
  formatRestaurantPriceRange,
  getCatalogNutritionStats,
  getRestaurantGoogleRating,
  matchesCatalogNutritionFilter,
} from '../src/lib/catalogNutrition.js'

test('counts matching dishes in a calorie range without exposing dish cards', () => {
  const restaurant = {
    dishesCount: 3,
    dishes: [
      { name: 'Суп', kcal: 220 },
      { name: 'Паста', kcal: 480 },
      { name: 'Десерт', kcal: 720 },
    ],
  }

  assert.deepEqual(getCatalogNutritionStats(restaurant, DEFAULT_CALORIE_RANGES[0]), {
    total: 3,
    matching: 1,
    hasData: true,
  })
  assert.equal(matchesCatalogNutritionFilter(restaurant, DEFAULT_CALORIE_RANGES[2]), true)
  assert.equal(getCatalogNutritionStats(restaurant, null).total, 3)
})

test('uses a backend-provided nutrition summary when dish details are not embedded', () => {
  const restaurant = { dishesCount: 42, nutritionCounts: { lt300: 12, '300to600': 20, gt600: 10 } }

  assert.equal(getCatalogNutritionStats(restaurant, DEFAULT_CALORIE_RANGES[1]).matching, 20)
  assert.equal(matchesCatalogNutritionFilter(restaurant, DEFAULT_CALORIE_RANGES[0]), true)
})

test('keeps optional restaurant metadata absent instead of inventing values', () => {
  assert.equal(formatRestaurantPriceRange({}), null)
  assert.equal(formatRestaurantPriceRange({ price_range: { min: 900, max: 1600 } }), '900–1600 ₽')
  assert.equal(getRestaurantGoogleRating({}), null)
  assert.equal(getRestaurantGoogleRating({ google_rating: 4.7 }), '4.7')
})
