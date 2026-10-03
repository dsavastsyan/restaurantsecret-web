import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeInstagramUrl } from '../src/lib/instagram.js'

test('normalizes Instagram handles and removes tracking parameters', () => {
  assert.equal(
    normalizeInstagramUrl('@restaurant.example?igsh=tracking'),
    'https://www.instagram.com/restaurant.example/',
  )
  assert.equal(
    normalizeInstagramUrl('https://instagram.com/restaurant.example/'),
    'https://www.instagram.com/restaurant.example/',
  )
})

test('does not expose non-Instagram URLs as social links', () => {
  assert.equal(normalizeInstagramUrl('https://restaurant.example/'), null)
  assert.equal(normalizeInstagramUrl(''), null)
})
