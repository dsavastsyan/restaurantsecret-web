import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, ExternalLink, Search } from 'lucide-react'
import { healthStatusInfo } from './adminMenuHealth'
import {
  COMPLETENESS,
  KBJU_SOURCE_LABELS,
  matchesQuery,
  orderWithLeadGroups,
  restaurantPath,
} from './adminRestaurants'
import { useRestaurantWorkspace } from './useRestaurantWorkspace'

const ISSUE_ORDER = Object.keys(COMPLETENESS)

function SourceCell({ type, url, label }) {
  if (!type && !url) return <td data-label={label}><span className="admin-crm__muted">Не найден</span></td>
  return (
    <td data-label={label}>
      {KBJU_SOURCE_LABELS[type] || type || '—'}
      {url && <small><a href={url} target="_blank" rel="noreferrer">Открыть <ExternalLink size={13} /></a></small>}
    </td>
  )
}

export default function AdminRestaurantCompleteness() {
  const { records, failed, loading, error } = useRestaurantWorkspace()
  const [query, setQuery] = useState('')
  const [issue, setIssue] = useState('')

  const withIssues = useMemo(() => records.filter((record) => record.completeness.length), [records])
  const counts = useMemo(() => {
    const result = Object.fromEntries(ISSUE_ORDER.map((code) => [code, 0]))
    for (const record of withIssues) for (const item of record.completeness) result[item.code] += 1
    return result
  }, [withIssues])

  const groups = useMemo(() => {
    const visible = withIssues
      .filter((record) => (!issue || record.completeness.some((item) => item.code === issue)) && matchesQuery(record, query))
      .map((record) => ({ ...record, lead_id: record.manual?.lead_id ?? null }))
    return orderWithLeadGroups(visible, (left, right) => right.completeness.length - left.completeness.length
      || left.name.localeCompare(right.name, 'ru'))
  }, [withIssues, issue, query])

  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <section className="admin-crm">
      <div className="admin-menu__title admin-crm__title">
        <div><span>Качество данных</span><h1>Полнота</h1><p>Чего не хватает меню: источников, блюд с сайта, атрибутов ресторана. Мало блюд, точка и кухня — по последнему хелс-чеку</p></div>
        <div><strong>{loading ? '…' : total}</strong></div>
      </div>
      <div className="admin-crm__filters">
        <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ресторан, slug или город" /></label>
        <select aria-label="Проблема полноты" value={issue} onChange={(event) => setIssue(event.target.value)}>
          <option value="">Все проблемы</option>
          {ISSUE_ORDER.map((code) => <option value={code} key={code}>{COMPLETENESS[code]} ({counts[code]})</option>)}
        </select>
      </div>
      {failed.length > 0 && <p className="admin-health__error" role="alert">Не загрузилось: {failed.join(', ')}. Остальные данные показаны</p>}
      {error && <p className="admin-menu__error" role="alert">{error}</p>}
      {loading && !records.length ? <p className="admin-crm__loading">Загружаем рестораны…</p> : (
        <div className="admin-crm__table-wrap admin-manual-menu__table-wrap">
          <table className="admin-crm__table admin-manual-menu__table admin-restaurants__table">
            <thead><tr><th>Ресторан</th><th>Чего не хватает</th><th>Что проверено</th><th>Источник КБЖУ</th><th>Источник меню</th><th>Хелс-чек</th></tr></thead>
            {groups.map((group) => (
              <tbody key={group.key} className={group.items.length > 1 ? 'admin-restaurants__group' : undefined}>
                {group.items.length > 1 && (
                  <tr className="admin-restaurants__group-title"><td colSpan={6}>{group.items[0].lead?.name || 'Одна переписка'} · {group.items.length} меню</td></tr>
                )}
                {group.items.map((record) => (
                  <tr key={record.slug}>
                    <td><Link to={restaurantPath(record.slug)}><strong>{record.name}</strong></Link><small>{record.cities.join(', ') || 'Город не указан'}</small></td>
                    <td data-label="Чего не хватает">
                      {record.completeness.map((item) => <span className="admin-crm__warning" key={item.code}><CircleAlert size={13} />{item.label}</span>)}
                    </td>
                    <td data-label="Что проверено">{record.manual?.notes || <span className="admin-crm__muted">—</span>}</td>
                    <SourceCell label="Источник КБЖУ" type={record.manual?.source_type} url={record.manual?.source_url} />
                    {record.kind === 'parser'
                      ? <td data-label="Источник меню">Парсер</td>
                      : <SourceCell label="Источник меню" type={record.menu_source?.source_type} url={record.menu_source?.source_url} />}
                    <td data-label="Хелс-чек">{record.health ? healthStatusInfo(record.health.status).label : <span className="admin-crm__muted">Не проверялось</span>}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          {!total && !error && <div className="admin-menu__empty">По выбранным условиям проблем полноты нет</div>}
        </div>
      )}
    </section>
  )
}
