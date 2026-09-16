import { IS_PREVIEW, PD_API_BASE } from '@/config/api'

const VISITOR_ID_KEY = 'rs_city_visitor_id'
const HYDRATE_TIMEOUT_MS = 3000

function createVisitorId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

function getVisitorId() {
  const stored = localStorage.getItem(VISITOR_ID_KEY)
  if (stored) return stored
  const visitorId = createVisitorId()
  localStorage.setItem(VISITOR_ID_KEY, visitorId)
  return visitorId
}

export async function persistCityPreference(city, source, accessToken) {
  // Until a staging personal-data API exists, previews persist locally only.
  if (!city || IS_PREVIEW) return
  const response = await fetch(`${PD_API_BASE}/api/city-preference`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ visitor_id: getVisitorId(), city, source }),
  })
  if (!response.ok) throw new Error(`Failed to persist city preference: ${response.status}`)
}

export function saveCatalogCity(city, source = 'manual', accessToken) {
  localStorage.setItem('catalog_city', city)
  persistCityPreference(city, source, accessToken).catch((error) => {
    console.error('Failed to persist city preference', error)
  })
}

// A previously confirmed/manual city is the server's source of truth for this
// visitor (or account, if authenticated) and should win over whatever is (or
// isn't) in this browser's localStorage — that's the whole point of persisting
// it server-side rather than just locally. Called once at app start, before
// any page reads `catalog_city`, so a returning user on a new browser or a
// logged-in user on a new device picks up their saved city immediately.
export async function hydrateCityPreference(accessToken) {
  if (IS_PREVIEW) return null
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), HYDRATE_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${PD_API_BASE}/api/city-preference?visitor_id=${encodeURIComponent(getVisitorId())}`,
      {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        signal: controller.signal,
      },
    )
    if (!response.ok) return null
    const data = await response.json()
    if (data?.selected_city) {
      localStorage.setItem('catalog_city', data.selected_city)
      return data.selected_city
    }
    return null
  } catch (error) {
    console.error('Failed to hydrate city preference', error)
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}
