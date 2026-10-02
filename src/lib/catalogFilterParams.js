const FILTER_KEYS = [
  'catalog_location',
  'catalog_radius',
  'catalog_near_lat',
  'catalog_near_lon',
  'catalog_near_label',
  'catalog_near_query',
  'catalog_cuisine',
  'catalog_venue',
  'catalog_metro',
  'catalog_calories_min',
  'catalog_calories_max',
  'catalog_protein_min',
  'catalog_protein_max',
  'catalog_fat_min',
  'catalog_fat_max',
  'catalog_carbs_min',
  'catalog_carbs_max',
]

const NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs']
const LOCATION_MODES = new Set(['metro', 'nearby', 'center'])
const NO_LOCATION_MODE = 'none'
export const DEFAULT_CATALOG_RADIUS_KM = 3

export const createEmptyCatalogNutritionCriteria = () => ({
  calories: { min: '', max: '' },
  protein: { min: '', max: '' },
  fat: { min: '', max: '' },
  carbs: { min: '', max: '' },
})

const readFiniteCoordinate = (value) => {
  if (value == null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function parseCatalogNutritionCriteria(searchParams) {
  const criteria = createEmptyCatalogNutritionCriteria()
  NUTRITION_FIELDS.forEach((field) => {
    criteria[field] = {
      min: searchParams.get(`catalog_${field}_min`) || '',
      max: searchParams.get(`catalog_${field}_max`) || '',
    }
  })
  return criteria
}

export function parseCatalogFilterState(searchParams) {
  const rawLocationMode = searchParams.get('catalog_location')
  const locationMode = rawLocationMode === NO_LOCATION_MODE
    ? null
    : LOCATION_MODES.has(rawLocationMode)
      ? rawLocationMode
      : 'center'
  const rawRadius = searchParams.get('catalog_radius')
  const parsedRadius = Number(rawRadius)
  const radiusKm = locationMode == null
    ? null
    : Number.isFinite(parsedRadius) && parsedRadius > 0
      ? parsedRadius
      : DEFAULT_CATALOG_RADIUS_KM
  const lat = readFiniteCoordinate(searchParams.get('catalog_near_lat'))
  const lon = readFiniteCoordinate(searchParams.get('catalog_near_lon'))

  return {
    selectedCuisines: searchParams.getAll('catalog_cuisine'),
    selectedVenueTypes: searchParams.getAll('catalog_venue'),
    selectedMetro: searchParams.getAll('catalog_metro'),
    locationMode,
    radiusKm,
    nearbyPoint: lat != null && lon != null ? { lat, lon } : null,
    nearbyPointLabel: searchParams.get('catalog_near_label') || '',
    addressQuery: searchParams.get('catalog_near_query') || '',
    nutritionCriteria: parseCatalogNutritionCriteria(searchParams),
  }
}

const hasLocationSelection = ({ locationMode, selectedMetro, nearbyPoint }) => (
  locationMode === 'metro'
    ? selectedMetro.length > 0
    : locationMode === 'nearby'
      ? Boolean(nearbyPoint)
      : locationMode === 'center'
)

export function serializeCatalogFilterState(searchParams, state) {
  FILTER_KEYS.forEach((key) => searchParams.delete(key))

  if (state.selectedCuisines?.length) {
    state.selectedCuisines.forEach((value) => searchParams.append('catalog_cuisine', value))
  }
  if (state.selectedVenueTypes?.length) {
    state.selectedVenueTypes.forEach((value) => searchParams.append('catalog_venue', value))
  }
  if (state.selectedMetro?.length) {
    state.selectedMetro.forEach((value) => searchParams.append('catalog_metro', value))
  }

  if (hasLocationSelection(state)) {
    searchParams.set('catalog_location', state.locationMode)
    const radiusKm = Number(state.radiusKm)
    searchParams.set(
      'catalog_radius',
      Number.isFinite(radiusKm) && radiusKm > 0 ? String(radiusKm) : String(DEFAULT_CATALOG_RADIUS_KM),
    )
    if (state.locationMode === 'nearby' && state.nearbyPoint) {
      searchParams.set('catalog_near_lat', String(state.nearbyPoint.lat))
      searchParams.set('catalog_near_lon', String(state.nearbyPoint.lon))
    }
    if (state.locationMode === 'nearby' && state.nearbyPointLabel) {
      searchParams.set('catalog_near_label', state.nearbyPointLabel)
    }
    if (state.locationMode === 'nearby' && state.addressQuery) {
      searchParams.set('catalog_near_query', state.addressQuery)
    }
  } else {
    searchParams.set('catalog_location', NO_LOCATION_MODE)
  }

  NUTRITION_FIELDS.forEach((field) => {
    const value = state.nutritionCriteria?.[field] || {}
    if (value.min !== '' && value.min != null) searchParams.set(`catalog_${field}_min`, String(value.min))
    if (value.max !== '' && value.max != null) searchParams.set(`catalog_${field}_max`, String(value.max))
  })

  return searchParams
}
