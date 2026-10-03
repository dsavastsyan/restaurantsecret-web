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
import {
  DEFAULT_CATALOG_RADIUS_KM,
  parseCatalogFilterState,
  serializeCatalogFilterState,
} from '../src/lib/catalogFilterParams.js'
import { flattenMenuGroups } from '../src/lib/nutrition.js'

test('flattens grouped menu variants into one selectable menu group', () => {
  const groups = flattenMenuGroups({
    categories: [{
      name: 'Кофе',
      groups: [{
        id: 101,
        name: 'Капучино',
        hasVariants: true,
        variants: [
          { id: 1011, name: 'Капучино Medium (овсяное молоко)', size: { key: 'medium', label: 'Medium' }, milk: { key: 'oat', label: 'Овсяное молоко' }, kcal: 120, price: 280 },
          { id: 1012, name: 'Капучино Large (кокосовое молоко)', size: { key: 'large', label: 'Large' }, milk: { key: 'coconut', label: 'Кокосовое молоко' }, kcal: 180, price: 340 },
        ],
      }],
    }],
  })

  assert.equal(groups.length, 1)
  assert.equal(groups[0].name, 'Капучино')
  assert.equal(groups[0].hasVariants, true)
  assert.equal(groups[0].variantCount, 2)
  assert.equal(groups[0].variants[1].kcal, 180)
  assert.equal(groups[0].variants[1].price, 340)
})

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

test('uses the backend matching dish count when menu details are not embedded', () => {
  const criteria = { calories: { min: '', max: 400 } }

  assert.equal(
    matchesCatalogNutritionCriteria({ dishesCount: 83, matchingDishesCount: 2 }, criteria),
    true,
  )
  assert.equal(
    matchesCatalogNutritionCriteria({ dishesCount: 41, matchingDishesCount: 0 }, criteria),
    false,
  )
  assert.equal(
    getCatalogNutritionStatsForCriteria({ dishesCount: 41, matchingDishesCount: 0 }, criteria).matching,
    0,
  )
  assert.equal(
    getCatalogNutritionStatsForCriteria({
      dishesCount: 83,
      matchingDishesCount: 2,
      dishes: [{ kcal: 220 }, { kcal: 480 }, { kcal: 720 }],
    }, criteria).matching,
    2,
  )
})

test('round-trips catalog filters through the menu navigation URL', () => {
  const params = new URLSearchParams('view=list')
  serializeCatalogFilterState(params, {
    selectedCuisines: ['Итальянская'],
    selectedVenueTypes: ['restaurant'],
    selectedMetro: ['Тверская'],
    locationMode: 'nearby',
    radiusKm: 3,
    nearbyPoint: { lat: 55.75, lon: 37.62 },
    nearbyPointLabel: 'моё местоположение',
    addressQuery: '',
    sort: 'rating',
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
    radiusKm: 3,
    nearbyPoint: { lat: 55.75, lon: 37.62 },
    nearbyPointLabel: 'моё местоположение',
    addressQuery: '',
    sort: 'rating',
    nutritionCriteria: {
      calories: { min: '', max: '400' },
      protein: { min: '25', max: '' },
      fat: { min: '', max: '' },
      carbs: { min: '', max: '60' },
    },
  })
})

test('defaults to the center with a 3 km radius and persists an empty location filter', () => {
  assert.equal(DEFAULT_CATALOG_RADIUS_KM, 3)
  assert.deepEqual(
    parseCatalogFilterState(new URLSearchParams()),
    {
      selectedCuisines: [],
      selectedVenueTypes: [],
      selectedMetro: [],
      locationMode: 'center',
      radiusKm: DEFAULT_CATALOG_RADIUS_KM,
      nearbyPoint: null,
      nearbyPointLabel: '',
      addressQuery: '',
      sort: 'name',
      nutritionCriteria: {
        calories: { min: '', max: '' },
        protein: { min: '', max: '' },
        fat: { min: '', max: '' },
        carbs: { min: '', max: '' },
      },
    },
  )
  assert.equal(parseCatalogFilterState(new URLSearchParams('catalog_location=center&catalog_radius=none')).radiusKm, 3)

  const activeParams = new URLSearchParams()
  serializeCatalogFilterState(activeParams, {
    selectedCuisines: [],
    selectedVenueTypes: [],
    selectedMetro: [],
    locationMode: 'center',
    radiusKm: null,
    nearbyPoint: null,
    nearbyPointLabel: '',
    addressQuery: '',
    nutritionCriteria: {},
  })
  assert.equal(activeParams.get('catalog_location'), 'center')
  assert.equal(activeParams.get('catalog_radius'), '3')

  assert.deepEqual(
    parseCatalogFilterState(new URLSearchParams('catalog_location=none')),
    {
      selectedCuisines: [],
      selectedVenueTypes: [],
      selectedMetro: [],
      locationMode: null,
      radiusKm: null,
      nearbyPoint: null,
      nearbyPointLabel: '',
      addressQuery: '',
      sort: 'name',
      nutritionCriteria: {
        calories: { min: '', max: '' },
        protein: { min: '', max: '' },
        fat: { min: '', max: '' },
        carbs: { min: '', max: '' },
      },
    },
  )

  const params = new URLSearchParams('catalog_location=center&catalog_radius=3')
  serializeCatalogFilterState(params, {
    selectedCuisines: [],
    selectedVenueTypes: [],
    selectedMetro: [],
    locationMode: null,
    radiusKm: null,
    nearbyPoint: null,
    nearbyPointLabel: '',
    addressQuery: '',
    nutritionCriteria: {},
  })
  assert.equal(params.get('catalog_location'), 'none')
  assert.equal(params.has('catalog_radius'), false)
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
