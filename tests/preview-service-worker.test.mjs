import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

import { configureServiceWorker, retirePreviewServiceWorker } from '../src/lib/serviceWorker.js'

test('preview runtime unregisters existing workers and clears all origin caches', async () => {
  const unregistered = []
  const deleted = []
  const serviceWorker = {
    getRegistrations: async () => [
      { unregister: async () => unregistered.push('first') },
      { unregister: async () => unregistered.push('second') },
    ],
  }
  const cacheStorage = {
    keys: async () => ['static-v3', 'api-v3', 'other-preview-cache'],
    delete: async (name) => deleted.push(name),
  }

  await retirePreviewServiceWorker(serviceWorker, cacheStorage)

  assert.deepEqual(unregistered, ['first', 'second'])
  assert.deepEqual(deleted, ['static-v3', 'api-v3', 'other-preview-cache'])
})

test('preview runtime does not register a new service worker', async () => {
  let registered = false
  let loadListenerAdded = false
  const serviceWorker = {
    getRegistrations: async () => [],
    register: async () => { registered = true },
  }

  configureServiceWorker({
    isPreview: true,
    serviceWorker,
    cacheStorage: { keys: async () => [] },
    windowObject: { addEventListener: () => { loadListenerAdded = true } },
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(registered, false)
  assert.equal(loadListenerAdded, false)
})

test('production runtime still registers its service worker after load', async () => {
  let loadListener
  let registeredPath
  const serviceWorker = {
    register: async (path) => { registeredPath = path },
  }

  configureServiceWorker({
    isPreview: false,
    serviceWorker,
    cacheStorage: null,
    windowObject: { addEventListener: (_name, listener) => { loadListener = listener } },
  })

  assert.equal(typeof loadListener, 'function')
  await loadListener()
  assert.equal(registeredPath, '/service-worker.js')
})

test('preview worker retires legacy caches and reloads controlled tabs', async () => {
  const listeners = new Map()
  const deleted = []
  const navigated = []
  let skippedWaiting = false
  let unregistered = false

  const workerSource = await readFile(new URL('../public/service-worker-preview.js', import.meta.url), 'utf8')
  const workerGlobal = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    skipWaiting: async () => { skippedWaiting = true },
    registration: {
      unregister: async () => { unregistered = true },
    },
    clients: {
      matchAll: async () => [
        { url: 'https://develop.example/', navigate: async (url) => navigated.push(url) },
      ],
    },
  }

  vm.runInNewContext(workerSource, {
    self: workerGlobal,
    caches: {
      keys: async () => ['static-v3', 'api-v3'],
      delete: async (name) => deleted.push(name),
    },
  })

  let installPromise
  listeners.get('install')({ waitUntil: (promise) => { installPromise = promise } })
  await installPromise

  let activatePromise
  listeners.get('activate')({ waitUntil: (promise) => { activatePromise = promise } })
  await activatePromise

  assert.equal(skippedWaiting, true)
  assert.equal(unregistered, true)
  assert.deepEqual(deleted, ['static-v3', 'api-v3'])
  assert.deepEqual(navigated, ['https://develop.example/'])
})
