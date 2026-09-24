import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterCatalogRestaurants,
  getCatalogRestaurantMetroNames,
  normalizeCatalogCuisine,
} from '../src/lib/catalogFilters.js'

test('normalizes catalog cuisines and replaces NaN with the fallback label', () => {
  assert.equal(normalizeCatalogCuisine('грузинская, ГРУЗИНСКАЯ, nan'), 'Грузинская, Другое')
})

test('uses the same query, cuisine and metro filters for map and list results', () => {
  const restaurants = [
    { name: 'Сыроварня', cuisine: 'Европейская, Итальянская', metro: 'Тверская' },
    { name: 'Кофемания', cuisine: 'Европейская', metroNames: ['Пушкинская', 'Тверская'] },
    { name: 'Тануки', cuisine: 'Японская', metro: 'Арбатская' },
  ]

  assert.deepEqual(
    filterCatalogRestaurants(restaurants, { cuisines: ['Европейская'], metro: 'Тверская' }),
    restaurants.slice(0, 2),
  )
  assert.deepEqual(filterCatalogRestaurants(restaurants, { query: 'танук' }), [restaurants[2]])
})

test('reads all supported metro fields used by catalog and map responses', () => {
  assert.deepEqual(
    getCatalogRestaurantMetroNames({ metro_name: 'Охотный ряд', metros: ['Театральная'] }),
    ['охотный ряд', 'театральная'],
  )
})
