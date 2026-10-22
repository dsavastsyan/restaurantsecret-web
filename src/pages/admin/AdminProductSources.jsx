import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Search } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import {
  SOURCE_STATUS,
  formatCount,
  formatDateTime,
  host,
  matchesSourceQuery,
  percent,
  sortSources,
} from './adminProducts'

function useSourceData(load) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    load()
      .then((payload) => active && setData(payload))
      .catch((requestError) => active && setError(requestError.message || 'Не удалось загрузить источники'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [load])

  return { data, loading, error }
}

function StatusCell({ source }) {
  return (
    <td data-label="Статус">
      {source.status
        ? <span className={`admin-parser__status admin-parser__status--${source.status}`}>{SOURCE_STATUS[source.status] || source.status}</span>
        : <span className="admin-crm__muted">—</span>}
      {source.status_note && <small className="admin-product-sources__note">{source.status_note}</small>}
    </td>
  )
}

function SourceFilters({ query, setQuery, status, setStatus, counts, placeholder }) {
  return (
    <div className="admin-crm__filters">
      <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /></label>
      <select aria-label="Статус источника" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">Все статусы</option>
        {Object.entries(SOURCE_STATUS).map(([value, label]) => <option value={value} key={value}>{label} ({counts[value] || 0})</option>)}
      </select>
    </div>
  )
}

function useFilteredSources(sources) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const counts = useMemo(() => {
    const result = {}
    for (const source of sources) result[source.status] = (result[source.status] || 0) + 1
    return result
  }, [sources])
  const visible = useMemo(() => sortSources(sources)
    .filter((source) => (!status || source.status === status) && matchesSourceQuery(source, query)), [sources, status, query])
  return { query, setQuery, status, setStatus, counts, visible }
}

function SectionTitle({ title, description, total }) {
  return (
    <div className="admin-menu__title admin-crm__title">
      <div><span>Сбор</span><h1>{title}</h1><p>{description}</p></div>
      <div><strong>{total}</strong></div>
    </div>
  )
}

function QueueCell({ queue }) {
  if (!queue) return <td data-label="Очередь"><span className="admin-crm__muted">Без очереди</span></td>
  return (
    <td data-label="Очередь">
      {formatCount(queue.parsed)} разобрано
      <small>{formatCount(queue.skipped)} пропущено · {formatCount(queue.error)} с ошибкой · {formatCount(queue.pending)} ждут</small>
    </td>
  )
}

function ErrorCell({ error }) {
  if (!error) return <td data-label="Последняя ошибка"><span className="admin-crm__muted">—</span></td>
  return (
    <td data-label="Последняя ошибка">
      <details className="admin-parser__error">
        <summary>{formatDateTime(error.at)}</summary>
        <strong>{error.message || 'Без текста ошибки'}</strong>
      </details>
    </td>
  )
}

const loadRetailers = () => adminMenuRevisionsApi.productSources()

export function AdminProductRetailers() {
  const { data, loading, error } = useSourceData(loadRetailers)
  const sources = data?.sources || []
  const filters = useFilteredSources(sources)
  const staleDays = data?.stale_after_days || 30

  return (
    <section className="admin-crm">
      <SectionTitle
        title="Базы ритейлеров"
        description={`Откуда приходят карточки товаров. Актуально — импорт был за последние ${staleDays} дней, ошибка — в последнем запуске заметная доля страниц упала`}
        total={loading ? '…' : sources.length}
      />
      <SourceFilters {...filters} placeholder="Ритейлер или сайт" />
      {error && <p className="admin-menu__error" role="alert">{error}</p>}
      {loading ? <p className="admin-crm__loading">Загружаем источники…</p> : (
        <div className="admin-crm__table-wrap admin-parser__table-wrap">
          <table className="admin-crm__table admin-parser__table admin-product-sources__table">
            <thead><tr><th>Источник</th><th>Статус</th><th>Последний импорт</th><th>Карточек</th><th>Очередь</th><th>Последняя ошибка</th></tr></thead>
            <tbody>{filters.visible.map((source) => (
              <tr key={source.key}>
                <td>
                  <strong>{source.label}</strong>
                  <small><a href={source.url} target="_blank" rel="noreferrer">{host(source.url)} <ExternalLink size={13} /></a></small>
                  <small>{[source.country, source.method].filter(Boolean).join(' · ')}</small>
                </td>
                <StatusCell source={source} />
                <td data-label="Последний импорт">{formatDateTime(source.last_import_at)}</td>
                <td data-label="Карточек">
                  {formatCount(source.cards)}
                  <small>{formatCount(source.cards_with_barcode)} со штрихкодом</small>
                </td>
                <QueueCell queue={source.queue} />
                <ErrorCell error={source.last_error} />
              </tr>
            ))}</tbody>
          </table>
          {!filters.visible.length && !error && <div className="admin-menu__empty">По выбранным условиям источников нет</div>}
        </div>
      )}
    </section>
  )
}

const loadBarcodes = () => adminMenuRevisionsApi.barcodeSources()

function ReviewCell({ review }) {
  if (!review) return <td data-label="Пары"><span className="admin-crm__muted">—</span></td>
  return (
    <td data-label="Пары">
      {review.pending > 0
        ? <Link to="/admin/products/freshness/barcodes">{formatCount(review.pending)} ждут проверки</Link>
        : <span className="admin-crm__muted">Нет на проверке</span>}
      <small>{formatCount(review.approved + review.auto)} принято · {formatCount(review.rejected)} отклонено</small>
    </td>
  )
}

export function AdminBarcodeSources() {
  const { data, loading, error } = useSourceData(loadBarcodes)
  const sources = data?.sources || []
  const coverage = data?.coverage
  const filters = useFilteredSources(sources)

  return (
    <section className="admin-crm">
      <SectionTitle
        title="Штрихкоды"
        description="Откуда берутся штрихкоды и сколько товаров ими покрыто. Кандидат — штрихкод, который ещё не подтверждён в карточке"
        total={loading ? '…' : sources.length}
      />
      {coverage && (
        <div className="admin-place-review__summary admin-product-sources__coverage" aria-label="Покрытие штрихкодами">
          <div><span>Штрихкод в карточке</span><strong>{formatCount(coverage.in_card)} · {percent(coverage.in_card, coverage.total)}</strong></div>
          <div><span>Только кандидат</span><strong>{formatCount(coverage.candidate_only)} · {percent(coverage.candidate_only, coverage.total)}</strong></div>
          <div>
            <span>Без штрихкода</span>
            <strong><Link to="/admin/products/quality/completeness?issue=no_barcode">{formatCount(coverage.none)} · {percent(coverage.none, coverage.total)}</Link></strong>
          </div>
          <div><span>Всего товаров</span><strong>{formatCount(coverage.total)}</strong></div>
        </div>
      )}
      <SourceFilters {...filters} placeholder="Источник" />
      {error && <p className="admin-menu__error" role="alert">{error}</p>}
      {loading ? <p className="admin-crm__loading">Загружаем источники штрихкодов…</p> : (
        <div className="admin-crm__table-wrap admin-parser__table-wrap">
          <table className="admin-crm__table admin-parser__table admin-product-sources__table">
            <thead><tr><th>Источник</th><th>Статус</th><th>Штрихкодов</th><th>Пары</th><th>Последнее обновление</th></tr></thead>
            <tbody>{filters.visible.map((source) => (
              <tr key={source.key}>
                <td>
                  <strong>{source.label}</strong>
                  <small>{source.group}</small>
                  {source.note && <small>{source.note}</small>}
                </td>
                <StatusCell source={source} />
                <td data-label="Штрихкодов">{formatCount(source.rows)}{source.rows_label && <small>{source.rows_label}</small>}</td>
                <ReviewCell review={source.review} />
                <td data-label="Последнее обновление">{formatDateTime(source.last_at)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!filters.visible.length && !error && <div className="admin-menu__empty">По выбранным условиям источников нет</div>}
        </div>
      )}
    </section>
  )
}
