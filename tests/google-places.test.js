import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { getGooglePlaceId } from '../src/lib/googlePlaces.js'

const googlePlaceMedia = await readFile(
  new URL('../src/components/GooglePlaceMedia.jsx', import.meta.url),
  'utf8',
)
const catalogMap = await readFile(
  new URL('../src/components/CatalogMap.jsx', import.meta.url),
  'utf8',
)
const catalogMapStyles = await readFile(
  new URL('../src/components/catalog-map.css', import.meta.url),
  'utf8',
)
const googlePlacesLoader = await readFile(
  new URL('../src/lib/googlePlaces.js', import.meta.url),
  'utf8',
)
const catalogPage = await readFile(
  new URL('../src/pages/Catalog.jsx', import.meta.url),
  'utf8',
)

test('reads a Google Place ID from the catalog API contract', () => {
  assert.equal(
    getGooglePlaceId({ googlePlaceId: ' ChIJ-test-place ' }),
    'ChIJ-test-place',
  )
})

test('accepts legacy and nested Google Place ID variants', () => {
  assert.equal(getGooglePlaceId({ restaurant_location: 'ChIJ-legacy' }), 'ChIJ-legacy')
  assert.equal(
    getGooglePlaceId({ restaurantLocation: { google_place_id: 'ChIJ-nested' } }),
    'ChIJ-nested',
  )
})

test('does not render a place request for an empty location', () => {
  assert.equal(getGooglePlaceId({ restaurant_location: '   ' }), '')
  assert.equal(getGooglePlaceId(null), '')
})

test('reports only successful Google Place Details loads to the usage counter', () => {
  assert.match(googlePlaceMedia, /gmp-load/)
  assert.match(googlePlaceMedia, /reportGooglePlacesUsage\(\)/)
  assert.match(googlePlacesLoader, /\/api\/telemetry\/google-places/)
})

test('shows a food icon while the Google place photo is loading', () => {
  assert.match(googlePlaceMedia, /Utensils/)
  assert.match(googlePlaceMedia, /catalog-card__place-media-placeholder-icon/)
  assert.match(googlePlaceMedia, /mediaOnly = false/)
  assert.match(googlePlaceMedia, /gmp-advanced-place-details'/)
  assert.match(googlePlacesLoader, /v: 'beta'/)
})

test('uses the Google Places UI Kit in the selected map card when a place ID exists', () => {
  assert.match(catalogMap, /selectedRestaurantGooglePlaceId/)
  assert.match(catalogMap, /className="catalog-map-card__place-media"/)
  assert.match(catalogMap, /mediaOnly/)
  assert.match(catalogMap, /mediaSize="small"/)
  assert.match(catalogMap, /catalog-map-card__content/)
  assert.match(catalogMapStyles, /grid-column: 1 \/ -1/)
  assert.match(catalogMap, /catalog-map-card__mark/)
})

test('uses the media-only Google Place UI Kit for the desktop catalog card', () => {
  assert.match(catalogPage, /<GooglePlaceMedia[\s\S]*?mediaOnly/)
})
