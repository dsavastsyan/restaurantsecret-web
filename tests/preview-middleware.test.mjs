import assert from 'node:assert/strict'
import test from 'node:test'

import { onRequest } from '../functions/_middleware.js'

test('preview middleware keeps cross-origin services identifiable without leaking paths', async () => {
  const response = await onRequest({
    env: { PREVIEW_AUTH_ENABLED: 'true' },
    next: async () => new Response('ok'),
  })

  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive')
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
})

test('preview middleware leaves production-like responses unchanged when preview auth is disabled', async () => {
  const response = await onRequest({
    env: {},
    next: async () => new Response('ok', {
      headers: { 'Referrer-Policy': 'strict-origin-when-cross-origin' },
    }),
  })

  assert.equal(response.headers.get('x-robots-tag'), null)
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
})
