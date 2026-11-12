import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import ProductCard from './ProductCard'
import { PAIR_GRADES, PAIR_LINE, PAIR_STATE, PAIR_WHY, formatCount } from './adminProducts'

const STATUS_LABELS = {
  pending: 'Ожидают решения',
  same: 'Один товар',
  different: 'Разные товары',
}

// The main card defaults to the side that is already a group, then to the side with a barcode, then to the left one.
function defaultMain(pair) {
  if (pair.a.member_count !== pair.b.member_count) return pair.a.member_count > pair.b.member_count ? 'a' : 'b'
  const aCode = Boolean(pair.a.product?.gtin)
  const bCode = Boolean(pair.b.product?.gtin)
  if (aCode !== bCode) return aCode ? 'a' : 'b'
  return 'a'
}

function Facts({ pair }) {
  const facts = [
    ['Название', PAIR_LINE[pair.line_relation] || pair.line_relation],
    ['Состав', PAIR_STATE[pair.ingredients_state] || pair.ingredients_state],
    ['КБЖУ', PAIR_STATE[pair.nutrition_state] || pair.nutrition_state],
    ['Вес', PAIR_STATE[pair.weight_state] || pair.weight_state],
  ]
  return (
    <ul className="admin-product-pair__facts" aria-label="Что сверило правило">
      {facts.map(([label, value]) => (
        <li key={label}><span>{label}</span><strong>{value || '—'}</strong></li>
      ))}
    </ul>
  )
}

function Pair({ pair, main, working, onMain, onDecide }) {
  const pending = pair.status === 'pending'
  const chosen = pending ? main : pair.main_side
  return (
    <section className="admin-product-match__pair">
      <header>
        <div>
          <strong>{PAIR_WHY[pair.why] || pair.why}</strong>
          <small>{PAIR_GRADES[pair.grade]?.label} уверенность</small>
        </div>
        <span className={`admin-parser__status admin-product-pair__grade--${pair.grade}`}>
          {PAIR_GRADES[pair.grade]?.label}
        </span>
      </header>
      <Facts pair={pair} />
      <div className="admin-product-match__comparison">
        <ProductCard
          product={pair.a.product}
          others={pair.a.others}
          groupSize={pair.a.member_count}
          main={pending || pair.status === 'same' ? { selected: chosen === 'a', disabled: !pending || working, onSelect: () => onMain('a') } : null}
        />
        <div className="admin-product-match__versus">и</div>
        <ProductCard
          product={pair.b.product}
          others={pair.b.others}
          groupSize={pair.b.member_count}
          main={pending || pair.status === 'same' ? { selected: chosen === 'b', disabled: !pending || working, onSelect: () => onMain('b') } : null}
        />
      </div>
      {pending ? (
        <footer className="admin-product-match__actions">
          <button type="button" className="is-reject" disabled={working} onClick={() => onDecide('different')}>
            Это разные товары
          </button>
          <button type="button" className="is-approve" disabled={working} onClick={() => onDecide('same')}>
            Один товар, главная: {chosen === 'a' ? 'слева' : 'справа'}
          </button>
        </footer>
      ) : null}
    </section>
  )
}

export default function ProductPairReview() {
  const [status, setStatus] = useState('pending')
  const [grade, setGrade] = useState('')
  const [why, setWhy] = useState('')
  const [data, setData] = useState({ pairs: [], counts: [], total: 0 })
  const [mains, setMains] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminMenuRevisionsApi.productPairs({ status, grade, why })
      setData({ pairs: result.pairs || [], counts: result.counts || [], total: result.total || 0 })
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить пары.')
    } finally {
      setLoading(false)
    }
  }, [status, grade, why])

  useEffect(() => { load() }, [load])

  const byGrade = useMemo(() => {
    const totals = { medium: 0, low: 0 }
    data.counts.forEach(({ grade: g, n }) => { totals[g] = (totals[g] || 0) + n })
    return totals
  }, [data.counts])

  const reasons = useMemo(() => (
    data.counts
      .filter((row) => !grade || row.grade === grade)
      .reduce((acc, row) => acc.set(row.why, (acc.get(row.why) || 0) + row.n), new Map())
  ), [data.counts, grade])

  const decide = async (pair, decision) => {
    setWorkingId(pair.id)
    setError('')
    try {
      const main = mains[pair.id] || defaultMain(pair)
      await adminMenuRevisionsApi.decideProductPair(pair.id, decision, main)
      const left = data.pairs.filter((item) => item.id !== pair.id)
      setData((current) => ({ ...current, pairs: left, total: Math.max(0, current.total - 1) }))
      if (left.length === 0) load()
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить решение.')
    } finally {
      setWorkingId(null)
    }
  }

  const pickGrade = (value) => { setGrade(value); setWhy('') }

  return (
    <>
      <div className="admin-product-match__filters" role="group" aria-label="Статус пары">
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <button key={value} type="button" className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="admin-product-match__filters" role="group" aria-label="Уровень уверенности">
        <button type="button" className={grade === '' ? 'active' : ''} onClick={() => pickGrade('')}>
          Все уровни · {formatCount(byGrade.medium + byGrade.low)}
        </button>
        {Object.entries(PAIR_GRADES).map(([value, { label, hint }]) => (
          <button key={value} type="button" title={hint} className={grade === value ? 'active' : ''} onClick={() => pickGrade(value)}>
            {label} · {formatCount(byGrade[value] || 0)}
          </button>
        ))}
        <select value={why} onChange={(event) => setWhy(event.target.value)} aria-label="Причина">
          <option value="">Все причины</option>
          {[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => (
            <option key={value} value={value}>{PAIR_WHY[value] || value} · {formatCount(n)}</option>
          ))}
        </select>
      </div>

      {error ? <p className="admin-crm__notice admin-crm__notice--error">{error}</p> : null}
      {loading ? <p className="admin-crm__loading">Загружаем пары…</p> : null}
      {!loading && data.pairs.length === 0 ? (
        <div className="admin-menu__empty">В этом разделе пока нет пар.</div>
      ) : null}
      {!loading && data.total > data.pairs.length ? (
        <p className="admin-product-pair__total">Показаны первые {data.pairs.length} из {formatCount(data.total)}. Остальные подгрузятся, когда вы разберёте эти.</p>
      ) : null}

      <div className="admin-product-match__list">
        {data.pairs.map((pair) => (
          <Pair
            key={pair.id}
            pair={pair}
            main={mains[pair.id] || defaultMain(pair)}
            working={workingId === pair.id}
            onMain={(side) => setMains((current) => ({ ...current, [pair.id]: side }))}
            onDecide={(decision) => decide(pair, decision)}
          />
        ))}
      </div>
    </>
  )
}
