// Catalog page showing restaurants on a map by default, with a list alternative.
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMeta } from '@/lib/useMeta'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import CuisineFilter from '../components/CuisineFilter.jsx'
import MetroFilter from '../components/MetroFilter.jsx'
import { useSWRLite } from '../hooks/useSWRLite.js'
import { useFavoriteRestaurantsStore } from '@/store/favoriteRestaurants'
import { useAuth } from '@/store/auth'
import { analytics } from '@/services/analytics'
import { getRussianPluralWord, getSearchQueryScore, matchesSearchQuery } from '@/lib/text'
import { getLandingStats } from '@/lib/api'
import AutoUpdatedBadge from '@/components/AutoUpdatedBadge.jsx'
import { saveCatalogCity } from '@/lib/cityPreference'
import { citySlug, cityGenitive, cityCatalogTitle, cityCatalogDescription } from '@/lib/cityCatalog'
import { getMetroSelectionPoints } from '@/lib/metroSelection'
import { collapseChainRestaurants } from '@/lib/catalogChains'
import {
  CATALOG_VENUE_TYPES,
  filterCatalogRestaurants,
  normalizeCatalogCuisine,
} from '@/lib/catalogFilters'

const CatalogMap = lazy(() => import('../components/CatalogMap.jsx'))

// Fetch a large number to emulate "all" items since backend pagination seems flaky
const FETCH_LIMIT = 1000;
const PAGE_SIZE = 8;
const EMPTY_METRO_DATA = { lines: [], stations: [] };

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

const RestaurantWebIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9.25" />
    <path d="M3 12h18" />
    <path d="M12 2.75c2.35 2.55 3.55 5.63 3.55 9.25s-1.2 6.7-3.55 9.25" />
    <path d="M12 2.75C9.65 5.3 8.45 8.38 8.45 12s1.2 6.7 3.55 9.25" />
    <path d="M5.35 6.05c1.72.83 3.93 1.25 6.65 1.25s4.93-.42 6.65-1.25" />
    <path d="M5.35 17.95c1.72-.83 3.93-1.25 6.65-1.25s4.93.42 6.65 1.25" />
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

const normalizeRestaurantLinkUrl = (rawUrl) => {
  if (!rawUrl) return null
  const text = String(rawUrl).trim()
  if (!text || text === '-' || text === '—') return null
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`

  try {
    const parsed = new URL(withProtocol)
    if (!/^https?:$/i.test(parsed.protocol) || !parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch (_) {
    return null
  }
}

export default function Catalog() {
  const { city: cityPath } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: citiesData } = useSWRLite('cities', () => api.cities())
  const cities = citiesData?.items || []
  const selectedCity = cities.find((item) => citySlug(item.id) === cityPath || item.id === cityPath)
    || cities.find((item) => item.id === localStorage.getItem('catalog_city'))
    || { id: 'Москва', name: 'Москва' }

  const { data: filters } = useSWRLite(`filters:${selectedCity.id}`, () => api.filters(selectedCity.id))
  const { data: metroResponse } = useSWRLite('metro', () => api.metro())
  const metroData = metroResponse || EMPTY_METRO_DATA
  const { data: landingStats } = useSWRLite('landing-stats', () => getLandingStats())
  const [selectedCuisines, setSelectedCuisines] = useState([])
  const [selectedMetro, setSelectedMetro] = useState([])
  const [selectedVenueType, setSelectedVenueType] = useState('')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('q') || '')
  const [currentPage, setCurrentPage] = useState(1)
  const viewMode = searchParams.get('view') === 'list' ? 'list' : 'map'

  const navigate = useNavigate()
  const { access, requireAccess, requestPaywall } = useOutletContext() || {}

  const accessToken = useAuth((state) => state.accessToken);
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
    setSelectedVenueType('')
    setCurrentPage(1)
  }, [accessToken, navigate, query, searchParams, selectedCity.id])

  const changeViewMode = useCallback((nextMode) => {
    const next = new URLSearchParams(searchParams)
    if (nextMode === 'list') next.set('view', 'list'); else next.delete('view')
    setSearchParams(next, { replace: true })
    analytics.track('catalog_view_changed', { view: nextMode, selected_city: selectedCity.id })
  }, [searchParams, selectedCity.id, setSearchParams])

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
      navigate(`/restaurants/${slug}/menu/?city=${encodeURIComponent(selectedCity.id)}`)
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

  // Fetch ALL restaurants once (or as many as limit allows)
  // We remove 'query' from here because we want to filter locally to ensure search works reliably
  // We remove 'page' because we want to fetch everything upfront
  const { data: rawData, loading, error } = useSWRLite(
    `restaurants-all:${selectedCity.id}`,
    () => api.restaurants({
      limit: FETCH_LIMIT,
      city: selectedCity.id,
    })
  )
  const { data: rawMapData, loading: mapLoading, error: mapError } = useSWRLite(
    `restaurants-map:${selectedCity.id}`,
    () => api.restaurantMap({ city: selectedCity.id }),
    { enabled: viewMode === 'map' },
  )
  const { data: crossCityResults } = useSWRLite(
    debouncedQuery ? `search:${selectedCity.id}:${debouncedQuery}` : null,
    () => api.search(debouncedQuery, { city: selectedCity.id }),
    { enabled: Boolean(debouncedQuery) },
  )

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

  // Filter items based on SEARCH and CUISINE
  const filteredItems = useMemo(() => {
    return filterCatalogRestaurants(allItems, {
      query: debouncedQuery,
      cuisines: selectedCuisines,
      metro: selectedMetro,
      venueType: selectedVenueType,
      sortByRelevance: true,
      matchesQuery: matchesSearchQuery,
      getQueryScore: getSearchQueryScore,
    })
  }, [debouncedQuery, allItems, selectedCuisines, selectedMetro, selectedVenueType])

  const mapItems = useMemo(() => {
    const list = Array.isArray(rawMapData?.items) ? rawMapData.items : []
    const catalogBySlug = new Map(allItems.map((item) => [String(item?.slug || '').toLowerCase(), item]))
    const enriched = list.map((item) => {
      const slug = item?.slug || item?.restaurantSlug || item?.restaurant_slug || ''
      const catalogItem = catalogBySlug.get(String(slug).toLowerCase())

      return {
        ...catalogItem,
        ...item,
        slug,
        name: item?.name || catalogItem?.name,
        cuisine: normalizeCatalogCuisine(item?.cuisine || catalogItem?.cuisine),
        metro: item?.metro || item?.metro_name || item?.metroName || catalogItem?.metro,
        primary_venue_type: item?.primary_venue_type
          ?? item?.primaryVenueType
          ?? catalogItem?.primary_venue_type
          ?? catalogItem?.primaryVenueType,
      }
    })

    return filterCatalogRestaurants(enriched, {
      query: debouncedQuery,
      cuisines: selectedCuisines,
      metro: selectedMetro,
      venueType: selectedVenueType,
      matchesQuery: matchesSearchQuery,
    })
  }, [allItems, debouncedQuery, rawMapData?.items, selectedCuisines, selectedMetro, selectedVenueType])

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedQuery, selectedCuisines, selectedMetro, selectedVenueType])

  // Physical branches remain reachable from their chain hub, but the catalog
  // itself presents one card per chain rather than exposing branch pages.
  const displayItems = useMemo(
    () => collapseChainRestaurants(filteredItems),
    [filteredItems],
  )

  const totalPages = Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE))

  const visibleItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return displayItems.slice(start, start + PAGE_SIZE)
  }, [currentPage, displayItems])

  const isInitialLoading = loading && !allItems.length

  useEffect(() => {
    if (!loading && !error && allItems.length === 0) {
      analytics.track('catalog_empty_city', { selected_city: selectedCity.id })
    }
  }, [allItems.length, error, loading, selectedCity.id])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  // Options are memoized so the filter chips do not re-render unnecessarily.
  const cuisineOptions = useMemo(() => {
    const raw = filters?.cuisines ?? []
    return Array.from(new Set(raw.map(c => {
      let val = String(c).trim()
      if (val.toLowerCase() === 'nan') return 'Другое'
      return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase()
    }))).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [filters?.cuisines])

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
    }))
  }, [filters?.venueTypes, filters?.venue_types])

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

  const extractDishes = useCallback((restaurant) => {
    const candidates = [
      restaurant?.dishes,
      restaurant?.menu_preview,
      restaurant?.popular_dishes,
      restaurant?.topDishes,
      restaurant?.top_dishes
    ]

    for (const list of candidates) {
      if (Array.isArray(list) && list.length) {
        return list
          .map((item) => typeof item === 'string' ? item : item?.name)
          .filter(Boolean)
      }
    }

    return []
  }, [])

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

  const shownFrom = displayItems.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0
  const shownTo = Math.min(currentPage * PAGE_SIZE, displayItems.length)
  const totalRestaurantCount = allItems.length || Number(rawData?.total ?? rawData?.count ?? 0)
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

  const handleSubmit = useCallback((event) => {
    event.preventDefault()
    const trimmedQuery = query.trim()
    setDebouncedQuery(trimmedQuery)
    setCurrentPage(1)
    const next = new URLSearchParams(searchParams)
    if (trimmedQuery) next.set('q', trimmedQuery); else next.delete('q')
    setSearchParams(next, { replace: true })
  }, [query, searchParams, setSearchParams])

  const handleClearSearch = useCallback(() => {
    setQuery('')
    setDebouncedQuery('')
    setCurrentPage(1)
    const next = new URLSearchParams(searchParams)
    next.delete('q')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return (
    <div className={`catalog-page catalog-page--${viewMode}`}>
      <header className="catalog-heading">
        <p className="catalog-heading__eyebrow">КБЖУ ресторанов</p>
        <div className="catalog-heading__row">
          <h1 className="catalog-heading__title">КБЖУ ресторанов {cityGenitiveName}</h1>
          <div className="catalog-view-switch" role="group" aria-label="Вид каталога">
            <button
              type="button"
              className={viewMode === 'map' ? 'is-active' : ''}
              aria-pressed={viewMode === 'map'}
              onClick={() => changeViewMode('map')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" />
                <path d="M8 3v15M16 6v15" />
              </svg>
              Карта
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              aria-pressed={viewMode === 'list'}
              onClick={() => changeViewMode('list')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 6h12M9 12h12M9 18h12" />
                <circle cx="4" cy="6" r="1" />
                <circle cx="4" cy="12" r="1" />
                <circle cx="4" cy="18" r="1" />
              </svg>
              Список
            </button>
          </div>
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
          <form className="catalog-search" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="restaurant-search">Поиск по ресторанам</label>
            <div className="catalog-search__field">
              <svg className="catalog-search__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.1 4.1" />
              </svg>
              <input
                id="restaurant-search"
                className="catalog-search__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти ресторан"
                autoComplete="off"
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
            </div>
            <button
              type="button"
              className="catalog-search__filter-btn"
              aria-label="Фильтры ресторанов"
              onClick={() => document.querySelector('.catalog-filter')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M3 6h10M17 6h4M9 6a2 2 0 1 0 0 0ZM3 12h4M11 12h10M15 12a2 2 0 1 0 0 0ZM3 18h10M17 18h4M9 18a2 2 0 1 0 0 0Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div className="catalog-filter-row">
              <div className="catalog-filter">
                <label className="catalog-filter__label" htmlFor="catalog-city">Город</label>
                <div className="catalog-filter__select-wrap">
                  <select id="catalog-city" className="catalog-metro-select" value={selectedCity.id}
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
              <div className="catalog-filter">
                <label className="catalog-filter__label" htmlFor="catalog-venue-type">Тип заведения</label>
                <div className="catalog-filter__select-wrap">
                  <select
                    id="catalog-venue-type"
                    className="catalog-metro-select"
                    value={selectedVenueType}
                    onChange={(event) => setSelectedVenueType(event.target.value)}
                  >
                    <option value="">Все типы</option>
                    {venueTypeOptions.map((venueType) => (
                      <option key={venueType.id} value={venueType.id}>{venueType.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="catalog-filter">
                <div className="catalog-filter__label">Кухня</div>
                <div className="catalog-filter__control">
                  <CuisineFilter
                    cuisines={cuisineOptions}
                    selectedCuisines={selectedCuisines}
                    onChange={setSelectedCuisines}
                  />
                </div>
              </div>
              <div className="catalog-filter catalog-filter--metro">
                <div className="catalog-filter__label">Метро</div>
                <div className="catalog-filter__control">
                  <MetroFilter
                    metroData={cityMetroData}
                    selectedStationNames={selectedMetro}
                    onChange={setSelectedMetro}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>
      </section>

      {viewMode === 'map' ? (
        <Suspense fallback={<div className="catalog-map-fallback">Загружаем карту…</div>}>
          <CatalogMap
            restaurants={mapLoading ? [] : mapItems}
            focusPoints={selectedMetroPoints}
            center={selectedCity?.center ? [selectedCity.center.lat, selectedCity.center.lon] : undefined}
            zoom={selectedCity?.recommendedZoom}
            loading={mapLoading}
            error={mapError}
            totalResults={filteredItems.length}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            onOpenRestaurant={openMenu}
            onShowList={() => changeViewMode('list')}
          />
        </Suspense>
      ) : (
      <section className="catalog-results">
        {isInitialLoading && <div className="catalog-state">Загружаем рестораны…</div>}
        {error && <p className="err">Ошибка: {String(error.message || error)}</p>}
        {!loading && !visibleItems.length && !error && (
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

            const allDishes = extractDishes(r)
            const restaurantLinkUrl = normalizeRestaurantLinkUrl(r.instagramUrl)
            const dishesCount = typeof r?.dishesCount === 'number'
              ? r.dishesCount
              : allDishes.length
            const badgeText = getInitials(r?.name)
            return (
              <li key={`${r.slug || r.name}-${i}`} className="catalog-card" role="group" aria-label={r?.name ?? 'Ресторан'}>
                <div className="catalog-card__top">
                  <div className="catalog-card__identity">
                    <div className={`${getBadgeClassName(r?.name)} catalog-card__badge--tone-${i % 4}`} aria-hidden="true">{badgeText}</div>
                    <div className="catalog-card__copy">
                      <h3 className="catalog-card__title">
                        <ScrollingRestaurantName name={r.name} />
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
                    </div>
                  </div>
                  <div className="catalog-card__top-actions">
                    {restaurantLinkUrl && (
                      <a
                        href={restaurantLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Ссылка ресторана"
                        title="Ссылка ресторана"
                        className="catalog-card__icon-btn catalog-card__icon-btn--web"
                      >
                        <RestaurantWebIcon />
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
                    Блюда в меню: {dishesCount} {getRussianPluralWord(dishesCount, 'блюдо', 'блюда', 'блюд')}
                  </div>
                  <button type="button" className="btn btn--primary" onClick={() => openMenu(r.slug)}>Открыть меню</button>
                </div>
              </li>
            )
          })}
        </ul>

        {!isInitialLoading && displayItems.length > 0 && (
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
              Показано {shownFrom}–{shownTo} из {displayItems.length} {getRussianPluralWord(displayItems.length, 'ресторан', 'ресторана', 'ресторанов')}
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
      )}
    </div>
  )
}
