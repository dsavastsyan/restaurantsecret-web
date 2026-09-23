import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'

const REASON_LABELS = {
  protein_over_100g: 'Белков больше 100 г на 100 г/мл',
  fat_over_100g: 'Жиров больше 100 г на 100 г/мл',
  carbohydrates_over_100g: 'Углеводов больше 100 г на 100 г/мл',
  macros_exceed_100g: 'Сумма БЖУ больше 100 г на 100 г/мл',
  calories_over_900kcal: 'Калорийность выше 900 ккал на 100 г/мл',
  calories_macros_mismatch: 'Калории не сходятся с БЖУ',
}

function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason
}

function formatNumber(value) {
  return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Источник'
  }
}

function FlaggedCard({ item, kind, approving, onApprove }) {
  const isProduct = kind === 'products'
  return (
    <article className="admin-product-match__pair">
      <header>
        <div>
          <strong>{reasonLabel(item.kbju_flag_reason)}</strong>
          <small>Спарсено {new Date(item.parsed_at).toLocaleString('ru-RU')}</small>
        </div>
        <span className="admin-menu__badge admin-menu__badge--changes_requested">
          {item.kbju_flag_reason}
        </span>
      </header>
      <div className="admin-product-match__product">
        <header>
          <div>
            <small>{isProduct ? host(item.source_url) : item.restaurant_name}</small>
            <h2>{item.name}</h2>
          </div>
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noreferrer" aria-label="Открыть источник">
              <ExternalLink size={18} />
            </a>
          ) : null}
        </header>

        <dl>
          {isProduct ? (
            <>
              <div><dt>Бренд</dt><dd>{item.brand || '—'}</dd></div>
              <div><dt>Производитель</dt><dd>{item.manufacturer || '—'}</dd></div>
              <div><dt>Категория</dt><dd>{item.source_category || '—'}</dd></div>
              <div><dt>Упаковка</dt><dd>{item.package_size || '—'}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Ресторан</dt><dd>{item.restaurant_name}</dd></div>
              <div><dt>Категория</dt><dd>{item.category || '—'}</dd></div>
              <div><dt>Расчёт</dt><dd>{item.nutrition_basis || '—'}</dd></div>
              <div><dt>Порция</dt><dd>{item.portion_g ? `${formatNumber(item.portion_g)} г` : '—'}</dd></div>
            </>
          )}
        </dl>

        <div className="admin-product-match__nutrition" aria-label="КБЖУ">
          <span><strong>{formatNumber(item.calories)}</strong><small>ккал</small></span>
          <span><strong>{formatNumber(item.protein_g)}</strong><small>белки</small></span>
          <span><strong>{formatNumber(item.fat_g)}</strong><small>жиры</small></span>
          <span><strong>{formatNumber(item.carbohydrates_g)}</strong><small>углеводы</small></span>
        </div>

        {item.ingredients ? (
          <details>
            <summary>Состав</summary>
            <p>{item.ingredients}</p>
          </details>
        ) : null}
      </div>
      <footer className="admin-product-match__actions">
        <button className="is-approve" type="button" disabled={approving} onClick={() => onApprove(item.id)}>
          <Check size={17} />
          {approving ? 'Подтверждаем…' : 'КБЖУ корректны'}
        </button>
      </footer>
    </article>
  )
}

export default function KbjuFlagReview() {
  const [activeTab, setActiveTab] = useState('products')
  const [itemsByTab, setItemsByTab] = useState({ products: [], 'restaurant-items': [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = activeTab === 'products'
        ? await adminMenuRevisionsApi.kbjuFlaggedProducts()
        : await adminMenuRevisionsApi.kbjuFlaggedRestaurantItems()
      setItemsByTab((current) => ({
        ...current,
        [activeTab]: activeTab === 'products' ? (data.products || []) : (data.items || []),
      }))
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить карточки.')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { load() }, [load])

  const approve = useCallback(async (itemId) => {
    setApprovingId(itemId)
    setError('')
    try {
      await adminMenuRevisionsApi.approveKbjuFlag(activeTab, itemId)
      setItemsByTab((current) => ({
        ...current,
        [activeTab]: current[activeTab].filter((item) => item.id !== itemId),
      }))
    } catch (requestError) {
      setError(requestError.message || 'Не удалось подтвердить КБЖУ.')
    } finally {
      setApprovingId(null)
    }
  }, [activeTab])

  const items = itemsByTab[activeTab]

  return (
    <section className="admin-product-match">
      <header className="admin-menu__title">
        <div>
          <span>Проверка данных</span>
          <h1>Странные КБЖУ</h1>
          <p>
            Позиции, где белки, жиры, углеводы или калории выглядят необычно. Подтвердите корректные
            значения — после этого карточка исчезнет из очереди.
          </p>
        </div>
        <strong>{items.length}</strong>
      </header>

      <nav className="admin-product-match__filters" aria-label="Тип позиций">
        <button type="button" className={activeTab === 'products' ? 'active' : ''} onClick={() => setActiveTab('products')}>
          Продукты
        </button>
        <button type="button" className={activeTab === 'restaurant-items' ? 'active' : ''} onClick={() => setActiveTab('restaurant-items')}>
          Рестораны
        </button>
      </nav>

      {error ? <p className="admin-crm__notice admin-crm__notice--error">{error}</p> : null}
      {loading ? <p className="admin-crm__loading">Загружаем карточки…</p> : null}
      {!loading && items.length === 0 ? (
        <div className="admin-menu__empty">Непроверенных карточек сейчас нет.</div>
      ) : null}

      <div className="admin-product-match__list">
        {items.map((item) => (
          <FlaggedCard
            item={item}
            kind={activeTab}
            approving={approvingId === item.id}
            onApprove={approve}
            key={item.id}
          />
        ))}
      </div>
    </section>
  )
}
