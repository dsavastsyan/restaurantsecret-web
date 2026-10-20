import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleAlert, ExternalLink } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import { PAIR_KINDS, VERDICTS, countVerdicts, formatCount, host } from './adminProducts'

function Side({ eyebrow, title, rows, link }) {
  return (
    <article className="admin-product-match__product">
      <header>
        <div>
          <small>{eyebrow}</small>
          <h2>{title || 'Название не найдено'}</h2>
        </div>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" aria-label="Открыть карточку магазина">
            <ExternalLink size={18} />
          </a>
        )}
      </header>
      <dl>
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
      </dl>
    </article>
  )
}

function Pair({ pair, working, onDecide }) {
  const { product, candidate } = pair
  return (
    <section className="admin-product-match__pair">
      <header>
        <div>
          <strong>{pair.source_label}</strong>
          {pair.kind === 'off' && pair.score != null && <small>Сходство названий {Math.round(pair.score * 100)}%</small>}
        </div>
        <span className={`admin-parser__status admin-product-barcodes__verdict--${pair.verdict}`}>{VERDICTS[pair.verdict].label}</span>
      </header>
      <div className="admin-product-match__comparison">
        <Side
          eyebrow={product.source_url ? `Наш товар · ${host(product.source_url)}` : 'Наш товар'}
          title={product.name}
          link={product.source_url}
          rows={[
            ['Бренд', product.brand],
            ['Вес', product.quantity_text],
            ['Штрихкод', product.barcode],
          ]}
        />
        <div className="admin-product-match__versus">и</div>
        <Side
          eyebrow={`Кандидат · ${pair.source_label}`}
          title={candidate.name}
          rows={[
            ['Бренд', candidate.brand],
            ['Вес', candidate.quantity_text],
            ['Штрихкод', candidate.barcode],
            ...(candidate.names_for_barcode > 1 ? [['Названий', `${candidate.names_for_barcode} в справочниках`]] : []),
          ]}
        />
      </div>
      {pair.reasons.length > 0 && (
        <ul className="admin-product-barcodes__reasons" aria-label="Причины">
          {pair.reasons.map((reason) => (
            <li key={reason.code} className={`admin-crm__warning admin-product-barcodes__reason--${reason.kind}`}>
              <CircleAlert size={13} />{reason.label}
            </li>
          ))}
        </ul>
      )}
      <footer className="admin-product-match__actions">
        <button type="button" className="is-reject" disabled={working} onClick={() => onDecide(pair, 'reject')}>
          Это разные товары
        </button>
        <button type="button" className="is-approve" disabled={working} onClick={() => onDecide(pair, 'approve')}>
          Штрихкод подходит
        </button>
      </footer>
    </section>
  )
}

export default function BarcodeCandidateReview() {
  const [kind, setKind] = useState('link')
  const [verdict, setVerdict] = useState('review')
  const [data, setData] = useState(null)
  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)
  // Decided pairs leave the pending queue, so the next page starts that much earlier
  const [decided, setDecided] = useState(0)

  const load = useCallback(async (offset = 0) => {
    setError('')
    try {
      const payload = await adminMenuRevisionsApi.barcodeCandidates({ kind, offset })
      setData(payload)
      setPairs((current) => (offset ? [...current, ...payload.pairs] : payload.pairs))
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить пары')
    }
  }, [kind])

  useEffect(() => {
    setLoading(true)
    setPairs([])
    setDecided(0)
    load(0).finally(() => setLoading(false))
  }, [load])

  const loadMore = async () => {
    setLoadingMore(true)
    await load(Math.max(0, data.next_offset - decided))
    setDecided(0)
    setLoadingMore(false)
  }

  const counts = useMemo(() => countVerdicts(pairs), [pairs])
  const visible = useMemo(() => pairs.filter((pair) => pair.verdict === verdict), [pairs, verdict])
  const pendingTotal = data?.totals?.[kind]?.pending

  const decide = async (pair, decision) => {
    const key = `${pair.kind}:${pair.id}`
    setWorkingId(key)
    setError('')
    try {
      await adminMenuRevisionsApi.decideBarcodeCandidate(pair.kind, pair.id, decision)
      setPairs((current) => current.filter((item) => `${item.kind}:${item.id}` !== key))
      setDecided((current) => current + 1)
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить решение')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <section className="admin-product-match">
      <header className="admin-menu__title">
        <div>
          <span>Актуальность</span>
          <h1>Сведение со штрихкодом</h1>
          <p>Пары «наш товар ↔ кандидат штрихкода». Ложная склейка хуже потерянной пары: принимайте, только если товар точно тот же. Вердикт правила — подсказка, сам он ничего не меняет</p>
        </div>
        <strong>{pendingTotal == null ? '…' : formatCount(pendingTotal)}</strong>
      </header>

      <div className="admin-product-match__filters" aria-label="Откуда кандидат">
        {Object.entries(PAIR_KINDS).map(([value, label]) => {
          const unavailable = data && value === 'off' && !data.available?.off
          const total = data?.totals?.[value]?.pending
          return (
            <button key={value} type="button" className={kind === value ? 'active' : ''} disabled={unavailable} onClick={() => setKind(value)}>
              {label}{unavailable ? ' — нет в этой базе' : total != null ? ` · ${formatCount(total)}` : ''}
            </button>
          )
        })}
      </div>

      <div className="admin-restaurant-review__stats" aria-label="Вердикт правила">
        {Object.entries(VERDICTS).map(([value, item]) => (
          <button key={value} type="button" className={verdict === value ? 'active' : ''} onClick={() => setVerdict(value)}>
            {item.label}<strong>{counts[value]}</strong>
          </button>
        ))}
      </div>
      <p className="admin-product-barcodes__hint">
        {VERDICTS[verdict].hint}. Проверено правилом {formatCount(pairs.length)} из {pendingTotal == null ? '…' : formatCount(pendingTotal)} пар
      </p>

      {error ? <p className="admin-crm__notice admin-crm__notice--error">{error}</p> : null}
      {loading ? <p className="admin-crm__loading">Загружаем пары…</p> : null}
      {!loading && visible.length === 0 ? <div className="admin-menu__empty">В этом разделе пока нет пар</div> : null}

      <div className="admin-product-match__list">
        {visible.map((pair) => (
          <Pair key={`${pair.kind}:${pair.id}`} pair={pair} working={workingId === `${pair.kind}:${pair.id}`} onDecide={decide} />
        ))}
      </div>

      {!loading && data?.next_offset != null && (
        <div className="admin-product-barcodes__more">
          <button type="button" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'Загружаем…' : `Проверить следующие ${formatCount(data.page_size)}`}
          </button>
        </div>
      )}
    </section>
  )
}
