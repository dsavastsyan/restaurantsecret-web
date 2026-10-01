import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_CALORIE_RANGES,
  formatRestaurantPriceRange,
  getCatalogNutritionStats,
  getCatalogNutritionStatsForCriteria,
  getRestaurantGoogleRating,
  hasCatalogNutritionCriteria,
  matchesCatalogNutritionCriteria,
  matchesCatalogNutritionFilter,
} from '../src/lib/catalogNutrition.js'
import { parseCatalogFilterState, serializeCatalogFilterState } from '../src/lib/catalogFilterParams.js'

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

test('matches multiple quick and custom nutrition criteria against one dish', () => {
  const restaurant = {
    dishesCount: 2,
    dishes: [
      { name: 'Суп', kcal: 220, protein: 28, fat: 8, carbs: 22 },
      { name: 'Паста', kcal: 480, protein: 18, fat: 20, carbs: 54 },
    ],
  }
  const criteria = {
    calories: { min: '', max: 400 },
    protein: { min: 25, max: '' },
    fat: { min: '', max: 10 },
    carbs: { min: '', max: '' },
  }

  assert.equal(hasCatalogNutritionCriteria(criteria), true)
  assert.equal(matchesCatalogNutritionCriteria(restaurant, criteria), true)
  assert.equal(getCatalogNutritionStatsForCriteria(restaurant, criteria).matching, 1)
  assert.equal(matchesCatalogNutritionCriteria({ dishes: [{ kcal: 500, protein: 10 }] }, criteria), false)
})

test('round-trips catalog filters through the menu navigation URL', () => {
  const params = new URLSearchParams('view=list')
  serializeCatalogFilterState(params, {
    selectedCuisines: ['Итальянская'],
    selectedVenueTypes: ['restaurant'],
    selectedMetro: ['Тверская'],
    locationMode: 'nearby',
    radiusKm: null,
    nearbyPoint: { lat: 55.75, lon: 37.62 },
    nearbyPointLabel: 'моё местоположение',
    addressQuery: '',
    nutritionCriteria: {
      calories: { min: '', max: 400 },
      protein: { min: 25, max: '' },
      fat: { min: '', max: '' },
      carbs: { min: '', max: 60 },
    },
  })

  assert.deepEqual(parseCatalogFilterState(params), {
    selectedCuisines: ['Итальянская'],
    selectedVenueTypes: ['restaurant'],
    selectedMetro: ['Тверская'],
    locationMode: 'nearby',
    radiusKm: null,
    nearbyPoint: { lat: 55.75, lon: 37.62 },
    nearbyPointLabel: 'моё местоположение',
    addressQuery: '',
    nutritionCriteria: {
      calories: { min: '', max: '400' },
      protein: { min: '25', max: '' },
      fat: { min: '', max: '' },
      carbs: { min: '', max: '60' },
    },
  })
})

test('keeps optional restaurant metadata absent instead of inventing values', () => {
  assert.equal(formatRestaurantPriceRange({}), null)
  assert.equal(formatRestaurantPriceRange({ price_range: { min: 900, max: 1600 } }), '900–1600 ₽')
  assert.equal(formatRestaurantPriceRange({ priceRange: {
    startPrice: { currencyCode: 'RUB', units: '1000' },
    endPrice: { currencyCode: 'RUB', units: '2000' },
  } }), '1000–2000 ₽')
  assert.equal(getRestaurantGoogleRating({}), null)
  assert.equal(getRestaurantGoogleRating({ google_rating: 4.7 }), '4.7')
})
