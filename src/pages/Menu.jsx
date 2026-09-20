// Restaurant menu page with filters for macros and calories.
// Rendering lives in components/MenuRedesign/*; this module owns data loading,
// filtering and the mutation handlers those views call.
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiGet } from '@/lib/requests'
import { flattenMenuDishes } from '@/lib/nutrition'
import { formatDescription, matchesSearchQuery } from '@/lib/text'
import {
  buildIngredientOptions,
  dishMatchesIngredients,
  menuHasCompositions,
} from '@/lib/ingredients'
import { formatMenuCapturedAt } from '@/lib/dates'
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
  const city = routeSearchParams.get('city') || 'Москва'
  const navigate = useNavigate()
  const accessToken = useAuth((state) => state.accessToken)
  const { fetchStatus } = useSubscriptionStore((state) => ({
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
  const [loading, setLoading] = useState(!previewMode)
  const [error, setError] = useState('')
  const [isOutdatedOpen, setIsOutdatedOpen] = useState(false)
  const [restaurantPoint, setRestaurantPoint] = useState(null)

  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [presets, setPresets] = useState(createDefaultPresets)
  const [range, setRange] = useState(createDefaultRange)
  const [allCategoriesExpanded, setAllCategoriesExpanded] = useState(false)
  const [isIngredientFilterOpen, setIsIngredientFilterOpen] = useState(false)
  const [ingredientFilter, setIngredientFilter] = useState(createDefaultIngredientFilter)

  // Reset filters whenever the restaurant slug changes.
  useEffect(() => {
    setQuery('')
    setSelectedCategory('all')
    setIsAdvancedFiltersOpen(false)
    setPresets(createDefaultPresets())
    setRange(createDefaultRange())
    setAllCategoriesExpanded(false)
    setIsIngredientFilterOpen(false)
    setIngredientFilter(createDefaultIngredientFilter())
  }, [city, slug])

  // Fetch the menu.
  useEffect(() => {
    if (previewMode) {
      setMenu(normalizeMenu(previewMenu))
      setLoading(false)
      setError('')
      return undefined
    }

    let aborted = false

      ; (async () => {
        try {
          await fetchStatus(accessToken)
          setLoading(true)
          setError('')
          const raw = await apiGet(
            `/restaurants/${slug}/menu?city=${encodeURIComponent(city)}`,
            accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
          )
          const data = raw?.categories ? raw : { ...(raw || {}), name: raw?.name || slug, categories: [] }
          if (!aborted) {
            const normalizedMenu = normalizeMenu(data)
            setMenu(normalizedMenu)
            analytics.track('restaurant_menu_open', { slug, name: normalizedMenu.name || slug })
            try { ym(108992733, 'reachGoal', 'restaurant_view'); } catch { /* ym not loaded */ }
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
            setError('Не удалось загрузить меню. Попробуйте обновить страницу позже.')
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
  const freeDishKeys = useMemo(() => {
    const isQrAccess = !previewMode && hasQrMenuAccess(slug)
    const visibleDishes = (previewMode || isQrAccess) ? dishes : dishes.slice(0, 3)
    return new Set(visibleDishes.map((dish) => buildDishAccessKey(dish)))
  }, [dishes, previewMode, slug])
  const capturedAt = useMemo(() => formatMenuCapturedAt(menu?.menuCapturedAt), [menu?.menuCapturedAt])

  // Apply search and macro filters locally to keep the UI responsive.
  const filtered = useMemo(() => {
    const q = query.trim()
    return dishes.filter((dish) => {
      const categoryName = formatDescription(dish.category, '') || 'Без категории'
      if (selectedCategory !== 'all' && categoryName !== selectedCategory) return false
      const searchableComposition = formatDescription(dish.ingredients ?? dish.description, '')
      if (q && !matchesSearchQuery(dish.name, q) && !matchesSearchQuery(searchableComposition, q)) return false
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
  }, [dishes, query, selectedCategory, presets, range, ingredientFilter])

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
      .map((category) => formatDescription(category?.name, '') || 'Без категории')
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [menu?.categories])

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
  // Within each category, dishes with a photo come first (stable sort), so the
  // grid never mixes photo and photo-less cards into a ragged rhythm. Only the
  // partner draft preview supplies photos today; the public menu API does not.
  const groupedDishesSorted = useMemo(
    () => groupedDishes.map((section) => ({
      ...section,
      dishes: [...section.dishes].sort((a, b) => {
        const aHasPhoto = a.photoUrl || a.photo_url ? 1 : 0
        const bHasPhoto = b.photoUrl || b.photo_url ? 1 : 0
        return bHasPhoto - aHasPhoto
      }),
    })),
    [groupedDishes]
  )
  const restaurantLinkUrl = useMemo(() => normalizeRestaurantLinkUrl(menu?.instagramUrl), [menu?.instagramUrl])
  const seoRestaurantName = menu?.name || slug || 'ресторана'
  const seoDescription = useMemo(
    () => `Меню ${seoRestaurantName} с КБЖУ: калории, белки, жиры и углеводы блюд ресторана. Сравнивайте блюда ${seoRestaurantName} по калорийности и макронутриентам перед посещением ресторана.`,
    [seoRestaurantName]
  )
  const mapOpenUrl = useMemo(() => {
    if (restaurantPoint) {
      const { lat, lon } = restaurantPoint
      return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
    }
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${menu?.name || slug} ресторан`)}`
  }, [menu?.name, restaurantPoint, slug])
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
      : `Меню ${seoRestaurantName} с КБЖУ — калории, белки, жиры, углеводы`,
    description: seoDescription,
    canonical: previewMode ? undefined : `https://restaurantsecret.ru${canonicalPath}`,
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

  return (
    <MenuRedesignView
      seoRestaurantName={seoRestaurantName}
      dishes={dishes}
      filtered={filtered}
      groupedDishes={groupedDishesSorted}
      capturedAt={capturedAt}
      freeDishKeys={freeDishKeys}
      slug={slug}
      loading={loading}
      error={error}
      menu={menu}
      query={query}
      setQuery={setQuery}
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
