const GOOGLE_MAPS_API_URL = 'https://maps.googleapis.com/maps/api/js'

let placesLibraryPromise

function toSnakeCase(value) {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
}

function addPreconnect(href) {
  if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = href
  document.head.append(link)
}

function installGoogleMapsBootstrapLoader(options) {
  const google = window.google || (window.google = {})
  const maps = google.maps || (google.maps = {})
  if (maps.importLibrary) return

  const requestedLibraries = new Set()
  let loaderPromise

  const load = () => loaderPromise || (loaderPromise = new Promise((resolve, reject) => {
    const query = new URLSearchParams()
    query.set('libraries', [...requestedLibraries].join(','))
    Object.entries(options).forEach(([name, value]) => query.set(toSnakeCase(name), value))
    query.set('callback', 'google.maps.__ib__')

    const script = document.createElement('script')
    script.src = `${GOOGLE_MAPS_API_URL}?${query}`
    script.async = true
    script.nonce = document.querySelector('script[nonce]')?.nonce || ''
    script.onerror = () => {
      loaderPromise = undefined
      reject(new Error('Google Maps JavaScript API failed to load'))
    }
    maps.__ib__ = resolve
    document.head.append(script)
  }))

  maps.importLibrary = (libraryName, ...args) => {
    requestedLibraries.add(libraryName)
    return load().then(() => maps.importLibrary(libraryName, ...args))
  }
}

export function getGooglePlaceId(restaurant) {
  if (!restaurant) return ''

  const location = restaurant.restaurant_location ?? restaurant.restaurantLocation
  const candidates = [
    restaurant.googlePlaceId,
    restaurant.google_place_id,
    typeof location === 'string' ? location : null,
    location?.googlePlaceId,
    location?.google_place_id,
    location?.placeId,
    location?.place_id,
  ]

  return candidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || ''
}

export function getGoogleMapsApiKey() {
  return String(import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '').trim()
}

export function loadGooglePlacesUiKit(apiKey = getGoogleMapsApiKey()) {
  if (!apiKey || typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Maps API key is not configured'))
  }

  if (!placesLibraryPromise) {
    addPreconnect('https://maps.googleapis.com')
    addPreconnect('https://maps.gstatic.com')
    installGoogleMapsBootstrapLoader({ key: apiKey, v: 'weekly' })
    placesLibraryPromise = window.google.maps.importLibrary('places').catch((error) => {
      placesLibraryPromise = undefined
      throw error
    })
  }

  return placesLibraryPromise
}
