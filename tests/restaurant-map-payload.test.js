import assert from 'node:assert/strict'
import test from 'node:test'

import { expandRestaurantMapPayload } from '../src/lib/restaurantMapPayload.js'

// Shape produced by the backend's buildCompactMapPayload.
const compactPayload = {
  format: 'compact',
  count: 3,
  truncated: false,
  pointFields: ['locationId', 'restaurant', 'lat', 'lon', 'address', 'source', 'metro'],
  restaurants: [
    {
      id: 233,
      slug: 'burger-king',
      name: 'Бургер кинг',
      city: 'Москва',
      createdAt: '2026-01-01',
      menuAddedAt: '2026-02-01',
      instagramUrl: 'https://bk.example',
      cuisine: 'Фастфуд',
      primary_venue_type: 'fast_food',
      autoUpdated: false,
    },
    {
      id: 9,
      slug: 'cafe',
      name: 'Кафе',
      city: 'Москва',
      createdAt: null,
      menuAddedAt: null,
      instagramUrl: null,
      cuisine: null,
      primary_venue_type: null,
      autoUpdated: true,
    },
  ],
  stations: [
    ['Арбатская', '00BFFF'],
    ['Арбатская', '2C75C4'],
    ['Охотный ряд', 'D92B2C'],
  ],
  points: [
    [101, 0, 55.75, 37.59, 'Арбат, 2', 1, [0, 585, 1, 607]],
    [102, 0, 55.757, 37.613, 'Тверская, 1', 0, [2, 300]],
    [103, 1, 55.8, 37.7, null, 0, []],
  ],
}

test('compact map payload expands to full-format point objects', () => {
  const { items, count, truncated } = expandRestaurantMapPayload(compactPayload)

  assert.equal(count, 3)
  assert.equal(truncated, false)
  assert.deepEqual(items[0], {
    id: 'location:101',
    locationId: 101,
    restaurantId: 233,
    slug: 'burger-king',
    name: 'Бургер кинг',
    city: 'Москва',
    address: 'Арбат, 2',
    lat: 55.75,
    lon: 37.59,
    locationSource: 'google_places',
    createdAt: '2026-01-01',
    menuAddedAt: '2026-02-01',
    instagramUrl: 'https://bk.example',
    metro: 'Арбатская',
    metroNames: ['Арбатская'],
    metroStations: [
      { name: 'Арбатская', lineColorHex: '00BFFF', distanceMeters: 585 },
      { name: 'Арбатская', lineColorHex: '2C75C4', distanceMeters: 607 },
    ],
    cuisine: 'Фастфуд',
    primary_venue_type: 'fast_food',
    autoUpdated: false,
  })
  // Two branches of one chain share the restaurant fields but keep their own
  // coordinates and stations.
  assert.equal(items[1].slug, 'burger-king')
  assert.equal(items[1].metro, 'Охотный ряд')
  assert.equal(items[1].locationSource, 'manual')
  assert.deepEqual(items[2].metroStations, [])
  assert.equal(items[2].metro, null)
  assert.equal(items[2].autoUpdated, true)
})

test('compact map payload follows pointFields when the column order changes', () => {
  const reordered = {
    ...compactPayload,
    pointFields: ['restaurant', 'locationId', 'lon', 'lat', 'address', 'source', 'metro'],
    points: [[1, 103, 37.7, 55.8, null, 0, []]],
  }
  const [item] = expandRestaurantMapPayload(reordered).items

  assert.equal(item.locationId, 103)
  assert.equal(item.slug, 'cafe')
  assert.equal(item.lat, 55.8)
  assert.equal(item.lon, 37.7)
})

test('full-format map payload passes through unchanged', () => {
  const items = [{ id: 'location:1', slug: 'maya', lat: 55.7, lon: 37.6 }]
  assert.deepEqual(expandRestaurantMapPayload({ items, count: 1 }), { items, count: 1, truncated: false })
  assert.deepEqual(expandRestaurantMapPayload(null), { items: [], count: 0, truncated: false })
})

test('compact map payload reports truncation', () => {
  assert.equal(expandRestaurantMapPayload({ ...compactPayload, truncated: true }).truncated, true)
})
