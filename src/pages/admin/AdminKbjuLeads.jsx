import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { adminMenuRevisionsApi } from '@/api/adminMenuRevisions'

const STATUS_LABELS = {
  queued: 'В очереди', checking: 'Проверяем', kbju_highlights: 'КБЖУ в хайлайтах',
  kbju_site_cards: 'КБЖУ в карточках', kbju_document: 'КБЖУ в документе', dm_pending: 'ЛС нужно отправить',
  dm_sent: 'ЛС отправлено', needs_nudge: 'Нужно напомнить', replied: 'Ответил', nudge_sent: 'Напомнили',
  no_kbju: 'КБЖУ нет', closed: 'Закрыт', discarded: 'Отброшен',
}

const STEP_LABELS = {
  0: 'Не начато', 1: '1. Хайлайты', 2: '2. Сайт / доставка', 3: '3. Документ', 4: '4. Директ',
}

const SOURCE_LABELS = {
  instagram_highlights: 'Instagram', website_cards: 'Сайт', delivery_cards: 'Доставка',
  document: 'Документ', direct_reply: 'Ответ в директ',
}

const EDITABLE_STATUSES = Object.keys(STATUS_LABELS).filter((status) => status !== 'needs_nudge')

function displayDate(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').replace(/:\d{2}(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/, '').slice(0, 16)
}

function inputDate(value) {
  if (!value) return ''
  return String(value).replace('Z', '').slice(0, 16)
}

function timestampValue(value) {
  return value ? new Date(value).toISOString() : null
}

function LeadEditor({ lead, saving, onSave, error }) {
  const [draft, setDraft] = useState(() => ({
    status: lead.status,
    check_step: String(lead.check_step ?? 0),
    kbju_source: lead.kbju_source || '',
    kbju_url: lead.kbju_url || '',
    parser_url: lead.parser_url || '',
    dm_sent_at: inputDate(lead.dm_sent_at),
    last_reply_at: inputDate(lead.last_reply_at),
    nudge_sent_at: inputDate(lead.nudge_sent_at),
    notes: lead.notes || '',
  }))

  useEffect(() => {
    setDraft({
      status: lead.status, check_step: String(lead.check_step ?? 0), kbju_source: lead.kbju_source || '',
      kbju_url: lead.kbju_url || '', parser_url: lead.parser_url || '', dm_sent_at: inputDate(lead.dm_sent_at),
      last_reply_at: inputDate(lead.last_reply_at), nudge_sent_at: inputDate(lead.nudge_sent_at), notes: lead.notes || '',
    })
  }, [lead])

  const set = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    onSave(lead.id, {
      status: draft.status,
      check_step: Number(draft.check_step),
      kbju_source: draft.kbju_source || null,
      kbju_url: draft.kbju_url || null,
      parser_url: draft.parser_url || null,
      dm_sent_at: timestampValue(draft.dm_sent_at),
      last_reply_at: timestampValue(draft.last_reply_at),
      nudge_sent_at: timestampValue(draft.nudge_sent_at),
      notes: draft.notes || null,
    })
  }

  return (
    <form className="admin-kbju-leads__editor" onSubmit={submit}>
      <label>Статус<select value={draft.status} onChange={set('status')} disabled={saving}>{EDITABLE_STATUSES.map((status) => <option value={status} key={status}>{STATUS_LABELS[status]}</option>)}</select></label>
      <label>Шаг проверки<select value={draft.check_step} onChange={set('check_step')} disabled={saving}>{Object.entries(STEP_LABELS).map(([step, label]) => <option value={step} key={step}>{label}</option>)}</select></label>
      <label>Источник КБЖУ<select value={draft.kbju_source} onChange={set('kbju_source')} disabled={saving}><option value="">Не указан</option>{Object.entries(SOURCE_LABELS).map(([source, label]) => <option value={source} key={source}>{label}</option>)}</select></label>
      <label>Ссылка на КБЖУ<input type="url" value={draft.kbju_url} onChange={set('kbju_url')} placeholder="Ссылка на хайлайт или документ" disabled={saving} /></label>
      <label>Страница для парсера<input type="url" value={draft.parser_url} onChange={set('parser_url')} placeholder="Ссылка на меню / доставку" disabled={saving} /></label>
      <label>Дата ЛС<input type="datetime-local" value={draft.dm_sent_at} onChange={set('dm_sent_at')} disabled={saving} /></label>
      <label>Дата ответа<input type="datetime-local" value={draft.last_reply_at} onChange={set('last_reply_at')} disabled={saving} /></label>
      <label>Дата напоминания<input type="datetime-local" value={draft.nudge_sent_at} onChange={set('nudge_sent_at')} disabled={saving} /></label>
      <label className="admin-kbju-leads__editor-wide">Заметки<textarea value={draft.notes} onChange={set('notes')} rows="2" disabled={saving} /></label>
      {error && <p className="admin-kbju-leads__editor-error" role="alert">{error}</p>}
      <button className="admin-crm__primary" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
  )
}

export default function AdminKbjuLeads() {
  const [leads, setLeads] = useState([])
  const [queueDate, setQueueDate] = useState('')
  const [status, setStatus] = useState('')
  const [needsNudge, setNeedsNudge] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [editorError, setEditorError] = useState({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await adminMenuRevisionsApi.kbjuLeads({ status: needsNudge ? 'needs_nudge' : status, queueDate })
      setLeads(data.leads || [])
    } catch (requestError) { setError(requestError.message || 'Не удалось загрузить очередь КБЖУ.') }
    finally { setLoading(false) }
  }, [needsNudge, queueDate, status])

  useEffect(() => { load() }, [load])

  const save = async (id, body) => {
    setSavingId(id); setEditorError((current) => ({ ...current, [id]: '' }))
    try {
      const data = await adminMenuRevisionsApi.updateKbjuLead(id, body)
      setLeads((current) => current.map((lead) => lead.id === id ? data.lead : lead))
    } catch (requestError) {
      setEditorError((current) => ({ ...current, [id]: requestError.message || 'Не удалось сохранить лид.' }))
    } finally { setSavingId(null) }
  }

  return (
    <section className="admin-crm admin-kbju-leads">
      <header className="admin-crm__title"><div><p className="admin-menu__eyebrow">Ежедневная очередь</p><h1>Сбор КБЖУ</h1><p>Проверка ресторанов и отслеживание директов.</p></div><div><strong>{leads.length}</strong></div></header>
      {error && <p className="admin-crm__notice admin-crm__notice--error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></p>}
      <div className="admin-crm__filters admin-kbju-leads__filters">
        <label>Дата очереди<input type="date" value={queueDate} onChange={(event) => setQueueDate(event.target.value)} /></label>
        <label>Статус<select value={status} onChange={(event) => { setStatus(event.target.value); setNeedsNudge(false) }} disabled={needsNudge}><option value="">Все статусы</option>{Object.entries(STATUS_LABELS).filter(([value]) => value !== 'needs_nudge').map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="admin-kbju-leads__checkbox"><input type="checkbox" checked={needsNudge} onChange={(event) => { setNeedsNudge(event.target.checked); if (event.target.checked) setStatus('') }} /> Нужно напомнить</label>
        <button type="button" onClick={load} disabled={loading}><Search size={16} /> Обновить</button>
      </div>
      {loading ? <p className="admin-crm__loading">Загружаем очередь…</p> : (
        <div className="admin-crm__table-wrap admin-kbju-leads__table-wrap"><table className="admin-crm__table admin-kbju-leads__table"><thead><tr><th>Ресторан</th><th>Instagram</th><th>Сайт</th><th>Шаг</th><th>Статус</th><th>Источник КБЖУ</th><th>Дата ЛС</th><th>Ответ</th><th>Изменить</th></tr></thead><tbody>
          {leads.map((lead) => <tr key={lead.id} className={lead.effective_status === 'needs_nudge' ? 'requires-action' : ''}>
            <td data-label="Ресторан"><strong>{lead.name}</strong><small>{lead.city}</small></td>
            <td data-label="Instagram"><a href={lead.instagram_url} target="_blank" rel="noreferrer">@{lead.instagram_handle} <ExternalLink size={13} /></a></td>
            <td data-label="Сайт">{lead.website_url ? <a href={lead.website_url} target="_blank" rel="noreferrer">Открыть сайт <ExternalLink size={13} /></a> : <span className="admin-crm__muted">—</span>}</td>
            <td data-label="Шаг">{STEP_LABELS[lead.check_step] || lead.check_step}</td>
            <td data-label="Статус"><span className={`admin-kbju-leads__status admin-kbju-leads__status--${lead.effective_status}`}>{STATUS_LABELS[lead.effective_status] || lead.effective_status}</span></td>
            <td data-label="Источник КБЖУ">{SOURCE_LABELS[lead.kbju_source] || <span className="admin-crm__muted">—</span>}</td>
            <td data-label="Дата ЛС">{displayDate(lead.dm_sent_at)}</td>
            <td data-label="Ответ">{lead.last_reply_at ? displayDate(lead.last_reply_at) : <span className="admin-crm__muted">Нет</span>}</td>
            <td data-label="Изменить"><details className="admin-kbju-leads__details"><summary>Открыть</summary><LeadEditor lead={lead} saving={savingId === lead.id} onSave={save} error={editorError[lead.id]} /></details></td>
          </tr>)}
        </tbody></table>{!leads.length && <div className="admin-menu__empty">По выбранным условиям лидов нет.</div>}</div>
      )}
    </section>
  )
}
