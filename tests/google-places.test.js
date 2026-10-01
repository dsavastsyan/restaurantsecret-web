import test from 'node:test'
import assert from 'node:assert/strict'

import { getGooglePlaceId } from '../src/lib/googlePlaces.js'

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
