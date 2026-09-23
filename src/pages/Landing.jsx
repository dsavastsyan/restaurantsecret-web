import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import BotanicDecor from '@/components/BotanicDecor'
import CityMapBackground from '@/components/CityMapBackground'
import SearchInput from '@/components/SearchInput'
import { CookieSettingsModal } from '@/components/CookieSettingsModal'
import PublicAccountLink from '@/components/PublicAccountLink'
import TelegramFooterLink from '@/components/TelegramFooterLink'
import { getLandingStats, getRestaurants, postSuggest } from '@/lib/api'
import { toast } from '@/lib/toast'
import { useAuth } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import { openAnyEatLaunchModal } from '@/components/AnyEatLaunchModal'
import { useFavoritesStore } from '@/store/favorites'
import { analytics } from '@/services/analytics'
import { useMeta } from '@/lib/useMeta'
import { getSubscriptionCheckoutLink } from '@/lib/subscriptionCta'
import { api } from '@/api/client'
import { persistCityPreference, saveCatalogCity } from '@/lib/cityPreference'

const STATS_FALLBACK = {
  restaurants: 0,
  dishes: 0,
  points: 0,
  weeklyAdded: 0,
}
const FEATURED_RESTAURANTS_LIMIT = 12
const RestaurantMap = lazy(() => import('@/components/RestaurantMap'))

const POPULAR_QUERIES = ['бургер', 'боул с лососем', 'салат цезарь', 'стейк', 'паста']
const CITY_SLUGS = {
  'Москва': 'moskva',
  'Санкт-Петербург': 'sankt-peterburg',
  'Нижний Новгород': 'nizhniy-novgorod',
  'Екатеринбург': 'ekaterinburg',
  'Казань': 'kazan',
  'Ижевск': 'izhevsk',
}
const DEV_DETECTED_CITY = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('detected_city')?.trim() || null
  : null

const SAMPLE_DISHES = [
  {
    id: 2633,
    name: 'Салат с крабом, авокадо, яблоком и соусом гомадари',
    restaurant: 'Ikura',
    restaurantSlug: 'ikura',
    kcal: 390,
    p: 13,
    f: 29,
    c: 18,
    tag: 'КБЖУ на порцию',
  },
  {
    id: 7850,
    name: 'Римская пицца Капричоза',
    restaurant: 'IL Патио',
    restaurantSlug: 'il-patio',
    kcal: 865,
    p: 32,
    f: 40,
    c: 94,
    tag: 'КБЖУ на порцию',
  },
  {
    id: 9378,
    name: 'Печенье шоколадное',
    restaurant: 'ABC coffee roasters',
    restaurantSlug: 'abc-coffee-roasters',
    kcal: 398,
    p: 5,
    f: 23,
    c: 42,
    tag: 'КБЖУ на порцию',
  },
]

const VALUE_CARDS = [
  {
    title: 'До 40% точнее*',
    description: 'Чем усредненные калькуляторы калорий: данные от ресторанов.',
    footnote: '*Shonkoff et al., 2023, systematic review, 52 papers',
    icon: 'arc',
  },
  {
    title: '< 5 секунд',
    description: 'Время на поиск ресторана и подходящего блюда.',
    icon: 'stopwatch',
  },
  {
    title: 'Цели без компромиссов',
    description: 'Выбирайте меню под вашу норму по фильтрам в 2 клика.',
    icon: 'target',
  },
  {
    title: 'Всё в одном месте',
    description: 'Ставь цели, добавляй любимые блюда и места в избранное, веди дневник, делись с друзьями.',
    icon: 'stack',
  },
]

function getRussianPluralWord(value, one, few, many) {
  const abs = Math.abs(Number(value))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

function formatDishesLabel(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '— блюд'
  return `${amount.toLocaleString('ru-RU')} ${getRussianPluralWord(amount, 'блюдо', 'блюда', 'блюд')}`
}

export default function Landing() {
  useMeta({
    title: 'Меню ресторанов с КБЖУ',
    description: 'Меню ресторанов Москвы с удобными фильтрами по составу и КБЖУ блюд',
    canonical: 'https://restaurantsecret.ru/',
  })

  const navigate = useNavigate()
  const location = useLocation()
  const accessToken = useAuth((state) => state.accessToken)
  const { showAccountAction, isSubscriptionStatusLoaded } = useSubscriptionStore((state) => ({
    showAccountAction: state.hasActiveSub || state.hasSubscriptionHistory,
    isSubscriptionStatusLoaded: state.isStatusLoaded,
  }))
  const showTrialAction = !accessToken || (isSubscriptionStatusLoaded && !showAccountAction)
  const subscriptionCheckoutLink = getSubscriptionCheckoutLink(accessToken, location.pathname + location.search)
  const accessTokenOrUndefined = accessToken || undefined
  const isFavoriteDish = useFavoritesStore((state) => state.isFavorite)
  const toggleFavoriteDish = useFavoritesStore((state) => state.toggle)

  const themeMode = 'day'
  const [heroStats, setHeroStats] = useState({ restaurants: 0, dishes: 0, weeklyAdded: 0 })
  const [mapStats, setMapStats] = useState({ points: 0 })
  const [query, setQuery] = useState('')
  const [catalogCities, setCatalogCities] = useState([])
  const [selectedCatalogCity, setSelectedCatalogCity] = useState(() => localStorage.getItem('catalog_city') || 'Москва')
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const [suggestedCity, setSuggestedCity] = useState(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false)
  const [restaurant, setRestaurant] = useState('')
  const [dish, setDish] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [validationError, setValidationError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [featuredRestaurants, setFeaturedRestaurants] = useState([])
  const [totalRestaurantsCount, setTotalRestaurantsCount] = useState(0)
  const [openMapFullscreenSignal, setOpenMapFullscreenSignal] = useState(0)
  const [shouldLoadMap, setShouldLoadMap] = useState(false)
  const suggestZoneRef = useRef(null)
  const mapSectionRef = useRef(null)

  useEffect(() => {
    api.cities().then((response) => setCatalogCities(response.items || [])).catch(() => setCatalogCities([]))
  }, [])

  useEffect(() => {
    if (localStorage.getItem('catalog_city')) return
    if (DEV_DETECTED_CITY) {
      setSuggestedCity(DEV_DETECTED_CITY)
      return
    }
    api.detectedCity()
      .then((response) => {
        if (localStorage.getItem('catalog_city')) return
        const detectedCity = response?.city || null
        setSuggestedCity(detectedCity || 'Москва')
        if (detectedCity) {
          persistCityPreference(detectedCity, 'ip', accessToken).catch((error) => {
            console.error('Failed to persist detected city', error)
          })
        }
      })
      .catch(() => {
        if (!localStorage.getItem('catalog_city')) setSuggestedCity('Москва')
      })
  }, [accessToken])

  useEffect(() => {
    if (!cityPickerOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') setCityPickerOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cityPickerOpen])

  const resolvedStats = useMemo(() => ({
    restaurants: heroStats.restaurants > 0 ? heroStats.restaurants : STATS_FALLBACK.restaurants,
    dishes: heroStats.dishes > 0 ? heroStats.dishes : STATS_FALLBACK.dishes,
    points: mapStats.points > 0 ? mapStats.points : STATS_FALLBACK.points,
    weeklyAdded: heroStats.weeklyAdded > 0 ? heroStats.weeklyAdded : STATS_FALLBACK.weeklyAdded,
  }), [heroStats.dishes, heroStats.restaurants, heroStats.weeklyAdded, mapStats.points])

  const restaurantsLabel = resolvedStats.restaurants > 0
    ? resolvedStats.restaurants.toLocaleString('ru-RU')
    : '—'
  const dishesLabel = resolvedStats.dishes > 0
    ? resolvedStats.dishes.toLocaleString('ru-RU')
    : '—'
  const weeklyAddedLabel = `+${resolvedStats.weeklyAdded.toLocaleString('ru-RU')}`
  const pointsLabel = resolvedStats.points > 0
    ? resolvedStats.points.toLocaleString('ru-RU')
    : '—'
  const pointsWord = resolvedStats.points > 0
    ? getRussianPluralWord(resolvedStats.points, 'точка', 'точки', 'точек')
    : 'точек'
  const extraRestaurantsCount = Math.max(totalRestaurantsCount - featuredRestaurants.length, 0)
  const extraRestaurantsLabel = totalRestaurantsCount > 0
    ? `- и ещё ${extraRestaurantsCount.toLocaleString('ru-RU')} заведений города ${selectedCatalogCity} -`
    : `- и ещё — заведений города ${selectedCatalogCity} -`

  useEffect(() => {
    analytics.track('landing_open')
    analytics.trackLandingAttribution().catch(() => { })
  }, [])

  useEffect(() => {
    let cancelled = false

    setHeroStats({ restaurants: 0, dishes: 0, weeklyAdded: 0 })
    getLandingStats(selectedCatalogCity)
      .then((payload) => {
        if (cancelled) return
        setHeroStats({
          restaurants: Number(payload?.restaurants ?? 0),
          dishes: Number(payload?.dishes ?? 0),
          weeklyAdded: Number(payload?.weeklyAdded ?? 0),
        })
      })
      .catch((error) => {
        console.error('Failed to load landing stats', error)
      })

    return () => {
      cancelled = true
    }
  }, [selectedCatalogCity])

  useEffect(() => {
    let cancelled = false

    setFeaturedRestaurants([])
    setTotalRestaurantsCount(0)
    getRestaurants(2000, selectedCatalogCity)
      .then((payload) => {
        if (cancelled) return
        const items = Array.isArray(payload?.items) ? payload.items : []
        const normalized = items
          .map((item) => ({
            name: String(item?.name || '').trim(),
            slug: String(item?.slug || '').trim(),
            dishes: Number(item?.dishesCount ?? 0),
          }))
          .filter((item) => item.name.length > 0 && item.slug.length > 0 && Number.isFinite(item.dishes) && item.dishes > 0)

        const featured = normalized
          .slice()
          .sort((a, b) => b.dishes - a.dishes || a.name.localeCompare(b.name, 'ru'))
          .slice(0, FEATURED_RESTAURANTS_LIMIT)

        setFeaturedRestaurants(featured)
        setTotalRestaurantsCount(normalized.length)
      })
      .catch((error) => {
        console.error('Failed to load featured restaurants', error)
      })

    return () => {
      cancelled = true
    }
  }, [selectedCatalogCity])

  useEffect(() => {
    if (!suggestOpen) return

    function handleClickOutside(event) {
      if (!suggestZoneRef.current?.contains(event.target)) {
        setSuggestOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setSuggestOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [suggestOpen])

  useEffect(() => {
    if (shouldLoadMap) return undefined
    const section = mapSectionRef.current
    if (!section || !('IntersectionObserver' in window)) {
      const id = window.setTimeout(() => setShouldLoadMap(true), 3000)
      return () => window.clearTimeout(id)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setShouldLoadMap(true)
        observer.disconnect()
      },
      { rootMargin: '700px 0px' },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [shouldLoadMap])

  function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId)
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (sectionId === 'restaurants') {
      navigate('/restaurants')
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault()
    openCatalogSearch(query)
  }

  function openCatalogSearch(value) {
    const trimmed = value.trim()
    if (!trimmed) return
    analytics.track('search_submit', { type: 'query', selected_city: selectedCatalogCity, has_query: true })
    navigate(`/catalog/${CITY_SLUGS[selectedCatalogCity] || encodeURIComponent(selectedCatalogCity.toLowerCase())}/?q=${encodeURIComponent(trimmed)}`)
  }

  function handlePopularClick(value) {
    setQuery(value)
    analytics.track('search_submit', { type: 'query', query: value, source: 'landing_popular_chip' })
    navigate(`/catalog/${CITY_SLUGS[selectedCatalogCity] || encodeURIComponent(selectedCatalogCity.toLowerCase())}/?q=${encodeURIComponent(value)}`)
  }

  async function toggleDishLike(event, dishCard) {
    event.stopPropagation()
    if (!accessToken) {
      navigate('/login', { state: { from: location.pathname + location.search } })
      return
    }

    const isFavorite = isFavoriteDish(dishCard.id)
    analytics.track(isFavorite ? 'favorite_remove' : 'favorite_add', {
      type: 'dish',
      dish_id: dishCard.id,
      name: dishCard.name,
      restaurant: dishCard.restaurantSlug,
      source: 'landing_sample_card',
    })

    await toggleFavoriteDish(accessToken, dishCard.id, dishCard.restaurantSlug)
  }

  function addDishToDiary(event) {
    event.stopPropagation()
    openAnyEatLaunchModal()
  }

  async function handleSuggestSubmit(event) {
    event.preventDefault()
    const trimmedRestaurant = restaurant.trim()
    if (!trimmedRestaurant) {
      setValidationError('Укажите название ресторана')
      return
    }

    setValidationError('')
    setSubmitting(true)

    try {
      await postSuggest(
        {
          name: trimmedRestaurant,
          dish_name: dish.trim() || null,
          city: city.trim() || null,
          email: email.trim() || null,
        },
        accessTokenOrUndefined,
      )
      toast.success('Заявка отправлена')
      setRestaurant('')
      setDish('')
      setCity('')
      setEmail('')
      setSuggestOpen(false)
    } catch (error) {
      console.error('Failed to submit suggestion', error)
      toast.error('Не удалось отправить заявку. Попробуйте еще раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <main className={`landing-warm landing-warm--${themeMode}`} data-theme={themeMode}>
        <header className="landing-warm__nav">
          <div className="landing-warm__nav-left">
            <Link to="/" className="landing-warm__brand-link" aria-label="RestaurantSecret">
              <img src="/assets/logo-64.png" width="32" height="32" alt="" aria-hidden="true" className="landing-warm__logo" />
              <span className="landing-warm__brand">RestaurantSecret</span>
            </Link>
          </div>

          <nav className="landing-warm__nav-center" aria-label="Разделы">
            <Link to="/catalog/">Рестораны</Link>
            <Link to="/how-it-works">Как работает</Link>
            <Link to="/tariffs">Тарифы</Link>
            <a href="https://t.me/RestSecretSupport_bot" target="_blank" rel="noopener noreferrer">Поддержка</a>
          </nav>

          <div className="landing-warm__nav-right">
            {accessToken && showAccountAction ? (
              <PublicAccountLink className="landing-warm__nav-cta" />
            ) : (
              <>
                {!accessToken && (
                  <Link
                    to="/login"
                    state={{ from: location.pathname + location.search }}
                    className="landing-warm__login-link"
                  >
                    Войти
                  </Link>
                )}
                {showTrialAction && (
                  <Link
                    to={subscriptionCheckoutLink.to}
                    state={subscriptionCheckoutLink.state}
                    className="landing-warm__nav-cta"
                    onClick={() => analytics.track('cta_clicked', { location: 'nav', text: 'Попробовать бесплатно' })}
                  >
                    Попробовать бесплатно
                  </Link>
                )}
              </>
            )}
          </div>
        </header>

        <section className="landing-warm__hero landing-warm__hero--botanic" id="top" style={{ position: 'relative' }}>
          <CityMapBackground themeMode={themeMode} variant="botanic" />
          <BotanicDecor />
          <div className="landing-warm__city-picker landing-warm__city-picker--mobile">
            <button
              type="button"
              className="landing-warm__city-trigger"
              aria-haspopup="dialog"
              aria-expanded={cityPickerOpen}
              onClick={() => setCityPickerOpen(true)}
            >
              <span aria-hidden="true" className="landing-warm__city-pin">
                <svg viewBox="0 0 24 24" focusable="false"><path d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
              </span>
              <span className="landing-warm__city-mobile-label">Ваш город:</span>
              <strong>{selectedCatalogCity}</strong>
              <span aria-hidden="true" className="landing-warm__city-chevron">⌄</span>
            </button>
          </div>
          {suggestedCity && (
            <aside className="landing-warm__city-suggestion landing-warm__city-suggestion--mobile" aria-live="polite">
              <span>Ваш город — <strong>{suggestedCity}</strong>?</span>
              <span className="landing-warm__city-suggestion-actions">
                <button className="landing-warm__city-confirm" type="button" onClick={() => {
                  setSelectedCatalogCity(suggestedCity)
                  saveCatalogCity(suggestedCity, 'confirmed', accessToken)
                  setSuggestedCity(null)
                }}>Да, это мой город</button>
                <button type="button" onClick={() => {
                  setSuggestedCity(null)
                  setCityPickerOpen(true)
                }}>Сменить</button>
              </span>
            </aside>
          )}
          <h1 className="landing-warm__hero-title">
            Ешь вкусно,
            <br />
            выбирай <em className="landing-warm__hero-focus">осознанно</em>
          </h1>

          <p className="landing-warm__hero-subtitle">
            Все меню ресторанов с КБЖУ и составом блюд - выбирайте то, что подходит именно вам
          </p>

          <div className="landing-warm__search-shell">
            {suggestedCity && (
              <aside className="landing-warm__city-suggestion landing-warm__city-suggestion--desktop" aria-live="polite">
                <span>Ваш город — <strong>{suggestedCity}</strong>?</span>
                <span className="landing-warm__city-suggestion-actions">
                  <button className="landing-warm__city-confirm" type="button" onClick={() => {
                    setSelectedCatalogCity(suggestedCity)
                    saveCatalogCity(suggestedCity, 'confirmed', accessToken)
                    setSuggestedCity(null)
                  }}>Да, это мой город</button>
                  <button type="button" onClick={() => {
                    setSuggestedCity(null)
                    setCityPickerOpen(true)
                  }}>Сменить</button>
                </span>
              </aside>
            )}
            <div className="landing-warm__city-picker landing-warm__city-picker--desktop">
              <span className="landing-warm__city-caption">Ищем рестораны в</span>
              <button
                type="button"
                className="landing-warm__city-trigger"
                aria-haspopup="dialog"
                aria-expanded={cityPickerOpen}
                onClick={() => setCityPickerOpen(true)}
              >
                <span aria-hidden="true" className="landing-warm__city-pin">
                  <svg viewBox="0 0 24 24" focusable="false"><path d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
                </span>
                {selectedCatalogCity}
                <span aria-hidden="true" className="landing-warm__city-chevron">⌄</span>
              </button>
            </div>

            <form className="landing-warm__search" onSubmit={handleSearchSubmit}>
              <span className="landing-warm__search-icon" aria-hidden="true">
                <SearchIcon />
              </span>
              <SearchInput value={query} onChange={setQuery} onSubmit={openCatalogSearch} />
              <button type="submit" className="landing-warm__search-submit">Найти</button>
            </form>
          </div>

          {cityPickerOpen && (
            <div className="landing-warm__city-modal" role="presentation" onMouseDown={() => setCityPickerOpen(false)}>
              <section
                className="landing-warm__city-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="landing-city-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="landing-warm__city-sheet-handle" aria-hidden="true" />
                <div className="landing-warm__city-sheet-head">
                  <h2 id="landing-city-title">Выберите город</h2>
                  <button type="button" aria-label="Закрыть выбор города" onClick={() => setCityPickerOpen(false)}>×</button>
                </div>
                <div className="landing-warm__city-options">
                  {(catalogCities.length ? catalogCities : [{ id: 'Москва', name: 'Москва' }]).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedCatalogCity ? 'is-selected' : ''}
                      onClick={() => {
                        setSelectedCatalogCity(item.id)
                        saveCatalogCity(item.id, 'manual', accessToken)
                        setSuggestedCity(null)
                        setCityPickerOpen(false)
                      }}
                    >
                      <span>{item.name}</span>
                      {item.id === selectedCatalogCity && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          <div className="landing-warm__chips" aria-label="Популярные запросы">
            <span className="landing-warm__chips-label">Популярно:</span>
            {POPULAR_QUERIES.map((item) => (
              <button
                key={item}
                type="button"
                className="landing-warm__chip"
                onClick={() => handlePopularClick(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="landing-warm__stats">
            <Link
              to={`/catalog/${CITY_SLUGS[selectedCatalogCity] || encodeURIComponent(selectedCatalogCity.toLowerCase())}/`}
              className="landing-warm__stat"
              aria-label="Открыть список ресторанов"
            >
              <p>{restaurantsLabel}</p>
              <span>
                {getRussianPluralWord(
                  resolvedStats.restaurants,
                  'ресторан',
                  'ресторана',
                  'ресторанов',
                )}
              </span>
            </Link>
            <Link
              to={`/catalog/${CITY_SLUGS[selectedCatalogCity] || encodeURIComponent(selectedCatalogCity.toLowerCase())}/`}
              className="landing-warm__stat"
              aria-label="Открыть список ресторанов с блюдами КБЖУ"
            >
              <p>{dishesLabel}</p>
              <span>блюд с КБЖУ</span>
            </Link>
            <Link
              to={`/catalog/${CITY_SLUGS[selectedCatalogCity] || encodeURIComponent(selectedCatalogCity.toLowerCase())}/`}
              className="landing-warm__stat"
              aria-label="Открыть список ресторанов с новыми блюдами"
            >
              <p>{weeklyAddedLabel}</p>
              <span>за эту неделю</span>
            </Link>
          </div>

          <div className="landing-warm__hero-scroll" aria-hidden="true">
            <div className="landing-warm__hero-scroll-line" />
            <svg viewBox="0 0 14 14">
              <path d="M3 5 L7 9 L11 5" />
            </svg>
          </div>
        </section>

        <section className="landing-warm__dishes" aria-labelledby="dish-preview-title">
          <div className="landing-warm__section-head">
            <h2 id="dish-preview-title">
              Каждое блюдо <em>разобрано</em> до грамма
            </h2>
            <p>Фильтруйте по целям и выбирайте то, что подходит.</p>
          </div>

          <div className="landing-warm__dish-grid">
            {SAMPLE_DISHES.map((dishCard) => {
              const isLiked = isFavoriteDish(dishCard.id)
              return (
                <article
                  key={dishCard.id}
                  className="landing-warm__dish-card"
                  onClick={() => navigate(`/restaurants/${dishCard.restaurantSlug}/menu/`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigate(`/restaurants/${dishCard.restaurantSlug}/menu/`)
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <div className="landing-warm__dish-head">
                    <div>
                      <span>{dishCard.restaurant}</span>
                      <h3>{dishCard.name}</h3>
                    </div>
                    <strong>{dishCard.tag}</strong>
                  </div>

                  <div className="landing-warm__dish-kbzhu">
                    <KbzhuDonut p={dishCard.p} f={dishCard.f} c={dishCard.c} kcal={dishCard.kcal} />
                    <KbzhuBars p={dishCard.p} f={dishCard.f} c={dishCard.c} />
                  </div>

                  <div className="landing-warm__dish-actions">
                    <button
                      type="button"
                      className={`landing-warm__dish-like ${isLiked ? 'is-liked' : ''}`}
                      onClick={(event) => toggleDishLike(event, dishCard)}
                      aria-label={isLiked ? 'Убрать из избранного' : 'Добавить в избранное'}
                    >
                      <HeartIcon />
                    </button>
                    <button
                      type="button"
                      className="landing-warm__dish-diary"
                      onClick={(event) => addDishToDiary(event, dishCard)}
                    >
                      В дневник →
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="landing-warm__why" id="why">
          <div className="landing-warm__why-head">
            <h2>Рестораны не предавая <em>цели</em></h2>
          </div>
          <div className="landing-warm__why-grid">
            {VALUE_CARDS.map((item, index) => (
              <article
                key={item.title}
                className={`landing-warm__why-card ${index === 0 || index === 3 ? 'landing-warm__why-card--stagger' : ''}`}
              >
                <div className="landing-warm__why-mark" aria-hidden="true">
                  <WhyMark type={item.icon} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {item.footnote && (
                  <small className="landing-warm__why-footnote">{item.footnote}</small>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="landing-warm__featured" id="restaurants-list">
          <div className="landing-warm__featured-head">
            <h2>
              От камерных бистро до <em>звёздных</em> ресторанов
            </h2>
          </div>

          <div className="landing-warm__featured-columns">
            {featuredRestaurants.map((restaurantItem) => (
              <Link
                key={restaurantItem.slug}
                className="landing-warm__featured-row"
                to={`/restaurants/${restaurantItem.slug}/menu/`}
                aria-label={`Открыть меню ресторана ${restaurantItem.name}`}
              >
                <span>{restaurantItem.name}</span>
                <small>{formatDishesLabel(restaurantItem.dishes)}</small>
              </Link>
            ))}
          </div>

          <Link className="landing-warm__featured-caption" to={`/catalog/${CITY_SLUGS[selectedCatalogCity] || encodeURIComponent(selectedCatalogCity.toLowerCase())}/`}>
            {extraRestaurantsLabel}
          </Link>

          <div className="landing-warm__suggest" ref={suggestZoneRef}>
            <button
              type="button"
              className="landing-warm__suggest-trigger"
              onClick={() => setSuggestOpen((previous) => !previous)}
              aria-expanded={suggestOpen}
            >
              Не нашли нужный ресторан или блюдо?
            </button>
            {suggestOpen && (
              <div className="suggest-popover" role="dialog" aria-label="Форма заявки" aria-modal="false">
                <div className="suggest-popover__header">
                  <p className="suggest-popover__title">Расскажите, что нужно добавить</p>
                  <button type="button" className="suggest-popover__close" onClick={() => setSuggestOpen(false)} aria-label="Закрыть">
                    ×
                  </button>
                </div>
                <form className="suggest-popover__form" onSubmit={handleSuggestSubmit} noValidate>
                  <label className="suggest-popover__field">
                    <span>Ресторан *</span>
                    <input
                      type="text"
                      value={restaurant}
                      onChange={(event) => {
                        setRestaurant(event.target.value)
                        if (validationError) setValidationError('')
                      }}
                      placeholder="Например, Cafe Pushkin"
                      required
                      className={validationError ? 'is-invalid' : ''}
                    />
                  </label>

                  <label className="suggest-popover__field">
                    <span>Блюдо</span>
                    <input
                      type="text"
                      value={dish}
                      onChange={(event) => setDish(event.target.value)}
                      placeholder="Например, Том ям"
                    />
                  </label>

                  <label className="suggest-popover__field">
                    <span>Город</span>
                    <input type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Москва" />
                  </label>

                  <label className="suggest-popover__field">
                    <span>Email для обратной связи</span>
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" inputMode="email" />
                  </label>

                  {validationError && (
                    <p className="hint hint--error" role="status">
                      {validationError}
                    </p>
                  )}

                  <button className="btn btn--primary" type="submit" disabled={submitting}>
                    {submitting ? 'Отправляем...' : 'Отправить'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>

        <section className="landing-warm__map" id="map" ref={mapSectionRef}>
          <div className="landing-warm__map-frame">
            {shouldLoadMap ? (
              <Suspense fallback={<div className="landing-warm__map-placeholder" aria-hidden="true" />}>
                <RestaurantMap
                  themeMode={themeMode}
                  selectedCity={selectedCatalogCity}
                  showSummaryHeader={false}
                  openFullscreenSignal={openMapFullscreenSignal}
                  onStatsChange={(next) => {
                    setMapStats({ points: Number(next?.points ?? 0) })
                  }}
                />
              </Suspense>
            ) : (
              <div className="landing-warm__map-placeholder" aria-hidden="true" />
            )}

            <aside className="landing-warm__map-overlay">
              <h3>{pointsLabel} {pointsWord} на карте города {selectedCatalogCity}</h3>
              <p>Посмотрите ближайшие рестораны и их меню.</p>
              <button
                type="button"
                onClick={() => {
                  setShouldLoadMap(true)
                  setOpenMapFullscreenSignal(Date.now())
                }}
              >
                Открыть карту →
              </button>
            </aside>
          </div>
        </section>

        {showTrialAction && (
          <section className="landing-warm__cta">
            <h2>
              Попробуйте <em>бесплатно</em>.
            </h2>
            <p>Первые 7 дней - доступ ко всей базе ресторанов</p>
            <div className="landing-warm__cta-actions">
              <Link
                to={subscriptionCheckoutLink.to}
                state={subscriptionCheckoutLink.state}
                className="landing-warm__cta-primary"
                onClick={() => analytics.track('cta_clicked', { location: 'hero_bottom', text: 'Начать бесплатно' })}
              >
                Начать бесплатно
              </Link>
              <Link to="/catalog/" className="landing-warm__cta-secondary" onClick={() => analytics.track('cta_clicked', { location: 'hero_bottom', text: 'Посмотреть меню' })}>Посмотреть меню</Link>
            </div>
          </section>
        )}

        <footer className="landing-warm__footer">
          <div className="landing-warm__footer-links">
            <Link to="/legal">Пользовательское соглашение</Link>
            <Link to="/privacy">Политика конфиденциальности</Link>
            <Link to="/tariffs">Тарифы</Link>
            <Link to="/licenses">Лицензии</Link>
            <button type="button" onClick={() => setIsCookieModalOpen(true)}>Настройки cookies</button>
            <Link to="/support">Контакты и поддержка</Link>
            <Link to="/feedback">Оставить отзыв</Link>
            <TelegramFooterLink className="landing-warm__footer-social" />
          </div>

          <div className="landing-warm__footer-meta">
            <span>© 2026 RestaurantSecret</span>
            <span>•</span>
            <span>Самозанятое лицо (НПД), Савастьян Дарья, ИНН 771007750946</span>
          </div>
        </footer>
      </main>

      <CookieSettingsModal
        isOpen={isCookieModalOpen}
        onClose={() => setIsCookieModalOpen(false)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_SCHEMA) }}
      />
    </>
  )
}

const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'RestaurantSecret',
  url: 'https://restaurantsecret.ru',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://restaurantsecret.ru/search?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
}

function KbzhuDonut({ p, f, c, kcal }) {
  const size = 88
  const stroke = 10
  const total = Math.max(p + f + c, 1)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  const segments = [
    { fraction: p / total, color: 'var(--warm-p)' },
    { fraction: f / total, color: 'var(--warm-f)' },
    { fraction: c / total, color: 'var(--warm-c)' },
  ]

  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--warm-donut-track)"
        strokeWidth={stroke}
      />
      {segments.map((segment, index) => {
        const length = circumference * segment.fraction
        const arc = (
          <circle
            key={`${segment.color}-${index}`}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={stroke}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += length
        return arc
      })}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--warm-ink)"
        style={{ font: '700 16px Inter, ui-sans-serif, system-ui' }}
      >
        {kcal}
      </text>
      <text
        x="50%"
        y={cy + 14}
        textAnchor="middle"
        fill="var(--warm-ink-soft)"
        style={{ font: '600 9px Inter, ui-sans-serif, system-ui', letterSpacing: 0.4 }}
      >
        ККАЛ
      </text>
    </svg>
  )
}

function KbzhuBars({ p, f, c }) {
  const total = Math.max(p + f + c, 1)

  return (
    <div className="landing-warm__bars">
      <div className="landing-warm__bars-track">
        <div style={{ width: `${(p / total) * 100}%`, background: 'var(--warm-p)' }} />
        <div style={{ width: `${(f / total) * 100}%`, background: 'var(--warm-f)' }} />
        <div style={{ width: `${(c / total) * 100}%`, background: 'var(--warm-c)' }} />
      </div>
      <div className="landing-warm__bars-legend">
        <span><b style={{ color: 'var(--warm-p)' }}>●</b> Б {p}г</span>
        <span><b style={{ color: 'var(--warm-f)' }}>●</b> Ж {f}г</span>
        <span><b style={{ color: 'var(--warm-c)' }}>●</b> У {c}г</span>
      </div>
    </div>
  )
}

function WhyMark({ type }) {
  if (type === 'arc') {
    return (
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
        <circle cx="48" cy="48" r="38" stroke="var(--warm-rule-strong)" strokeWidth="2" strokeDasharray="2 4" />
        <circle
          cx="48"
          cy="48"
          r="38"
          stroke="var(--warm-warm)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="95 239"
          transform="rotate(-90 48 48)"
        />
        <circle cx="48" cy="48" r="3" fill="var(--warm-warm)" />
      </svg>
    )
  }

  if (type === 'stopwatch') {
    return (
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
        <circle cx="48" cy="52" r="34" stroke="var(--warm-warm)" strokeWidth="2" />
        <line x1="48" y1="18" x2="48" y2="12" stroke="var(--warm-warm)" strokeWidth="3" strokeLinecap="round" />
        <line x1="40" y1="10" x2="56" y2="10" stroke="var(--warm-warm)" strokeWidth="3" strokeLinecap="round" />
        <line x1="48" y1="52" x2="48" y2="30" stroke="var(--warm-bg-soft)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="48" y1="52" x2="62" y2="60" stroke="var(--warm-warm)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="48" cy="52" r="3" fill="var(--warm-warm)" />
        <line x1="48" y1="22" x2="48" y2="26" stroke="var(--warm-rule-strong)" strokeWidth="2" />
        <line x1="74" y1="52" x2="70" y2="52" stroke="var(--warm-rule-strong)" strokeWidth="2" />
        <line x1="48" y1="82" x2="48" y2="78" stroke="var(--warm-rule-strong)" strokeWidth="2" />
        <line x1="22" y1="52" x2="26" y2="52" stroke="var(--warm-rule-strong)" strokeWidth="2" />
      </svg>
    )
  }

  if (type === 'target') {
    return (
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
        <circle cx="48" cy="48" r="38" stroke="var(--warm-rule-strong)" strokeWidth="1.5" />
        <circle cx="48" cy="48" r="26" stroke="var(--warm-rule-strong)" strokeWidth="1.5" />
        <circle cx="48" cy="48" r="14" stroke="var(--warm-warm)" strokeWidth="2" />
        <circle cx="48" cy="48" r="4" fill="var(--warm-warm)" />
        <line x1="48" y1="4" x2="48" y2="16" stroke="var(--warm-rule-strong)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="48" y1="80" x2="48" y2="92" stroke="var(--warm-rule-strong)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="4" y1="48" x2="16" y2="48" stroke="var(--warm-rule-strong)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="80" y1="48" x2="92" y2="48" stroke="var(--warm-rule-strong)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <rect x="16" y="28" width="50" height="38" rx="6" stroke="var(--warm-rule-strong)" strokeWidth="1.5" />
      <rect x="26" y="38" width="50" height="38" rx="6" stroke="var(--warm-rule-strong)" strokeWidth="1.5" fill="var(--warm-ink)" />
      <rect x="36" y="48" width="50" height="38" rx="6" stroke="var(--warm-warm)" strokeWidth="2" fill="var(--warm-ink)" />
      <circle cx="61" cy="67" r="3" fill="var(--warm-warm)" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
