import assert from 'node:assert/strict'
import test from 'node:test'

import { cityFromSlug } from '../src/lib/cityCatalog.js'

test('resolves a known city slug', () => {
  assert.equal(cityFromSlug('moskva'), 'Москва')
})

test('resolves a percent-encoded slug', () => {
  assert.equal(cityFromSlug('sankt%2Dpeterburg'), 'Санкт-Петербург')
})

test('returns null for an unknown slug', () => {
  assert.equal(cityFromSlug('not-a-city'), null)
})

test('returns null for a malformed percent-encoded slug', () => {
  assert.equal(cityFromSlug('%'), null)
})
