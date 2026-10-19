import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CircleAlert, Clock3 } from 'lucide-react'
import { adminMenuHealthApi } from '@/api/adminMenuHealth'
import {
  detailValue,
  formatHealthDate,
  formatHealthDateTime,
  healthReasonLabel,
  healthStatusInfo,
} from './adminMenuHealth'

function listValue(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null
}

function Metric({ value, label }) {
  return <div className="admin-health-report__metric"><strong>{value ?? '—'}</strong><span>{label}</span></div>
}

function ActionList({ actions, emptyLabel }) {
  if (!actions.length) return <p className="admin-health-report__empty">{emptyLabel}</p>
  return <ul className="admin-health-report__actions">{actions.map((action, index) => (
    <li key={`${action.at || 'action'}-${index}`}>
      <span className="admin-health-report__action-icon"><Check size={15} /></span>
      <div><strong>{action.text || 'Действие выполнено'}</strong><small>{formatHealthDateTime(action.at)}{action.result ? ` · ${action.result}` : ''}</small></div>
    </li>
  ))}</ul>
}

function ReasonList({ values, kind }) {
  if (!values.length) return <p className="admin-health-report__empty">Нет</p>
  return <ul className="admin-health-report__reasons">{values.map((value) => <li key={value}><CircleAlert size={16} />{healthReasonLabel(value, kind)}</li>)}</ul>
}

function History({ records }) {
  if (!records.length) return <p className="admin-health-report__empty">Пока нет предыдущих проверок.</p>
  return <ol className="admin-health-report__history">{records.map((item, index) => {
    const status = healthStatusInfo(item.status)
    return <li key={item.id || `${item.checked_at}-${index}`}>
      <Clock3 size={16} />
      <div><strong>{status.label}</strong><span>{formatHealthDateTime(item.checked_at)}</span>{item.summary && <small>{item.summary}</small>}</div>
    </li>
  })}</ol>
}

export default function AdminMenuHealthReport() {
  const { publicId } = useParams()
  const [state, setState] = useState({ record: null, history: [], loading: true, error: '' })

  useEffect(() => {
    let active = true
    setState({ record: null, history: [], loading: true, error: '' })
    adminMenuHealthApi.get(publicId)
      .then((data) => active && setState({ record: data.record, history: data.history || [], loading: false, error: '' }))
      .catch((error) => active && setState({ record: null, history: [], loading: false, error: error.message || 'Не удалось загрузить отчёт хелс-чека.' }))
    return () => { active = false }
  }, [publicId])

  if (state.loading) return <section className="admin-health-report"><p className="admin-crm__loading">Загружаем отчёт…</p></section>
  if (state.error || !state.record) {
    return <section className="admin-health-report">
      <Link className="admin-health-report__back" to="/admin/restaurants"><ArrowLeft size={16} />Назад к ресторанам</Link>
      <p className="admin-menu__error" role="alert">{state.error || 'Отчёт не найден.'}</p>
    </section>
  }

  const { record, history } = state
  const status = healthStatusInfo(record.status)
  const reasons = listValue(record.reasons)
  const warnings = listValue(record.warnings)
  const details = record.details || {}
  const nameLoss = detailValue(details, 'name_loss') || {}
  const nutrition = detailValue(details, 'zero_nutrition', 'nutrition', 'nutrition_zero') || {}
  const nameLossExamples = listValue(nameLoss.examples)
  const actions = listValue(record.actions)
  const automaticActions = actions.filter((action) => ['ok', 'success', 'fixed', 'done'].includes(String(action.result || '').toLowerCase()))
  const waitingActions = actions.filter((action) => !automaticActions.includes(action))
  const lostNames = numberValue(nameLoss.lost)
  const lostTotal = numberValue(nameLoss.total_prod)
  const nutritionCount = numberValue(nutrition.count ?? nutrition.zero ?? nutrition.lost)
  const nutritionTotal = numberValue(nutrition.total ?? nutrition.dishes)

  return (
    <section className="admin-health-report">
      <Link className="admin-health-report__back" to="/admin/restaurants"><ArrowLeft size={16} />Назад к ресторанам</Link>
      <header className="admin-health-report__header">
        <div><span className="admin-health-report__eyebrow">Отчёт проверки меню</span><h1>{record.restaurant_name || 'Ресторан без названия'}</h1><p>{record.city || 'Город не указан'} · Проверено {formatHealthDate(record.checked_at)}</p></div>
        <span className={`admin-health__status admin-health__status--${status.className}`}>{status.label}</span>
      </header>

      <div className="admin-health-report__grid">
        <section className="admin-health-report__card">
          <h2>Причины и предупреждения</h2>
          <div className="admin-health-report__columns">
            <div><h3>Нужно решить</h3><ReasonList values={reasons} kind="reason" /></div>
            <div><h3>Предупреждения</h3><ReasonList values={warnings} kind="warning" /></div>
          </div>
        </section>

        <section className="admin-health-report__card">
          <h2>Что показала проверка</h2>
          <div className="admin-health-report__metrics">
            <Metric value={record.production_dish_count} label="блюд в проде" />
            <Metric value={record.staging_dish_count} label="блюд в staging" />
            <Metric value={lostTotal === null ? '—' : `${lostNames ?? 0} / ${lostTotal}`} label="названий потеряно" />
            <Metric value={nutritionCount === null ? (reasons.includes('zero_nutrition') ? 'Есть' : '—') : `${nutritionCount}${nutritionTotal === null ? '' : ` / ${nutritionTotal}`}`} label="нулевое КБЖУ" />
          </div>
          {nameLossExamples.length > 0 && <div className="admin-health-report__note"><strong>Примеры потерянных названий</strong><p>{nameLossExamples.join(', ')}</p></div>}
          {record.summary && <p className="admin-health-report__summary">{record.summary}</p>}
        </section>

        <section className="admin-health-report__card">
          <h2>Что починено автоматически / что ждёт вас</h2>
          <div className="admin-health-report__columns">
            <div><h3>Починено автоматически</h3><ActionList actions={automaticActions} emptyLabel="Пока ничего" /></div>
            <div><h3>Ждёт вас</h3><ActionList actions={waitingActions} emptyLabel="Пока ничего" /></div>
          </div>
        </section>

        <section className="admin-health-report__card">
          <h2>История проверок</h2>
          <History records={history} />
        </section>
      </div>
    </section>
  )
}
