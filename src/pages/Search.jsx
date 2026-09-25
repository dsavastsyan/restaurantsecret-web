// Unified search page for dishes and restaurants.
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'

import { postSuggest, searchFull } from '@/lib/api'
import { toast } from '@/lib/toast'
import { useAuth } from '@/store/auth'
import { useDishCardStore } from '@/store/dishCard'
import { api } from '@/api/client'
import { getRussianPluralWord, getSearchQueryScore } from '@/lib/text'
import { saveCatalogCity } from '@/lib/cityPreference'

const DEFAULT_TYPE = 'dish'
const emptyResults = { restaurants: [], dishes: [], otherCities: [] }
const CITY_LOCATIVE = { 'Москва': 'Москве', 'Санкт-Петербург': 'Санкт-Петербурге', 'Ижевск': 'Ижевске' }
const cityLocative = (city) => CITY_LOCATIVE[city] || `городе ${city}`

const normalizeType = (value) => (value === 'restaurant' ? 'restaurant' : 'dish')

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { access, requireAccess, requestPaywall } = useOutletContext() || {}
  const canAccess = access?.isActive
  const accessToken = useAuth((state) => state.accessToken)
  const accessTokenOrUndefined = accessToken || undefined
  const openDishCard = useDishCardStore((state) => state.open)

  const queryParam = searchParams.get('q')?.trim() ?? ''
  const searchType = normalizeType(searchParams.get('type'))
  const [inputValue, setInputValue] = useState(queryParam)
  const selectedCity = searchParams.get('city') || localStorage.getItem('catalog_city') || 'Москва'
  const [cities, setCities] = useState([])

  const [restaurantsExpanded, setRestaurantsExpanded] = useState(false)
  const [dishesExpanded, setDishesExpanded] = useState(false)

  useEffect(() => setInputValue(queryParam), [queryParam])

  useEffect(() => {
    api.cities().then((data) => setCities(data?.items || [])).catch(() => setCities([]))
  }, [])

  const ensureAccess = useCallback(() => {
    if (requireAccess) {
      return requireAccess()
    }
    if (canAccess) return true
    if (requestPaywall) requestPaywall()
    return false
  }, [canAccess, requireAccess, requestPaywall])

  const [results, setResults] = useState(emptyResults)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submittingSuggest, setSubmittingSuggest] = useState(false)

  useEffect(() => {
    const query = queryParam.trim()
    if (!query) {
      setResults(emptyResults)
      setLoading(false)
      setError('')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    searchFull(query, selectedCity)
      .then((data) => {
        if (cancelled) return
        setResults({
          restaurants: [...(data?.restaurants ?? [])].sort((left, right) =>
            getSearchQueryScore(right.name, query) - getSearchQueryScore(left.name, query)
          ),
          dishes: [...(data?.dishes ?? [])].sort((left, right) =>
            getSearchQueryScore(right.dishName, query) - getSearchQueryScore(left.dishName, query)
          ),
          otherCities: data?.otherCities ?? [],
        })
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Не удалось выполнить поиск')
        setResults(emptyResults)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [queryParam, selectedCity])

  const updateParams = useCallback((nextQuery, nextType = searchType) => {
    const params = new URLSearchParams()
    const normalizedQuery = nextQuery.trim()
    if (normalizedQuery) {
      params.set('q', normalizedQuery)
    }
    params.set('type', nextType || DEFAULT_TYPE)
    params.set('city', selectedCity)
    setSearchParams(params, { replace: true })
  }, [searchType, selectedCity, setSearchParams])

  const changeCity = useCallback((city) => {
    saveCatalogCity(city, 'manual', accessToken)
    const params = new URLSearchParams(searchParams)
    params.set('city', city)
    setSearchParams(params)
  }, [accessToken, searchParams, setSearchParams])

  const handleSubmit = useCallback((event) => {
    event.preventDefault()
    setRestaurantsExpanded(false)
    setDishesExpanded(false)
    updateParams(inputValue, searchType)
  }, [inputValue, searchType, updateParams])

  const handleClear = useCallback(() => {
    setInputValue('')
    setRestaurantsExpanded(false)
    setDishesExpanded(false)
    updateParams('', searchType)
  }, [searchType, updateParams])

  const handleRestaurantOpen = useCallback((slug) => {
    if (!slug) return
    if (ensureAccess()) {
      navigate(`/restaurants/${slug}/menu/?city=${encodeURIComponent(selectedCity)}`)
    }
  }, [ensureAccess, navigate, selectedCity])

  const handleDishOpen = useCallback((dish) => {
    openDishCard({
      id: dish.id,
      dishName: dish.dishName,
      restaurantSlug: dish.restaurantSlug,
      restaurantName: dish.restaurantName,
    })
  }, [openDishCard])

  const handleSuggestRestaurant = useCallback(async () => {
    const trimmedQuery = queryParam.trim()
    if (!trimmedQuery || submittingSuggest) return

    setSubmittingSuggest(true)
    try {
      await postSuggest(
        {
          kind: 'restaurant',
          name: trimmedQuery,
          comment: 'Запрос пользователя из страницы поиска',
        },
        accessTokenOrUndefined,
      )
      toast.success('Спасибо, ваш запрос принят!')
    } catch (requestError) {
      console.error('Failed to submit search suggestion', requestError)
      toast.error('Не удалось отправить запрос. Попробуйте ещё раз.')
    } finally {
      setSubmittingSuggest(false)
    }
  }, [accessTokenOrUndefined, queryParam, submittingSuggest])

  const hasQuery = queryParam.length > 0
  const dishes = results?.dishes ?? []
  const restaurants = results?.restaurants ?? []
  const otherCities = results?.otherCities ?? []
  const dishRestaurantCount = new Set(dishes.map((dish) => dish.restaurantSlug)).size
  const otherDishCount = otherCities.reduce((total, group) => total + (group.dishes?.length || 0), 0)

  const visibleRestaurants = restaurantsExpanded ? restaurants : restaurants.slice(0, 5)
  const visibleDishes = dishesExpanded ? dishes : dishes.slice(0, 5)

  return (
    <div className="search-page">
      <div className="search-page__hero">
        <h1 className="search-page__title">
          Найдите любимые рестораны
          <span>и блюда</span>
        </h1>
        <p className="search-page__hint">Ищите рестораны и блюда с учетом состава, КБЖУ и ваших целей</p>
      </div>

      <div className="search-page__city-context">
        <label className="search-page__city-label" htmlFor="search-city">Ищем рестораны и блюда в</label>
        <select id="search-city" className="search-page__city-select" value={selectedCity} onChange={(event) => changeCity(event.target.value)}>
          {(cities.length ? cities : [{ id: 'Москва', name: 'Москва' }]).map((city) => (
            <option key={city.id} value={city.id}>{city.name}</option>
          ))}
        </select>
      </div>

      <form className="search-page__form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="search-query">Поисковый запрос</label>
        <div className="search-page__field">
          <span className="search-page__search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="m21 21-4.2-4.2m2.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
            </svg>
          </span>
          <input
            id="search-query"
            className="search-page__input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Например, бургер или название ресторана"
            autoComplete="off"
          />
          {inputValue && (
            <button
              type="button"
              className="search-page__clear"
              onClick={handleClear}
              aria-label="Очистить поиск"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
        <button type="submit" className="search-page__submit">Найти</button>
      </form>

      {loading && <div className="search-state">Ищем…</div>}
      {error && <div className="search-state search-state--error">Ошибка: {error}</div>}

      {!loading && hasQuery && restaurants.length === 0 && dishes.length === 0 && otherCities.length === 0 && !error && (
        <div className="search-state search-state--empty search-state--empty-action">
          <span>Ничего не нашли по «{queryParam}»</span>
          <button
            type="button"
            className="search-state__suggest-btn"
            onClick={handleSuggestRestaurant}
            disabled={submittingSuggest}
          >
            {submittingSuggest ? 'Отправляем…' : `🔔 Запросить добавление ресторана «${queryParam}»`}
          </button>
        </div>
      )}

      {hasQuery && !loading && (
        <>
          <header className="search-city-heading">
            <h2>В {cityLocative(selectedCity)}</h2>
            {restaurants.length === 0 && dishes.length === 0 && <span>Результатов нет</span>}
          </header>
          {restaurants.length > 0 && (
            <section className="search-results-section">
              <header className="search-results-header">
                <h2 className="search-results-header__title">Рестораны</h2>
                <span className="search-results-header__count">Найдено {restaurants.length}</span>
              </header>
              <ul className="search-results">
                {visibleRestaurants.map((restaurant) => (
                  <li key={`restaurant-${restaurant.id}`} className="search-card">
                    <button type="button" className="search-card__button" onClick={() => handleRestaurantOpen(restaurant.slug)}>
                      <span className="search-card__content">
                        <span className="search-card__title">{restaurant.name}</span>
                        <span className="search-card__subtitle">
                          {[restaurant.cuisine, restaurant.branchesCount > 1 ? `${restaurant.branchesCount} ${getRussianPluralWord(restaurant.branchesCount, 'ресторан', 'ресторана', 'ресторанов')} в ${cityLocative(selectedCity)}` : selectedCity].filter(Boolean).join(' · ')}
                        </span>
                        <span className="search-card__meta">Открыть меню</span>
                      </span>
                      <span className="search-card__chevron" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="m9 5 7 7-7 7" />
                        </svg>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {restaurants.length > 5 && (
                <button
                  className="search-results-expand"
                  onClick={() => setRestaurantsExpanded(!restaurantsExpanded)}
                >
                  {restaurantsExpanded ? 'Свернуть' : 'Показать все'}
                </button>
              )}
            </section>
          )}

          {dishes.length > 0 && (
            <section className="search-results-section">
              <header className="search-results-header">
                <h2 className="search-results-header__title">Блюда</h2>
                <span className="search-results-header__count">Доступно в {dishRestaurantCount} {getRussianPluralWord(dishRestaurantCount, 'ресторане', 'ресторанах', 'ресторанах')} {selectedCity === 'Москва' ? 'Москвы' : selectedCity}</span>
              </header>
              <ul className="search-results">
                {visibleDishes.map((dish) => (
                  <li key={`dish-${dish.id}`} className="search-card">
                    <button type="button" className="search-card__button" onClick={() => handleDishOpen(dish)}>
                      <span className="search-card__content">
                        <span className="search-card__title">{dish.dishName}</span>
                        <span className="search-card__subtitle">{dish.restaurantName}</span>
                        <span className="search-card__meta">Подробнее</span>
                      </span>
                      <span className="search-card__chevron" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="m9 5 7 7-7 7" />
                        </svg>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {dishes.length > 5 && (
                <button
                  className="search-results-expand"
                  onClick={() => setDishesExpanded(!dishesExpanded)}
                >
                  {dishesExpanded ? 'Свернуть' : 'Показать все'}
                </button>
              )}
            </section>
          )}

          {otherCities.length > 0 && (
            <section className="search-results-section search-results-section--other">
              <header className="search-results-header search-results-header--stacked">
                <h2 className="search-results-header__title">Есть в других городах</h2>
                {otherDishCount > 0 && <span className="search-results-header__count">Найдено ещё {otherDishCount} вариантов блюд</span>}
              </header>
              <ul className="search-results search-other-cities">
                {otherCities.map((group) => (
                  <li key={group.city} className="search-card search-other-city">
                    <div className="search-other-city__head">
                      <div className="search-other-city__content">
                        <strong>{group.city}</strong>
                        <span>{group.restaurants.length} {getRussianPluralWord(group.restaurants.length, 'ресторан', 'ресторана', 'ресторанов')} · {group.dishes.length} {getRussianPluralWord(group.dishes.length, 'блюдо', 'блюда', 'блюд')}</span>
                      </div>
                      <button type="button" onClick={() => {
                        if (window.confirm(`Переключиться на город ${group.city}?`)) changeCity(group.city)
                      }}>Посмотреть</button>
                    </div>
                    <div className="search-other-city__matches">
                      {group.restaurants.map((restaurant) => (
                        <div key={`other-restaurant-${group.city}-${restaurant.id}`}>
                          <strong>{restaurant.name}</strong>
                          <span>{restaurant.cuisine || 'Ресторан'} · {group.city}</span>
                        </div>
                      ))}
                      {group.dishes.map((dish) => (
                        <div key={`other-dish-${group.city}-${dish.id}`}>
                          <strong>{dish.dishName}</strong>
                          <span>{dish.restaurantName} · {group.city}</span>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {!hasQuery && !loading && (
        <div className="search-state">Введите название блюда или ресторана и нажмите «Искать».</div>
      )}
    </div>
  )
}
