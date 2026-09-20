import assert from 'node:assert/strict'
import test from 'node:test'

import { onRequestPost } from '../functions/api/preview-login.js'

const requestFor = (body, headers = {}) => new Request('https://branch.restaurantsecret-web.pages.dev/api/preview-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

test('preview login is concealed when preview bindings are absent', async () => {
  const response = await onRequestPost({ request: requestFor({ persona: 'free' }), env: {} })
  assert.equal(response.status, 404)
})

test('preview login rejects unknown personas before contacting staging', async () => {
  const response = await onRequestPost({
    request: requestFor({ persona: 'admin' }),
    env: {
      PREVIEW_AUTH_ENABLED: 'true',
      PREVIEW_AUTH_SECRET: 'x'.repeat(64),
      PREVIEW_PD_API_BASE: 'https://staging-pd.restaurantsecret.ru',
    },
  })
  assert.equal(response.status, 400)
})

test('preview login forwards only the allowlisted persona and returns the JWT', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://staging-pd.restaurantsecret.ru/internal/preview-auth/session')
    assert.equal(options.headers['X-Preview-Auth-Secret'], 'x'.repeat(64))
    assert.deepEqual(JSON.parse(options.body), { persona: 'active' })
    return Response.json({ ok: true, access_token: 'jwt-value', expires_in: 3600, onboarding_completed: true })
  }

  const response = await onRequestPost({
    request: requestFor({ persona: 'active' }, {
      Origin: 'https://branch.restaurantsecret-web.pages.dev',
      'Sec-Fetch-Site': 'same-origin',
    }),
    env: {
      PREVIEW_AUTH_ENABLED: 'true',
      PREVIEW_AUTH_SECRET: 'x'.repeat(64),
      PREVIEW_PD_API_BASE: 'https://staging-pd.restaurantsecret.ru/',
    },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    persona: 'active',
    access_token: 'jwt-value',
    expires_in: 3600,
    onboarding_completed: true,
  })
})

test('preview login rejects cross-site requests', async () => {
  const response = await onRequestPost({
    request: requestFor({ persona: 'free' }, {
      Origin: 'https://example.com',
      'Sec-Fetch-Site': 'cross-site',
    }),
    env: {
      PREVIEW_AUTH_ENABLED: 'true',
      PREVIEW_AUTH_SECRET: 'x'.repeat(64),
      PREVIEW_PD_API_BASE: 'https://staging-pd.restaurantsecret.ru',
    },
  })
  assert.equal(response.status, 403)
})
