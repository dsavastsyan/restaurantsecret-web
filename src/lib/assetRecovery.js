const RECOVERY_STORAGE_KEY = 'rs-asset-recovery-at'
const RECOVERY_COOLDOWN_MS = 30_000
const RECOVERY_QUERY_KEY = 'rs_asset_recovery'
const ASSET_RECOVERY_ACTIVE_FLAG = '__RS_ASSET_RECOVERY_ACTIVE__'

const ASSET_PRELOAD_ERROR_PATTERNS = [
  'Unable to preload CSS for ',
  'Failed to fetch dynamically imported module',
  'Importing a module script failed.',
  'is not a valid JavaScript MIME type',
]

export function isAssetPreloadErrorMessage(value) {
  const message = String(value || '')
  return ASSET_PRELOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

export function isAssetPreloadErrorEvent(event) {
  if (isAssetPreloadErrorMessage(event?.message)) return true
  return (event?.exception?.values || []).some((value) => isAssetPreloadErrorMessage(value?.value))
}

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

async function unregisterServiceWorkers(serviceWorker) {
  if (!serviceWorker?.getRegistrations) return

  const registrations = await serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
}

function hasRecoveryQuery(windowObject) {
  try {
    const href = windowObject?.location?.href
    return href ? new URL(href).searchParams.has(RECOVERY_QUERY_KEY) : false
  } catch {
    return false
  }
}

function clearRecoveryQuery(windowObject) {
  try {
    const href = windowObject?.location?.href
    if (!href || !windowObject?.history?.replaceState) return
    const url = new URL(href)
    if (!url.searchParams.has(RECOVERY_QUERY_KEY)) return
    url.searchParams.delete(RECOVERY_QUERY_KEY)
    windowObject.history.replaceState(windowObject.history.state, '', url.toString())
  } catch {
    // Keeping the marker is safer than risking another reload loop.
  }
}

function buildRecoveryUrl(windowObject, timestamp) {
  try {
    const href = windowObject?.location?.href
    if (!href) return null
    const url = new URL(href)
    url.searchParams.set(RECOVERY_QUERY_KEY, String(timestamp))
    return url.toString()
  } catch {
    return null
  }
}

function navigateToFreshPage(windowObject, timestamp) {
  const location = windowObject?.location
  const recoveryUrl = buildRecoveryUrl(windowObject, timestamp)
  if (recoveryUrl && typeof location?.replace === 'function') {
    location.replace(recoveryUrl)
    return
  }
  location?.reload?.()
}

export function configureAssetRecovery({
  windowObject,
  cacheStorage,
  storage,
  serviceWorker,
  now = () => Date.now(),
}) {
  if (!windowObject?.addEventListener) return

  // A normal session has storage available, so the persisted cooldown is
  // enough to guard the just-recovered page. Remove the marker from the
  // address bar; privacy-restricted sessions keep it as their loop guard.
  if (hasRecoveryQuery(windowObject) && readLastRecovery(storage).available) {
    clearRecoveryQuery(windowObject)
  }

  windowObject.addEventListener('vite:preloadError', () => {
    // Let Vite reject the failed import. Cancelling this event makes its
    // preload promise resolve to undefined, which crashes React.lazy while
    // reading the module's default export.

    const timestamp = now()
    // A cache-busting URL is also the fallback loop guard when sessionStorage
    // is disabled or unavailable (for example in a privacy-restricted tab).
    if (hasRecoveryQuery(windowObject)) return

    const recovery = readLastRecovery(storage)
    if (recovery.value !== null && timestamp - recovery.value < RECOVERY_COOLDOWN_MS) return

    if (recovery.available && !writeLastRecovery(storage, timestamp)) return
    windowObject[ASSET_RECOVERY_ACTIVE_FLAG] = true

    Promise.all([
      clearStaticCaches(cacheStorage),
      unregisterServiceWorkers(serviceWorker),
    ])
      .catch(() => {})
      .finally(() => navigateToFreshPage(windowObject, timestamp))
  })
}

export { ASSET_RECOVERY_ACTIVE_FLAG }
