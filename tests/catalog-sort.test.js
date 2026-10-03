import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CATALOG_SORT_OPTIONS,
  normalizeCatalogSort,
  sortCatalogItems,
} from '../src/lib/catalogSort.js'

test('exposes the three requested catalog sort options plus the default', () => {
  assert.deepEqual(CATALOG_SORT_OPTIONS.map((option) => option.value), [
    'name',
    'matching_dishes',
    'rating',
    'metro_distance',
  ])
  assert.equal(normalizeCatalogSort('unknown'), 'name')
})

test('sorts by matching dishes, rating, and nearest metro with deterministic fallbacks', () => {
  const items = [
    { name: 'Бета', matchingDishesCount: 2, googleRating: 4.9, metroDistanceMeters: 900 },
    { name: 'Альфа', matchingDishesCount: 5, googleRating: 4.9, metroDistanceMeters: 700 },
    { name: 'Гамма', matchingDishesCount: null, googleRating: null, metroDistanceMeters: null },
  ]

  assert.deepEqual(sortCatalogItems(items, 'matching_dishes', (item) => item.matchingDishesCount).map((item) => item.name), ['Альфа', 'Бета', 'Гамма'])
  assert.deepEqual(sortCatalogItems(items, 'rating').map((item) => item.name), ['Альфа', 'Бета', 'Гамма'])
  assert.deepEqual(sortCatalogItems(items, 'metro_distance').map((item) => item.name), ['Альфа', 'Бета', 'Гамма'])
})

test('uses the nearest station when the API distance field is absent', () => {
  const items = [
    { name: 'Дальше', metroStations: [{ distanceMeters: 800 }] },
    { name: 'Ближе', metroStations: [{ distanceMeters: 350 }, { distanceMeters: 500 }] },
  ]

  assert.deepEqual(sortCatalogItems(items, 'metro_distance').map((item) => item.name), ['Ближе', 'Дальше'])
})
