import { useState } from 'react'
import ProductMatchReview from './ProductMatchReview'
import ProductPairReview from './ProductPairReview'

const VIEWS = {
  pairs: 'Очередь склейки',
  matches: 'Прежние совпадения',
}

// «Сведение дубликатов»: the new queue of pairs from the matching rules (medium and low confidence)
// and the older raw-product matches that were reviewed before.
export default function ProductDuplicates() {
  const [view, setView] = useState('pairs')
  return (
    <>
      <div className="admin-product-match__views" role="tablist" aria-label="Что разбираем">
        {Object.entries(VIEWS).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={view === value} className={view === value ? 'active' : ''} onClick={() => setView(value)}>
            {label}
          </button>
        ))}
      </div>
      {view === 'pairs' ? (
        <section className="admin-product-match">
          <header className="admin-menu__title">
            <div>
              <span>Сырые продукты</span>
              <h1>Дубликаты карточек</h1>
              <p>Правила не смогли склеить эти пары сами. «Один товар» объединяет карточки в группу, главная карточка задаёт её название и КБЖУ. Исходные карточки не удаляются.</p>
            </div>
          </header>
          <ProductPairReview />
        </section>
      ) : <ProductMatchReview />}
    </>
  )
}

