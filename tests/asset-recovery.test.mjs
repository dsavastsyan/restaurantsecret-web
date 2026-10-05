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
    location: { reload: () => reloads.push(true) },
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

test('preload errors clear static caches and reload once', async () => {
  const harness = createHarness()
  let prevented = false

  harness.handler({ preventDefault: () => { prevented = true } })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(prevented, true)
  assert.deepEqual(harness.deletedCaches, ['static-v4-old'])
  assert.deepEqual(harness.reloads, [true])
  assert.equal(harness.storageValues.get('rs-asset-recovery-at'), '1000')
})

test('preload errors do not create a reload loop during the cooldown', async () => {
  const harness = createHarness({ storedTimestamp: 1000 })

  harness.handler({ preventDefault: () => {} })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(harness.deletedCaches, [])
  assert.deepEqual(harness.reloads, [])
})

test('preload errors do not reload when recovery storage is unavailable', async () => {
  const reloads = []
  const deletedCaches = []
  let handler

  configureAssetRecovery({
    windowObject: {
      addEventListener: (_name, listener) => { handler = listener },
      location: { reload: () => reloads.push(true) },
    },
    cacheStorage: { keys: async () => ['static-v4-old'], delete: async (name) => deletedCaches.push(name) },
    storage: null,
  })

  handler({ preventDefault: () => {} })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(deletedCaches, [])
  assert.deepEqual(reloads, [])
})
