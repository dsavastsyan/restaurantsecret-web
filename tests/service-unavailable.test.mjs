import assert from 'node:assert/strict'
import test from 'node:test'

import { isServiceUnavailableError } from '../src/lib/serviceUnavailable.js'

test('recognizes timeout, network, and server errors', () => {
  assert.equal(isServiceUnavailableError({ kind: 'timeout' }), true)
  assert.equal(isServiceUnavailableError({ kind: 'network' }), true)
  assert.equal(isServiceUnavailableError({ status: 503 }), true)
  assert.equal(isServiceUnavailableError({ status: 502 }), true)
})

test('keeps client errors on their existing page-specific path', () => {
  assert.equal(isServiceUnavailableError({ status: 400 }), false)
  assert.equal(isServiceUnavailableError({ status: 401 }), false)
  assert.equal(isServiceUnavailableError({ status: 404 }), false)
})

test('recognizes fetch failures without changing the API client contract', () => {
  assert.equal(isServiceUnavailableError({ name: 'TypeError' }), false)
  assert.equal(isServiceUnavailableError({ name: 'AbortError' }), true)
})
