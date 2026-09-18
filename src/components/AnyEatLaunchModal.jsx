import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, apiPost } from '@/lib/api'
import { useAuth } from '@/store/auth'
import preview from '@/assets/anyeat-phone-left.png'
import { Apple, BookText, Mail, Rocket, Utensils } from 'lucide-react'
import './AnyEatLaunchModal.css'

const WEEK = 7 * 24 * 60 * 60 * 1000
const STORAGE_KEY = 'rs_anyeat_launch_seen_v1'
const CONSENT_VERSION = 'restaurantsecret-communications-2026-09-16'

function readLastSeen() {
  try { return Number(window.localStorage.getItem(STORAGE_KEY)) || 0 } catch { return 0 }
}

function markSeen() {
  try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* storage can be disabled */ }
}

export default function AnyEatLaunchModal({ eligible }) {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('anyeatPreview') === '1'
  const previewOpened = useRef(false)
  const token = useAuth((state) => state.accessToken)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [consents, setConsents] = useState({ personal_data_advertising: false, marketing_communications: false })
  const [knownConsents, setKnownConsents] = useState({ personal_data_advertising: false, marketing_communications: false })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!previewMode || previewOpened.current) return
    previewOpened.current = true
    setOpen(true)
  }, [previewMode])

  useEffect(() => {
    if (previewMode || !eligible || open || Date.now() - readLastSeen() < WEEK) return
    let actions = 0
    const onAction = (event) => {
      if (!event.isTrusted || event.target?.closest?.('.rs-anyeat')) return
      actions += 1
      if (actions < 2) return
      markSeen()
      setOpen(true)
    }
    document.addEventListener('click', onAction)
    return () => document.removeEventListener('click', onAction)
  }, [eligible, open, previewMode])

  useEffect(() => {
    if (!open || !token) return
    let active = true
    apiGet('/api/consent/communications', token).then((result) => {
      if (!active) return
      const known = {
        personal_data_advertising: result?.personal_data_advertising === true,
        marketing_communications: result?.marketing_communications === true,
      }
      setKnownConsents(known)
      setConsents(known)
    }).catch(() => {})
    return () => { active = false }
  }, [open, token])

  useEffect(() => {
    if (!open) return
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const canSubmit = /^\S+@\S+\.\S+$/.test(email.trim()) &&
    consents.personal_data_advertising && consents.marketing_communications && !submitting

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      await apiPost('/api/launch-waitlist', {
        email: email.trim(),
        personal_data_advertising: true,
        marketing_communications: true,
        consent_version: CONSENT_VERSION,
      }, token || undefined)
      setSuccess(true)
    } catch {
      setError('Не удалось сохранить заявку. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="rs-anyeat" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="rs-anyeat__panel" role="dialog" aria-modal="true" aria-labelledby="rs-anyeat-title">
        <button className="rs-anyeat__close" type="button" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
        {success ? (
          <div className="rs-anyeat__success" role="status"><span>✓</span><h2>Вы в списке</h2><p>Сообщим вам, как только AnyEat станет доступен.</p></div>
        ) : <>
          <div className="rs-anyeat__content">
            <span className="rs-anyeat__badge"><Rocket size={17} />Скоро в приложении</span>
            <h2 id="rs-anyeat-title"><span>Вся еда</span><br />в одном месте</h2>
            <h3>RestaurantSecret скоро будет в AnyEat</h3>
            <p>Совсем скоро можно будет учитывать не только рестораны. Добавляем продукты, единый дневник питания и всё необходимое, чтобы следить за рационом в одном приложении.</p>
          </div>
          <div className="rs-anyeat__visual" aria-hidden="true">
            <div className="rs-anyeat__orb rs-anyeat__orb--one" /><div className="rs-anyeat__orb rs-anyeat__orb--two" />
            <img src={preview} alt="" />
            <span className="rs-anyeat__note rs-anyeat__note--top">Больше возможностей<br />для вашего рациона</span>
            <span className="rs-anyeat__note rs-anyeat__note--bottom">Здоровые привычки<br />всегда под рукой ♡</span>
          </div>
          <div className="rs-anyeat__features" aria-label="Возможности приложения">
            <div><span className="rs-anyeat__icon"><Utensils size={19} /></span><strong>Рестораны</strong><small>Блюда и калории</small></div>
            <div><span className="rs-anyeat__icon"><Apple size={19} /></span><strong>Продукты</strong><small>Сканируйте и ищите</small></div>
            <div><span className="rs-anyeat__icon"><BookText size={19} /></span><strong>Дневник</strong><small>Всё в одном месте</small></div>
          </div>
          <form className="rs-anyeat__form" onSubmit={submit}>
            <div className="rs-anyeat__formrow">
              <label className="rs-anyeat__field" htmlFor="rs-anyeat-email"><Mail size={20} /><input id="rs-anyeat-email" type="email" autoComplete="email" placeholder="Ваша почта" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <button className="rs-anyeat__submit" type="submit" disabled={!canSubmit}>{submitting ? 'Отправляем…' : 'Сообщить мне о запуске →'}</button>
            </div>
            {(!knownConsents.personal_data_advertising || !knownConsents.marketing_communications) && <div className="rs-anyeat__consents">
              {!knownConsents.personal_data_advertising && <label><input type="checkbox" checked={consents.personal_data_advertising} onChange={(event) => setConsents({ ...consents, personal_data_advertising: event.target.checked })} /><span>Даю согласие на <a href="/legal/pdn-consent.pdf" target="_blank" rel="noopener noreferrer">обработку персональных данных</a> в целях отправки рекламных сообщений.</span></label>}
              {!knownConsents.marketing_communications && <label><input type="checkbox" checked={consents.marketing_communications} onChange={(event) => setConsents({ ...consents, marketing_communications: event.target.checked })} /><span>Соглашаюсь получать рассылку RestaurantSecret о запуске AnyEat и других предложениях.</span></label>}
            </div>}
            {error && <p className="rs-anyeat__error" role="alert">{error}</p>}
            <small className="rs-anyeat__fine">Обещаем писать только по важным поводам <span aria-hidden="true">♡</span></small>
          </form>
        </>}
      </section>
    </div>, document.body
  )
}
