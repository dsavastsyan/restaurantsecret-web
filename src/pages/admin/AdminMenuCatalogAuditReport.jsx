import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, ExternalLink } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import { formatHealthDate, formatHealthDateTime } from './adminMenuHealth'
import { catalogAuditInfo, catalogAuditPath, pluralDishes, restaurantPath } from './adminRestaurants'
import { useRestaurantWorkspace } from './useRestaurantWorkspace'

function Metric({ value, label }) {
  return <div className="admin-health-report__metric"><strong>{value ?? '—'}</strong><span>{label}</span></div>
}

function DishList({ names, emptyLabel }) {
  if (!names.length) return <p className="admin-health-report__empty">{emptyLabel}</p>
  return <p>{names.join(', ')}</p>
}

function Files({ audit }) {
  const files = audit.files || []
  if (!audit.menu_url && !files.length) return <p className="admin-health-report__empty">Ссылки не записаны</p>
  return (
    <ul className="admin-health-report__history">
      {audit.menu_url && <li><ExternalLink size={16} /><div><a href={audit.menu_url} target="_blank" rel="noreferrer">Раздел меню на сайте</a></div></li>}
      {files.map((file) => (
        <li key={file.url}><ExternalLink size={16} /><div><a href={file.url} target="_blank" rel="noreferrer">{file.label || file.url}</a></div></li>
      ))}
    </ul>
  )
}

function History({ slug, items, currentId }) {
  if (items.length < 2) return <p className="admin-health-report__empty">Других сверок пока не было</p>
  return <ol className="admin-health-report__history">{items.map((item) => (
    <li key={item.id}>
      <Clock3 size={16} />
      <div>
        <strong>{item.id === currentId ? catalogAuditInfo(item.result).label : <Link to={catalogAuditPath(slug, item.id)}>{catalogAuditInfo(item.result).label}</Link>}</strong>
        <span>{formatHealthDateTime(item.audited_at)}</span>
        {item.summary && <small>{item.summary}</small>}
      </div>
    </li>
  ))}</ol>
}

export default function AdminMenuCatalogAuditReport() {
  const { slug, auditId } = useParams()
  const { records } = useRestaurantWorkspace()
  const name = records.find((item) => item.slug === slug)?.name || slug
  const [state, setState] = useState({ audit: null, history: [], loading: true, error: '' })

  useEffect(() => {
    let active = true
    setState({ audit: null, history: [], loading: true, error: '' })
    adminMenuRevisionsApi.menuCatalogAudit(auditId)
      .then((data) => active && setState({ audit: data.audit, history: data.history || [], loading: false, error: '' }))
      .catch((error) => active && setState({ audit: null, history: [], loading: false, error: error.message || 'Не удалось загрузить отчёт сверки' }))
    return () => { active = false }
  }, [auditId])

  const back = <Link className="admin-health-report__back" to={restaurantPath(slug)}><ArrowLeft size={16} />Назад к ресторану</Link>
  if (state.loading) return <section className="admin-health-report">{back}<p className="admin-crm__loading">Загружаем отчёт…</p></section>
  const { audit } = state
  if (state.error || !audit || audit.slug !== slug) {
    return <section className="admin-health-report">{back}<p className="admin-menu__error" role="alert">{state.error || 'Отчёт сверки не найден'}</p></section>
  }

  const info = catalogAuditInfo(audit.result)
  return (
    <section className="admin-health-report">
      {back}
      <header className="admin-health-report__header">
        <div>
          <span className="admin-health-report__eyebrow">Сверка меню с каталогом · {slug}</span>
          <h1>{name}</h1>
          <p>Проверено {formatHealthDate(audit.audited_at)} · меню в каталоге от {formatHealthDate(audit.catalog_captured_at)}</p>
        </div>
        <span className={`admin-health__status admin-health__status--${info.className}`}>{info.label}</span>
      </header>

      <div className="admin-health-report__grid">
        <section className="admin-health-report__card">
          <h2>Вывод</h2>
          <div className="admin-health-report__metrics">
            <Metric value={audit.catalog_dish_count} label={`${pluralDishes(audit.catalog_dish_count || 0)} в каталоге`} />
            <Metric value={audit.new_dishes.length} label="новых на сайте" />
            <Metric value={audit.missing_dishes.length} label="нет на сайте" />
          </div>
          <p className="admin-health-report__summary">{audit.summary}</p>
        </section>

        <section className="admin-health-report__card">
          <h2>Расхождения</h2>
          <div className="admin-health-report__columns">
            <div><h3>На сайте, нет в каталоге</h3><DishList names={audit.new_dishes} emptyLabel="Нет" /></div>
            <div><h3>В каталоге, нет на сайте</h3><DishList names={audit.missing_dishes} emptyLabel="Нет" /></div>
          </div>
        </section>

        <section className="admin-health-report__card">
          <h2>Что прочитано</h2>
          <Files audit={audit} />
        </section>

        <section className="admin-health-report__card">
          <h2>История сверок</h2>
          <History slug={slug} items={state.history} currentId={audit.id} />
        </section>
      </div>
    </section>
  )
}
