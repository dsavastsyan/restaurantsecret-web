import { ExternalLink } from 'lucide-react'

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

// Store card shown on both duplicate-review queues. The optional props are used by the pair queue:
// `main` marks and picks the main card of the pair, `others` lists the rest of an already merged group.
export default function ProductCard({ product, main, others = [], groupSize = 1 }) {
  if (!product) {
    return <article className="admin-product-match__product"><p>Карточка не найдена в базе.</p></article>
  }
  return (
    <article className={`admin-product-match__product${main?.selected ? ' is-main' : ''}`}>
      <header>
        <div>
          <small>{host(product.source_url)}</small>
          <h2>{product.name}</h2>
        </div>
        <a href={product.source_url} target="_blank" rel="noreferrer" aria-label="Открыть карточку магазина">
          <ExternalLink size={18} />
        </a>
      </header>

      <dl>
        <div><dt>Бренд</dt><dd>{product.brand || '—'}</dd></div>
        <div><dt>Производитель</dt><dd>{product.manufacturer || '—'}</dd></div>
        <div><dt>Категория</dt><dd>{product.source_category || '—'}</dd></div>
        <div><dt>Упаковка</dt><dd>{product.package_size}</dd></div>
        <div><dt>GTIN</dt><dd>{product.gtin || '—'}</dd></div>
        <div><dt>Базис</dt><dd>{product.nutrition_basis === '100_ml' ? '100 мл' : '100 г'}</dd></div>
      </dl>

      <div className="admin-product-match__nutrition" aria-label="КБЖУ">
        <span><strong>{formatNumber(product.calories)}</strong><small>ккал</small></span>
        <span><strong>{formatNumber(product.protein_g)}</strong><small>белки</small></span>
        <span><strong>{formatNumber(product.fat_g)}</strong><small>жиры</small></span>
        <span><strong>{formatNumber(product.carbohydrates_g)}</strong><small>углеводы</small></span>
      </div>

      <details>
        <summary>Состав</summary>
        <p>{product.ingredients || 'Состав не указан магазином.'}</p>
      </details>

      {groupSize > 1 ? (
        <details className="admin-product-match__group">
          <summary>Уже склеено ещё {groupSize - 1} {groupSize - 1 === 1 ? 'карточка' : 'карточки'}</summary>
          <ul>
            {others.map((other) => (
              <li key={other.id}>
                <a href={other.source_url} target="_blank" rel="noreferrer">{other.name}</a>
                <small>{host(other.source_url)}{other.gtin ? ` · ${other.gtin}` : ''}</small>
              </li>
            ))}
            {groupSize - 1 > others.length ? <li><small>…и ещё {groupSize - 1 - others.length}</small></li> : null}
          </ul>
        </details>
      ) : null}

      {main ? (
        <button
          type="button"
          className={`admin-product-match__main${main.selected ? ' is-selected' : ''}`}
          aria-pressed={main.selected}
          disabled={main.disabled}
          onClick={main.onSelect}
        >
          {main.selected ? 'Главная карточка' : 'Сделать главной'}
        </button>
      ) : null}
      <footer>Спарсено {new Date(product.parsed_at).toLocaleString('ru-RU')}</footer>
    </article>
  )
}
