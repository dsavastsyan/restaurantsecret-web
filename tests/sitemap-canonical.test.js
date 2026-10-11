import assert from 'node:assert/strict'
import test from 'node:test'

import { hubCanonicalChainSlug } from '../src/lib/sitemapCanonical.js'

test('restaurant with a resolvable chain slug is a hub-canonicalized branch', () => {
  assert.equal(
    hubCanonicalChainSlug({ chainSlug: 'syrovarnya' }, new Set(['syrovarnya'])),
    'syrovarnya',
  )
})

test('restaurant without a chain slug is not a hub-canonicalized branch', () => {
  assert.equal(hubCanonicalChainSlug({}, new Set(['syrovarnya'])), null)
})

test('restaurant with an unresolvable chain slug is not a hub-canonicalized branch', () => {
  assert.equal(
    hubCanonicalChainSlug({ chainSlug: 'syrovarnya' }, new Set(['other-chain'])),
    null,
  )
})
