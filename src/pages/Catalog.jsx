// Catalog page showing restaurants on a map by default, with a list alternative.
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMeta } from '@/lib/useMeta'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import CatalogLocationFilter from '../components/CatalogLocationFilter.jsx'
import CatalogPlaceFilter from '../components/CatalogPlaceFilter.jsx'
import { useSWRLite } from '../hooks/useSWRLite.js'
import { useFavoriteRestaurantsStore } from '@/store/favoriteRestaurants'
import { useAuth } from '@/store/auth'
import { analytics } from '@/services/analytics'
import { getRussianPluralWord, getSearchQueryScore, matchesSearchQuery } from '@/lib/text'
import { getLandingStats } from '@/lib/api'
import AutoUpdatedBadge from '@/components/AutoUpdatedBadge.jsx'
import InstagramIcon from '@/components/InstagramIcon.jsx'
import MetroStationsText from '@/components/MetroStationsText.jsx'
import GooglePlaceMedia from '@/components/GooglePlaceMedia.jsx'
import { saveCatalogCity } from '@/lib/cityPreference'
import { citySlug, cityGenitive, cityCatalogTitle, cityCatalogDescription } from '@/lib/cityCatalog'
import { getMetroSelectionPoints } from '@/lib/metroSelection'
import {
  enrichCatalogItemsWithMapMetros,
  enrichCatalogMapItems,
  filterCatalogItemsByMapPoints,
  filterCatalogMapItemsByRadius,
  getNearbyMetroStations,
} from '@/lib/catalogMapItems'
import { collapseChainRestaurants, getChainSearchSuggestions } from '@/lib/catalogChains'
import {
  CATALOG_VENUE_TYPES,
  filterCatalogRestaurants,
  getCatalogCuisineFilterValues,
  normalizeCatalogCuisine,
} from '@/lib/catalogFilters'
import {
  getCatalogNutritionStatsForCriteria,
  hasCatalogNutritionCriteria,
  getRestaurantGoogleRating,
  matchesCatalogNutritionCriteria,
} from '@/lib/catalogNutrition'
import {
  createEmptyCatalogNutritionCriteria,
  DEFAULT_CATALOG_RADIUS_KM,
  parseCatalogFilterState,
  serializeCatalogFilterState,
} from '@/lib/catalogFilterParams'
import {
  CATALOG_SORT_OPTIONS,
  DEFAULT_CATALOG_SORT,
  normalizeCatalogSort,
  sortCatalogItems,
} from '@/lib/catalogSort'
import { getGooglePlaceId } from '@/lib/googlePlaces'
import { getSubscriptionCheckoutLink } from '@/lib/subscriptionCta'
import { useSubscriptionStore } from '@/store/subscription'
import { normalizeInstagramUrl } from '@/lib/instagram'
import '../catalog-compact.css'

const CatalogMap = lazy(() => import('../components/CatalogMap.jsx'))

// Keep the first paint bounded. The API returns total/hasMore and the catalog
// requests the next batch only when the user reaches it.
const FETCH_LIMIT = 48;
const CLIENT_LOCATION_FETCH_LIMIT = 2000;
const PAGE_SIZE = 8;
const EMPTY_METRO_DATA = { lines: [], stations: [] };
const NUTRITION_PRESETS = [
  { key: 'calories', label: 'До 400 ккал', field: 'max', value: 400 },
  { key: 'protein', label: 'Белка от 25 г', field: 'min', value: 25 },
  { key: 'fat', label: 'Жиров до 10 г', field: 'max', value: 10 },
]

const getNutritionMenuKey = (city, slug) => `${city}:${slug}`

const getNutritionMenuDishes = (payload) => {
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.dishes)) return payload.dishes
  return []
}

const CuisineIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 3v8" />
    <path d="M5 3v8" />
    <path d="M9 3v8" />
    <path d="M5 11h4" />
    <path d="M7 11v10" />
    <path d="M16 3v18" />
    <path d="M16 3c2.4 1.5 3.6 3.4 3.6 5.8 0 2.5-1.2 4.1-3.6 4.9" />
  </svg>
)

const ScrollingRestaurantName = ({ name }) => {
  const viewportRef = useRef(null)
  const measureRef = useRef(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const measure = measureRef.current
    if (!viewport || !measure) return undefined

    const update = () => setIsOverflowing(measure.offsetWidth > viewport.clientWidth + 1)
    update()

    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [name])

  return (
    <span
      ref={viewportRef}
      className={`catalog-card__title-text${isOverflowing ? ' is-overflowing' : ''}`}
      title={name}
      aria-label={name}
    >
      <span ref={measureRef} className="catalog-card__title-measure" aria-hidden="true">{name}</span>
      {isOverflowing ? (
        <span className="catalog-card__title-marquee" aria-hidden="true">
          <span>{name}</span>
          <span>{name}</span>
        </span>
      ) : name}
    </span>
  )
}

export default function Catalog() {
  const { city: cityPath } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: citiesData } = useSWRLite('cities', () => api.cities())
  const cities = citiesData?.items || []
  const selectedCity = cities.find((item) => citySlug(item.id) === cityPath || item.id === cityPath)
    || cities.find((item) => item.id === localStorage.getItem('catalog_city'))
    || { id: 'Москва', name: 'Москва' }
  const initialCatalogFilters = parseCatalogFilterState(searchParams)

  const { data: filters } = useSWRLite(`filters:${selectedCity.id}`, () => api.filters(selectedCity.id))
  const { data: metroResponse } = useSWRLite('metro', () => api.metro())
  const metroData = metroResponse || EMPTY_METRO_DATA
  const { data: landingStats } = useSWRLite('landing-stats', () => getLandingStats())
  const [selectedCuisines, setSelectedCuisines] = useState(() => initialCatalogFilters.selectedCuisines
    .map(normalizeCatalogCuisine)
    .filter(Boolean))
  const [selectedMetro, setSelectedMetro] = useState(() => initialCatalogFilters.selectedMetro)
  const [selectedVenueTypes, setSelectedVenueTypes] = useState(() => initialCatalogFilters.selectedVenueTypes)
  const [nutritionCriteria, setNutritionCriteria] = useState(() => initialCatalogFilters.nutritionCriteria)
  const [nutritionMenuData, setNutritionMenuData] = useState({})
  const [isNutritionCustomOpen, setIsNutritionCustomOpen] = useState(false)
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('q') || '')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [activeSearchSuggestionIndex, setActiveSearchSuggestionIndex] = useState(-1)
  const [currentPage, setCurrentPage] = useState(1)
  const [locationMode, setLocationMode] = useState(() => initialCatalogFilters.locationMode)
  const [radiusKm, setRadiusKm] = useState(() => initialCatalogFilters.radiusKm)
  const [nearbyPoint, setNearbyPoint] = useState(() => initialCatalogFilters.nearbyPoint)
  const [nearbyPointLabel, setNearbyPointLabel] = useState(() => initialCatalogFilters.nearbyPointLabel)
  const [addressQuery, setAddressQuery] = useState(() => initialCatalogFilters.addressQuery)
  const [addressResults, setAddressResults] = useState([])
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [sort, setSort] = useState(() => normalizeCatalogSort(initialCatalogFilters.sort))
  const [geolocationLoading, setGeolocationLoading] = useState(false)
  const [geolocationError, setGeolocationError] = useState('')
  const [isPickingLocation, setIsPickingLocation] = useState(false)
  const [openFilter, setOpenFilter] = useState(null)
  const compactFiltersRef = useRef(null)
  const nutritionMenuRequestsRef = useRef(new Set())
  const viewMode = searchParams.get('view') === 'list' ? 'list' : 'map'

  useEffect(() => {
    const next = new URLSearchParams(window.location.search)
    serializeCatalogFilterState(next, {
      selectedCuisines,
      selectedVenueTypes,
      selectedMetro,
      locationMode,
      radiusKm,
      nearbyPoint,
      nearbyPointLabel,
      addressQuery,
      nutritionCriteria,
      sort,
    })
    const nextSearch = next.toString()
    if (nextSearch !== window.location.search.slice(1)) {
      const suffix = nextSearch ? `?${nextSearch}` : ''
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${suffix}${window.location.hash}`)
    }
  }, [addressQuery, locationMode, nearbyPoint, nearbyPointLabel, nutritionCriteria, radiusKm, selectedCuisines, selectedMetro, selectedVenueTypes, sort])

  const isNutritionPresetActive = (preset, criteria = nutritionCriteria) => {
    const current = criteria[preset.key] || {}
    return String(current[preset.field] ?? '') === String(preset.value)
      && (preset.field === 'max' ? !current.min : !current.max)
  }

  const toggleNutritionPreset = (preset) => {
    setNutritionCriteria((current) => {
      const next = {
        ...current,
        [preset.key]: { ...(current[preset.key] || {}) },
      }
      if (isNutritionPresetActive(preset, current)) {
        next[preset.key][preset.field] = ''
      } else {
        next[preset.key][preset.field] = preset.value
      }
      return next
    })
  }

  const updateNutritionCriteria = (field, bound, value) => {
    setNutritionCriteria((current) => ({
      ...current,
      [field]: {
        ...(current[field] || {}),
        [bound]: value,
      },
    }))
  }

  const resetNutritionCriteria = () => {
    setNutritionCriteria(createEmptyCatalogNutritionCriteria())
    setIsNutritionCustomOpen(false)
  }

  const resetLocationFilter = () => {
    setLocationMode(null)
    setSelectedMetro([])
    setRadiusKm(null)
    setNearbyPoint(null)
    setNearbyPointLabel('')
    setAddressQuery('')
    setAddressResults([])
    setAddressError('')
    setGeolocationError('')
    setIsPickingLocation(false)
  }

  const resetPlaceFilter = () => {
    setSelectedCuisines([])
    setSelectedVenueTypes([])
  }

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (compactFiltersRef.current && !compactFiltersRef.current.contains(event.target)) {
        setOpenFilter(null)
      }
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenFilter(null)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const cityMetroData = useMemo(() => {
    const stations = (metroData.stations || []).filter((station) => station.city === selectedCity.id)
    const availableLineIds = new Set(stations.map((station) => String(station.line_id)))
    return {
      lines: (metroData.lines || []).filter((line) => availableLineIds.has(String(line.id))),
      stations,
    }
  }, [metroData.lines, metroData.stations, selectedCity.id])

  const selectedMetroPoints = useMemo(
    () => getMetroSelectionPoints(cityMetroData.stations, selectedMetro),
    [cityMetroData.stations, selectedMetro],
  )
  const citySearchCenter = useMemo(() => {
    const point = selectedCity?.searchCenter || selectedCity?.center
    const lat = Number(point?.lat)
    const lon = Number(point?.lon)
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  }, [selectedCity?.center, selectedCity?.searchCenter])
  const locationAnchorPoints = useMemo(() => {
    if (locationMode === 'metro') return selectedMetroPoints
    if (locationMode === 'nearby') return nearbyPoint ? [nearbyPoint] : []
    if (locationMode === 'center') return citySearchCenter ? [citySearchCenter] : []
    return []
  }, [citySearchCenter, locationMode, nearbyPoint, selectedMetroPoints])
  const isRadiusFilterActive = locationAnchorPoints.length > 0 && radiusKm != null

  const navigate = useNavigate()
  const { access, requireAccess, requestPaywall } = useOutletContext() || {}

  const accessToken = useAuth((state) => state.accessToken);
  const hasActiveSubscription = useSubscriptionStore((state) => state.hasActiveSub)
  const { isFavorite, toggleFavorite, loadFavorites } = useFavoriteRestaurantsStore((state) => ({
    isFavorite: state.isFavorite,
    toggleFavorite: state.toggle,
    loadFavorites: state.load,
  }));

  useEffect(() => {
    if (accessToken) {
      loadFavorites(accessToken);
    }
  }, [accessToken, loadFavorites]);

  const handleToggleFavorite = useCallback(async (slug, name) => {
    if (!accessToken) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    const currentlyFavorite = isFavorite(slug)
    if (!currentlyFavorite) {
      analytics.track("favorite_add", { type: "restaurant", slug, name: name || slug })
    } else {
      analytics.track("favorite_remove", { type: "restaurant", slug, name: name || slug })
    }
    await toggleFavorite(accessToken, slug);
  }, [accessToken, isFavorite, navigate, toggleFavorite]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 280)

    return () => clearTimeout(handle)
  }, [query])

  const changeCity = useCallback((city) => {
    analytics.track('city_changed', { from_city: selectedCity.id, selected_city: city.id })
    saveCatalogCity(city.id, 'manual', accessToken)
    const next = new URLSearchParams(searchParams)
    if (query.trim()) next.set('q', query.trim()); else next.delete('q')
    const queryString = next.toString()
    navigate(`/catalog/${citySlug(city.id)}/${queryString ? `?${queryString}` : ''}`)
    setSelectedCuisines([])
    setSelectedMetro([])
    setSelectedVenueTypes([])
    resetNutritionCriteria()
    setLocationMode('metro')
    setNearbyPoint(null)
    setNearbyPointLabel('')
    setAddressQuery('')
    setAddressResults([])
    setAddressError('')
    setGeolocationError('')
    setIsPickingLocation(false)
    setOpenFilter(null)
    setCurrentPage(1)
  }, [accessToken, navigate, query, searchParams, selectedCity.id])

  const changeViewMode = useCallback((nextMode) => {
    const next = new URLSearchParams(window.location.search)
    if (nextMode === 'list') next.set('view', 'list'); else next.delete('view')
    setSearchParams(next, { replace: true })
    analytics.track('catalog_view_changed', { view: nextMode, selected_city: selectedCity.id })
  }, [selectedCity.id, setSearchParams])

  // Ask the parent layout for access; show the paywall if the user is not
  // subscribed yet.
  const ensureAccess = useCallback(() => {
    if (requireAccess) {
      return requireAccess()
    }
    if (access?.isActive) return true
    if (requestPaywall) requestPaywall()
    return false
  }, [access?.isActive, requireAccess, requestPaywall])

  // Same for direct menu navigation.
  const openMenu = useCallback((slug) => {
    if (!slug) return
    if (ensureAccess()) {
      analytics.track('restaurant_open', { slug, selected_city: selectedCity.id })
      const menuParams = new URLSearchParams(window.location.search)
      menuParams.set('city', selectedCity.id)
      navigate(`/restaurants/${slug}/menu/?${menuParams.toString()}`)
    }
  }, [ensureAccess, navigate, selectedCity.id])

  // The hub just lists a chain's locations (no nutrition data of its own),
  // so — like the catalog itself — it isn't behind the paywall gate.
  const openChainHub = useCallback((chainSlug) => {
    if (!chainSlug) return
    analytics.track('catalog_chain_open', { chain_slug: chainSlug, selected_city: selectedCity.id })
    navigate(`/restaurants/${chainSlug}/`)
  }, [navigate, selectedCity.id])

  useEffect(() => {
    if (debouncedQuery) analytics.track('catalog_search', { selected_city: selectedCity.id, has_query: true })
  }, [debouncedQuery, selectedCity.id])

  const { data: crossCityResults, loading: searchLoading, error: searchError } = useSWRLite(
    debouncedQuery ? `search:${selectedCity.id}:${debouncedQuery}` : null,
    () => api.search(debouncedQuery, { city: selectedCity.id }),
    { enabled: Boolean(debouncedQuery) },
  )
  const usesClientMetroFilter = locationMode === 'metro' && selectedMetro.length > 0
  // With a radius, station coordinates are the source of truth. Requiring a
  // matching API metro label first would hide restaurants that are physically
  // nearby but whose station metadata is incomplete or stale.
  const metroFilterForCatalog = useMemo(() => (
    locationMode === 'metro'
    && selectedMetro.length > 0
    && (radiusKm == null || selectedMetroPoints.length === 0)
      ? selectedMetro
      : []
  ), [locationMode, radiusKm, selectedMetro, selectedMetroPoints])
  const usesClientVenueFilter = selectedVenueTypes.length > 1
  const hasNutritionFilter = hasCatalogNutritionCriteria(nutritionCriteria)
  const usesClientSortedCatalog = sort !== DEFAULT_CATALOG_SORT
  const loadsCuisinePopularity = openFilter === 'place' && !debouncedQuery
  const usesClientFilteredCatalog = usesClientMetroFilter || usesClientVenueFilter || hasNutritionFilter || loadsCuisinePopularity || usesClientSortedCatalog
  const catalogFetchLimit = usesClientFilteredCatalog ? CLIENT_LOCATION_FETCH_LIMIT : FETCH_LIMIT
  const catalogPagesPerFetch = catalogFetchLimit / PAGE_SIZE
  // Text search is owned by /search. Keep the paginated catalog request
  // independent so a long result set cannot turn into an oversized cache key.
  const serverPage = debouncedQuery ? 0 : Math.floor((currentPage - 1) / catalogPagesPerFetch)
  const { data: rawData, loading, error } = useSWRLite(
    `restaurants:${selectedCity.id}:${serverPage}:${catalogFetchLimit}:${sort}:${selectedCuisines.join(',')}:${selectedVenueTypes.join(',')}:${selectedMetro.join(',')}:${JSON.stringify(nutritionCriteria)}:${locationAnchorPoints.map((point) => `${point.lat}:${point.lon}`).join('|')}:${radiusKm}`,
    () => api.restaurants({
      limit: catalogFetchLimit,
      offset: serverPage * catalogFetchLimit,
      city: selectedCity.id,
      cuisine: getCatalogCuisineFilterValues(selectedCuisines),
      venue_type: selectedVenueTypes.length === 1 ? selectedVenueTypes[0] : undefined,
      metro: usesClientMetroFilter ? undefined : selectedMetro,
      calorie_range: undefined,
      near_lat: isRadiusFilterActive && !usesClientMetroFilter ? locationAnchorPoints.map((point) => point.lat) : undefined,
      near_lon: isRadiusFilterActive && !usesClientMetroFilter ? locationAnchorPoints.map((point) => point.lon) : undefined,
      radius_m: isRadiusFilterActive && !usesClientMetroFilter ? radiusKm * 1000 : undefined,
      sort,
      nutrition_calories_min: nutritionCriteria.calories?.min || undefined,
      nutrition_calories_max: nutritionCriteria.calories?.max || undefined,
      nutrition_protein_min: nutritionCriteria.protein?.min || undefined,
      nutrition_protein_max: nutritionCriteria.protein?.max || undefined,
      nutrition_fat_min: nutritionCriteria.fat?.min || undefined,
      nutrition_fat_max: nutritionCriteria.fat?.max || undefined,
      nutrition_carbs_min: nutritionCriteria.carbs?.min || undefined,
      nutrition_carbs_max: nutritionCriteria.carbs?.max || undefined,
    }),
  )
  const { data: rawMapData, loading: mapLoading, error: mapError } = useSWRLite(
    `restaurants-map:${selectedCity.id}`,
    () => api.restaurantMap({ city: selectedCity.id }),
  )

  const openCatalogDishResults = useCallback((slug) => {
    if (!slug) return
    if (!hasNutritionFilter || hasActiveSubscription) {
      openMenu(slug)
      return
    }

    const returnTo = `${window.location.pathname}${window.location.search}`
    const checkoutLink = getSubscriptionCheckoutLink(accessToken, returnTo)
    analytics.track('catalog_filtered_dishes_open', { slug, selected_city: selectedCity.id })
    navigate(checkoutLink.to, { state: checkoutLink.state })
  }, [accessToken, hasActiveSubscription, hasNutritionFilter, navigate, openMenu, selectedCity.id])
  // Normalize data
  const allItems = useMemo(() => {
    if (!rawData) return []
    // Handle { items: [...] } or [...]
    const list = Array.isArray(rawData?.items) ? rawData.items : (Array.isArray(rawData) ? rawData : [])
    const seen = new Set()
    return list.map(item => {
      const cuisine = normalizeCatalogCuisine(item.cuisine)

      const key = item.slug || item.id || item.name
      if (seen.has(key)) return null
      seen.add(key)
      return { ...item, cuisine }
    }).filter(Boolean)
  }, [rawData])

  const allItemsWithNutrition = useMemo(() => allItems.map((item) => {
    const menuData = item.slug ? nutritionMenuData[getNutritionMenuKey(selectedCity.id, item.slug)] : null
    return menuData?.status === 'ready' ? { ...item, dishes: menuData.dishes } : item
  }), [allItems, nutritionMenuData, selectedCity.id])

  const searchItems = useMemo(() => {
    const restaurants = Array.isArray(crossCityResults?.restaurants) ? crossCityResults.restaurants : []
    return restaurants.map((result) => {
      const catalogItem = allItemsWithNutrition.find((item) => item.slug === result.slug)
      return {
        ...catalogItem,
        ...result,
        cuisine: normalizeCatalogCuisine(result.cuisine || catalogItem?.cuisine),
      }
    })
  }, [allItemsWithNutrition, crossCityResults?.restaurants])

  const mapSourceItems = useMemo(
    () => Array.isArray(rawMapData?.items) ? rawMapData.items : [],
    [rawMapData?.items],
  )
  const filterableItems = useMemo(
    () => enrichCatalogItemsWithMapMetros(allItemsWithNutrition, mapSourceItems),
    [allItemsWithNutrition, mapSourceItems],
  )

  // The list uses the map's per-point metro coverage as well as the nearest
  // station stored on each card, so switching views preserves the same set of
  // matching restaurants.

  const searchSuggestions = useMemo(() => getChainSearchSuggestions(
    debouncedQuery ? searchItems : allItems,
    query,
    {
    matchesQuery: matchesSearchQuery,
    getQueryScore: getSearchQueryScore,
    },
  ), [allItems, debouncedQuery, query, searchItems])

  const showSearchSuggestions = isSearchFocused && Boolean(query.trim()) && searchSuggestions.length > 0

  useEffect(() => {
    if (activeSearchSuggestionIndex >= searchSuggestions.length) {
      setActiveSearchSuggestionIndex(searchSuggestions.length ? 0 : -1)
    }
  }, [activeSearchSuggestionIndex, searchSuggestions.length])

  // Search results come from /search. The catalog endpoint has already applied
  // the structural filters, while the local pass keeps location filtering and
  // compatibility with older response shapes predictable.
  const catalogItemsBeforeLocation = useMemo(() => {
    const sourceItems = debouncedQuery ? searchItems : filterableItems
    const filtered = filterCatalogRestaurants(sourceItems, {
      query: debouncedQuery,
      cuisines: selectedCuisines,
      venueType: selectedVenueTypes,
      metro: metroFilterForCatalog,
      sortByRelevance: sort === DEFAULT_CATALOG_SORT,
      matchesQuery: matchesSearchQuery,
      getQueryScore: getSearchQueryScore,
    })
    const nutritionFiltered = hasNutritionFilter
      ? filtered.filter((restaurant) => matchesCatalogNutritionCriteria(restaurant, nutritionCriteria))
      : filtered
    return sortCatalogItems(
      nutritionFiltered,
      sort,
      (restaurant) => getCatalogNutritionStatsForCriteria(restaurant, nutritionCriteria).matching,
    )
  }, [debouncedQuery, filterableItems, hasNutritionFilter, metroFilterForCatalog, nutritionCriteria, searchItems, selectedCuisines, selectedVenueTypes, sort])

  const mapItemsBeforeLocation = useMemo(() => {
    const enriched = enrichCatalogMapItems(mapSourceItems, allItemsWithNutrition)

    const filtered = filterCatalogRestaurants(enriched, {
      query: debouncedQuery,
      cuisines: selectedCuisines,
      metro: metroFilterForCatalog,
      venueType: selectedVenueTypes,
      matchesQuery: matchesSearchQuery,
    })
    return hasNutritionFilter
      ? filtered.filter((restaurant) => matchesCatalogNutritionCriteria(restaurant, nutritionCriteria))
      : filtered
  }, [allItemsWithNutrition, debouncedQuery, hasNutritionFilter, mapSourceItems, metroFilterForCatalog, nutritionCriteria, selectedCuisines, selectedVenueTypes])

  const mapItems = useMemo(() => (
    isRadiusFilterActive
      ? filterCatalogMapItemsByRadius(mapItemsBeforeLocation, locationAnchorPoints, radiusKm * 1000)
      : mapItemsBeforeLocation
  ), [isRadiusFilterActive, locationAnchorPoints, mapItemsBeforeLocation, radiusKm])

  const filteredItems = useMemo(() => (
    isRadiusFilterActive
      ? filterCatalogItemsByMapPoints(catalogItemsBeforeLocation, mapItems)
      : catalogItemsBeforeLocation
  ), [catalogItemsBeforeLocation, isRadiusFilterActive, mapItems])

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedQuery, locationMode, nearbyPoint, nutritionCriteria, radiusKm, selectedCuisines, selectedMetro, selectedVenueTypes, sort])

  // Physical branches remain reachable from their chain hub, but the catalog
  // itself presents one card per chain rather than exposing branch pages.
  const displayItems = useMemo(
    () => collapseChainRestaurants(filteredItems),
    [filteredItems],
  )

  const resultCount = debouncedQuery || usesClientFilteredCatalog
    ? displayItems.length
    : Number(rawData?.total ?? displayItems.length)
  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE))

  const visibleItems = useMemo(() => {
    const pageWithinFetch = debouncedQuery ? currentPage - 1 : (currentPage - 1) % catalogPagesPerFetch
    const start = pageWithinFetch * PAGE_SIZE
    return displayItems.slice(start, start + PAGE_SIZE)
  }, [catalogPagesPerFetch, currentPage, debouncedQuery, displayItems])

  useEffect(() => {
    if (!hasNutritionFilter) return

    const candidates = visibleItems.filter((restaurant) => (
      !restaurant.isChainCard
      && restaurant.slug
      && nutritionMenuData[getNutritionMenuKey(selectedCity.id, restaurant.slug)] == null
      && !nutritionMenuRequestsRef.current.has(getNutritionMenuKey(selectedCity.id, restaurant.slug))
    ))
    if (!candidates.length) return

    const requests = candidates.map((restaurant) => {
      const key = getNutritionMenuKey(selectedCity.id, restaurant.slug)
      nutritionMenuRequestsRef.current.add(key)
      return api.menu(restaurant.slug, selectedCity.id)
        .then((payload) => ({
          key,
          status: 'ready',
          dishes: getNutritionMenuDishes(payload),
        }))
        .catch(() => ({ key, status: 'error', dishes: [] }))
        .finally(() => nutritionMenuRequestsRef.current.delete(key))
    })

    Promise.all(requests).then((results) => {
      setNutritionMenuData((current) => {
        const next = { ...current }
        results.forEach((result) => {
          next[result.key] = result
        })
        return next
      })
    })
  }, [hasNutritionFilter, nutritionMenuData, selectedCity.id, visibleItems])

  const catalogLoading = debouncedQuery ? searchLoading : loading
  const catalogError = debouncedQuery ? searchError : error
  const isInitialLoading = catalogLoading && !(debouncedQuery ? crossCityResults : rawData)

  useEffect(() => {
    if (!catalogLoading && !catalogError && !allItems.length && !debouncedQuery) {
      analytics.track('catalog_empty_city', { selected_city: selectedCity.id })
    }
  }, [allItems.length, catalogError, catalogLoading, debouncedQuery, selectedCity.id])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  // Options are memoized so the filter chips do not re-render unnecessarily.
  const cuisineOptions = useMemo(() => {
    const raw = filters?.cuisines ?? []
    const options = Array.from(new Set(raw.map(normalizeCatalogCuisine).filter(Boolean)))
    const popularity = new Map(options.map((cuisine) => [cuisine, 0]))
    allItems.forEach((restaurant) => {
      normalizeCatalogCuisine(restaurant.cuisine)
        .split(',')
        .map((cuisine) => cuisine.trim())
        .filter(Boolean)
        .forEach((cuisine) => popularity.set(cuisine, (popularity.get(cuisine) || 0) + 1))
    })
    return options.sort((left, right) => (
      (popularity.get(right) || 0) - (popularity.get(left) || 0)
      || left.localeCompare(right, 'ru')
    ))
  }, [allItems, filters?.cuisines])

  const venueTypeOptions = useMemo(() => {
    const raw = filters?.venue_types ?? filters?.venueTypes ?? []
    const namesById = new Map(
      raw
        .filter((option) => option && typeof option.id === 'string')
        .map((option) => [option.id, String(option.name || '').trim()]),
    )
    return CATALOG_VENUE_TYPES.map((option) => ({
      ...option,
      name: namesById.get(option.id) || option.name,
      displayName: {
        restaurant: 'Ресторан',
        cafe: 'Кафе',
        coffee_tea: 'Кофейня',
        fast_food: 'Бистро',
      }[option.id] || option.name,
    }))
  }, [filters?.venueTypes, filters?.venue_types])

  const selectedVenueTypeEntries = venueTypeOptions
    .filter((option) => selectedVenueTypes.includes(option.id))
  const selectedVenueTypeNames = selectedVenueTypeEntries
    .map((option) => option.displayName || option.name)
  const placeFilterCount = selectedCuisines.length + selectedVenueTypes.length
  const placeFilterSummary = [
    selectedCuisines.length === 1
      ? selectedCuisines[0]
      : selectedCuisines.length > 1
        ? `${selectedCuisines.length} ${getRussianPluralWord(selectedCuisines.length, 'кухня', 'кухни', 'кухонь')}`
        : null,
    selectedVenueTypeNames.length === 1
      ? selectedVenueTypeNames[0]
      : selectedVenueTypeNames.length > 1
        ? `${selectedVenueTypeNames.length} типа`
        : null,
  ].filter(Boolean).join(' · ') || 'Любое место'
  const hasLocationSelection = locationMode === 'center'
    || (locationMode === 'metro' && selectedMetro.length > 0)
    || (locationMode === 'nearby' && Boolean(nearbyPoint))
  const radiusSummary = hasLocationSelection && radiusKm != null ? ` · ${radiusKm} км` : ''
  const locationFilterSummary = !hasLocationSelection
    ? 'Любое место'
    : locationMode === 'metro'
      ? `${selectedMetro.length === 1 ? selectedMetro[0] : `${selectedMetro.length} метро`}${radiusSummary}`
      : locationMode === 'nearby'
        ? `${nearbyPointLabel || 'Рядом с точкой'}${radiusSummary}`
        : `В центре${radiusSummary}`
  const nutritionFilterParts = [
    ...NUTRITION_PRESETS
      .filter((preset) => isNutritionPresetActive(preset))
      .map((preset) => preset.label.toLocaleLowerCase('ru-RU')),
    ...['calories', 'protein', 'fat', 'carbs']
      .filter((field) => {
        const value = nutritionCriteria[field] || {}
        return (value.min !== '' || value.max !== '')
          && !NUTRITION_PRESETS.some((preset) => preset.key === field && isNutritionPresetActive(preset))
      })
      .map((field) => {
        const value = nutritionCriteria[field] || {}
        const labels = { calories: 'ккал', protein: 'белок', fat: 'жиры', carbs: 'углеводы' }
        const unit = labels[field]
        if (value.min !== '' && value.max !== '') return `${value.min}–${value.max} ${unit}`
        if (value.min !== '') return `${unit} от ${value.min} ${field === 'calories' ? '' : 'г'}`.trim()
        return `до ${value.max} ${unit}`
      }),
  ]
  const nutritionFilterSummary = nutritionFilterParts.join(' · ') || 'КБЖУ блюд'
  const nutritionFilterCount = nutritionFilterParts.length

  const appliedFilterChips = [
    ...(locationMode === 'metro'
      ? selectedMetro.map((stationName) => ({
        key: `metro:${stationName}`,
        label: stationName,
        onRemove: () => setSelectedMetro((current) => current.filter((value) => value !== stationName)),
      }))
      : locationMode === 'nearby' && nearbyPoint
        ? [{
          key: 'location:nearby',
          label: nearbyPointLabel || 'Рядом с точкой',
          onRemove: resetLocationFilter,
        }]
        : locationMode === 'center'
          ? [{ key: 'location:center', label: 'Центр', onRemove: resetLocationFilter }]
          : []),
    ...((radiusKm != null && hasLocationSelection)
      ? [{ key: 'location:radius', label: `до ${radiusKm} км`, onRemove: resetLocationFilter }]
      : []),
    ...selectedCuisines.map((cuisine) => ({
      key: `cuisine:${cuisine}`,
      label: cuisine,
      onRemove: () => setSelectedCuisines((current) => current.filter((value) => value !== cuisine)),
    })),
    ...selectedVenueTypeEntries.map((venueType) => {
      return {
        key: `venue:${venueType.id}`,
        label: venueType.displayName || venueType.name,
        onRemove: () => setSelectedVenueTypes((current) => current.filter((value) => value !== venueType.id)),
      }
    }),
    ...NUTRITION_PRESETS
      .filter((preset) => isNutritionPresetActive(preset))
      .map((preset) => ({
        key: `nutrition:${preset.key}`,
        label: preset.label.replace(/^Белка/, 'Белок'),
        onRemove: () => setNutritionCriteria((current) => ({
          ...current,
          [preset.key]: { ...(current[preset.key] || {}), [preset.field]: '' },
        })),
        })),
    ...['calories', 'protein', 'fat', 'carbs'].flatMap((field) => {
      const value = nutritionCriteria[field] || {}
      const activePreset = NUTRITION_PRESETS.some((preset) => preset.key === field && isNutritionPresetActive(preset))
      if (activePreset || (value.min === '' && value.max === '')) return []
      const labels = { calories: 'Калории', protein: 'Белок', fat: 'Жиры', carbs: 'Углеводы' }
      const unit = field === 'calories' ? 'ккал' : 'г'
      const label = value.min !== '' && value.max !== ''
        ? `${labels[field]} ${value.min}–${value.max} ${unit}`
        : value.min !== ''
          ? `${labels[field]} от ${value.min} ${unit}`
          : `${labels[field]} до ${value.max} ${unit}`
      return [{
        key: `nutrition:${field}:custom`,
        label,
        onRemove: () => setNutritionCriteria((current) => ({
          ...current,
          [field]: { min: '', max: '' },
        })),
      }]
    }),
  ]

  const visibleMetroStations = useMemo(
    () => debouncedQuery
      ? getNearbyMetroStations(cityMetroData.stations, mapItems)
      : cityMetroData.stations,
    [cityMetroData.stations, debouncedQuery, mapItems],
  )

  const getInitials = useCallback((name = '') => {
    const trimmed = String(name || '').trim()
    const numeric = trimmed.match(/^(\d+\s*(?:см|cm|°)?)/i)
    if (numeric) return numeric[1].replace(/\s+/g, '').toUpperCase()

    const firstWord = trimmed.split(/\s+/).find(Boolean) || ''
    if (/^[A-Za-zА-Яа-яЁё]{2,4}$/.test(firstWord)) return firstWord.toUpperCase()

    return trimmed
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'RS'
  }, [])

  const getBadgeClassName = useCallback((name) => {
    const label = getInitials(name)
    return [
      'catalog-card__badge',
      label.length >= 4 ? 'catalog-card__badge--long' : '',
      label.length >= 5 ? 'catalog-card__badge--xlong' : '',
    ].filter(Boolean).join(' ')
  }, [getInitials])

  const pageWithinFetch = debouncedQuery ? currentPage - 1 : (currentPage - 1) % catalogPagesPerFetch
  const shownFrom = visibleItems.length
    ? (debouncedQuery ? pageWithinFetch * PAGE_SIZE : serverPage * catalogFetchLimit + pageWithinFetch * PAGE_SIZE) + 1
    : 0
  const shownTo = shownFrom ? Math.min(shownFrom + visibleItems.length - 1, resultCount) : 0
  const totalRestaurantCount = debouncedQuery
    ? displayItems.length
    : Number(rawData?.total ?? rawData?.count ?? allItems.length)
  const weeklyAdded = Number(landingStats?.weeklyAdded ?? 0)
  const cityGenitiveName = cityGenitive(selectedCity.name)

  useMeta({
    title: cityCatalogTitle(selectedCity.name),
    description: cityCatalogDescription(selectedCity.name, totalRestaurantCount),
    canonical: `https://restaurantsecret.ru/catalog/${citySlug(selectedCity.id)}/`,
  })

  const crossCitySuggestions = useMemo(() => (
    (crossCityResults?.otherCities || []).map((result) => {
      const city = cities.find((item) => item.id === result.city)
      return city ? { ...result, city } : null
    }).filter(Boolean)
  ), [cities, crossCityResults?.otherCities])

  const applySearchQuery = useCallback((value) => {
    const trimmedQuery = String(value || '').trim()
    setQuery(trimmedQuery)
    setDebouncedQuery(trimmedQuery)
    setCurrentPage(1)
    const next = new URLSearchParams(window.location.search)
    if (trimmedQuery) next.set('q', trimmedQuery); else next.delete('q')
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  const handleSubmit = useCallback((event) => {
    event.preventDefault()
    if (showSearchSuggestions && activeSearchSuggestionIndex >= 0) {
      const suggestion = searchSuggestions[activeSearchSuggestionIndex]
      if (suggestion) {
        applySearchQuery(suggestion.name)
        setIsSearchFocused(false)
        analytics.track('catalog_search_suggestion_select', {
          chain_slug: suggestion.slug,
          selected_city: selectedCity.id,
        })
        return
      }
    }

    applySearchQuery(query)
    setIsSearchFocused(false)
  }, [activeSearchSuggestionIndex, applySearchQuery, query, searchSuggestions, selectedCity.id, showSearchSuggestions])

  const selectSearchSuggestion = useCallback((suggestion) => {
    applySearchQuery(suggestion.name)
    setIsSearchFocused(false)
    analytics.track('catalog_search_suggestion_select', {
      chain_slug: suggestion.slug,
      selected_city: selectedCity.id,
    })
  }, [applySearchQuery, selectedCity.id])

  const handleSearchKeyDown = useCallback((event) => {
    if (!showSearchSuggestions) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSearchSuggestionIndex((current) => (
        current >= searchSuggestions.length - 1 ? 0 : current + 1
      ))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSearchSuggestionIndex((current) => (
        current <= 0 ? searchSuggestions.length - 1 : current - 1
      ))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setIsSearchFocused(false)
    }
  }, [searchSuggestions.length, showSearchSuggestions])

  const handleClearSearch = useCallback(() => {
    applySearchQuery('')
    setActiveSearchSuggestionIndex(-1)
  }, [applySearchQuery])

  const handleSortChange = useCallback((event) => {
    const nextSort = normalizeCatalogSort(event.target.value)
    setSort(nextSort)
    analytics.track('catalog_sort_changed', { sort: nextSort, selected_city: selectedCity.id })
  }, [selectedCity.id])

  const handleLocationModeChange = useCallback((nextMode) => {
    if (locationMode == null && radiusKm == null) {
      setRadiusKm(DEFAULT_CATALOG_RADIUS_KM)
    }
    setLocationMode(nextMode)
    setIsPickingLocation(false)
    setCurrentPage(1)
    analytics.track('catalog_location_mode_changed', {
      mode: nextMode,
      selected_city: selectedCity.id,
    })
  }, [locationMode, radiusKm, selectedCity.id])

  const handleRadiusChange = useCallback((value) => {
    setRadiusKm(value)
    setCurrentPage(1)
    analytics.track('catalog_location_radius_changed', {
      mode: locationMode,
      radius_km: value,
      selected_city: selectedCity.id,
    })
  }, [locationMode, selectedCity.id])

  const handleUseCurrentLocation = useCallback(() => {
    setGeolocationError('')
    setAddressError('')
    if (!navigator.geolocation) {
      setGeolocationError('Браузер не поддерживает геолокацию. Введите адрес или выберите точку на карте.')
      return
    }

    setGeolocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const approximate = Number(coords.accuracy) > 500
        setNearbyPoint({ lat: coords.latitude, lon: coords.longitude })
        setNearbyPointLabel(approximate ? 'местоположение определено приблизительно' : 'моё местоположение')
        setGeolocationError('')
        setGeolocationLoading(false)
        setIsPickingLocation(false)
        analytics.track('catalog_location_point_selected', {
          source: 'geolocation',
          approximate,
          selected_city: selectedCity.id,
        })
      },
      () => {
        setGeolocationLoading(false)
        setGeolocationError('Не удалось определить местоположение. Введите адрес или выберите точку на карте.')
      },
      // Не ограничиваем запрос коротким таймаутом: браузер может держать
      // системное окно разрешения открытым дольше, чем длится обычный запрос.
      { enableHighAccuracy: true, maximumAge: 60_000 },
    )
  }, [selectedCity.id])

  const handleAddressSearch = useCallback(async () => {
    const value = addressQuery.trim()
    if (value.length < 3 || addressLoading) return

    setAddressLoading(true)
    setAddressError('')
    setGeolocationError('')
    setAddressResults([])
    try {
      const result = await api.geocode(value, selectedCity.id)
      const items = Array.isArray(result?.items) ? result.items : []
      setAddressResults(items)
      if (!items.length) setAddressError('Адрес не найден. Уточните запрос или выберите точку на карте.')
      analytics.track('catalog_address_search', {
        selected_city: selectedCity.id,
        has_results: items.length > 0,
      })
    } catch (_) {
      setAddressError('Поиск адреса временно недоступен. Выберите точку на карте или попробуйте позже.')
    } finally {
      setAddressLoading(false)
    }
  }, [addressLoading, addressQuery, selectedCity.id])

  const handleAddressQueryChange = useCallback((value) => {
    setAddressQuery(value)
    setAddressResults([])
    setAddressError('')
  }, [])

  const handleSelectAddress = useCallback((result) => {
    setNearbyPoint({ lat: result.lat, lon: result.lon })
    setNearbyPointLabel(result.label)
    setAddressQuery(result.label)
    setAddressResults([])
    setAddressError('')
    setIsPickingLocation(false)
    analytics.track('catalog_location_point_selected', {
      source: 'address',
      selected_city: selectedCity.id,
    })
  }, [selectedCity.id])

  const handlePickOnMap = useCallback(() => {
    setLocationMode('nearby')
    setIsPickingLocation(true)
    setOpenFilter(null)
    setAddressError('')
    setGeolocationError('')
    if (viewMode !== 'map') changeViewMode('map')
  }, [changeViewMode, viewMode])

  const handleMapLocationPick = useCallback((point) => {
    setNearbyPoint(point)
    setNearbyPointLabel('точка на карте')
    setAddressResults([])
    setIsPickingLocation(false)
    analytics.track('catalog_location_point_selected', {
      source: 'map',
      selected_city: selectedCity.id,
    })
  }, [selectedCity.id])

  return (
    <div className={`catalog-page catalog-page--${viewMode}`}>
      <header className="catalog-heading">
        <div className="catalog-heading__row">
          <h1 className="catalog-heading__title">Куда пойдём <em>сегодня?</em></h1>
        </div>
        <p className="catalog-heading__lead">
          {'КБЖУ блюд в '}
          <strong>{totalRestaurantCount.toLocaleString('ru-RU')}</strong>
          {' '}
          {getRussianPluralWord(totalRestaurantCount, 'ресторане', 'ресторанах', 'ресторанах')}
          {` ${cityGenitiveName}: калории, белки, жиры и углеводы из меню`}
          {weeklyAdded > 0 && (
            <>
              <span className="catalog-heading__sep" aria-hidden="true">·</span>
              <strong>{weeklyAdded.toLocaleString('ru-RU')}</strong>
              {' '}
              {getRussianPluralWord(weeklyAdded, 'добавлен', 'добавлено', 'добавлено')} за неделю
            </>
          )}
        </p>
      </header>

      <section className="catalog-hero" aria-label="Поиск и фильтры ресторанов">
        <div className="catalog-hero__inner">
          <form className="catalog-search" onSubmit={handleSubmit} ref={compactFiltersRef}>
            <div className="catalog-search-line">
              <div className="catalog-city-filter">
                <label htmlFor="catalog-city">Город</label>
                <div className="catalog-city-filter__select-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
                    <circle cx="12" cy="10" r="2.1" />
                  </svg>
                  <select id="catalog-city" value={selectedCity.id}
                    onFocus={() => analytics.track('city_selector_open', { selected_city: selectedCity.id })}
                    onChange={(event) => {
                      const city = cities.find((item) => item.id === event.target.value)
                      if (city) changeCity(city)
                    }}>
                    {cities.length ? cities.map((city) => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    )) : <option value="Москва">Москва</option>}
                  </select>
                </div>
              </div>
            <label className="sr-only" htmlFor="restaurant-search">Поиск по ресторанам</label>
            <div
              className="catalog-search__field"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setIsSearchFocused(false)
              }}
            >
              <svg className="catalog-search__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.1 4.1" />
              </svg>
              <input
                id="restaurant-search"
                className="catalog-search__input"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveSearchSuggestionIndex(-1)
                }}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Найти ресторан"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSearchSuggestions}
                aria-controls="catalog-search-suggestions"
                aria-activedescendant={activeSearchSuggestionIndex >= 0
                  ? `catalog-search-suggestion-${activeSearchSuggestionIndex}`
                  : undefined}
              />
              {query && (
                <button
                  type="button"
                  className="catalog-search__clear"
                  onClick={handleClearSearch}
                  aria-label="Очистить поиск"
                >
                  ×
                </button>
              )}
              {showSearchSuggestions && (
                <ul
                  id="catalog-search-suggestions"
                  className="catalog-search__suggestions"
                  role="listbox"
                  aria-label="Подсказки по сетям"
                >
                  {searchSuggestions.map((suggestion, index) => (
                    <li key={suggestion.slug} role="none">
                      <button
                        id={`catalog-search-suggestion-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeSearchSuggestionIndex}
                        className={`catalog-search__suggestion${index === activeSearchSuggestionIndex ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveSearchSuggestionIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectSearchSuggestion(suggestion)}
                      >
                        <span className="catalog-search__suggestion-mark" aria-hidden="true">
                          {suggestion.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="catalog-search__suggestion-copy">
                          <strong>{suggestion.name}</strong>
                          <span>
                            Сеть · {suggestion.locationsCount}{' '}
                            {getRussianPluralWord(suggestion.locationsCount, 'ресторан', 'ресторана', 'ресторанов')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              className="catalog-search__submit btn btn--primary"
            >
              Найти
            </button>
            </div>

            <div className="catalog-compact-filters">
              <button
                type="button"
                className={`catalog-compact-filter${openFilter === 'location' ? ' is-open' : ''}`}
                aria-expanded={openFilter === 'location'}
                aria-controls="catalog-location-popover"
                onClick={() => setOpenFilter((current) => current === 'location' ? null : 'location')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
                  <circle cx="12" cy="10" r="2.1" />
                </svg>
                <span>
                  <small>Где удобно?</small>
                  <strong>{locationFilterSummary}</strong>
                </span>
              </button>

              <button
                type="button"
                className={`catalog-compact-filter${openFilter === 'place' ? ' is-open' : ''}`}
                aria-expanded={openFilter === 'place'}
                aria-controls="catalog-place-popover"
                onClick={() => setOpenFilter((current) => current === 'place' ? null : 'place')}
              >
                <CuisineIcon />
                <span>
                  <small>Какое место?</small>
                  <strong>{placeFilterSummary}</strong>
                </span>
                {placeFilterCount > 0 && <b aria-label={`Выбрано фильтров: ${placeFilterCount}`}>{placeFilterCount}</b>}
              </button>

              <button
                type="button"
                className={`catalog-compact-filter${openFilter === 'nutrition' ? ' is-open' : ''}`}
                aria-expanded={openFilter === 'nutrition'}
                aria-controls="catalog-nutrition-popover"
                onClick={() => setOpenFilter((current) => current === 'nutrition' ? null : 'nutrition')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 19V5M4 19h16" />
                  <path d="m7 15 3-4 3 2 5-7" />
                  <circle cx="7" cy="15" r="1" />
                  <circle cx="10" cy="11" r="1" />
                  <circle cx="13" cy="13" r="1" />
                  <circle cx="18" cy="6" r="1" />
                </svg>
                <span>
                  <small>По блюдам</small>
                  <strong>{nutritionFilterSummary}</strong>
                </span>
                {nutritionFilterCount > 0 && <b aria-label={`Фильтров КБЖУ: ${nutritionFilterCount}`}>{nutritionFilterCount}</b>}
              </button>
            </div>

            {appliedFilterChips.length > 0 && (
              <div className="catalog-applied-filters" aria-label="Применённые фильтры">
                {appliedFilterChips.map((chip) => (
                  <span className="catalog-applied-filter" key={chip.key}>
                    <span>{chip.label}</span>
                    <button type="button" onClick={chip.onRemove} aria-label={`Убрать фильтр «${chip.label}»`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {openFilter && (
              <button
                type="button"
                className="catalog-filter-backdrop"
                aria-label="Закрыть фильтры"
                onClick={() => setOpenFilter(null)}
              />
            )}

            <div
              id="catalog-location-popover"
              className={`catalog-filter-popover catalog-filter-popover--location${openFilter === 'location' ? ' is-open' : ''}`}
              role="dialog"
              aria-labelledby="catalog-location-popover-title"
              aria-hidden={openFilter !== 'location'}
            >
              <div className="catalog-filter-popover__head">
                <div>
                  <h2 id="catalog-location-popover-title">Где удобно?</h2>
                </div>
                <button type="button" className="catalog-filter-popover__clear" onClick={resetLocationFilter}>Сбросить</button>
              </div>
              <CatalogLocationFilter
                  mode={locationMode}
                  onModeChange={handleLocationModeChange}
                  radiusKm={radiusKm}
                  onRadiusChange={handleRadiusChange}
                  metroData={cityMetroData}
                  selectedStationNames={selectedMetro}
                  onMetroChange={setSelectedMetro}
                  pointLabel={nearbyPointLabel}
                  addressQuery={addressQuery}
                  onAddressQueryChange={handleAddressQueryChange}
                  onAddressSearch={handleAddressSearch}
                  addressResults={addressResults}
                  addressLoading={addressLoading}
                  addressError={addressError}
                  onSelectAddress={handleSelectAddress}
                  onUseCurrentLocation={handleUseCurrentLocation}
                  geolocationLoading={geolocationLoading}
                  geolocationError={geolocationError}
                  onPickOnMap={handlePickOnMap}
                  isPickingOnMap={isPickingLocation}
                />
            </div>

            <div
              id="catalog-place-popover"
              className={`catalog-filter-popover catalog-filter-popover--place${openFilter === 'place' ? ' is-open' : ''}`}
              role="dialog"
              aria-labelledby="catalog-place-popover-title"
              aria-hidden={openFilter !== 'place'}
            >
              <div className="catalog-filter-popover__head">
                <div>
                  <h2 id="catalog-place-popover-title">Какое место?</h2>
                  <p>Можно выбрать несколько кухонь и типов заведений.</p>
                </div>
                <button type="button" className="catalog-filter-popover__clear" onClick={resetPlaceFilter}>Сбросить</button>
              </div>
              <CatalogPlaceFilter
                cuisines={cuisineOptions}
                selectedCuisines={selectedCuisines}
                onCuisinesChange={setSelectedCuisines}
                venueTypes={venueTypeOptions}
                selectedVenueTypes={selectedVenueTypes}
                onVenueTypesChange={setSelectedVenueTypes}
              />
            </div>

            <div
              id="catalog-nutrition-popover"
              className={`catalog-filter-popover catalog-filter-popover--nutrition${openFilter === 'nutrition' ? ' is-open' : ''}`}
              role="dialog"
              aria-labelledby="catalog-nutrition-popover-title"
              aria-hidden={openFilter !== 'nutrition'}
            >
              <div className="catalog-filter-popover__head">
                <div>
                  <h2 id="catalog-nutrition-popover-title">КБЖУ блюд</h2>
                  <p>Покажем рестораны, где есть хотя бы одно подходящее блюдо.</p>
                </div>
                <button
                  type="button"
                  className="catalog-filter-popover__clear"
                  onClick={resetNutritionCriteria}
                >
                  Сбросить
                </button>
              </div>
              <div className="catalog-nutrition-intro">Быстрые варианты</div>
              <div className="catalog-nutrition-quick" role="group" aria-label="Быстрые варианты КБЖУ">
                {NUTRITION_PRESETS.map((preset) => {
                  const isActive = isNutritionPresetActive(preset)
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`catalog-nutrition-quick-card${isActive ? ' is-active' : ''}`}
                      aria-pressed={isActive}
                      onClick={() => toggleNutritionPreset(preset)}
                    >
                      <span>{preset.label}</span>
                      <span className="catalog-nutrition-quick-card__tick" aria-hidden="true">✓</span>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className={`catalog-nutrition-custom-toggle${isNutritionCustomOpen ? ' is-open' : ''}`}
                aria-expanded={isNutritionCustomOpen}
                aria-controls="catalog-nutrition-custom-values"
                onClick={() => setIsNutritionCustomOpen((open) => !open)}
              >
                <span>Задать свои значения</span><span aria-hidden="true">⌄</span>
              </button>
              <div
                id="catalog-nutrition-custom-values"
                className={`catalog-nutrition-custom-values${isNutritionCustomOpen ? ' is-open' : ''}`}
              >
                {[
                  ['calories', 'Калории', 'ккал'],
                  ['protein', 'Белки', 'г'],
                  ['fat', 'Жиры', 'г'],
                  ['carbs', 'Углеводы', 'г'],
                ].map(([field, label, unit]) => (
                  <div className="catalog-nutrition-input-row" key={field}>
                    <label htmlFor={`catalog-nutrition-${field}-min`}>{label}</label>
                    <input
                      id={`catalog-nutrition-${field}-min`}
                      type="number"
                      min="0"
                      placeholder="от"
                      value={nutritionCriteria[field]?.min ?? ''}
                      onChange={(event) => updateNutritionCriteria(field, 'min', event.target.value)}
                    />
                    <input
                      id={`catalog-nutrition-${field}-max`}
                      type="number"
                      min="0"
                      placeholder="до"
                      value={nutritionCriteria[field]?.max ?? ''}
                      onChange={(event) => updateNutritionCriteria(field, 'max', event.target.value)}
                    />
                    <span>{unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>
      </section>

      <div className="catalog-content">
        <div className="catalog-map-column">
          <Suspense fallback={<div className="catalog-map-fallback">Загружаем карту…</div>}>
            <CatalogMap
              key={viewMode}
              restaurants={mapLoading ? [] : mapItems}
              metroStations={visibleMetroStations}
              selectedMetroStationNames={selectedMetro}
              focusPoints={locationAnchorPoints}
              radiusPoints={locationAnchorPoints}
              radiusMeters={radiusKm == null ? 0 : radiusKm * 1000}
              isPickingLocation={isPickingLocation}
              onPickLocation={handleMapLocationPick}
              onCancelLocationPick={() => setIsPickingLocation(false)}
              center={selectedCity?.center ? [selectedCity.center.lat, selectedCity.center.lon] : undefined}
              zoom={selectedCity?.recommendedZoom}
              loading={mapLoading}
              error={mapError}
              totalResults={resultCount}
              isFavorite={isFavorite}
              onToggleFavorite={handleToggleFavorite}
              onOpenRestaurant={openCatalogDishResults}
              onShowList={() => changeViewMode('list')}
            />
          </Suspense>
        </div>
        <section className="catalog-results">
        {isInitialLoading && <div className="catalog-state">Загружаем рестораны…</div>}
        {!isInitialLoading && !catalogError && (
          <div className="catalog-results__summary" role="status" aria-live="polite">
            <span>
              Найдено: <strong>{resultCount.toLocaleString('ru-RU')}</strong>{' '}
              {getRussianPluralWord(resultCount, 'ресторан', 'ресторана', 'ресторанов')}
            </span>
            <label className="catalog-sort-control">
              <span>Сортировать</span>
              <select value={sort} onChange={handleSortChange} aria-label="Сортировка ресторанов">
                {CATALOG_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {catalogError && <p className="err">Ошибка: {String(catalogError.message || catalogError)}</p>}
        {!catalogLoading && !visibleItems.length && !catalogError && (
          crossCitySuggestions.length > 0 ? (
            <div className="catalog-empty" role="status">
              <div className="catalog-empty__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <circle cx="10.75" cy="10.75" r="6.75" />
                  <path d="m15.8 15.8 4.2 4.2" />
                </svg>
              </div>
              <h2 className="catalog-empty__title">Здесь пока пусто</h2>
              <p className="catalog-empty__text">
                Попробуйте другой запрос или посмотрите результаты в другом городе.
              </p>
              <div className="catalog-empty__cities" aria-label="Результаты в других городах">
                {crossCitySuggestions.map(({ city }) => (
                  <button
                    className="catalog-empty__city"
                    key={city.id}
                    type="button"
                    onClick={() => changeCity(city)}
                  >
                    {city.name}
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="catalog-state catalog-state--empty">
              <div className="catalog-state__badge">Ничего не нашли</div>
              <p className="catalog-state__text">Попробуйте изменить запрос или выбрать другую кухню.</p>
            </div>
          )
        )}

        <ul className="catalog-grid">
          {visibleItems.map((r, i) => {
            if (r.isChainCard) {
              const badgeText = getInitials(r.name)
              return (
                <li key={`chain-${r.slug}`} className="catalog-card catalog-card--chain" role="group" aria-label={r.name}>
                  <div className="catalog-card__top">
                    <div className="catalog-card__identity">
                      <div className={`${getBadgeClassName(r.name)} catalog-card__badge--tone-${i % 4}`} aria-hidden="true">{badgeText}</div>
                      <div className="catalog-card__copy">
                        <h3 className="catalog-card__title">{r.name}</h3>
                        <div className="catalog-card__meta">
                          {r.cuisine && (
                            <span className="catalog-card__meta-item">
                              <CuisineIcon />
                              {r.cuisine}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="catalog-card__bottom">
                    <div className="catalog-card__label">
                      Сеть: {r.chainCount} {getRussianPluralWord(r.chainCount, 'ресторан', 'ресторана', 'ресторанов')}
                    </div>
                    <button type="button" className="btn btn--primary" onClick={() => openChainHub(r.slug)}>Все рестораны сети</button>
                  </div>
                </li>
              )
            }

            const restaurantLinkUrl = normalizeInstagramUrl(r.instagramUrl)
            const nutritionStats = getCatalogNutritionStatsForCriteria(r, nutritionCriteria)
            const dishesCount = hasNutritionFilter ? nutritionStats.matching : nutritionStats.total
            const nutritionMenuState = r.slug
              ? nutritionMenuData[getNutritionMenuKey(selectedCity.id, r.slug)]
              : null
            const googleRating = getRestaurantGoogleRating(r)
            const googlePlaceId = getGooglePlaceId(r)
            return (
              <li key={`${r.slug || r.name}-${i}`} className="catalog-card" role="group" aria-label={r?.name ?? 'Ресторан'}>
                <div className="catalog-card__layout">
                  <GooglePlaceMedia key={googlePlaceId || r.slug || r.name} placeId={googlePlaceId} restaurantName={r.name} />
                  <div className="catalog-card__content">
                    <div className="catalog-card__top">
                      <div className="catalog-card__identity">
                        <div className="catalog-card__copy">
                          <h3 className="catalog-card__title">
                            <ScrollingRestaurantName name={r.name} />
                            {googleRating && <span className="catalog-card__rating" aria-label={`Рейтинг Google ${googleRating}`}>★ {googleRating}</span>}
                            {r?.autoUpdated && <AutoUpdatedBadge className="catalog-card__auto-updated" />}
                          </h3>
                          <div className="catalog-card__meta">
                            {r?.cuisine && (
                              <span className="catalog-card__meta-item">
                                <CuisineIcon />
                                {r.cuisine}
                              </span>
                            )}
                          </div>
                          <MetroStationsText restaurant={r} className="catalog-card__metro" />
                        </div>
                      </div>
                      <div className="catalog-card__top-actions">
                        {restaurantLinkUrl && (
                          <a
                            href={restaurantLinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Открыть Instagram"
                            title="Instagram"
                            className="catalog-card__icon-btn catalog-card__icon-btn--instagram"
                          >
                            <InstagramIcon />
                          </a>
                        )}
                        <button
                          type="button"
                          className={`catalog-card__icon-btn catalog-card__fav-btn ${isFavorite(r.slug) ? 'is-active' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleToggleFavorite(r.slug, r.name)
                          }}
                          aria-label={isFavorite(r.slug) ? "Удалить из избранного" : "Добавить в избранное"}
                        >
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z"
                              fill={isFavorite(r.slug) ? "#E11D48" : "none"}
                              stroke={isFavorite(r.slug) ? "#E11D48" : "currentColor"}
                              strokeWidth="2"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="catalog-card__bottom">
                      <div className="catalog-card__label">
                        {hasNutritionFilter
                          ? dishesCount === null
                            ? nutritionMenuState?.status === 'error'
                              ? 'Не удалось загрузить блюда'
                              : 'Загрузка блюд…'
                            : `${dishesCount} ${getRussianPluralWord(dishesCount, 'подходящее блюдо', 'подходящих блюда', 'подходящих блюд')}`
                          : `Блюда в меню: ${dishesCount} ${getRussianPluralWord(dishesCount, 'блюдо', 'блюда', 'блюд')}`}
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => openCatalogDishResults(r.slug)}
                      >
                        {hasNutritionFilter ? 'Посмотреть подходящие блюда' : 'Открыть меню'}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {!isInitialLoading && resultCount > 0 && (
          <nav className="catalog-pagination" aria-label="Навигация по ресторанам">
            <button
              type="button"
              className="catalog-pagination__button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              aria-label="Предыдущая страница"
            >
              ‹
            </button>
            <span className="catalog-pagination__text">
              Показано {shownFrom}–{shownTo} из {resultCount} {getRussianPluralWord(resultCount, 'ресторан', 'ресторана', 'ресторанов')}
            </span>
            <button
              type="button"
              className="catalog-pagination__button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              aria-label="Следующая страница"
            >
              ›
            </button>
          </nav>
        )}
        </section>
      </div>

      <button
        type="button"
        className={`catalog-mobile-view-toggle${openFilter ? ' is-hidden' : ''}`}
        onClick={() => changeViewMode(viewMode === 'map' ? 'list' : 'map')}
        aria-label={viewMode === 'map' ? 'Показать список ресторанов' : 'Показать карту ресторанов'}
      >
        {viewMode === 'map' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 6h12M8 12h12M8 18h12" />
            <circle cx="4" cy="6" r="1" />
            <circle cx="4" cy="12" r="1" />
            <circle cx="4" cy="18" r="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z" />
            <path d="M8 4v13M16 7v13" />
          </svg>
        )}
        {viewMode === 'map' ? 'Список' : 'Карта'}
      </button>
    </div>
  )
}
