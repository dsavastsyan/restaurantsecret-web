import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'

const STATUS_LABELS = {
  pending: 'Нужно решение',
  retry_requested: 'Ждут перезапуска',
  confirmed: 'Подтверждены',
  rejected: 'Отклонены',
}

const REASON_LABELS = {
  no_network_points: 'По текущему названию сеть не найдена',
  no_restaurants: 'У сети нет активных ресторанов',
  google_place_id_conflict: 'Эти точки уже принадлежат другой внутренней сети',
}

function formatCount(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0))
}

function formatUsageMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return 'текущий месяц'
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
}

function GooglePlacesUsageCard({ usage, loading, error }) {
  const hasLimit = Number.isFinite(usage?.monthly_limit) && usage.monthly_limit > 0
  const percentUsed = hasLimit ? Number(usage.percent_used || 0) : 0
  const progressValue = Math.min(percentUsed, 100)

  return (
    <aside className="admin-place-review__usage" aria-label="Расход Google Places">
      <div>
        <p className="admin-place-review__eyebrow">Расход Google Places</p>
        <div className="admin-place-review__usage-number">
          {loading ? '…' : formatCount(usage?.request_count)}{' '}
          <span>запросов</span>
        </div>
        <p className="admin-place-review__usage-period">
          {formatUsageMonth(usage?.usage_month)} · Places UI Kit Query
        </p>
      </div>
      <div className={`admin-place-review__usage-budget${percentUsed >= 100 ? ' is-over-budget' : ''}`}>
        {hasLimit ? (
          <>
            <strong>{formatCount(usage.remaining)} осталось</strong>
            <span>из {formatCount(usage.monthly_limit)} в заданном лимите</span>
            <progress value={progressValue} max="100" aria-label={`Использовано ${percentUsed}% лимита`} />
            <small>Использовано {percentUsed}%</small>
          </>
        ) : (
          <span>Лимит проекта не задан</span>
        )}
      </div>
      <p className="admin-place-review__usage-note">
        Считаем успешные запросы карточек Google. Для стоимости сверяйте этот показатель с Google Cloud Billing.
        {error ? ` Счётчик недоступен: ${error}` : ''}
      </p>
    </aside>
  )
}

function mapsUrl(placeId) {
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`
}

function NetworkReviewCard({ review, working, onDecision }) {
  const [alias, setAlias] = useState(review.suggested_alias || '')
  const actionable = ['pending', 'retry_requested'].includes(review.status)
  const locationByPlaceId = new Map(review.locations.map((location) => [location.google_place_id, location]))

  return (
    <article className="admin-place-review__card">
      <header className="admin-place-review__card-header">
        <div>
          <p className="admin-place-review__eyebrow">Сеть #{review.network_id} · {review.city || 'город не указан'}</p>
          <h2>{review.network_name}</h2>
          <p>{REASON_LABELS[review.reason] || review.reason}</p>
        </div>
        <strong className="admin-place-review__impact">
          {review.candidate_count} {review.candidate_count === 1 ? 'точка' : 'точек'}
        </strong>
      </header>

      <div className="admin-place-review__summary">
        <div>
          <span>Искали как</span>
          <strong>{review.query_name}</strong>
        </div>
        <div>
          <span>Рестораны в сети</span>
          <strong>{review.restaurants.length}</strong>
        </div>
        <div>
          <span>Уже сохранено точек</span>
          <strong>{review.locations.length}</strong>
        </div>
      </div>

      {review.aliases.length ? (
        <div className="admin-place-review__aliases" aria-label="Сохранённые названия">
          {review.aliases.map((item) => <span key={`${item.source}-${item.alias}`}>{item.alias}</span>)}
        </div>
      ) : null}

      {review.candidate_place_ids.length ? (
        <details className="admin-place-review__candidates">
          <summary>Проверить найденные точки ({review.candidate_place_ids.length})</summary>
          <ul>
            {review.candidate_place_ids.map((placeId) => {
              const location = locationByPlaceId.get(placeId)
              return (
                <li key={placeId}>
                  <a href={location?.google_maps_uri || mapsUrl(placeId)} target="_blank" rel="noreferrer">
                    {location?.google_display_name || placeId}
                  </a>
                  {location?.address ? <small>{location.address}</small> : null}
                </li>
              )
            })}
          </ul>
          <p className="admin-place-review__attribution">Данные Google Maps</p>
        </details>
      ) : (
        <p className="admin-place-review__empty-evidence">Google не вернул подходящих кандидатов.</p>
      )}

      {actionable ? (
        <>
          <label className="admin-place-review__alias-input">
            Название сети в Google
            <input
              name="google-network-alias"
              autoComplete="off"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="Например, Кулинарная лавка братьев Караваевых"
            />
          </label>
          <footer className="admin-place-review__actions">
            <button
              type="button"
              disabled={working}
              onClick={() => window.confirm('Отклонить кандидатов для этой сети?') && onDecision(review, { action: 'reject' })}
            >
              Не эта сеть
            </button>
            <button type="button" disabled={working} onClick={() => onDecision(review, { action: 'retry' })}>
              Повторить без алиаса
            </button>
            <button
              className="is-secondary"
              type="button"
              disabled={working || !alias.trim()}
              onClick={() => onDecision(review, { action: 'set_alias_and_retry', alias: alias.trim() })}
            >
              Сохранить алиас и повторить
            </button>
            <button
              className="is-primary"
              type="button"
              disabled={working || !alias.trim()}
              onClick={() => onDecision(review, { action: 'confirm_alias', alias: alias.trim() })}
            >
              Это та же сеть
            </button>
          </footer>
        </>
      ) : null}
    </article>
  )
}

function BranchReviewCard({ review, working, onDecision }) {
  const [restaurantId, setRestaurantId] = useState('')
  return (
    <article className="admin-place-review__card admin-place-review__card--branch">
      <header className="admin-place-review__card-header">
        <div>
          <p className="admin-place-review__eyebrow">{review.network_name} · {review.city}</p>
          <h2>{review.google_display_name || 'Точка Google'}</h2>
          <p>{review.address || review.google_place_id}</p>
        </div>
        <a href={review.google_maps_uri || mapsUrl(review.google_place_id)} target="_blank" rel="noreferrer">
          Открыть на карте
        </a>
      </header>
      <label className="admin-place-review__alias-input">
        Филиал
        <select
          name="restaurant-branch"
          autoComplete="off"
          value={restaurantId}
          onChange={(event) => setRestaurantId(event.target.value)}
        >
          <option value="">Выберите филиал</option>
          {review.branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.branch || branch.name} · id {branch.id}
            </option>
          ))}
        </select>
      </label>
      <footer className="admin-place-review__actions">
        <button type="button" disabled={working} onClick={() => onDecision(review, { action: 'keep_network' })}>
          Оставить на уровне сети
        </button>
        <button
          className="is-primary"
          type="button"
          disabled={working || !restaurantId}
          onClick={() => onDecision(review, { action: 'attach', restaurant_id: Number(restaurantId) })}
        >
          Привязать к филиалу
        </button>
      </footer>
    </article>
  )
}

export default function AdminGooglePlaceReviews() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMode = searchParams.get('queue')
  const requestedStatus = searchParams.get('status')
  const mode = requestedMode === 'branches' ? 'branches' : 'networks'
  const status = Object.hasOwn(STATUS_LABELS, requestedStatus) ? requestedStatus : 'pending'
  const [reviews, setReviews] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState(null)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState(null)
  const [usageLoading, setUsageLoading] = useState(true)
  const [usageError, setUsageError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = mode === 'networks'
        ? await adminMenuRevisionsApi.googlePlaceNetworkReviews(status)
        : await adminMenuRevisionsApi.googlePlaceBranchReviews()
      setReviews(data.reviews || [])
      setStats(data.stats || {})
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить очередь.')
    } finally {
      setLoading(false)
    }
  }, [mode, status])

  useEffect(() => { load() }, [load])

  const loadUsage = useCallback(async () => {
    setUsageLoading(true)
    setUsageError('')
    try {
      setUsage(await adminMenuRevisionsApi.googlePlacesUsage())
    } catch (requestError) {
      setUsageError(requestError.message || 'не удалось загрузить')
    } finally {
      setUsageLoading(false)
    }
  }, [])

  useEffect(() => { loadUsage() }, [loadUsage])

  const refresh = () => {
    load()
    loadUsage()
  }

  const selectMode = (nextMode) => {
    const next = new URLSearchParams(searchParams)
    next.set('queue', nextMode)
    if (nextMode === 'branches') next.delete('status')
    setSearchParams(next)
  }

  const selectStatus = (nextStatus) => {
    const next = new URLSearchParams(searchParams)
    next.set('queue', 'networks')
    next.set('status', nextStatus)
    setSearchParams(next)
  }

  const decideNetwork = async (review, body) => {
    setWorkingId(review.id)
    setError('')
    try {
      await adminMenuRevisionsApi.decideGooglePlaceNetworkReview(review.id, body)
      setReviews((current) => current.filter((item) => item.id !== review.id))
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить решение.')
    } finally {
      setWorkingId(null)
    }
  }

  const decideBranch = async (review, body) => {
    setWorkingId(review.id)
    setError('')
    try {
      await adminMenuRevisionsApi.decideGooglePlaceBranchReview(review.id, body)
      setReviews((current) => current.filter((item) => item.id !== review.id))
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить привязку.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <section className="admin-place-review">
      <header className="admin-place-review__page-header">
        <div>
          <p className="admin-place-review__eyebrow">Google Places</p>
          <h1>Ревью сетей и точек</h1>
          <p>Сначала подтверждаем название всей сети. Привязка к филиалу — отдельный необязательный шаг.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || usageLoading}>Обновить</button>
      </header>

      <GooglePlacesUsageCard usage={usage} loading={usageLoading} error={usageError} />

      <div className="admin-place-review__mode-tabs" role="tablist" aria-label="Тип очереди">
        <button type="button" className={mode === 'networks' ? 'active' : ''} onClick={() => selectMode('networks')}>
          Сети и алиасы
        </button>
        <button type="button" className={mode === 'branches' ? 'active' : ''} onClick={() => selectMode('branches')}>
          Привязка филиалов
        </button>
      </div>

      {mode === 'networks' ? (
        <div className="admin-place-review__status-tabs">
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => selectStatus(value)}>
              {label}<strong>{stats[value] || 0}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div aria-live="polite">
        {error ? <p className="admin-crm__notice admin-crm__notice--error">{error} Повторите действие.</p> : null}
        {loading ? <p className="admin-place-review__loading">Загружаю…</p> : null}
      </div>
      {!loading && !reviews.length ? (
        <div className="admin-place-review__empty">В этой очереди сейчас ничего нет.</div>
      ) : null}

      <div className="admin-place-review__list">
        {reviews.map((review) => mode === 'networks' ? (
          <NetworkReviewCard
            key={review.id}
            review={review}
            working={workingId === review.id}
            onDecision={decideNetwork}
          />
        ) : (
          <BranchReviewCard
            key={review.id}
            review={review}
            working={workingId === review.id}
            onDecision={decideBranch}
          />
        ))}
      </div>
    </section>
  )
}
