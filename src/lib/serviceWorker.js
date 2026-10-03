export async function retirePreviewServiceWorker(serviceWorker, cacheStorage) {
  const registrations = await serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))

  if (!cacheStorage) return

  const cacheNames = await cacheStorage.keys()
  await Promise.all(cacheNames.map((name) => cacheStorage.delete(name)))
}

export function configureServiceWorker({
  isPreview,
  serviceWorker,
  cacheStorage,
  windowObject,
}) {
  if (!serviceWorker) return

  if (isPreview) {
    // A previously installed production worker can serve a cached app shell
    // whose hashed chunks were removed by the latest preview deploy. Register
    // the preview retirement worker first so the browser updates the worker
    // itself (service-worker script updates bypass the active worker), clears
    // its caches, and reloads the tab from the current deployment.
    Promise.resolve(serviceWorker.getRegistrations())
      .then((registrations) => {
        if (registrations.length === 0) {
          return retirePreviewServiceWorker(serviceWorker, cacheStorage)
        }

        return serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      })
      .catch(() => retirePreviewServiceWorker(serviceWorker, cacheStorage).catch(() => { }))
    return
  }

  windowObject.addEventListener('load', () => {
    serviceWorker.register('/service-worker.js').catch(() => { })
  }, { once: true })
}
