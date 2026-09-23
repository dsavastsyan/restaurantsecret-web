import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'

const STATUS_LABELS = {
  new: 'Новый', deferred: 'Отложено', awaiting_parser: 'Ожидает парсинга', awaiting_manual: 'Ожидает добавления',
  awaiting_reply: 'Ожидает ответа', follow_up: 'Follow-up', menu_development: 'Меню в разработке',
  ready: 'Готово', no_menu: 'Меню нет', in_person_only: 'Только лично', discarded: 'Не подходит',
  blocked_antibot: 'Антибот-защита',
}

const outreachCache = new Map()

function ActionButton({ children, onClick, disabled }) {
  return <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
}

function CandidateActions({ candidate, busy, update }) {
  const status = candidate.effective_status
  const [showParser, setShowParser] = useState(false)
  const [menuUrl, setMenuUrl] = useState('')
  const save = (nextStatus, workflowKind = candidate.workflow_kind, url = null) =>
    update(candidate.id, { status: nextStatus, workflow_kind: workflowKind, menu_url: url })

  if (status === 'discarded') return <ActionButton disabled={busy} onClick={() => save('new', null)}>Вернуть в новые</ActionButton>
  if (status === 'blocked_antibot') return (
    <details className="admin-crm__actions"><summary>Действия</summary><div>
      <ActionButton disabled={busy} onClick={() => save('awaiting_parser', 'parser', candidate.menu_url)}>Повторить парсинг</ActionButton>
      <ActionButton disabled={busy} onClick={() => save('discarded', null)}>Не подходит</ActionButton>
    </div></details>
  )
  if (status === 'ready' || status === 'no_menu' || status === 'in_person_only') return <span className="admin-crm__muted">—</span>
  if (status === 'awaiting_parser') return <ActionButton disabled={busy} onClick={() => save('blocked_antibot', 'parser')}>Антибот-защита</ActionButton>

  if (showParser) {
    return (
      <form className="admin-outreach__parser-form" onSubmit={(event) => { event.preventDefault(); save('awaiting_parser', 'parser', menuUrl) }}>
        <input type="url" required autoFocus value={menuUrl} onChange={(event) => setMenuUrl(event.target.value)} placeholder="Ссылка на меню" />
        <button disabled={busy}>В очередь</button>
        <button type="button" disabled={busy} onClick={() => setShowParser(false)}>Отмена</button>
      </form>
    )
  }

  if (status === 'awaiting_manual') return (
    <details className="admin-crm__actions"><summary>Действия</summary><div>
      <ActionButton disabled={busy} onClick={() => save('ready')}>Готово</ActionButton>
      <ActionButton disabled={busy} onClick={() => save('discarded', null)}>Не подходит</ActionButton>
    </div></details>
  )

  if (status === 'menu_development') {
    return (
      <details className="admin-crm__actions"><summary>Действия</summary><div>
        <ActionButton disabled={busy} onClick={() => save('ready')}>Меню получено — готово</ActionButton>
        <ActionButton disabled={busy} onClick={() => save('no_menu')}>Меню нет</ActionButton>
        <ActionButton disabled={busy} onClick={() => save('in_person_only')}>Только лично</ActionButton>
        <ActionButton disabled={busy} onClick={() => save('discarded', null)}>Не подходит</ActionButton>
      </div></details>
    )
  }

  if (status === 'awaiting_reply' || status === 'follow_up') {
    return (
      <details className="admin-crm__actions"><summary>Ответ ресторана</summary><div>
        {status === 'follow_up' && <ActionButton disabled={busy} onClick={() => save('awaiting_reply', 'direct')}>Написала повторно</ActionButton>}
        <ActionButton disabled={busy} onClick={() => save('ready')}>Прислали меню — готово</ActionButton>
        <ActionButton disabled={busy} onClick={() => save('no_menu')}>Меню нет</ActionButton>
        <ActionButton disabled={busy} onClick={() => save('menu_development', 'direct')}>Меню в разработке</ActionButton>
        <ActionButton disabled={busy} onClick={() => save('in_person_only')}>Только лично</ActionButton>
        <ActionButton disabled={busy} onClick={() => save('discarded', null)}>Не подходит</ActionButton>
      </div></details>
    )
  }

  return (
    <details className="admin-crm__actions"><summary>Добавить меню</summary><div>
      <ActionButton disabled={busy} onClick={() => setShowParser(true)}>Парсинг</ActionButton>
      <ActionButton disabled={busy} onClick={() => save('awaiting_manual', 'manual_website')}>Вручную с сайта</ActionButton>
      <ActionButton disabled={busy} onClick={() => save('awaiting_manual', 'instagram_highlights')}>Instagram Highlights</ActionButton>
      <ActionButton disabled={busy} onClick={() => save('awaiting_reply', 'direct')}>Написала в Direct</ActionButton>
      <ActionButton disabled={busy} onClick={() => save('deferred', null)}>Отложить</ActionButton>
      <ActionButton disabled={busy} onClick={() => save('discarded', null)}>Не подходит</ActionButton>
    </div></details>
  )
}

export default function AdminOutreach() {
  const [candidates, setCandidates] = useState([])
  const [cities, setCities] = useState([])
  const [city, setCity] = useState('Москва')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const mutationVersion = useRef(0)

  const load = useCallback(async () => {
    const versionAtStart = mutationVersion.current
    const cached = outreachCache.get(city)
    if (cached) {
      setCandidates(cached.candidates); setCities(cached.cities); setLoading(false)
    } else {
      setLoading(true)
    }
    setError('')
    try {
      const data = await adminMenuRevisionsApi.outreach({ city })
      const next = { candidates: data.candidates || [], cities: data.cities || [] }
      if (mutationVersion.current !== versionAtStart) return
      outreachCache.set(city, next)
      setCandidates(next.candidates); setCities(next.cities)
    } catch (requestError) { setError(requestError.message || 'Не удалось загрузить базу аутрича.') }
    finally { setLoading(false) }
  }, [city])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => candidates.filter((candidate) => {
    if (status && candidate.effective_status !== status) return false
    const needle = query.trim().toLowerCase()
    return !needle || `${candidate.name} ${candidate.city} ${candidate.instagram_url || ''} ${candidate.website_url || ''}`.toLowerCase().includes(needle)
  }), [candidates, query, status])

  const update = async (id, body) => {
    const previous = candidates.find((candidate) => candidate.id === id)
    const replaceCandidate = (replacement) => setCandidates((current) => {
      const next = current.map((candidate) => candidate.id === id ? replacement(candidate) : candidate)
      const cached = outreachCache.get(city)
      if (cached) outreachCache.set(city, { ...cached, candidates: next })
      return next
    })

    mutationVersion.current += 1
    setBusyId(id); setError('')
    replaceCandidate((candidate) => ({
      ...candidate,
      status: body.status,
      effective_status: body.status,
      workflow_kind: body.workflow_kind,
      menu_url: body.menu_url,
    }))
    try {
      await adminMenuRevisionsApi.updateOutreach(id, body)
    }
    catch (requestError) {
      if (previous) replaceCandidate(() => previous)
      setError(requestError.message || 'Не удалось обновить статус.')
    }
    finally { setBusyId(null) }
  }

  const importBatch = async () => {
    setImporting(true); setError(''); setNotice('')
    try {
      const result = await adminMenuRevisionsApi.importOutreach(city)
      setNotice(`Проверено до следующей пачки: добавлено ${result.added}, уже в базе ${result.skipped_existing}, без контактов ${result.skipped_no_contact}${result.failed ? `, ошибок ${result.failed}` : ''}.`)
      await load()
    } catch (requestError) { setError(requestError.message || 'Не удалось обновить базу.') }
    finally { setImporting(false) }
  }

  return (
    <section className="admin-crm admin-outreach">
      <header className="admin-crm__title"><div><p className="admin-menu__eyebrow">База для связи</p><h1>Аутрич</h1><p>Рестораны, которых ещё нет в RestaurantSecret.</p></div><div><strong>{visible.length}</strong><button className="admin-crm__primary" type="button" onClick={importBatch} disabled={importing || !city}><RefreshCw size={17} />{importing ? 'Собираем…' : 'Обновить базу'}</button></div></header>
      {notice && <p className="admin-crm__notice">{notice}<button type="button" onClick={() => setNotice('')}>×</button></p>}
      {error && <p className="admin-crm__notice admin-crm__notice--error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></p>}
      <div className="admin-crm__filters">
        <select aria-label="Город" value={city} onChange={(event) => setCity(event.target.value)}>{cities.length ? cities.map((item) => <option key={item}>{item}</option>) : <option>{city}</option>}</select>
        <label className="admin-crm__search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, Instagram или сайт" /></label>
        <select aria-label="Статус" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все статусы</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      </div>
      {loading ? <p className="admin-crm__loading">Загружаем рестораны…</p> : (
        <div className="admin-crm__table-wrap admin-outreach__table-wrap"><table className="admin-crm__table admin-outreach__table"><thead><tr><th>Ресторан</th><th>Instagram</th><th>Сайт</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
          {visible.map((candidate) => <tr key={candidate.id} className={candidate.effective_status === 'follow_up' ? 'requires-action' : ''}>
            <td data-label="Ресторан"><strong>{candidate.name}</strong><small>{candidate.city}</small></td>
            <td data-label="Instagram">{candidate.instagram_url ? <a href={candidate.instagram_url} target="_blank" rel="noreferrer">Открыть Instagram <ExternalLink size={13} /></a> : <span className="admin-crm__muted">—</span>}</td>
            <td data-label="Сайт">{candidate.website_url ? <a href={candidate.website_url} target="_blank" rel="noreferrer">Открыть сайт <ExternalLink size={13} /></a> : <span className="admin-crm__muted">—</span>}</td>
            <td data-label="Статус"><span className={`admin-outreach__status admin-outreach__status--${candidate.effective_status}`}>{STATUS_LABELS[candidate.effective_status]}</span></td>
            <td data-label="Действия"><CandidateActions key={candidate.effective_status} candidate={candidate} busy={busyId === candidate.id} update={update} /></td>
          </tr>)}
        </tbody></table>{!visible.length && <div className="admin-menu__empty">По выбранным условиям ресторанов нет.</div>}</div>
      )}
    </section>
  )
}
