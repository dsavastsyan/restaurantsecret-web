import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'
import {
  CRAWL_STATUS,
  crawlStatus,
  crawlStatusDetail,
  formatCount,
  formatDateTime,
  formatWeeks,
  percent,
  rejectedSummary,
  rejectedTotal,
  sortCrawlNetworks,
} from './adminProducts'

const STATE_LABELS = {
  working: 'Идёт сбор',
  cooldown: 'Пауза после 429',
  captcha: 'Нужна капча',
  idle_ok: 'Очередь пуста',
  stopped: 'Остановлен',
}

function NowPanel({ snapshot, receivedAt, stale }) {
  const now = snapshot.now || {}
  return (
    <div className="admin-place-review__summary admin-product-sources__coverage" aria-label="Состояние сбора">
      <div><span>Сейчас</span><strong>{STATE_LABELS[now.state] || now.state || '—'}</strong></div>
      <div><span>Последний сигнал</span><strong>{formatDateTime(now.heartbeat_at)}</strong></div>
      <div><span>Запросов за час</span><strong>{formatCount(now.requests_last_hour)}</strong></div>
      <div><span>Последний прогресс</span><strong>{formatDateTime(now.last_progress_at)}</strong></div>
      {stale && <div><span>Данные</span><strong>Устарели, снимок от {formatDateTime(receivedAt)}</strong></div>}
    </div>
  )
}

export default function AdminProductAutoUpdate() {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    adminMenuRevisionsApi.retailCrawlStatus()
      .then((data) => active && setPayload(data))
      .catch((requestError) => active && setError(requestError.message || 'Не удалось загрузить статус сбора'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const snapshot = payload?.snapshot || null
  const networks = useMemo(() => snapshot?.networks || [], [snapshot])
  const counts = useMemo(() => {
    const result = {}
    for (const network of networks) result[network.status] = (result[network.status] || 0) + 1
    return result
  }, [networks])
  const visible = useMemo(() => sortCrawlNetworks(networks).filter((network) => (
    (!status || network.status === status)
    && (!query.trim() || String(network.name).toLowerCase().includes(query.trim().toLowerCase()))
  )), [networks, status, query])

  return (
    <section className="admin-crm">
      <div className="admin-menu__title admin-crm__title">
        <div>
          <span>Актуальность</span>
          <h1>Автоматическое обновление</h1>
          <p>Недельный сбор КБЖУ продуктов магазинов Яндекс Еды. Новые товары идут первыми, старые карточки перепроверяются, когда новых не осталось</p>
        </div>
        <div><strong>{loading ? '…' : networks.length}</strong></div>
      </div>
      {error && <p className="admin-menu__error" role="alert">{error}</p>}
      {loading && <p className="admin-crm__loading">Загружаем статус сбора…</p>}
      {!loading && !error && !snapshot && <div className="admin-menu__empty">Оркестратор ещё не присылал статус</div>}
      {snapshot && (
        <>
          <NowPanel snapshot={snapshot} receivedAt={payload.received_at} stale={payload.stale} />
          <div className="admin-crm__filters">
            <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Сеть" /></label>
            <select aria-label="Статус сети" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Все статусы</option>
              {Object.entries(CRAWL_STATUS).map(([value, item]) => <option value={value} key={value}>{item.label} ({counts[value] || 0})</option>)}
            </select>
          </div>
          <div className="admin-crm__table-wrap admin-parser__table-wrap">
            <table className="admin-crm__table admin-parser__table admin-product-sources__table">
              <thead>
                <tr>
                  <th>Сеть</th><th>Статус</th><th>Список</th><th>Принято</th><th>Отклонено</th><th>Ждёт карточек</th><th>Новые за неделю</th><th>Доля КБЖУ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((network) => {
                  const item = crawlStatus(network.status)
                  const detail = crawlStatusDetail(network)
                  return (
                    <tr key={network.key}>
                      <td>
                        <strong>{network.name}</strong>
                        <small>{network.scheme === 'A' ? 'Всё в списке' : 'Карточка на товар'}</small>
                      </td>
                      <td data-label="Статус">
                        <span className={`admin-parser__status admin-parser__status--${item.tone}`}>{item.label}</span>
                        {detail && <small className="admin-product-sources__note">{detail}</small>}
                      </td>
                      <td data-label="Список">
                        {formatDateTime(network.last_list_at)}
                        <small>{network.list_size ? `${formatCount(network.list_size)} позиций` : 'ещё не снимали'}</small>
                      </td>
                      <td data-label="Принято">
                        {formatCount(network.accepted)}
                        <small>последняя карточка {formatDateTime(network.last_card_at)}</small>
                      </td>
                      <td data-label="Отклонено">
                        {formatCount(rejectedTotal(network.rejected))}
                        <small>{[rejectedSummary(network.rejected), network.skipped_by_name ? `по названию ${formatCount(network.skipped_by_name)}` : '', network.excluded_nonfood ? `нефуд ${formatCount(network.excluded_nonfood)}` : ''].filter(Boolean).join(' · ') || '—'}</small>
                      </td>
                      <td data-label="Ждёт карточек">
                        {formatCount(network.pending_new)}
                        <small>{network.pending_new ? `до конца: ${formatWeeks(network.backlog_weeks)}` : `круг перепроверки: ${formatWeeks(network.rotation_cycle_weeks)}`}</small>
                      </td>
                      <td data-label="Новые за неделю">{network.new_uids_last_list === null || network.new_uids_last_list === undefined ? '—' : formatCount(network.new_uids_last_list)}</td>
                      <td data-label="Доля КБЖУ">{network.kbju_share === null || network.kbju_share === undefined ? '—' : percent(network.kbju_share, 1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!visible.length && <div className="admin-menu__empty">По выбранным условиям сетей нет</div>}
          </div>
          <p className="admin-crm__muted">Снимок от {formatDateTime(snapshot.generated_at)}. Метро обновляется отдельно с сайта METRO и показывается в разделе «Базы ритейлеров»</p>
        </>
      )}
    </section>
  )
}
