// Preview builds must never retain an application shell from an older deployment.
// This one-shot worker replaces any previously installed production worker, clears
// its caches, unregisters itself, and reloads open preview tabs from the network.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
    await self.registration.unregister()

    const windowClients = await self.clients.matchAll({ type: 'window' })
    await Promise.all(windowClients.map((client) => client.navigate(client.url)))
  })())
})
