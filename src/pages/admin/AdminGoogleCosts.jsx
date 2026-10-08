import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import {
  formatGoogleDate,
  formatGoogleDateTime,
  formatGoogleDays,
  formatGoogleMoney,
  formatGoogleMonth,
  formatGoogleNumber,
  formatGooglePercent,
} from './googleCostsFormatters'
import './google-costs.css'

const SETTING_FIELDS = [
  { key: 'credit_baseline_gbp', label: 'Базовая сумма кредита', type: 'number', step: '0.01' },
  { key: 'baseline_date', label: 'Дата начала', type: 'date' },
  { key: 'credit_expires', label: 'Сгорает', type: 'date' },
  { key: 'fx_usd_gbp', label: 'Курс USD → GBP', type: 'number', step: '0.0001' },
  { key: 'vertex_block_gbp', label: 'Блок Vertex, £', type: 'number', step: '0.01' },
]

const EVENT_LABELS = {
  cycle_start: 'начат платный цикл',
  counter_mismatch: 'расхождение со счётом',
  summary: 'сводка',
}

const DELIVERY_LABELS = {
  sent: 'отправлено',
  skipped: 'не настроен Telegram',
  suppressed: 'сжато',
  failed: 'ошибка',
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function previousMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return date.toISOString().slice(0, 7)
}

function nextMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber, 1))
  return date.toISOString().slice(0, 7)
}

function clampProgress(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function normalizeSettings(settings = {}) {
  return SETTING_FIELDS.reduce((result, field) => ({
    ...result,
    [field.key]: settings[field.key] ?? '',
  }), {})
}

function errorMessage(error) {
  if (error?.code === 'google_costs_unavailable') return 'google_costs_unavailable'
  return error?.message || 'Не удалось загрузить расходы Google'
}

function sourceLabel(source) {
  return source === 'billing' ? 'по счёту Google' : 'оценка по счётчикам'
}

function tierLabel(tier) {
  if (!tier) return 'тариф не определён'
  if (tier.input_gbp_per_1m_tokens !== undefined) {
    return `${formatGoogleMoney(tier.input_gbp_per_1m_tokens)} / ${formatGoogleMoney(tier.output_gbp_per_1m_tokens)} за 1M токенов`
  }
  return `${formatGoogleMoney(tier.price_gbp_per_1000)} за 1 000`
}

function cycleLabel(cycle) {
  const value = Number(cycle || 0)
  return value === 0 ? 'бесплатный' : `платный цикл ${formatGoogleNumber(value)}`
}

function eventLabel(alert) {
  if (EVENT_LABELS[alert.kind]) return EVENT_LABELS[alert.kind]
  if (alert.kind === 'usage_pct') return `порог ${formatGoogleNumber(alert.threshold)}%`
  if (alert.kind === 'credit_pct') return `кредит ${formatGoogleNumber(alert.threshold)}%`
  if (alert.kind === 'credit_days') return `до сгорания ${formatGoogleNumber(alert.threshold)} дн.`
  return alert.kind || 'событие'
}

function CreditCard({ credit }) {
  if (!credit) return null
  const baseline = Number(credit.baseline_gbp || 0)
  const used = Number(credit.used_gbp || 0)
  const spentProgress = baseline > 0 ? clampProgress(used / baseline) : 0
  const days = Number(credit.days_to_expiry)
  const spentState = spentProgress >= 0.9 ? 'is-danger' : spentProgress >= 0.75 ? 'is-warning' : ''
  const expiryState = days <= 7 ? 'is-danger' : days <= 14 ? 'is-warning' : ''
  const source = credit.source || credit.credit_source

  return (
    <section className={`google-costs__card google-costs__credit ${spentState} ${expiryState}`} aria-labelledby="google-costs-credit-title">
      <div className="google-costs__credit-main">
        <p className="google-costs__eyebrow">Триал-кредит</p>
        <h2 id="google-costs-credit-title">{formatGoogleMoney(credit.remaining_gbp)}</h2>
        <span className="google-costs__badge">{sourceLabel(source)}</span>
      </div>
      <div className="google-costs__credit-details">
        <div className="google-costs__progress-copy">
          <strong>Потрачено {formatGoogleMoney(used)} из {formatGoogleMoney(baseline)}</strong>
          <span>{formatGooglePercent(spentProgress)}</span>
        </div>
        <progress value={spentProgress} max="1" aria-label={`Потрачено ${formatGooglePercent(spentProgress)} кредита`} />
        <div className="google-costs__credit-expiry">
          <strong className={expiryState}>осталось {formatGoogleDays(days)}</strong>
          <span>Сгорает {formatGoogleDate(credit.expires || '')}</span>
        </div>
        {spentState === 'is-danger' && <p className="google-costs__warning">Потрачено 90% или больше кредита</p>}
        {spentState === 'is-warning' && <p className="google-costs__warning">Потрачено 75% или больше кредита</p>}
        {expiryState === 'is-danger' && <p className="google-costs__warning">До сгорания осталось 7 дней или меньше</p>}
        {expiryState === 'is-warning' && <p className="google-costs__warning">До сгорания осталось 14 дней или меньше</p>}
      </div>
    </section>
  )
}

function Totals({ report }) {
  const billing = report.billing
  return (
    <section aria-labelledby="google-costs-totals-title">
      <h2 className="google-costs__section-title" id="google-costs-totals-title">Итоги месяца</h2>
      <div className="google-costs__totals">
        <article className="google-costs__metric">
          <span>Потрачено по счётчикам (оценка)</span>
          <strong>{formatGoogleMoney(report.total_estimated_cost_gbp)}</strong>
        </article>
        {billing?.available && (
          <article className="google-costs__metric">
            <span>По счёту Google</span>
            <strong>{formatGoogleMoney(billing.total_cost)}</strong>
          </article>
        )}
        {report.forecast_cost_gbp !== null && report.forecast_cost_gbp !== undefined && (
          <article className="google-costs__metric">
            <span>Прогноз на конец месяца</span>
            <strong>{formatGoogleMoney(report.forecast_cost_gbp)}</strong>
          </article>
        )}
      </div>
    </section>
  )
}

function CycleProgress({ sku }) {
  const percent = clampProgress(sku.pct_in_cycle)
  return (
    <div className="google-costs__cycle-progress">
      <div className="google-costs__cycle-copy">
        <span>{formatGoogleNumber(sku.used)} / {formatGoogleNumber(sku.free_cap)}</span>
        <strong>{formatGooglePercent(percent)}</strong>
      </div>
      <div className="google-costs__progress-wrap">
        <progress value={percent} max="1" aria-label={`${sku.label}: использовано ${formatGooglePercent(percent)} цикла`} />
        <div className="google-costs__thresholds" aria-hidden="true">
          {[50, 75, 90, 99].map((threshold) => <span key={threshold} style={{ left: `${threshold}%` }}>{threshold}</span>)}
        </div>
      </div>
    </div>
  )
}

function SkuDetails({ sku }) {
  return (
    <>
      <div className="google-costs__sku-title">
        <strong>{sku.label}</strong>
        <span>{sku.service}</span>
      </div>
      <CycleProgress sku={sku} />
      <div><span className="google-costs__mobile-label">Осталось бесплатных</span>{formatGoogleNumber(sku.free_remaining)}</div>
      <div><span className="google-costs__mobile-label">Текущий тариф</span>{tierLabel(sku.current_tier)}</div>
      <div><span className="google-costs__mobile-label">Цикл</span>{cycleLabel(sku.cycle)}</div>
      <div className="google-costs__sku-cost">
        <span className="google-costs__mobile-label">Оценка</span>
        {sku.approximate && <span className="google-costs__approximate" title="цена ориентировочная, сверяется по счёту Google" aria-label="цена ориентировочная, сверяется по счёту Google">≈</span>}
        {formatGoogleMoney(sku.estimated_cost_gbp)}
      </div>
    </>
  )
}

function SkuName({ sku }) {
  return <div className="google-costs__sku-title"><strong>{sku.label}</strong><span>{sku.service}</span></div>
}

function SkuTable({ skus }) {
  if (!skus.length) return <p className="google-costs__empty">За этот месяц данных нет</p>
  return (
    <>
      <div className="google-costs__table-wrap google-costs__sku-table-wrap">
        <table className="google-costs__table">
          <caption className="sr-only">Запросы по сервисам</caption>
          <thead><tr><th scope="col">Сервис</th><th scope="col">Использовано / бесплатный лимит</th><th scope="col">Осталось бесплатных</th><th scope="col">Текущий тариф</th><th scope="col">Цикл</th><th scope="col">Оценка</th></tr></thead>
          <tbody>{skus.map((sku) => <tr key={sku.sku} id={`sku-${sku.sku}`}><td><SkuName sku={sku} /></td><td><CycleProgress sku={sku} /></td><td>{formatGoogleNumber(sku.free_remaining)}</td><td>{tierLabel(sku.current_tier)}</td><td>{cycleLabel(sku.cycle)}</td><td className="google-costs__sku-cost">{sku.approximate && <span className="google-costs__approximate" title="цена ориентировочная, сверяется по счёту Google" aria-label="цена ориентировочная, сверяется по счёту Google">≈</span>}{formatGoogleMoney(sku.estimated_cost_gbp)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="google-costs__sku-cards">{skus.map((sku) => <article className="google-costs__sku-card" key={sku.sku} id={`sku-card-${sku.sku}`}><SkuDetails sku={sku} /></article>)}</div>
    </>
  )
}

function BillingSection({ billing }) {
  if (!billing?.available) return null
  const lines = billing.lines || []
  return (
    <section aria-labelledby="google-costs-billing-title">
      <h2 className="google-costs__section-title" id="google-costs-billing-title">Счёт Google по строкам</h2>
      <div className="google-costs__card google-costs__billing">
        <div className="google-costs__table-wrap">
          <table className="google-costs__table">
            <caption className="sr-only">Строки счёта Google</caption>
            <thead><tr><th scope="col">Сервис</th><th scope="col">SKU</th><th scope="col">Расход</th><th scope="col">Кредиты</th><th scope="col">Объём</th></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr className={line.our_sku ? 'is-linked' : ''} key={`${line.sku || line.service}-${index}`}>
                  <td data-label="Сервис">{line.service || '—'}</td>
                  <td data-label="SKU">{line.our_sku ? <a href={`#sku-${line.our_sku}`}>{line.sku || line.our_sku}</a> : line.sku || '—'}</td>
                  <td data-label="Расход">{formatGoogleMoney(line.cost)}</td>
                  <td data-label="Кредиты">{formatGoogleMoney(line.credits)}</td>
                  <td data-label="Объём">{formatGoogleNumber(line.usage_amount)} {line.usage_unit || ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row" colSpan="2">Итого</th><td>{formatGoogleMoney(billing.total_cost)}</td><td>{formatGoogleMoney(billing.total_credits)}</td><td>—</td></tr></tfoot>
          </table>
        </div>
        <div className="google-costs__mismatches">
          <h3>Расхождения со счётчиками</h3>
          {billing.mismatches?.length ? <ul>{billing.mismatches.map((mismatch, index) => <li key={index}>{typeof mismatch === 'string' ? mismatch : mismatch.message || `${mismatch.sku || mismatch.service || 'Строка'}: ${formatGoogleMoney(mismatch.difference ?? mismatch.cost)}`}</li>)}</ul> : <p>Расхождений нет</p>}
        </div>
      </div>
    </section>
  )
}

function AlertsSection({ alerts = [] }) {
  return (
    <section aria-labelledby="google-costs-alerts-title">
      <h2 className="google-costs__section-title" id="google-costs-alerts-title">Журнал алертов</h2>
      <div className="google-costs__card google-costs__table-wrap google-costs__alerts">
        {alerts.length ? <table className="google-costs__table"><caption className="sr-only">Последние алерты Google</caption><thead><tr><th scope="col">Время</th><th scope="col">SKU</th><th scope="col">Событие</th><th scope="col">Статус доставки</th></tr></thead><tbody>{alerts.slice(0, 20).map((alert, index) => <tr key={`${alert.sent_at}-${index}`}><td data-label="Время">{formatGoogleDateTime(alert.sent_at)}</td><td data-label="SKU">{alert.sku || '—'}</td><td data-label="Событие">{eventLabel(alert)}</td><td data-label="Статус доставки">{DELIVERY_LABELS[alert.delivery] || alert.delivery || '—'}</td></tr>)}</tbody></table> : <p className="google-costs__empty">Алертов пока нет</p>}
      </div>
    </section>
  )
}

function validateSettings(settings) {
  const errors = {}
  for (const field of SETTING_FIELDS) {
    const value = String(settings[field.key] ?? '').trim()
    if (field.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) errors[field.key] = 'Введите число больше нуля'
    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[field.key] = 'Введите дату в формате YYYY-MM-DD'
    if (field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T00:00:00Z`)
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) errors[field.key] = 'Введите корректную дату'
    }
  }
  return errors
}

function SettingsSection({ settings, onSaved }) {
  const [values, setValues] = useState(() => normalizeSettings(settings))
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValues(normalizeSettings(settings))
  }, [settings])

  const save = async (event) => {
    event.preventDefault()
    const validationErrors = validateSettings(values)
    setErrors(validationErrors)
    setServerError('')
    setSaved(false)
    if (Object.keys(validationErrors).length) return
    setSaving(true)
    try {
      const result = await adminMenuRevisionsApi.updateGoogleBillingSettings(values)
      const nextSettings = result.settings || values
      setValues(normalizeSettings(nextSettings))
      setSaved(true)
      onSaved(nextSettings)
    } catch (error) {
      setServerError(error.status === 422 ? 'Проверьте значения настроек' : error.message || 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="google-costs-settings-title">
      <details className="google-costs__settings">
        <summary id="google-costs-settings-title">Настройки</summary>
        <form onSubmit={save}>
          <p className="google-costs__hint">Меняйте только если изменился стартовый кредит</p>
          <div className="google-costs__settings-grid">
            {SETTING_FIELDS.map((field) => <label key={field.key}>{field.label}{field.key === 'credit_baseline_gbp' && <small>Меняйте только если изменился стартовый кредит</small>}<input aria-label={field.label} type={field.type} step={field.step} value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} aria-invalid={Boolean(errors[field.key])} />{errors[field.key] && <span className="google-costs__field-error">{errors[field.key]}</span>}</label>)}
          </div>
          {serverError && <p className="google-costs__form-error" role="alert">{serverError}</p>}
          {saved && <p className="google-costs__saved" role="status">Сохранено</p>}
          <button className="google-costs__primary" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
        </form>
      </details>
    </section>
  )
}

function Skeleton() {
  return <div className="google-costs__skeleton" role="status" aria-label="Загрузка расходов Google"><span /><span /><span /><span /></div>
}

export default function AdminGoogleCosts() {
  const [month, setMonth] = useState(currentMonth)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminMenuRevisionsApi.googleCosts(month)
      setReport({ ...data, skus: data.skus || [], billing: data.billing || null })
    } catch (requestError) {
      setReport(null)
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  const billingUpdated = report?.billing?.last_sync_at
  const previous = useMemo(() => previousMonth(month), [month])
  const next = useMemo(() => nextMonth(month), [month])
  const thisMonth = currentMonth()

  return (
    <section className="google-costs">
      <header className="google-costs__page-header">
        <div>
          <p className="google-costs__eyebrow">Google Cloud</p>
          <h1>Расходы Google</h1>
          <p className="google-costs__updated">Обновлено {billingUpdated ? formatGoogleDateTime(billingUpdated) : 'по счётчикам'}</p>
        </div>
        <div className="google-costs__month-picker" aria-label="Переключатель месяца">
          <button type="button" onClick={() => setMonth(previous)} aria-label="Предыдущий месяц">‹</button>
          <strong>{formatGoogleMonth(month)}</strong>
          <button type="button" onClick={() => setMonth(next)} disabled={next > thisMonth} aria-label="Следующий месяц">›</button>
        </div>
      </header>

      {loading && <Skeleton />}
      {!loading && error && <div className="google-costs__error" role="alert"><p>{error}</p><button type="button" onClick={load}>Повторить</button></div>}
      {!loading && !error && report && (
        <>
          <CreditCard credit={report.credit && { ...report.credit, expires: report.credit.expires || report.settings?.credit_expires }} />
          <Totals report={report} />
          <section aria-labelledby="google-costs-sku-title"><h2 className="google-costs__section-title" id="google-costs-sku-title">Запросы по сервисам</h2><SkuTable skus={report.skus} /></section>
          <BillingSection billing={report.billing} />
          <AlertsSection alerts={report.alerts} />
          <SettingsSection settings={report.settings} onSaved={(settings) => setReport((current) => ({ ...current, settings }))} />
        </>
      )}
    </section>
  )
}
