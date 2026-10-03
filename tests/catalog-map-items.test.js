import assert from 'node:assert/strict'
import test from 'node:test'

import {
  enrichCatalogItemsWithMapMetros,
  enrichCatalogMapItems,
  filterCatalogItemsByMapPoints,
  filterCatalogMapItemsByRadius,
  getCatalogMapPointKey,
  getNearbyMetroStations,
  normalizeCatalogMetroStations,
} from '../src/lib/catalogMapItems.js'
import { filterCatalogRestaurants } from '../src/lib/catalogFilters.js'

test('map points never inherit metro from another branch with the same slug', () => {
  const catalogItems = [
    { slug: 'cofefest', name: 'Cofefest', cuisine: 'Кофейня', metro: 'Арбатская' },
  ]
  const mapItems = [
    { id: 'cofefest:manual:0', slug: 'cofefest', lat: 55.75, lon: 37.6, metro: 'Арбатская' },
    { id: 'cofefest:manual:1', slug: 'cofefest', lat: 55.8, lon: 37.7, metro: 'Динамо' },
    { id: 'cofefest:manual:2', slug: 'cofefest', lat: 55.7, lon: 37.8 },
  ]

  const enriched = enrichCatalogMapItems(mapItems, catalogItems)

  assert.equal(enriched[0].metro, 'Арбатская')
  assert.equal(enriched[1].metro, 'Динамо')
  assert.equal(enriched[2].metro, null)
  assert.deepEqual(
    filterCatalogRestaurants(enriched, { metro: ['Арбатская'] }).map((item) => item.id),
    ['cofefest:manual:0'],
  )
})

test('map point keys distinguish branches that share a slug', () => {
  const first = { id: 'cofefest:manual:0', restaurantId: 101, slug: 'cofefest', lat: 55.75, lon: 37.6 }
  const second = { id: 'cofefest:manual:0', restaurantId: 202, slug: 'cofefest', lat: 55.8, lon: 37.7 }

  assert.notEqual(getCatalogMapPointKey(first), getCatalogMapPointKey(second))
  assert.equal(getCatalogMapPointKey(null), '')
})

test('list restaurants inherit every nearby metro station from their map points', () => {
  const catalogItems = [
    { id: 101, slug: 'udon', name: 'Udon', metro: 'Третьяковская' },
  ]
  const mapItems = [
    {
      restaurantId: 101,
      slug: 'udon',
      metro: 'Третьяковская',
      metroNames: ['Третьяковская', 'Новокузнецкая'],
      metroStations: [
        { name: 'Третьяковская', lineColorHex: '43A047', distanceMeters: 510 },
        { name: 'Новокузнецкая', lineColorHex: '43A047', distanceMeters: 750 },
        { name: 'Полянка', lineColorHex: '9E9E9E', distanceMeters: 910 },
      ],
    },
  ]

  const enriched = enrichCatalogItemsWithMapMetros(catalogItems, mapItems)

  assert.deepEqual(enriched[0].metroNames, ['третьяковская', 'новокузнецкая'])
  assert.deepEqual(enriched[0].metroStations, [
    { name: 'Третьяковская', lineColorHex: '#43A047', distanceMeters: 510 },
    { name: 'Новокузнецкая', lineColorHex: '#43A047', distanceMeters: 750 },
    { name: 'Полянка', lineColorHex: '#9E9E9E', distanceMeters: 910 },
  ])
  assert.deepEqual(filterCatalogRestaurants(enriched, { metro: ['Новокузнецкая'] }), enriched)
})

test('normalizes card metro metadata and keeps stations ordered by distance', () => {
  assert.deepEqual(normalizeCatalogMetroStations({
    metro_stations: [
      { name: ' Новокузнецкая ', line_color_hex: '#43a047', distance_meters: 750 },
      { name: 'Третьяковская', lineColorHex: 'not-a-color', distanceMeters: 510.4 },
      { name: '', lineColorHex: 'E53935', distanceMeters: 100 },
      { name: 'Павелецкая', lineColorHex: 'E53935', distanceMeters: -1 },
    ],
  }), [
    { name: 'Третьяковская', lineColorHex: null, distanceMeters: 510 },
    { name: 'Новокузнецкая', lineColorHex: '#43A047', distanceMeters: 750 },
  ])
})

test('list branches only inherit metro stations from their own map points', () => {
  const catalogItems = [
    { id: 101, slug: 'cofefest', name: 'Cofefest Арбат', metro: 'Арбатская' },
    { id: 202, slug: 'cofefest', name: 'Cofefest Динамо', metro: 'Динамо' },
  ]
  const mapItems = [
    { restaurantId: 101, slug: 'cofefest', metroNames: ['Арбатская'] },
    { restaurantId: 202, slug: 'cofefest', metroNames: ['Динамо'] },
  ]

  const enriched = enrichCatalogItemsWithMapMetros(catalogItems, mapItems)

  assert.deepEqual(
    filterCatalogRestaurants(enriched, { metro: ['Арбатская'] }).map((item) => item.id),
    [101],
  )
})

test('search map keeps only metro stations near matching restaurants', () => {
  const restaurants = [
    { name: 'Джонджоли', lat: 55.7645, lon: 37.6055, metro: 'Тверская' },
  ]
  const stations = [
    { name_ru: 'Тверская', lat: 55.7653, lon: 37.6038 },
    { name_ru: 'Пушкинская', lat: 55.7658, lon: 37.6042 },
    { name_ru: 'Выхино', lat: 55.7163, lon: 37.8186 },
  ]

  assert.deepEqual(
    getNearbyMetroStations(stations, restaurants).map((station) => station.name_ru),
    ['Тверская', 'Пушкинская'],
  )
  assert.deepEqual(getNearbyMetroStations(stations, []), [])
})

test('keeps a restaurant metro by name even when its coordinates are missing', () => {
  const stations = [
    { name_ru: 'Тверская', lat: 55.7653, lon: 37.6038 },
    { name_ru: 'Выхино', lat: 55.7163, lon: 37.8186 },
  ]

  assert.deepEqual(
    getNearbyMetroStations(stations, [{ name: 'Филиал без координат', metro: 'Выхино' }]),
    [stations[1]],
  )
})

test('radius filtering uses every selected anchor and keeps map and list identities aligned', () => {
  const mapItems = [
    { id: 'location:1', restaurantId: 101, slug: 'near-first', lat: 55.751, lon: 37.618 },
    { id: 'location:2', restaurantId: 202, slug: 'near-second', lat: 55.8, lon: 37.7 },
    { id: 'location:3', restaurantId: 303, slug: 'far-away', lat: 59.93, lon: 30.33 },
  ]
  const anchors = [
    { lat: 55.751244, lon: 37.618423 },
    { lat: 55.8002, lon: 37.7002 },
  ]
  const filteredMapItems = filterCatalogMapItemsByRadius(mapItems, anchors, 1_000)
  const listItems = [
    { id: 101, slug: 'near-first' },
    { id: 202, slug: 'near-second' },
    { id: 303, slug: 'far-away' },
  ]

  assert.deepEqual(filteredMapItems, mapItems.slice(0, 2))
  assert.deepEqual(filterCatalogItemsByMapPoints(listItems, filteredMapItems), listItems.slice(0, 2))
})

test('radius filtering stays inactive until a mode has an anchor point', () => {
  const items = [{ id: 1, lat: 55.75, lon: 37.62 }]
  assert.equal(filterCatalogMapItemsByRadius(items, [], 1_000), items)
})

test('list radius matching does not include a different branch with the same slug', () => {
  const listItems = [
    { id: 101, slug: 'shared-chain' },
    { id: 202, slug: 'shared-chain' },
  ]
  const mapPoints = [{ restaurantId: 101, slug: 'shared-chain', lat: 55.75, lon: 37.62 }]

  assert.deepEqual(filterCatalogItemsByMapPoints(listItems, mapPoints), [listItems[0]])
})
