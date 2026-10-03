// Restaurant menu page with filters for macros and calories.
// Rendering lives in components/MenuRedesign/*; this module owns data loading,
// filtering and the mutation handlers those views call.
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiGet } from '@/lib/requests'
import { flattenMenuDishes, flattenMenuGroups } from '@/lib/nutrition'
import { formatDescription, matchesSearchQuery } from '@/lib/text'
import {
  buildIngredientOptions,
  dishMatchesIngredients,
  menuHasCompositions,
} from '@/lib/ingredients'
import { formatMenuCapturedAt } from '@/lib/dates'
import { parseCatalogNutritionCriteria } from '@/lib/catalogFilterParams'
import { getSubscriptionCheckoutLink } from '@/lib/subscriptionCta'
import { createDefaultMenuSort, sortMenuDishes } from '@/lib/menuSorting'
import { useAuth } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import { useDishCardStore } from '@/store/dishCard'
import { useFavoriteRestaurantsStore } from '@/store/favoriteRestaurants'
import { analytics } from '@/services/analytics'
import { toast } from '@/lib/toast'
import { useMeta } from '@/lib/useMeta'
import { hasQrMenuAccess } from '@/lib/qrMenuAccess'
import MenuRedesignView from '@/components/MenuRedesign/MenuRedesignView'

const createDefaultPresets = () => ({ highProtein: false, lowFat: false, lowKcal: false })
const createDefaultRange = () => ({
  kcal: { min: '', max: '' },
  protein: { min: '', max: '' },
  fat: { min: '', max: '' },
  carbs: { min: '', max: '' }
})
// Excluding is the common case ("покажи всё без грибов"), so it is the default
// mode; 'include' flips the filter into "только с этим ингредиентом".
const createDefaultIngredientFilter = () => ({ mode: 'exclude', selected: [] })

const CATALOG_TO_MENU_PRESETS = [
  { key: 'lowKcal', field: 'calories', bound: 'max', value: 400 },
  { key: 'highProtein', field: 'protein', bound: 'min', value: 25 },
  { key: 'lowFat', field: 'fat', bound: 'max', value: 10 },
]

const createMenuFiltersFromCatalog = (searchParams) => {
  const criteria = parseCatalogNutritionCriteria(searchParams)
  const presets = createDefaultPresets()
  const range = {
    kcal: { ...criteria.calories },
    protein: { ...criteria.protein },
    fat: { ...criteria.fat },
    carbs: { ...criteria.carbs },
  }

  CATALOG_TO_MENU_PRESETS.forEach(({ key, field, bound, value }) => {
    const current = criteria[field] || {}
    const oppositeBound = bound === 'min' ? 'max' : 'min'
    if (current[oppositeBound] === '' && String(current[bound] ?? '') === String(value)) {
      presets[key] = true
      const menuField = field === 'calories' ? 'kcal' : field
      range[menuField] = { min: '', max: '' }
    }
  })

  return { presets, range }
}

// Russian numeral agreement: 1 блюдо / 2-4 блюда / 5+ блюд (11-14 always
// take the "many" form regardless of the last digit, hence the % 100 check).
const pluralizeRu = (n, [one, few, many]) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const formatRetryAfter = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60)
    return `${minutes} ${pluralizeRu(minutes, ['минуту', 'минуты', 'минут'])}`
  }
  return `${seconds} ${pluralizeRu(seconds, ['секунду', 'секунды', 'секунд'])}`
}

// Maps a load failure to the message a visitor should actually see. The API
// distinguishes real anti-bot gates (rate-limited/temporarily blocked, or an
// unsolved Turnstile challenge) from generic network errors via `err.code`
// (set in `@/lib/requests`) — before this, every one of these looked like a
// plain "site is broken" error (incident 2026-09-29).
const buildMenuError = (err) => {
  if (err?.code === 'temporarily_blocked' || err?.code === 'rate_limited') {
    const retryAfter = formatRetryAfter(Number(err?.body?.retry_after))
    return {
      kind: 'blocked',
      message: retryAfter
        ? `Слишком много запросов подряд — это защита от ботов, не ошибка сайта. Попробуйте снова примерно через ${retryAfter}.`
        : 'Слишком много запросов подряд — это защита от ботов, не ошибка сайта. Подождите немного и обновите страницу.',
    }
  }
  if (err?.code === 'captcha_cancelled' || err?.code === 'captcha_error' || err?.code === 'captcha_required') {
    return {
      kind: 'blocked',
      message: 'Не удалось подтвердить, что вы не робот. Обновите страницу, чтобы попробовать снова.',
    }
  }
  return {
    kind: 'network',
    message: 'Не удалось загрузить меню. Попробуйте обновить страницу позже.',
  }
}

// Reads the {name, dishCount} the prerender embedded in the static page
// (see generate-sitemap.js's `seoHint`) so the very first paint — before our
// own fetch below resolves — already shows the real name/count instead of a
// blank loading state. Only present on a real page load of this exact
// restaurant's static file, never on SPA client-side navigation, so there is
// no risk of it going stale or matching the wrong restaurant.
const readSeoHint = () => {
  if (typeof document === 'undefined') return null
  try {
    const el = document.getElementById('rs-seo-hint')
    if (!el) return null
    const parsed = JSON.parse(el.textContent)
    if (!parsed || typeof parsed.name !== 'string') return null
    return parsed
  } catch (_) {
    return null
  }
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

export default function Menu({
  previewMenu = null,
  previewRestaurantSlug = '',
  previewMode = false,
}) {
  const { slug: routeSlug } = useParams()
  const slug = previewRestaurantSlug || routeSlug
  const [routeSearchParams] = useSearchParams()
  const routeFilterKey = routeSearchParams.toString()
  const initialMenuFilters = useMemo(
    () => createMenuFiltersFromCatalog(routeSearchParams),
    [routeFilterKey],
  )
  const city = routeSearchParams.get('city') || 'Москва'
  const navigate = useNavigate()
  const accessToken = useAuth((state) => state.accessToken)
  const { hasActiveSub, fetchStatus } = useSubscriptionStore((state) => ({
    hasActiveSub: state.hasActiveSub,
    fetchStatus: state.fetchStatus,
  }))
  const open = useDishCardStore((state) => state.open)
  const openPreview = useDishCardStore((state) => state.openPreview)
  const {
    isFavoriteRestaurant,
    toggleFavoriteRestaurant,
    loadFavoriteRestaurants,
  } = useFavoriteRestaurantsStore((state) => ({
    isFavoriteRestaurant: state.isFavorite(slug),
    toggleFavoriteRestaurant: state.toggle,
    loadFavoriteRestaurants: state.load,
  }))

  const [menu, setMenu] = useState(() => previewMode ? normalizeMenu(previewMenu) : null)
  const [seoHint] = useState(() => (previewMode ? null : readSeoHint()))
  const [loading, setLoading] = useState(!previewMode)
  const [error, setError] = useState(null)
  const [isOutdatedOpen, setIsOutdatedOpen] = useState(false)
  const [restaurantPoint, setRestaurantPoint] = useState(null)

  const [query, setQuery] = useState('')
  const [selectedSection, setSelectedSection] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [presets, setPresets] = useState(() => initialMenuFilters.presets)
  const [range, setRange] = useState(() => initialMenuFilters.range)
  const [allCategoriesExpanded, setAllCategoriesExpanded] = useState(false)
  const [isIngredientFilterOpen, setIsIngredientFilterOpen] = useState(false)
  const [ingredientFilter, setIngredientFilter] = useState(createDefaultIngredientFilter)
  const [menuSort, setMenuSort] = useState(createDefaultMenuSort)
  const [categorySorts, setCategorySorts] = useState({})

  // Reset menu-local filters when the restaurant or incoming catalog filters change.
  useEffect(() => {
    setQuery('')
    setSelectedSection('all')
    setSelectedCategory('all')
    setIsAdvancedFiltersOpen(false)
    setAllCategoriesExpanded(false)
    setIsIngredientFilterOpen(false)
    setIngredientFilter(createDefaultIngredientFilter())
    setMenuSort(createDefaultMenuSort())
    setCategorySorts({})
    const nextMenuFilters = createMenuFiltersFromCatalog(routeSearchParams)
    setPresets(nextMenuFilters.presets)
    setRange(nextMenuFilters.range)
  }, [city, routeFilterKey, slug])

  // Fetch the menu.
  useEffect(() => {
    if (previewMode) {
      setMenu(normalizeMenu(previewMenu))
      setLoading(false)
      setError(null)
      return undefined
    }

    let aborted = false

      ; (async () => {
        try {
          await fetchStatus(accessToken)
          setLoading(true)
          setError(null)
          const raw = await apiGet(
            `/restaurants/${slug}/menu?city=${encodeURIComponent(city)}`,
            accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
          )
          const data = raw?.categories ? raw : { ...(raw || {}), name: raw?.name || slug, categories: [] }
          if (!aborted) {
            const normalizedMenu = normalizeMenu(data)
            setMenu(normalizedMenu)
            analytics.track('restaurant_menu_open', { slug, name: normalizedMenu.name || slug })
            analytics.reachGoal('restaurant_view');
          }
        } catch (err) {
          if (!aborted) {
            if (err?.status === 404 && err?.body?.isChainBase && err.body.hubPath) {
              // # This restaurant slug used to be a real address; it's now
              // # the bare URL for the whole chain instead — send the
              // # visitor to the hub rather than showing a load error.
              navigate(err.body.hubPath, { replace: true })
              return
            }
            console.error('Failed to load menu', err)
            setError(buildMenuError(err))
          }
        } finally {
          if (!aborted) setLoading(false)
        }
      })()

    return () => {
      aborted = true
    }
  }, [accessToken, city, fetchStatus, previewMenu, previewMode, slug])

  useEffect(() => {
    if (!previewMode && accessToken) {
      loadFavoriteRestaurants(accessToken)
    }
  }, [accessToken, loadFavoriteRestaurants, previewMode])

  useEffect(() => {
    let aborted = false
    setRestaurantPoint(null)

    ; (async () => {
      try {
        const mapData = await apiGet(`/restaurants/map?city=${encodeURIComponent(city)}`)
        if (aborted) return
        const targetSlug = String(slug || '').trim().toLowerCase()
        const points = Array.isArray(mapData?.items) ? mapData.items : []
        const found = points.find((item) => String(item?.slug || '').trim().toLowerCase() === targetSlug)
        const lat = Number(found?.lat)
        const lon = Number(found?.lon)
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setRestaurantPoint({ lat, lon })
        }
      } catch (coordsError) {
        if (!aborted) console.error('Failed to load restaurant coordinates', coordsError)
      }
    })()

    return () => {
      aborted = true
    }
  }, [city, slug])

  const dishes = useMemo(() => flattenMenuDishes(menu), [menu])
  const menuGroups = useMemo(() => flattenMenuGroups(menu), [menu])
  const sectionOptions = useMemo(() => {
    const categories = Array.isArray(menu?.categories) ? menu.categories : []
    if (!categories.length || categories.some((category) => !['food', 'drinks'].includes(category?.menuSection))) {
      return []
    }
    return ['food', 'drinks'].filter((section) => categories.some((category) => category.menuSection === section))
  }, [menu?.categories])

  useEffect(() => {
    const nextSection = sectionOptions.includes('food') ? 'food' : sectionOptions[0] || 'all'
    setSelectedSection(nextSection)
    setSelectedCategory('all')
    setAllCategoriesExpanded(false)
  }, [sectionOptions])

  const handleSectionChange = (section) => {
    setSelectedSection(section)
    setSelectedCategory('all')
    setAllCategoriesExpanded(false)
  }
  const freeDishKeys = useMemo(() => {
    const isQrAccess = !previewMode && hasQrMenuAccess(slug)
    const visibleGroups = (previewMode || isQrAccess) ? menuGroups : menuGroups.slice(0, 3)
    return new Set(visibleGroups.map((group) => buildDishAccessKey(group)))
  }, [menuGroups, previewMode, slug])
  const capturedAt = useMemo(() => formatMenuCapturedAt(menu?.menuCapturedAt), [menu?.menuCapturedAt])

  // Apply search and macro filters to atomic variants, then keep only the
  // matching variants inside each visible base item. This prevents a filtered
  // result from re-opening all hidden milk/size combinations.
  const filtered = useMemo(() => {
    const q = query.trim()
    return menuGroups.flatMap((group) => {
      if (selectedSection !== 'all' && group.menuSection !== selectedSection) return []
      const categoryName = formatDescription(group.category, '') || 'Без категории'
      if (selectedCategory !== 'all' && categoryName !== selectedCategory) return []
      const variants = Array.isArray(group.variants) && group.variants.length ? group.variants : [group]
      const groupNameMatches = q && matchesSearchQuery(group.name, q)
      const matchingVariants = variants.filter((dish) => {
        const searchableComposition = formatDescription(dish.ingredients ?? dish.description, '')
        if (q && !groupNameMatches && !matchesSearchQuery(dish.name, q) && !matchesSearchQuery(searchableComposition, q)) return false
        if (presets.highProtein && !(dish.protein >= 25)) return false
        if (presets.lowFat && !(dish.fat <= 10)) return false
        if (presets.lowKcal && !(dish.kcal <= 400)) return false
        if (!inRange(dish.kcal, range.kcal.min, range.kcal.max)) return false
        if (!inRange(dish.protein, range.protein.min, range.protein.max)) return false
        if (!inRange(dish.fat, range.fat.min, range.fat.max)) return false
        if (!inRange(dish.carbs, range.carbs.min, range.carbs.max)) return false
        if (!dishMatchesIngredients(dish, ingredientFilter.selected, ingredientFilter.mode)) return false
        return true
      })
      if (!matchingVariants.length) return []
      return [{ ...group, variants: matchingVariants, variantCount: matchingVariants.length, ...matchingVariants[0], name: group.name }]
    })
  }, [menuGroups, query, selectedSection, selectedCategory, presets, range, ingredientFilter])

  const hasRestrictedMenuFilters = useMemo(() => {
    const hasCustomRange = Object.values(range).some((bounds) => bounds.min !== '' || bounds.max !== '')
    return Boolean(
      query.trim()
      || selectedCategory !== 'all'
      || Object.values(presets).some(Boolean)
      || hasCustomRange
      || ingredientFilter.selected.length,
    )
  }, [ingredientFilter.selected.length, presets, query, range, selectedCategory])
  const hasFullDishAccess = previewMode || hasActiveSub || hasQrMenuAccess(slug)
  const isFilteredResultsLocked = hasRestrictedMenuFilters && !hasFullDishAccess

  // The ingredient control only makes sense when the restaurant actually filled
  // compositions in — many menus have none, and an empty picker is worse than
  // no picker, so the whole disclosure is hidden in that case.
  const hasCompositions = useMemo(() => menuHasCompositions(dishes), [dishes])
  const ingredientOptions = useMemo(() => buildIngredientOptions(dishes), [dishes])

  const toggleIngredient = (value) => {
    setIngredientFilter((prev) => ({
      ...prev,
      selected: prev.selected.includes(value)
        ? prev.selected.filter((item) => item !== value)
        : [...prev.selected, value],
    }))
  }

  const setIngredientMode = (mode) => {
    setIngredientFilter((prev) => ({ ...prev, mode }))
  }

  const clearIngredients = () => {
    setIngredientFilter(createDefaultIngredientFilter())
  }

  const categoryOptions = useMemo(() => {
    const source = Array.isArray(menu?.categories) ? menu.categories : []
    const names = source
      .filter((category) => selectedSection === 'all' || category?.menuSection === selectedSection)
      .map((category) => formatDescription(category?.name, '') || 'Без категории')
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [menu?.categories, selectedSection])

  const groupedDishes = useMemo(() => {
    if (!menu?.categories?.length) {
      return filtered.length ? [{ name: 'Меню', dishes: filtered }] : []
    }

    const ordered = menu.categories.map((category) => ({
      name: formatDescription(category?.name, '') || 'Без категории',
      dishes: [],
    }))
    const lookup = new Map(ordered.map((item) => [item.name, item]))
    const known = new Set(lookup.keys())

    for (const dish of filtered) {
      const categoryName = formatDescription(dish.category, '')
      const bucketName = categoryName && known.has(categoryName) ? categoryName : null
      if (bucketName) {
        lookup.get(bucketName)?.dishes.push(dish)
      }
    }

    const leftovers = filtered.filter((dish) => {
      const categoryName = formatDescription(dish.category, '')
      return !categoryName || !known.has(categoryName)
    })
    if (leftovers.length) {
      ordered.push({ name: 'Другое', dishes: leftovers })
    }

    return ordered.filter((section) => section.dishes.length)
  }, [filtered, menu?.categories])
  const handleSortChange = (scope, categoryName, nextSort) => {
    if (scope === 'menu') {
      setMenuSort(nextSort)
      setCategorySorts({})
      return
    }
    setCategorySorts((previous) => ({ ...previous, [categoryName]: nextSort }))
  }

  const handleSortReset = (scope, categoryName) => {
    if (scope === 'menu') {
      setMenuSort(createDefaultMenuSort())
      setCategorySorts({})
      return
    }
    setCategorySorts((previous) => {
      const next = { ...previous }
      delete next[categoryName]
      return next
    })
  }

  const resetSorting = () => {
    setMenuSort(createDefaultMenuSort())
    setCategorySorts({})
  }

  // Sort within each category so the curated category order remains intact.
  // A category-level choice overrides the global sort only for that category.
  const groupedDishesSorted = useMemo(
    () => groupedDishes.map((section) => ({
      ...section,
      dishes: sortMenuDishes(section.dishes, categorySorts[section.name] || menuSort),
    })),
    [categorySorts, groupedDishes, menuSort]
  )
  const restaurantLinkUrl = useMemo(() => normalizeRestaurantLinkUrl(menu?.instagramUrl), [menu?.instagramUrl])
  // A slug ("horoshaya-devochka-nan") must never stand in for a real name —
  // fall back to a generic word instead of leaking the URL to the reader.
  const isSlugLike = (value) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(value)
  // Before the live fetch resolves, fall back to the count/name the
  // prerender already embedded (readSeoHint above) instead of showing 0/
  // generic placeholders — both come from the same source once `menu` loads.
  const rawSeoName = menu?.name?.trim() || seoHint?.name
  const seoRestaurantName =
    rawSeoName && !isSlugLike(rawSeoName)
      ? rawSeoName.charAt(0).toUpperCase() + rawSeoName.slice(1)
      : 'ресторана'
  const seoDishCount = menu ? menuGroups.length : (seoHint?.dishCount ?? menuGroups.length)
  const seoDishWord = pluralizeRu(seoDishCount, ['позиция', 'позиции', 'позиций'])
  const seoDescription = useMemo(
    () => `${seoDishCount} ${seoDishWord} с полным КБЖУ. Постоянное обновление. Быстрые фильтры. Много белков. Мало жиров. Лучшая калорийность. Сравнивайте блюда ${seoRestaurantName} перед посещением ресторана.`,
    [seoDishCount, seoDishWord, seoRestaurantName]
  )
  const mapOpenUrl = useMemo(() => {
    if (restaurantPoint) {
      const { lat, lon } = restaurantPoint
      return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
    }
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${seoRestaurantName} ресторан`)}`
  }, [restaurantPoint, seoRestaurantName])
  const mobileMapOpenUrl = restaurantLinkUrl || mapOpenUrl

  // A branch of a chain with a resolvable hub (menu.chainHubPath, set by the
  // API — see restaurants.js) canonicalizes to that hub instead of itself:
  // branch menus overlap heavily with their siblings, so this tells Google to
  // consolidate ranking signal on the hub rather than treat every branch as a
  // distinct, competing near-duplicate. The page still renders normally.
  const canonicalPath = menu?.chainHubPath || `/restaurants/${slug}/menu/`

  useMeta({
    title: previewMode
      ? `Превью меню ${seoRestaurantName} — не опубликовано`
      : `Меню ${seoRestaurantName} с полным КБЖУ — калории, белки, жиры, углеводы`,
    description: seoDescription,
    canonical: previewMode ? undefined : `https://restaurantsecret.ru${canonicalPath}`,
    robots: !previewMode && menu?.chainHubPath ? 'noindex, follow' : undefined,
  })

  // Toggle a preset chip and re-run memoized filtering.
  const togglePreset = (key) => {
    setPresets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const updateRange = (macro, edge, value) => {
    const clean = value.replace(/[^\d]/g, '')
    setRange((prev) => ({
      ...prev,
      [macro]: {
        ...prev[macro],
        [edge]: clean,
      },
    }))
  }

  // Reset search, presets and custom ranges in one click.
  const resetFilters = () => {
    setQuery('')
    setSelectedCategory('all')
    setPresets(createDefaultPresets())
    setRange(createDefaultRange())
    setIngredientFilter(createDefaultIngredientFilter())
    resetSorting()
  }

  const openMapInBrowser = () => {
    window.open(mapOpenUrl, '_blank', 'noopener,noreferrer')
  }

  const openMobileMapInBrowser = () => {
    window.open(mobileMapOpenUrl, '_blank', 'noopener,noreferrer')
  }

  const handleShare = async () => {
    const pageUrl = window.location.href
    const isMobileViewport = window.matchMedia('(max-width: 768px)').matches

    if (isMobileViewport && navigator.share) {
      try {
        await navigator.share({
          title: menu?.name || 'Меню ресторана',
          url: pageUrl,
        })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(pageUrl)
      if (!isMobileViewport) {
        toast.success('Ссылка скопирована', { duration: 2200 })
      }
    } catch (_) {
      // Ignore clipboard API failures in unsupported environments.
    }
  }

  const handleToggleRestaurantFavorite = async () => {
    if (previewMode) return
    if (!slug) return
    if (!accessToken) {
      navigate('/login', { state: { from: window.location.pathname + window.location.search } })
      return
    }
    if (!isFavoriteRestaurant) {
      analytics.track('favorite_add', { type: 'restaurant', slug, name: menu?.name || slug })
    } else {
      analytics.track('favorite_remove', { type: 'restaurant', slug, name: menu?.name || slug })
    }
    await toggleFavoriteRestaurant(accessToken, slug)
  }

  const handleViewFilteredDishes = () => {
    const returnTo = window.location.pathname + window.location.search
    const checkoutLink = getSubscriptionCheckoutLink(accessToken, returnTo)
    navigate(checkoutLink.to, { state: checkoutLink.state })
  }

  const handleSortAttempt = () => {
    handleViewFilteredDishes()
  }

  return (
    <MenuRedesignView
      seoRestaurantName={seoRestaurantName}
      heroDishCount={seoDishCount}
      dishes={dishes}
      filtered={filtered}
      groupedDishes={groupedDishesSorted}
      filteredDishCount={filtered.length}
      isFilteredResultsLocked={isFilteredResultsLocked}
      onViewFilteredDishes={handleViewFilteredDishes}
      capturedAt={capturedAt}
      freeDishKeys={freeDishKeys}
      slug={slug}
      loading={loading}
      error={error}
      menu={menu}
      query={query}
      setQuery={setQuery}
      selectedSection={selectedSection}
      setSelectedSection={handleSectionChange}
      sectionOptions={sectionOptions}
      selectedCategory={selectedCategory}
      setSelectedCategory={setSelectedCategory}
      categoryOptions={categoryOptions}
      allCategoriesExpanded={allCategoriesExpanded}
      setAllCategoriesExpanded={setAllCategoriesExpanded}
      presets={presets}
      togglePreset={togglePreset}
      isAdvancedFiltersOpen={isAdvancedFiltersOpen}
      setIsAdvancedFiltersOpen={setIsAdvancedFiltersOpen}
      range={range}
      updateRange={updateRange}
      resetFilters={resetFilters}
      menuSort={menuSort}
      categorySorts={categorySorts}
      onSortChange={handleSortChange}
      onSortReset={handleSortReset}
      onSortAttempt={handleSortAttempt}
      canSort={hasFullDishAccess}
      isIngredientFilterOpen={isIngredientFilterOpen}
      setIsIngredientFilterOpen={setIsIngredientFilterOpen}
      hasCompositions={hasCompositions}
      ingredientOptions={ingredientOptions}
      ingredientFilter={ingredientFilter}
      toggleIngredient={toggleIngredient}
      setIngredientMode={setIngredientMode}
      clearIngredients={clearIngredients}
      isFavoriteRestaurant={isFavoriteRestaurant}
      handleToggleRestaurantFavorite={handleToggleRestaurantFavorite}
      handleShare={handleShare}
      openMapInBrowser={openMapInBrowser}
      openMobileMapInBrowser={openMobileMapInBrowser}
      isOutdatedOpen={isOutdatedOpen}
      setIsOutdatedOpen={setIsOutdatedOpen}
      openDishCard={open}
      openPreviewDishCard={openPreview}
      readOnly={previewMode}
    />
  )
}


// Preserve nullish menus but ensure we always return an object.
function normalizeMenu(raw) {
  return raw || {}
}

// Inclusive range check that treats empty fields as unbounded.
function inRange(value, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return min === '' && max === ''
  }
  const lower = min === '' ? -Infinity : Number(min)
  const upper = max === '' ? Infinity : Number(max)
  return numeric >= lower && numeric <= upper
}

function buildDishAccessKey(dish) {
  if (dish?.id != null && dish?.id !== '') return `id:${dish.id}`
  return `name:${String(dish?.name || '').trim().toLowerCase()}`
}
