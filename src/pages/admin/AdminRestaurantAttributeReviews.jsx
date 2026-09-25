import { useCallback, useEffect, useState } from 'react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'

const STATUS_LABELS = {
  pending: 'Ждут решения',
  approved: 'Применены',
  rejected: 'Отклонены',
}

const FIELD_LABELS = {
  name: 'Название',
  city: 'Город',
  branch: 'Филиал',
  instagram_url: 'Instagram',
  manual_coordinates: 'Координаты',
  cuisine: 'Кухня',
  primary_venue_type: 'Тип заведения',
}

const VENUE_TYPE_OPTIONS = [
  ['restaurant', 'Ресторан'],
  ['cafe', 'Кафе'],
  ['coffee_tea', 'Кофе и чай'],
  ['fast_food', 'Быстрая еда'],
]

function ReviewValueInput({ review, value, onChange }) {
  if (review.field === 'primary_venue_type') {
    return (
      <select value={value} onChange={onChange}>
        <option value="">Выберите тип</option>
        {VENUE_TYPE_OPTIONS.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>{label}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder="агент ничего не нашёл — впишите вручную или отклоните"
    />
  )
}

function formatConfidence(value) {
  if (value === null || value === undefined) return '—'
  return `${Math.round(Number(value) * 100)}%`
}

function ReviewCard({ review, onDecide, working }) {
  const [value, setValue] = useState(review.suggested_value || '')
  const isVenueTypeReview = review.field === 'primary_venue_type'

  return (
    <article className="admin-restaurant-review__card">
      <header>
        <div>
          <small>{FIELD_LABELS[review.field] || review.field}</small>
          <h2>{review.restaurant_name}</h2>
          <p>слаг {review.restaurant_slug} · id {review.restaurant_id}</p>
        </div>
        <span className={`admin-menu__badge admin-menu__badge--${review.status}`}>
          уверенность агента {formatConfidence(review.confidence)}
        </span>
      </header>

      {review.note ? <p className="admin-restaurant-review__note">{review.note}</p> : null}

      {review.status === 'pending' ? (
        <>
          <label className="admin-restaurant-review__value">
            {isVenueTypeReview
              ? 'Значение уже применено — проверьте или измените его'
              : 'Значение (можно поправить перед применением)'}
            <ReviewValueInput
              review={review}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <footer className="admin-restaurant-review__actions">
            <button
              type="button"
              className="is-reject"
              disabled={working}
              onClick={() => onDecide(review, 'reject')}
            >
              {isVenueTypeReview ? 'Оставить как есть' : 'Отклонить'}
            </button>
            <button
              type="button"
              className="is-approve"
              disabled={working || !value.trim()}
              onClick={() => onDecide(review, 'approve', value.trim())}
            >
              {isVenueTypeReview ? 'Сохранить выбор' : 'Применить'}
            </button>
          </footer>
        </>
      ) : (
        <p className="admin-restaurant-review__value admin-restaurant-review__value--readonly">
          {review.suggested_value || '—'}
        </p>
      )}
    </article>
  )
}

function RestaurantEditCard({ restaurant, onSaved }) {
  const [form, setForm] = useState({
    name: restaurant.name || '',
    city: restaurant.city || '',
    branch: restaurant.branch || '',
    instagram_url: restaurant.instagram_url || '',
    manual_coordinates: restaurant.manual_coordinates || '',
    cuisines: (restaurant.cuisines || []).join(', '),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const update = (field) => (event) => {
    setSaved(false)
    setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const body = {
        name: form.name,
        city: form.city || null,
        branch: form.branch || null,
        instagram_url: form.instagram_url || null,
        manual_coordinates: form.manual_coordinates || null,
        cuisines: form.cuisines.split(',').map((c) => c.trim()).filter(Boolean),
      }
      const result = await adminMenuRevisionsApi.patchRestaurantById(restaurant.id, body)
      setSaved(true)
      onSaved?.(result.restaurant)
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="admin-restaurant-review__card">
      <header>
        <div>
          <small>id {restaurant.id} · слаг {restaurant.slug}</small>
          <h2>{restaurant.restaurant_name || restaurant.name}</h2>
        </div>
      </header>

      <div className="admin-restaurant-review__grid">
        <label>Название<input type="text" value={form.name} onChange={update('name')} /></label>
        <label>Город<input type="text" value={form.city} onChange={update('city')} /></label>
        <label>Филиал<input type="text" value={form.branch} onChange={update('branch')} /></label>
        <label>Instagram<input type="text" value={form.instagram_url} onChange={update('instagram_url')} /></label>
        <label className="admin-restaurant-review__grid-wide">
          Координаты (через ;)
          <input type="text" value={form.manual_coordinates} onChange={update('manual_coordinates')} />
        </label>
        <label className="admin-restaurant-review__grid-wide">
          Кухня (через запятую)
          <input type="text" value={form.cuisines} onChange={update('cuisines')} />
        </label>
      </div>

      {error ? <p className="admin-crm__notice admin-crm__notice--error">{error}</p> : null}

      <footer className="admin-restaurant-review__actions">
        {saved ? <span className="admin-restaurant-review__saved">Сохранено</span> : null}
        <button type="button" className="is-approve" disabled={saving} onClick={save}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </footer>
    </article>
  )
}

export default function AdminRestaurantAttributeReviews() {
  const [status, setStatus] = useState('pending')
  const [field, setField] = useState('')
  const [city, setCity] = useState('')
  const [reviews, setReviews] = useState([])
  const [stats, setStats] = useState([])
  const [cities, setCities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const selectStatus = (nextStatus) => {
    setStatus(nextStatus)
    setField('')
    setCity('')
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminMenuRevisionsApi.restaurantAttributeReviews(status, { field, city })
      setReviews(data.reviews || [])
      setStats(data.stats || [])
      setCities(data.cities || [])
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить очередь.')
    } finally {
      setLoading(false)
    }
  }, [status, field, city])

  useEffect(() => { load() }, [load])

  const totalStatsCount = stats.reduce((sum, item) => sum + item.count, 0)

  const decide = async (review, decision, value) => {
    setWorkingId(review.id)
    setError('')
    try {
      await adminMenuRevisionsApi.decideRestaurantAttributeReview(review.id, decision, value)
      setReviews((current) => current.filter((item) => item.id !== review.id))
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить решение.')
    } finally {
      setWorkingId(null)
    }
  }

  const runSearch = async (event) => {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    try {
      const data = await adminMenuRevisionsApi.searchRestaurants(query.trim())
      setSearchResults(data.restaurants || [])
    } catch (requestError) {
      setSearchError(requestError.message || 'Не удалось выполнить поиск.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <section className="admin-restaurant-review">
      <header className="admin-menu__title">
        <div>
          <span>Рестораны</span>
          <h1>Ревью и правки</h1>
          <p>Находки агента по типу заведения, координатам и кухне, а также точечное редактирование любого ресторана.</p>
        </div>
        <strong>{reviews.length}</strong>
      </header>

      {stats.length > 0 ? (
        <div className="admin-restaurant-review__stats">
          <button type="button" className={field === '' ? 'active' : ''} onClick={() => setField('')}>
            Все причины <strong>{totalStatsCount}</strong>
          </button>
          {stats.map((item) => (
            <button
              key={item.field}
              type="button"
              className={field === item.field ? 'active' : ''}
              onClick={() => setField(item.field)}
            >
              {FIELD_LABELS[item.field] || item.field} <strong>{item.count}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="admin-restaurant-review__toolbar">
        <div className="admin-product-match__filters">
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={status === value ? 'active' : ''}
              onClick={() => selectStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {cities.length > 0 ? (
          <label className="admin-restaurant-review__city-filter">
            Город
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="">Все города</option>
              {cities.map((cityOption) => (
                <option key={cityOption} value={cityOption}>{cityOption}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? <p className="admin-crm__notice admin-crm__notice--error">{error}</p> : null}
      {loading ? <p className="admin-crm__loading">Загружаем очередь…</p> : null}
      {!loading && reviews.length === 0 ? (
        <div className="admin-menu__empty">В этом разделе пока пусто.</div>
      ) : null}

      <div className="admin-product-match__list">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} onDecide={decide} working={workingId === review.id} />
        ))}
      </div>

      <h2 className="admin-restaurant-review__section-title">Найти ресторан и поправить вручную</h2>
      <form className="admin-restaurant-review__search" onSubmit={runSearch}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="название или слаг сети"
        />
        <button type="submit" disabled={searching}>{searching ? 'Ищу…' : 'Найти'}</button>
      </form>
      {searchError ? <p className="admin-crm__notice admin-crm__notice--error">{searchError}</p> : null}
      {searchResults !== null && searchResults.length === 0 ? (
        <div className="admin-menu__empty">Ничего не нашлось.</div>
      ) : null}

      <div className="admin-product-match__list">
        {(searchResults || []).map((restaurant) => (
          <RestaurantEditCard key={restaurant.id} restaurant={restaurant} />
        ))}
      </div>
    </section>
  )
}
