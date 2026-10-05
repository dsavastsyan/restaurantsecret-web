import assert from 'node:assert/strict'
import test from 'node:test'

import { safeJsonStringify } from '../src/lib/safeJson.js'

test('safeJsonStringify replaces circular references instead of throwing', () => {
  const value = { name: 'anchor' }
  value.self = value

  assert.equal(safeJsonStringify(value), '{"name":"anchor","self":"[Circular]"}')
})
