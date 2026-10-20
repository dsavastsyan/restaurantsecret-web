import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Search } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import { adminMenuHealthApi } from '@/api/adminMenuHealth'
import {
  HEALTH_STATUS,
  buildHealthIndex,
  findHealthRecord,
  formatHealthDate,
  healthStatusInfo,
  truncateHealthSummary,
} from './adminMenuHealth'
import {
  DM_STATE_LABELS,
  FRESHNESS,
  KBJU_SOURCE_LABELS,
  MANUAL_FRESHNESS_FILTERS,
  manualFreshness,
  orderWithLeadGroups,
  restaurantPath,
  toTime,
} from './adminRestaurants'
import { invalidateRestaurantWorkspace } from './useRestaurantWorkspace'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date)
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function HealthCell({ restaurant, healthIndex, loading, error }) {
  const health = findHealthRecord(restaurant, healthIndex)
  if (!health && loading) {
    return <td className="admin-health-cell" data-label="Хелс-чек"><span className="admin-crm__muted">Загружаем…</span></td>
  }
  if (!health && error) {
    return <td className="admin-health-cell" data-label="Хелс-чек"><span className="admin-crm__muted">Не удалось загрузить</span></td>
  }
  if (!health) {
    return <td className="admin-health-cell" data-label="Хелс-чек"><span className="admin-crm__muted">Не проверялось</span></td>
  }
  const status = healthStatusInfo(health.status)
  return (
    <td className="admin-health-cell" data-label="Хелс-чек">
      <span className={`admin-health__status admin-health__status--${status.className}`} aria-label={`Статус хелс-чека: ${status.label}`}>{status.label}</span>
      <span className="admin-health__summary" title={health.summary || undefined}>{truncateHealthSummary(health.summary) || 'Без комментария'}</span>
      <small>{formatHealthDate(health.checked_at)}</small>
      <Link to={`/admin/restaurants/publication/health/${encodeURIComponent(health.publicId)}`} aria-label={`Подробнее о хелс-чеке ${health.restaurant_name || restaurant.name}`}>Подробнее</Link>
      {error && <span className="admin-health__inline-error">Обновление недоступно</span>}
    </td>
  )
}

function useHealthRecords(tab) {
  const [state, setState] = useState({ records: [], loading: true, error: '' })

  useEffect(() => {
    let active = true
    setState({ records: [], loading: true, error: '' })
    adminMenuHealthApi.list({ tab, limit: 200 })
      .then((data) => active && setState({ records: data.items || [], loading: false, error: '' }))
      .catch((requestError) => active && setState({ records: [], loading: false, error: requestError.message || 'Не удалось загрузить результаты хелс-чека.' }))
    return () => { active = false }
  }, [tab])

  return state
}

function PendingMenuHealthDashboard({ records, loading, error }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 25

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')
    return records.filter((record) => {
      if (status && record.status !== status) return false
      if (!normalizedQuery) return true
      return `${record.restaurant_name || ''} ${record.city || ''}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery)
    })
  }, [records, query, status])

  useEffect(() => setPage(1), [query, status])

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize)
  const currentPage = Math.min(page, pageCount)
  const healthIndex = useMemo(() => buildHealthIndex(records), [records])

  if (loading) return <p className="admin-crm__loading">Загружаем рестораны, которые ждут промоушена…</p>
  if (error) return <p className="admin-menu__error" role="alert">{error}</p>
  return (
    <>
      <div className="admin-crm__filters">
        <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ресторан или город" /></label>
        <select aria-label="Статус хелс-чека" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(HEALTH_STATUS).map(([value, info]) => <option value={value} key={value}>{info.label}</option>)}
        </select>
      </div>
      <div className="admin-crm__table-wrap admin-health__table-wrap">
        <table className="admin-crm__table admin-health__table">
          <thead><tr><th>Ресторан</th><th>Город</th><th>Хелс-чек</th></tr></thead>
          <tbody>{pageItems.map((record) => (
            <tr key={record.publicId}>
              <td><strong>{record.restaurant_name || 'Без названия'}</strong></td>
              <td>{record.city || <span className="admin-crm__muted">Город не указан</span>}</td>
              <HealthCell restaurant={record} healthIndex={healthIndex} loading={false} error={false} />
            </tr>
          ))}</tbody>
        </table>
        {!pageItems.length && <div className="admin-menu__empty">Ресторанов по выбранным условиям нет.</div>}
      </div>
      {visible.length > 0 && <div className="admin-health__pagination" aria-label="Пагинация ресторанов, ожидающих промоушен">
        <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</button>
        <span>Страница {currentPage} из {pageCount}</span>
        <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Вперёд</button>
      </div>}
    </>
  )
}

const PARSER_STATUS = {
  error: 'Ошибка',
  waiting: 'Ждёт прогона',
  current: 'Актуально',
  disabled: 'Отключён',
}

const PARSER_STATUS_PRIORITY = { error: 0, waiting: 1, current: 2, disabled: 3 }

// The API computes freshness; the fallback keeps the page usable against an older backend
function parserFreshnessStatus(parser) {
  if (parser.freshness?.status) return parser.freshness.status
  if (!parser.enabled) return 'disabled'
  if (!parser.run) return 'waiting'
  return parser.run.status === 'error' ? 'error' : 'current'
}

function formatDaysWithoutUpdate(parser) {
  const days = parser.freshness?.days_since_success
  if (days === null || days === undefined) return parser.freshness ? 'Ни разу' : '—'
  if (days === 0) return 'Сегодня'
  return `${days} дн.`
}

function statusWithSource(lastCheckedAt, staleAfterDays) {
  const checkedAt = lastCheckedAt ? Date.parse(lastCheckedAt) : Number.NaN
  if (Number.isNaN(checkedAt)) return 'needs_check'
  return Date.now() - checkedAt >= staleAfterDays * 86400000 ? 'needs_check' : 'current'
}

function MenuSourceCell({ source }) {
  if (!source) return <td data-label="Источник меню"><span className="admin-crm__muted">Не найден</span></td>
  return (
    <td data-label="Источник меню">
      {KBJU_SOURCE_LABELS[source.source_type] || source.source_type}
      {source.source_url && <> <a href={source.source_url} target="_blank" rel="noreferrer" aria-label="Открыть источник меню"><ExternalLink size={13} /></a></>}
      <small>Проверено {formatDate(source.last_checked_at)} · менялось {formatDate(source.last_changed_at)}</small>
    </td>
  )
}

function DmCell({ restaurant, lead }) {
  const state = restaurant.dm_state || 'none'
  return (
    <td data-label="Директ">
      <span>{DM_STATE_LABELS[state] || state}</span>
      {restaurant.dm_last_sent_at && <small>Писали {formatDate(restaurant.dm_last_sent_at)}</small>}
      {restaurant.next_followup_at && <small>Фолоу-ап {formatDate(restaurant.next_followup_at)}</small>}
      {lead && <small>Лид: {lead.name}</small>}
    </td>
  )
}

function ManualMenuRow({ restaurant, menuSource, lead, staleAfterDays, onChanged, healthIndex, healthLoading, healthError }) {
  const [sourceType, setSourceType] = useState(restaurant.source_type || '')
  const [sourceUrl, setSourceUrl] = useState(restaurant.source_url || '')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const freshness = manualFreshness(restaurant, menuSource)

  const saveSource = async () => {
    setBusy('source')
    setMessage('')
    try {
      const result = await adminMenuRevisionsApi.updateManualMenuSource(restaurant.slug, {
        source_type: sourceType,
        source_url: sourceUrl,
      })
      onChanged({
        source_type: result.source_type || sourceType,
        source_url: result.source_url || sourceUrl,
        status: statusWithSource(restaurant.last_checked_at, staleAfterDays),
      })
      setMessage('Источник сохранён')
    } catch (requestError) {
      setMessage(requestError.message || 'Не удалось сохранить источник')
    } finally {
      setBusy('')
    }
  }

  const confirm = async () => {
    setBusy('confirm')
    setMessage('')
    try {
      const result = await adminMenuRevisionsApi.confirmManualMenu(restaurant.slug)
      onChanged({ last_checked_at: result.last_checked_at, status: 'current', kbju_stale: false })
    } catch (requestError) {
      setMessage(requestError.message || 'Не удалось подтвердить актуальность')
    } finally {
      setBusy('')
    }
  }

  return (
    <tr>
      <td><Link to={restaurantPath(restaurant.slug)}><strong>{restaurant.name}</strong></Link><small>{restaurant.cities.join(', ') || 'Город не указан'}</small></td>
      <td data-label="Источник КБЖУ">
        <div className="admin-manual-menu__source">
          <select aria-label={`Источник КБЖУ ${restaurant.name}`} value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            <option value="">Выберите источник</option>
            {Object.entries(KBJU_SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <div>
            <input aria-label={`Ссылка на КБЖУ ${restaurant.name}`} type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" />
            {restaurant.source_url && <a href={restaurant.source_url} target="_blank" rel="noreferrer" aria-label={`Открыть источник КБЖУ ${restaurant.name}`}><ExternalLink size={16} /></a>}
          </div>
          <button type="button" disabled={busy !== '' || !sourceType || !sourceUrl.trim()} onClick={saveSource}>{busy === 'source' ? 'Сохраняем…' : 'Сохранить'}</button>
          {message && <small role="status">{message}</small>}
        </div>
      </td>
      <MenuSourceCell source={menuSource} />
      <HealthCell restaurant={restaurant} healthIndex={healthIndex} loading={healthLoading} error={healthError} />
      <td data-label="Последняя проверка">{formatDate(restaurant.last_checked_at)}</td>
      <DmCell restaurant={restaurant} lead={lead} />
      <td data-label="Статус"><span className={`admin-manual-menu__status admin-manual-menu__status--${FRESHNESS[freshness].tone}`}>{FRESHNESS[freshness].label}</span></td>
      <td data-label="Действие"><button className="admin-crm__primary" type="button" disabled={busy !== ''} onClick={confirm}>{busy === 'confirm' ? 'Подтверждаем…' : 'Подтвердить актуальность'}</button></td>
    </tr>
  )
}

function useOptionalList(load) {
  const [items, setItems] = useState([])
  useEffect(() => {
    let active = true
    load().then((data) => active && setItems(data)).catch(() => active && setItems([]))
    return () => { active = false }
  }, [load])
  return items
}

const loadMenuSources = () => adminMenuRevisionsApi.menuSources().then((data) => data.sources || [])
const loadLeads = () => adminMenuRevisionsApi.kbjuLeads().then((data) => data.leads || [])

function sourceTypeMatches(filter, type) {
  if (!filter) return true
  if (filter === 'none') return !type
  return type === filter
}

function compareCheckedAt(order) {
  return (left, right) => {
    const leftTime = toTime(left.last_checked_at)
    const rightTime = toTime(right.last_checked_at)
    const leftMissing = Number.isNaN(leftTime)
    const rightMissing = Number.isNaN(rightTime)
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1
    if (leftMissing) return left.name.localeCompare(right.name, 'ru')
    return order === 'desc' ? rightTime - leftTime : leftTime - rightTime
  }
}

function ManualMenuDashboard({ healthIndex, healthLoading, healthError }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [kbjuType, setKbjuType] = useState('')
  const [menuType, setMenuType] = useState('')
  const [checkedAtOrder, setCheckedAtOrder] = useState(null)
  const [staleAfterDays, setStaleAfterDays] = useState(90)
  const menuSources = useOptionalList(loadMenuSources)
  const leads = useOptionalList(loadLeads)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    adminMenuRevisionsApi.manualMenus()
      .then((data) => {
        if (!active) return
        setItems(data.restaurants || [])
        setStaleAfterDays(data.stale_after_days || 90)
      })
      .catch((requestError) => active && setError(requestError.message || 'Не удалось загрузить ручные меню'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const sourceBySlug = useMemo(() => new Map(menuSources.map((source) => [source.slug, source])), [menuSources])
  const leadById = useMemo(() => new Map(leads.map((lead) => [Number(lead.id), lead])), [leads])

  const updateItem = (slug, patch) => {
    invalidateRestaurantWorkspace()
    setItems((current) => current.map((item) => item.slug === slug ? { ...item, ...patch } : item))
  }

  const groups = useMemo(() => {
    const filtered = items.filter((restaurant) => {
      const menuSource = sourceBySlug.get(restaurant.slug)
      if (status && manualFreshness(restaurant, menuSource) !== status) return false
      if (!sourceTypeMatches(kbjuType, restaurant.source_type)) return false
      if (!sourceTypeMatches(menuType, menuSource?.source_type)) return false
      return `${restaurant.name} ${restaurant.slug} ${restaurant.cities.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
    })
    const compare = checkedAtOrder
      ? compareCheckedAt(checkedAtOrder)
      : (left, right) => FRESHNESS[manualFreshness(left, sourceBySlug.get(left.slug))].priority
        - FRESHNESS[manualFreshness(right, sourceBySlug.get(right.slug))].priority
        || left.name.localeCompare(right.name, 'ru')
    return orderWithLeadGroups(filtered, compare)
  }, [items, query, status, kbjuType, menuType, checkedAtOrder, sourceBySlug])

  if (loading) return <p className="admin-crm__loading">Загружаем ручные меню…</p>
  if (error) return <p className="admin-menu__error" role="alert">{error}</p>
  return (
    <>
      <div className="admin-crm__filters">
        <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ресторан" /></label>
        <select aria-label="Статус актуальности" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Все статусы</option>
          {MANUAL_FRESHNESS_FILTERS.map((value) => <option value={value} key={value}>{FRESHNESS[value].label}</option>)}
        </select>
        <select aria-label="Тип источника КБЖУ" value={kbjuType} onChange={(event) => setKbjuType(event.target.value)}>
          <option value="">Любой источник КБЖУ</option>
          {Object.entries(KBJU_SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>КБЖУ: {label}</option>)}
          <option value="none">КБЖУ: не указан</option>
        </select>
        <select aria-label="Тип источника меню" value={menuType} onChange={(event) => setMenuType(event.target.value)}>
          <option value="">Любой источник меню</option>
          {Object.entries(KBJU_SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>Меню: {label}</option>)}
          <option value="none">Меню: не найден</option>
        </select>
      </div>
      <div className="admin-crm__table-wrap admin-manual-menu__table-wrap">
        <table className="admin-crm__table admin-manual-menu__table admin-restaurants__table admin-restaurants__table--manual">
          <thead><tr><th>Ресторан</th><th>Источник КБЖУ</th><th>Источник меню</th><th>Хелс-чек</th><th aria-sort={checkedAtOrder === 'desc' ? 'descending' : checkedAtOrder === 'asc' ? 'ascending' : 'none'}><button className="admin-crm__sort" type="button" onClick={() => setCheckedAtOrder((current) => current === 'desc' ? 'asc' : 'desc')}>Последняя проверка <span aria-hidden="true">{checkedAtOrder === 'asc' ? '↑' : '↓'}</span></button></th><th>Директ</th><th>Статус</th><th /></tr></thead>
          {groups.map((group) => {
            const lead = group.lead_id == null ? null : leadById.get(Number(group.lead_id))
            return (
              <tbody key={group.key} className={group.items.length > 1 ? 'admin-restaurants__group' : undefined}>
                {group.items.length > 1 && <tr className="admin-restaurants__group-title"><td colSpan={8}>{lead?.name || 'Одна переписка'} · {group.items.length} меню</td></tr>}
                {group.items.map((restaurant) => (
                  <ManualMenuRow
                    restaurant={restaurant}
                    menuSource={sourceBySlug.get(restaurant.slug) || null}
                    lead={lead}
                    staleAfterDays={staleAfterDays}
                    onChanged={(patch) => updateItem(restaurant.slug, patch)}
                    healthIndex={healthIndex}
                    healthLoading={healthLoading}
                    healthError={healthError}
                    key={restaurant.slug}
                  />
                ))}
              </tbody>
            )
          })}
        </table>
        {!groups.length && <div className="admin-menu__empty">По выбранным условиям ресторанов нет</div>}
      </div>
    </>
  )
}

function MenuMaintenanceSection({ eyebrow, title, description, children }) {
  return (
    <section className="admin-crm">
      <div className="admin-menu__title admin-crm__title">
        <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      </div>
      {children}
    </section>
  )
}

export function AdminRestaurantManual() {
  const productionHealth = useHealthRecords('production')
  const productionHealthIndex = useMemo(() => buildHealthIndex(productionHealth.records), [productionHealth.records])
  return (
    <MenuMaintenanceSection eyebrow="Актуальность" title="Ручное обновление" description="Контроль актуальности ручных меню">
      {productionHealth.error && <p className="admin-health__error" role="alert">{productionHealth.error}</p>}
      <ManualMenuDashboard healthIndex={productionHealthIndex} healthLoading={productionHealth.loading} healthError={!!productionHealth.error} />
    </MenuMaintenanceSection>
  )
}

export function AdminRestaurantAuto() {
  const productionHealth = useHealthRecords('production')
  const productionHealthIndex = useMemo(() => buildHealthIndex(productionHealth.records), [productionHealth.records])
  return (
    <MenuMaintenanceSection eyebrow="Актуальность" title="Автоматическое обновление" description="Статусы парсеров и результаты последних запусков">
      {productionHealth.error && <p className="admin-health__error" role="alert">{productionHealth.error}</p>}
      <ParserDashboard healthIndex={productionHealthIndex} healthLoading={productionHealth.loading} healthError={!!productionHealth.error} />
    </MenuMaintenanceSection>
  )
}

export function AdminRestaurantPublication() {
  const pendingHealth = useHealthRecords('pending')
  return (
    <MenuMaintenanceSection eyebrow="Публикация" title={`Ждут промоушена (${pendingHealth.loading ? '…' : pendingHealth.records.length})`} description="Меню, ожидающие публикации">
      <PendingMenuHealthDashboard records={pendingHealth.records} loading={pendingHealth.loading} error={pendingHealth.error} />
    </MenuMaintenanceSection>
  )
}

function ParserDashboard({ healthIndex, healthLoading, healthError }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    adminMenuRevisionsApi.parserRuns()
      .then((data) => active && setItems(data.parsers || []))
      .catch((requestError) => active && setError(requestError.message || 'Не удалось загрузить статусы парсеров.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const visible = useMemo(() => items
    .filter((parser) => {
      if (status && parserFreshnessStatus(parser) !== status) return false
      return `${parser.restaurant_name} ${parser.cities.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
    })
    .sort((left, right) => PARSER_STATUS_PRIORITY[parserFreshnessStatus(left)] - PARSER_STATUS_PRIORITY[parserFreshnessStatus(right)]
      || (right.freshness?.days_since_success ?? Infinity) - (left.freshness?.days_since_success ?? Infinity)
      || left.restaurant_name.localeCompare(right.restaurant_name, 'ru')), [items, query, status])

  if (loading) return <p className="admin-crm__loading">Загружаем статусы парсеров…</p>
  if (error) return <p className="admin-menu__error" role="alert">{error}</p>
  return (
    <>
      <div className="admin-crm__filters">
        <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ресторан или город" /></label>
        <select aria-label="Статус парсера" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(PARSER_STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </div>
      <div className="admin-crm__table-wrap admin-parser__table-wrap">
        <table className="admin-crm__table admin-parser__table">
          <thead><tr><th>Ресторан</th><th>Хелс-чек</th><th>Статус</th><th>Без обновления</th><th>Последняя проверка</th><th>Последний успех</th><th>Меню опубликовано</th><th>Позиций</th><th>Источник</th></tr></thead>
          <tbody>{visible.map((parser) => {
            const parserStatus = parserFreshnessStatus(parser)
            return (
              <tr key={parser.parser_id}>
                <td>{parser.restaurant_slug ? <Link to={restaurantPath(parser.restaurant_slug)}><strong>{parser.restaurant_name}</strong></Link> : <strong>{parser.restaurant_name}</strong>}{parser.cities.length > 0 && <small>{parser.cities.join(', ')}</small>}</td>
                <HealthCell restaurant={{ ...parser, name: parser.restaurant_name }} healthIndex={healthIndex} loading={healthLoading} error={healthError} />
                <td>
                  <span className={`admin-parser__status admin-parser__status--${parserStatus}`}>{PARSER_STATUS[parserStatus]}</span>
                  {parserStatus === 'error' && parser.run && (
                    <details className="admin-parser__error"><summary>Что случилось</summary>
                      <strong>{parser.run.error_message || `Парсер завершился с кодом ${parser.run.exit_code}`}</strong>
                      {parser.run.log_excerpt && <pre>{parser.run.log_excerpt}</pre>}
                      {parser.run.github_run_url && <a href={parser.run.github_run_url} target="_blank" rel="noreferrer">Полный запуск <ExternalLink size={13} /></a>}
                    </details>
                  )}
                </td>
                <td>{formatDaysWithoutUpdate(parser)}</td>
                <td>{formatDateTime(parser.run?.finished_at)}</td>
                <td>{formatDateTime(parser.run?.last_success_at)}</td>
                <td>{parser.published_at && parser.public_menu_url
                  ? <a href={parser.public_menu_url} target="_blank" rel="noreferrer">{formatDateTime(parser.published_at)} <ExternalLink size={13} /></a>
                  : formatDateTime(parser.published_at)}</td>
                <td>{parser.run?.item_count ?? '—'}</td>
                <td>{parser.run?.source_url ? <a href={parser.run.source_url} target="_blank" rel="noreferrer">Открыть <ExternalLink size={13} /></a> : <span className="admin-crm__muted">—</span>}</td>
              </tr>
            )
          })}</tbody>
        </table>
        {!visible.length && <div className="admin-menu__empty">По выбранным условиям парсеров нет.</div>}
      </div>
    </>
  )
}
