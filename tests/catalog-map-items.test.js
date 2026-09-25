import assert from 'node:assert/strict'
import test from 'node:test'

import {
  enrichCatalogMapItems,
  getCatalogMapPointKey,
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
