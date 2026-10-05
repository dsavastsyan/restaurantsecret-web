const RECOVERY_STORAGE_KEY = 'rs-asset-recovery-at'
const RECOVERY_COOLDOWN_MS = 30_000

function readLastRecovery(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return { available: false, value: null }
  }

  try {
    const rawValue = storage?.getItem(RECOVERY_STORAGE_KEY)
    if (rawValue === null || rawValue === undefined) return { available: true, value: null }
    const value = Number(rawValue)
    return { available: true, value: Number.isFinite(value) ? value : null }
  } catch {
    return { available: false, value: null }
  }
}

function writeLastRecovery(storage, timestamp) {
  try {
    storage?.setItem(RECOVERY_STORAGE_KEY, String(timestamp))
    return true
  } catch {
    // Storage can be unavailable in private browsing or when it is full.
    return false
  }
}

async function clearStaticCaches(cacheStorage) {
  if (!cacheStorage?.keys || !cacheStorage.delete) return

  const cacheNames = await cacheStorage.keys()
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith('static-'))
      .map((name) => cacheStorage.delete(name)),
  )
}

export function configureAssetRecovery({
  windowObject,
  cacheStorage,
  storage,
  now = () => Date.now(),
}) {
  if (!windowObject?.addEventListener) return

  windowObject.addEventListener('vite:preloadError', (event) => {
    event?.preventDefault?.()

    const timestamp = now()
    const recovery = readLastRecovery(storage)
    if (!recovery.available) return
    if (recovery.value !== null && timestamp - recovery.value < RECOVERY_COOLDOWN_MS) return

    if (!writeLastRecovery(storage, timestamp)) return
    Promise.resolve(clearStaticCaches(cacheStorage))
      .catch(() => {})
      .finally(() => windowObject.location?.reload?.())
  })
}
