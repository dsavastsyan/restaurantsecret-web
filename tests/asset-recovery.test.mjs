import assert from 'node:assert/strict'
import test from 'node:test'

import { configureAssetRecovery } from '../src/lib/assetRecovery.js'

function createHarness({ now = 1000, storedTimestamp = null } = {}) {
  let handler
  const reloads = []
  const deletedCaches = []
  const storageValues = new Map()
  if (storedTimestamp !== null) storageValues.set('rs-asset-recovery-at', String(storedTimestamp))

  const windowObject = {
    addEventListener: (name, listener) => {
      assert.equal(name, 'vite:preloadError')
      handler = listener
    },
    location: {
      href: 'https://example.test/restaurants/demo/menu/?city=Moscow',
      replace: (url) => reloads.push(url),
      reload: () => reloads.push(true),
    },
  }
  const cacheStorage = {
    keys: async () => ['static-v4-old', 'api-v3', 'other-cache'],
    delete: async (name) => deletedCaches.push(name),
  }
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
  }

  configureAssetRecovery({ windowObject, cacheStorage, storage, now: () => now })

  return { handler, reloads, deletedCaches, storageValues }
}

test('preload errors keep the Vite rejection and navigate to a cache-busted URL', async () => {
  const harness = createHarness()
  let prevented = false

  harness.handler({ preventDefault: () => { prevented = true } })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(prevented, false)
  assert.deepEqual(harness.deletedCaches, ['static-v4-old'])
  assert.deepEqual(harness.reloads, [
    'https://example.test/restaurants/demo/menu/?city=Moscow&rs_asset_recovery=1000',
  ])
  assert.equal(harness.storageValues.get('rs-asset-recovery-at'), '1000')
})

test('preload errors do not create a reload loop during the cooldown', async () => {
  const harness = createHarness({ storedTimestamp: 1000 })
  let prevented = false

  harness.handler({ preventDefault: () => { prevented = true } })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(prevented, false)
  assert.deepEqual(harness.deletedCaches, [])
  assert.deepEqual(harness.reloads, [])
})

test('preload errors recover once when session storage is unavailable', async () => {
  const reloads = []
  const deletedCaches = []
  let handler

  configureAssetRecovery({
    windowObject: {
      addEventListener: (_name, listener) => { handler = listener },
      location: {
        href: 'https://example.test/restaurants/demo/menu/',
        replace: (url) => reloads.push(url),
        reload: () => reloads.push(true),
      },
    },
    cacheStorage: { keys: async () => ['static-v4-old'], delete: async (name) => deletedCaches.push(name) },
    storage: null,
    now: () => 1000,
  })

  handler({ preventDefault: () => {} })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(deletedCaches, ['static-v4-old'])
  assert.deepEqual(reloads, ['https://example.test/restaurants/demo/menu/?rs_asset_recovery=1000'])
})

test('preload errors are not retried when the recovery URL is already present', async () => {
  let handler
  const reloads = []

  configureAssetRecovery({
    windowObject: {
      addEventListener: (_name, listener) => { handler = listener },
      location: {
        href: 'https://example.test/menu/?rs_asset_recovery=1000',
        replace: (url) => reloads.push(url),
      },
    },
    cacheStorage: { keys: async () => [], delete: async () => {} },
    storage: null,
  })

  handler({ preventDefault: () => {} })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(reloads, [])
})
