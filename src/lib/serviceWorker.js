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
    retirePreviewServiceWorker(serviceWorker, cacheStorage).catch(() => { })
    return
  }

  windowObject.addEventListener('load', () => {
    serviceWorker.register('/service-worker.js').catch(() => { })
  }, { once: true })
}
