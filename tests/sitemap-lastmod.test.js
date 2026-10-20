import assert from 'node:assert/strict'
import test from 'node:test'

import { latestLastmod, restaurantLastmod } from '../scripts/generate-sitemap.js'

test('restaurantLastmod uses the API date and never falls back to today', () => {
  assert.equal(restaurantLastmod({ updatedAt: '2026-10-15T08:00:00.000Z' }), '2026-10-15')
  assert.equal(restaurantLastmod({}), undefined)
  assert.equal(restaurantLastmod({ updatedAt: null }), undefined)
  assert.equal(restaurantLastmod({ updatedAt: 'garbage' }), undefined)
})

test('chain hub lastmod is the newest branch date', () => {
  assert.equal(
    latestLastmod([{ updatedAt: '2026-10-01T00:00:00Z' }, { updatedAt: '2026-10-12T00:00:00Z' }, {}]),
    '2026-10-12',
  )
  assert.equal(latestLastmod([{}, {}]), undefined)
})
