import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, Search } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import { COMPLETENESS_ISSUES, formatCount, host } from './adminProducts'

function formatNutrition(nutrition) {
  const unit = nutrition.basis === '100ml' ? '100 мл' : '100 г'
  const value = (number) => Number(number || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
  return `${value(nutrition.calories)} ккал · Б ${value(nutrition.protein_g)} · Ж ${value(nutrition.fat_g)} · У ${value(nutrition.carbs_g)} на ${unit}`
}

export default function AdminProductCompleteness() {
  const [searchParams, setSearchParams] = useSearchParams()
  const issue = COMPLETENESS_ISSUES[searchParams.get('issue')] ? searchParams.get('issue') : 'no_kbju'
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 350)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => { setOffset(0) }, [issue, query])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    adminMenuRevisionsApi.productCompleteness({ issue, query, offset })
      .then((payload) => active && setData(payload))
      .catch((requestError) => active && setError(requestError.message || 'Не удалось загрузить товары'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [issue, query, offset])

  const selectIssue = (value) => setSearchParams(value === 'no_kbju' ? {} : { issue: value })
  const items = data?.items || []
  const matched = data?.matched ?? 0
  const pageSize = data?.page_size || 100

  return (
    <section className="admin-crm">
      <div className="admin-menu__title admin-crm__title">
        <div>
          <span>Качество данных</span>
          <h1>Полнота</h1>
          <p>Каких данных не хватает товарам каталога{data ? ` · всего ${formatCount(data.total_products)}` : ''}</p>
        </div>
        <div><strong>{data ? formatCount(data.issues[issue]) : '…'}</strong></div>
      </div>

      <div className="admin-restaurant-review__stats" aria-label="Чего не хватает">
        {Object.entries(COMPLETENESS_ISSUES).map(([value, item]) => (
          <button key={value} type="button" className={issue === value ? 'active' : ''} onClick={() => selectIssue(value)}>
            {item.label}<strong>{data ? formatCount(data.issues[value]) : '…'}</strong>
          </button>
        ))}
      </div>
      <p className="admin-product-barcodes__hint">{COMPLETENESS_ISSUES[issue].hint}</p>

      <div className="admin-crm__filters">
        <label className="admin-crm__search"><Search size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Название, бренд или штрихкод" /></label>
      </div>

      {error && <p className="admin-menu__error" role="alert">{error}</p>}
      {loading && !items.length ? <p className="admin-crm__loading">Загружаем товары…</p> : (
        <div className="admin-crm__table-wrap admin-parser__table-wrap">
          <table className="admin-crm__table admin-parser__table admin-product-completeness__table">
            <thead><tr><th>Товар</th><th>Бренд и производитель</th><th>Вес</th><th>Штрихкод</th><th>КБЖУ</th><th>Источник</th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <small>{item.id}</small>
                  {issue === 'no_kbju' && item.generic && <small className="admin-product-completeness__generic">Генерик — можно взять общеизвестное КБЖУ</small>}
                </td>
                <td data-label="Бренд и производитель">
                  {item.brand || <span className="admin-crm__muted">Бренд не указан</span>}
                  {item.manufacturer && <small>{item.manufacturer}</small>}
                </td>
                <td data-label="Вес">{item.quantity_text || <span className="admin-crm__muted">Не указан</span>}</td>
                <td data-label="Штрихкод">{item.barcode || <span className="admin-crm__muted">Нет</span>}</td>
                <td data-label="КБЖУ">{formatNutrition(item.nutrition)}</td>
                <td data-label="Источник">
                  {item.source_url
                    ? <a href={item.source_url} target="_blank" rel="noreferrer">{host(item.source_url)} <ExternalLink size={13} /></a>
                    : <span className="admin-crm__muted">Не магазин</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!items.length && !error && <div className="admin-menu__empty">По выбранным условиям товаров нет</div>}
        </div>
      )}

      {matched > pageSize && (
        <div className="admin-product-barcodes__more">
          <button type="button" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Назад</button>
          <span>{formatCount(offset + 1)}–{formatCount(Math.min(offset + pageSize, matched))} из {formatCount(matched)}</span>
          <button type="button" disabled={loading || offset + pageSize >= matched} onClick={() => setOffset(offset + pageSize)}>Дальше</button>
        </div>
      )}
    </section>
  )
}
