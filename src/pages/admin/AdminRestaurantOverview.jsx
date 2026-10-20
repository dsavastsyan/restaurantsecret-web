import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CircleAlert, Clock3, ExternalLink, RefreshCw, Search, Store } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import { adminMenuHealthApi } from '@/api/adminMenuHealth'
import { formatHealthDate, formatHealthDateTime, healthReasonLabel, healthStatusInfo } from './adminMenuHealth'
import {
  DM_STATE_LABELS,
  FRESHNESS,
  KBJU_SOURCE_LABELS,
  matchesQuery,
  restaurantPath,
  toTime,
} from './adminRestaurants'
import { useRestaurantWorkspace } from './useRestaurantWorkspace'

const KIND_LABELS = { manual: 'Ручное обновление', parser: 'Парсер', unknown: 'Без источника обновления' }
const PAGE_SIZE = 60

export function FreshnessBadge({ code }) {
  const info = FRESHNESS[code] || FRESHNESS.unknown
  return <span className={`admin-manual-menu__status admin-manual-menu__status--${info.tone}`}>{info.label}</span>
}

function WorkspaceWarning({ failed }) {
  if (!failed.length) return null
  return <p className="admin-health__error" role="alert">Не загрузилось: {failed.join(', ')}. Остальные данные показаны</p>
}

function citiesLabel(cities) {
  return cities?.length ? cities.join(', ') : 'Город не указан'
}

function RestaurantCard({ record }) {
  const issues = [...record.completeness, ...record.accuracy]
  return (
    <Link to={restaurantPath(record.slug)} aria-label={`Открыть ${record.name}`}>
      <span className="admin-menu__file-icon"><Store size={22} /></span>
      <div>
        <h2>{record.name}</h2>
        <p>{citiesLabel(record.cities)} · {KIND_LABELS[record.kind]}</p>
        {issues.length > 0 && (
          <div className="admin-restaurants__issues">
            {issues.slice(0, 4).map((issue) => <span className="admin-crm__warning" key={issue.code}><CircleAlert size={13} />{issue.label}</span>)}
            {issues.length > 4 && <small>ещё {issues.length - 4}</small>}
          </div>
        )}
      </div>
      <FreshnessBadge code={record.freshness} />
    </Link>
  )
}

export default function AdminRestaurantOverview() {
  const { records, failed, loading, error, reload } = useRestaurantWorkspace()
  const [query, setQuery] = useState('')
  const [freshness, setFreshness] = useState('')
  const [kind, setKind] = useState('')
  const [issue, setIssue] = useState('')
  const [city, setCity] = useState('')
  const [page, setPage] = useState(1)

  const cities = useMemo(() => [...new Set(records.flatMap((record) => record.cities))].sort((left, right) => left.localeCompare(right, 'ru')), [records])
  const visible = useMemo(() => records
    .filter((record) => {
      if (freshness && record.freshness !== freshness) return false
      if (kind && record.kind !== kind) return false
      if (city && !record.cities.includes(city)) return false
      if (issue === 'completeness' && !record.completeness.length) return false
      if (issue === 'accuracy' && !record.accuracy.length) return false
      if (issue === 'none' && (record.completeness.length || record.accuracy.length)) return false
      return matchesQuery(record, query)
    })
    .sort((left, right) => FRESHNESS[left.freshness].priority - FRESHNESS[right.freshness].priority
      || left.name.localeCompare(right.name, 'ru')), [records, query, freshness, kind, city, issue])

  useEffect(() => setPage(1), [query, freshness, kind, city, issue])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <section className="admin-crm">
      <div className="admin-menu__title admin-crm__title">
        <div><span>Рестораны</span><h1>Все рестораны</h1><p>Одна карточка — одно меню. Внутри всё по нему: источники, переписка, проблемы</p></div>
        <div><strong>{loading ? '…' : visible.length}</strong><button type="button" className="admin-crm__clear" onClick={reload} disabled={loading}><RefreshCw size={16} /> Обновить</button></div>
      </div>
      <div className="admin-crm__filters">
        <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ресторан, slug или город" /></label>
        <select aria-label="Актуальность" value={freshness} onChange={(event) => setFreshness(event.target.value)}>
          <option value="">Любая актуальность</option>
          {Object.entries(FRESHNESS).map(([value, info]) => <option value={value} key={value}>{info.label}</option>)}
        </select>
        <select aria-label="Как обновляется" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">Парсер и ручные</option>
          <option value="manual">Ручное обновление</option>
          <option value="parser">Парсер</option>
        </select>
        <select aria-label="Проблемы" value={issue} onChange={(event) => setIssue(event.target.value)}>
          <option value="">Все меню</option>
          <option value="completeness">Есть проблемы полноты</option>
          <option value="accuracy">Есть проблемы точности</option>
          <option value="none">Без проблем</option>
        </select>
        <select aria-label="Город" value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="">Все города</option>
          {cities.map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      <WorkspaceWarning failed={failed} />
      {error && <p className="admin-menu__error" role="alert">{error}</p>}
      {loading && !records.length ? <p className="admin-crm__loading">Загружаем рестораны…</p> : (
        <>
          <div className="admin-menu__cards admin-restaurants__cards">{pageItems.map((record) => <RestaurantCard record={record} key={record.slug} />)}</div>
          {!pageItems.length && !error && <div className="admin-menu__empty">По выбранным условиям ресторанов нет</div>}
          {visible.length > PAGE_SIZE && <div className="admin-health__pagination" aria-label="Пагинация ресторанов">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Назад</button>
            <span>Страница {currentPage} из {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Вперёд</button>
          </div>}
        </>
      )}
    </section>
  )
}

function ExternalUrl({ href, children }) {
  if (!href) return <span className="admin-crm__muted">—</span>
  return <a href={href} target="_blank" rel="noreferrer">{children} <ExternalLink size={13} /></a>
}

function Field({ label, children }) {
  return <div className="admin-health-report__metric"><span>{label}</span><strong className="admin-restaurant-page__value">{children}</strong></div>
}

function SourcesCard({ record }) {
  const { manual, menu_source: menuSource } = record
  return (
    <section className="admin-health-report__card">
      <h2>Источники</h2>
      {record.kind === 'parser' ? (
        <ul className="admin-health-report__history">
          {record.parsers.map((parser) => (
            <li key={parser.parser_id}>
              <Clock3 size={16} />
              <div>
                <strong>Парсер {parser.freshness?.status === 'error' ? '· ошибка' : ''}</strong>
                <span>Последний прогон {formatHealthDateTime(parser.run?.finished_at)} · успех {formatHealthDateTime(parser.run?.last_success_at)} · позиций {parser.run?.item_count ?? '—'}</span>
                {parser.run?.error_message && <small>{parser.run.error_message}</small>}
                <small><ExternalUrl href={parser.run?.source_url}>Страница меню</ExternalUrl></small>
              </div>
            </li>
          ))}
          {!record.parsers.length && <li><div><strong>Парсер указан для сети, запусков ещё нет</strong></div></li>}
        </ul>
      ) : (
        <div className="admin-health-report__columns">
          <div>
            <h3>КБЖУ</h3>
            <div className="admin-health-report__metrics admin-restaurant-page__fields">
              <Field label="Тип">{KBJU_SOURCE_LABELS[manual?.source_type] || 'Не указан'}</Field>
              <Field label="Ссылка"><ExternalUrl href={manual?.source_url}>Открыть</ExternalUrl></Field>
              <Field label="Последняя проверка">{formatHealthDate(manual?.last_checked_at)}</Field>
            </div>
          </div>
          <div>
            <h3>Меню без КБЖУ</h3>
            <div className="admin-health-report__metrics admin-restaurant-page__fields">
              <Field label="Тип">{menuSource ? KBJU_SOURCE_LABELS[menuSource.source_type] || menuSource.source_type : 'Не найден'}</Field>
              <Field label="Ссылка"><ExternalUrl href={menuSource?.source_url}>Открыть</ExternalUrl></Field>
              <Field label="Проверено">{formatHealthDate(menuSource?.last_checked_at)}</Field>
              <Field label="Менялось">{formatHealthDate(menuSource?.last_changed_at)}</Field>
            </div>
          </div>
        </div>
      )}
      {manual?.notes && <div className="admin-health-report__note"><strong>Заметки</strong><p>{manual.notes}</p></div>}
    </section>
  )
}

function ConversationCard({ record }) {
  const { manual, lead } = record
  if (record.kind !== 'manual') return null
  return (
    <section className="admin-health-report__card">
      <h2>Переписка</h2>
      <div className="admin-health-report__metrics">
        <Field label="Состояние">{DM_STATE_LABELS[manual?.dm_state] || DM_STATE_LABELS.none}</Field>
        <Field label="Писали">{formatHealthDate(manual?.dm_last_sent_at)}</Field>
        <Field label="Следующий фолоу-ап">{formatHealthDate(manual?.next_followup_at)}</Field>
        <Field label="Ответ">{formatHealthDate(lead?.last_reply_at)}</Field>
      </div>
      {lead ? (
        <div className="admin-health-report__note">
          <strong>Лид: {lead.name}{lead.city ? ` · ${lead.city}` : ''}</strong>
          <p>
            {lead.instagram_url ? <ExternalUrl href={lead.instagram_url}>@{lead.instagram_handle || 'instagram'}</ExternalUrl> : 'Instagram не указан'}
            {' · '}первое сообщение {formatHealthDate(lead.dm_sent_at)}{lead.nudge_sent_at ? ` · напоминание ${formatHealthDate(lead.nudge_sent_at)}` : ''}
          </p>
          {lead.notes && <p>{lead.notes}</p>}
          <p><Link to="/admin/restaurants/collection">Открыть в «Сборе»</Link></p>
        </div>
      ) : <p className="admin-health-report__empty">Меню не привязано к лиду</p>}
    </section>
  )
}

function CatalogMissing({ slug, count }) {
  const [state, setState] = useState({ names: null, error: '' })
  useEffect(() => {
    if (!count) return undefined
    let active = true
    adminMenuRevisionsApi.menuSource(slug)
      .then((data) => active && setState({ names: data.source?.catalog_missing || [], error: '' }))
      .catch((error) => active && setState({ names: null, error: error.message || 'Не удалось загрузить список блюд' }))
    return () => { active = false }
  }, [slug, count])
  if (!count) return null
  if (state.error) return <p className="admin-health__inline-error">{state.error}</p>
  if (!state.names) return <p className="admin-crm__loading">Загружаем блюда…</p>
  return <div className="admin-health-report__note"><strong>Есть на сайте, нет в каталоге</strong><p>{state.names.join(', ')}</p></div>
}

function IssuesCard({ record }) {
  const catalogMissing = record.completeness.find((issue) => issue.code === 'catalog_missing')
  return (
    <section className="admin-health-report__card">
      <h2>Полнота и точность</h2>
      <div className="admin-health-report__columns">
        <div>
          <h3>Полнота</h3>
          {record.completeness.length ? <ul className="admin-health-report__reasons">{record.completeness.map((issue) => <li key={issue.code}><CircleAlert size={16} />{issue.label}</li>)}</ul>
            : <p className="admin-health-report__empty">Проблем не найдено</p>}
        </div>
        <div>
          <h3>Точность</h3>
          {record.accuracy.length ? <ul className="admin-health-report__reasons">{record.accuracy.map((issue) => <li key={issue.code}><CircleAlert size={16} />{issue.to ? <Link to={issue.to}>{issue.label}</Link> : issue.label}</li>)}</ul>
            : <p className="admin-health-report__empty">Проблем не найдено</p>}
        </div>
      </div>
      <CatalogMissing slug={record.slug} count={catalogMissing?.count || 0} />
    </section>
  )
}

function checkEvents(record, healthHistory) {
  const events = []
  const add = (at, title, details) => { if (at) events.push({ at, title, details }) }
  add(record.manual?.last_checked_at, 'КБЖУ проверено')
  add(record.menu_source?.last_checked_at, 'Проверен источник меню')
  add(record.menu_source?.last_changed_at, 'Меню на сайте изменилось')
  add(record.manual?.dm_last_sent_at, 'Отправлен запрос в директ')
  add(record.lead?.last_reply_at, 'Ресторан ответил')
  for (const parser of record.parsers) {
    add(parser.run?.finished_at, parser.run?.status === 'error' ? 'Прогон парсера с ошибкой' : 'Прогон парсера', parser.run?.error_message)
  }
  for (const item of healthHistory) add(item.checked_at, `Хелс-чек: ${healthStatusInfo(item.status).label}`, item.summary)
  return events.sort((left, right) => (toTime(right.at) || 0) - (toTime(left.at) || 0))
}

function HealthCard({ record, history }) {
  const { health } = record
  const reasons = [...(health?.reasons || []).map((code) => healthReasonLabel(code)), ...(health?.warnings || []).map((code) => healthReasonLabel(code, 'warning'))]
  return (
    <section className="admin-health-report__card">
      <h2>Хелс-чек</h2>
      {health ? (
        <>
          <p><span className={`admin-health__status admin-health__status--${healthStatusInfo(health.status).className}`}>{healthStatusInfo(health.status).label}</span> · {formatHealthDate(health.checked_at)}</p>
          {health.summary && <p className="admin-health-report__summary">{health.summary}</p>}
          {reasons.length > 0 && <ul className="admin-health-report__reasons">{[...new Set(reasons)].map((label) => <li key={label}><CircleAlert size={16} />{label}</li>)}</ul>}
          <p><Link to={`/admin/restaurants/publication/health/${encodeURIComponent(health.publicId)}`}>Полный отчёт</Link></p>
        </>
      ) : <p className="admin-health-report__empty">Хелс-чек это меню ещё не проверял</p>}
      {history.error && <p className="admin-health__inline-error">{history.error}</p>}
    </section>
  )
}

export function AdminRestaurantPage() {
  const { slug } = useParams()
  const { records, failed, loading, error } = useRestaurantWorkspace()
  const record = records.find((item) => item.slug === slug) || null
  const publicId = record?.health?.publicId || ''
  const [history, setHistory] = useState({ items: [], error: '' })

  useEffect(() => {
    if (!publicId) return undefined
    let active = true
    adminMenuHealthApi.get(publicId)
      .then((data) => active && setHistory({ items: data.history || [], error: '' }))
      .catch((requestError) => active && setHistory({ items: [], error: requestError.message || 'История хелс-чека недоступна' }))
    return () => { active = false }
  }, [publicId])

  const back = <Link className="admin-health-report__back" to="/admin/restaurants/all"><ArrowLeft size={16} />Назад ко всем ресторанам</Link>
  if (loading && !record) return <section className="admin-health-report">{back}<p className="admin-crm__loading">Загружаем ресторан…</p></section>
  if (!record) {
    return <section className="admin-health-report">{back}<p className="admin-menu__error" role="alert">{error || `Меню «${slug}» не найдено`}</p></section>
  }

  const events = checkEvents(record, history.items)
  return (
    <section className="admin-health-report">
      {back}
      <header className="admin-health-report__header">
        <div>
          <span className="admin-health-report__eyebrow">{KIND_LABELS[record.kind]} · {record.slug}</span>
          <h1>{record.name}</h1>
          <p>{citiesLabel(record.cities)} · <ExternalUrl href={record.public_menu_url}>Публичное меню</ExternalUrl></p>
        </div>
        <FreshnessBadge code={record.freshness} />
      </header>
      <WorkspaceWarning failed={failed} />
      <div className="admin-health-report__grid">
        <SourcesCard record={record} />
        <ConversationCard record={record} />
        <IssuesCard record={record} />
        <HealthCard record={record} history={history} />
        <section className="admin-health-report__card">
          <h2>История проверок</h2>
          {events.length ? (
            <ol className="admin-health-report__history">{events.map((event, index) => (
              <li key={`${event.at}-${index}`}><Clock3 size={16} /><div><strong>{event.title}</strong><span>{formatHealthDateTime(event.at)}</span>{event.details && <small>{event.details}</small>}</div></li>
            ))}</ol>
          ) : <p className="admin-health-report__empty">Проверок пока не было</p>}
        </section>
      </div>
    </section>
  )
}

