import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStagingApiUrl, isPreviewHostname, onRequest } from '../functions/api/[[path]].js'

test('preview API proxy preserves the path and query on the staging Worker', () => {
  const upstreamUrl = buildStagingApiUrl(
    'https://develop.restaurantsecret-web.pages.dev/api/landing/stats?city=Москва',
  )

  assert.equal(
    upstreamUrl.href,
    'https://restaurantsecret-api-staging.dsavastyan.workers.dev/landing/stats?city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0',
  )
})

test('preview API proxy cannot be redirected to another origin through its path', () => {
  const upstreamUrl = buildStagingApiUrl(
    'https://preview.example/api//attacker.example/collect',
  )

  assert.equal(upstreamUrl.origin, 'https://restaurantsecret-api-staging.dsavastyan.workers.dev')
  assert.equal(upstreamUrl.pathname, '//attacker.example/collect')
})

test('preview API proxy is limited to Pages branch hostnames', () => {
  assert.equal(isPreviewHostname('develop.restaurantsecret-web.pages.dev'), true)
  assert.equal(isPreviewHostname('7e8a7279.restaurantsecret-web.pages.dev'), true)
  assert.equal(isPreviewHostname('restaurantsecret-web.pages.dev'), false)
  assert.equal(isPreviewHostname('restaurantsecret.ru'), false)
})

test('production hostname cannot reach the staging proxy', async () => {
  const response = await onRequest({
    request: new Request('https://restaurantsecret-web.pages.dev/api/health'),
  })

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'NOT_FOUND' })
})

test('preview API proxy streams the upstream response and filters browser-only headers', async () => {
  const originalFetch = globalThis.fetch
  let proxiedRequest

  globalThis.fetch = async (request) => {
    proxiedRequest = request
    return Response.json({ restaurants: 334 })
  }

  try {
    const response = await onRequest({
      request: new Request('https://branch.restaurantsecret-web.pages.dev/api/landing/stats', {
        headers: {
          Authorization: 'Bearer test-token',
          Cookie: 'preview-session=private',
          Origin: 'https://preview.example',
          'X-Request-ID': 'request-1',
        },
      }),
    })

    assert.equal(proxiedRequest.url, 'https://restaurantsecret-api-staging.dsavastyan.workers.dev/landing/stats')
    assert.equal(proxiedRequest.headers.get('authorization'), 'Bearer test-token')
    assert.equal(proxiedRequest.headers.get('x-request-id'), 'request-1')
    assert.equal(proxiedRequest.headers.has('cookie'), false)
    assert.equal(proxiedRequest.headers.has('origin'), false)
    assert.equal(response.headers.get('x-preview-api-proxy'), 'staging')
    assert.deepEqual(await response.json(), { restaurants: 334 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('preview API proxy returns a bounded 502 when the upstream is unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network unavailable') }

  try {
    const response = await onRequest({
      request: new Request('https://branch.restaurantsecret-web.pages.dev/api/health'),
    })

    assert.equal(response.status, 502)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { error: 'STAGING_API_UNAVAILABLE' })
  } finally {
    globalThis.fetch = originalFetch
  }
})
