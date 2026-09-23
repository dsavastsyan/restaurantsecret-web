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
let launchModalRequested = false

function storageKey(base, userKey) {
  return `${base}:${encodeURIComponent(userKey || 'unknown')}`
}

function readTimestamp(key) {
  try { return Number(window.localStorage.getItem(key)) || 0 } catch { return 0 }
}

function writeTimestamp(key, value = Date.now()) {
  try { window.localStorage.setItem(key, String(value)) } catch { /* storage can be disabled */ }
}

function markSeen(userKey) {
  if (!userKey) return
  writeTimestamp(storageKey(STORAGE_KEY, userKey.trim().toLowerCase()))
}

function hasActiveTrial(subscription) {
  const status = typeof subscription?.status === 'string' ? subscription.status.trim().toLowerCase() : ''
  const statusNorm = typeof subscription?.statusNorm === 'string' ? subscription.statusNorm.trim().toLowerCase() : ''
  const active = statusNorm === 'active' || status === 'active' || status === 'canceled'
  if (!active || subscription?.is_trial !== true) return false
  if (!subscription?.expires_at) return true
  const expiresDate = new Date(subscription.expires_at)
  return isNaN(expiresDate.getTime()) || expiresDate > new Date()
}

export function openAnyEatLaunchModal() {
  launchModalRequested = true
  window.dispatchEvent(new CustomEvent('rs:anyeat-launch-open'))
}

export default function AnyEatLaunchModal({ eligible = false, embedded = false }) {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('anyeatPreview') === '1'
  const previewOpened = useRef(false)
  const token = useAuth((state) => state.accessToken)
  const [audienceReady, setAudienceReady] = useState(Boolean(embedded || previewMode))
  const [canShowAudience, setCanShowAudience] = useState(Boolean(embedded || previewMode))
  const [open, setOpen] = useState(() => {
    const requested = launchModalRequested
    launchModalRequested = false
    return embedded || (previewMode && requested)
  })
  const [email, setEmail] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [consents, setConsents] = useState({ personal_data_advertising: false, marketing_communications: false })
  const [knownConsents, setKnownConsents] = useState({ personal_data_advertising: false, marketing_communications: false })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (embedded) return
    if (!previewMode || previewOpened.current) return
    previewOpened.current = true
    setAudienceReady(true)
    setCanShowAudience(true)
    setOpen(true)
  }, [embedded, previewMode])

  useEffect(() => {
    if (embedded) return
    const show = () => {
      if (!canShowAudience) return
      markSeen(accountEmail)
      setOpen(true)
    }
    window.addEventListener('rs:anyeat-launch-open', show)
    return () => window.removeEventListener('rs:anyeat-launch-open', show)
  }, [accountEmail, canShowAudience, embedded])

  useEffect(() => {
    if (embedded || previewMode || canShowAudience) return
    setOpen(false)
  }, [canShowAudience, embedded, previewMode])

  useEffect(() => {
    if (embedded || previewMode) return
    if (!token) {
      setAudienceReady(true)
      setCanShowAudience(false)
      setOpen(false)
      setEmail('')
      setAccountEmail('')
      setKnownConsents({ personal_data_advertising: false, marketing_communications: false })
      setConsents({ personal_data_advertising: false, marketing_communications: false })
      return
    }

    let active = true
    setAudienceReady(false)
    setCanShowAudience(false)

    Promise.all([
      apiGet('/api/v1/me', token),
      apiGet('/api/consent/communications', token),
      apiGet('/api/subscriptions/status', token).catch(() => null),
    ]).then(([me, consent, subscription]) => {
      if (!active) return

      const value = me?.user?.email || ''
      const userKey = value.trim().toLowerCase()
      setAccountEmail(value)
      setEmail(value)

      const known = {
        personal_data_advertising: consent?.personal_data_advertising === true,
        marketing_communications: consent?.marketing_communications === true,
      }
      setKnownConsents(known)
      setConsents(known)

      if (!userKey) {
        setCanShowAudience(false)
        return
      }

      const now = Date.now()
      const lastSeen = readTimestamp(storageKey(STORAGE_KEY, userKey))
      const recentlyShown = now - lastSeen < WEEK
      setCanShowAudience(hasActiveTrial(subscription) && !recentlyShown)
    }).catch(() => {
      if (!active) return
      setCanShowAudience(false)
    }).finally(() => {
      if (active) setAudienceReady(true)
    })

    return () => { active = false }
  }, [embedded, previewMode, token])

  useEffect(() => {
    if (embedded || previewMode || !eligible || open || !audienceReady || !canShowAudience) return
    let actions = 0
    const onAction = (event) => {
      if (!event.isTrusted || event.target?.closest?.('.rs-anyeat')) return
      actions += 1
      if (actions < 2) return
      markSeen(accountEmail)
      setOpen(true)
    }
    document.addEventListener('click', onAction)
    return () => document.removeEventListener('click', onAction)
  }, [accountEmail, audienceReady, canShowAudience, eligible, embedded, open, previewMode])

  useEffect(() => {
    if (!open) return
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const canSubmit = Boolean(token) && /^\S+@\S+\.\S+$/.test(email.trim()) &&
    consents.personal_data_advertising && consents.marketing_communications && !submitting

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      if (!accountEmail || email.trim().toLowerCase() !== accountEmail.toLowerCase()) {
        setError('Укажите почту вашего аккаунта RestaurantSecret.')
        return
      }
      await apiPost('/api/consent/communications', {
        personal_data_advertising: true,
        marketing_communications: true,
        consent_version: CONSENT_VERSION,
      }, token)
      setSuccess(true)
    } catch {
      setError('Не удалось сохранить заявку. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  const content = (
    <div className={`rs-anyeat${embedded ? ' rs-anyeat--embedded' : ''}`} onMouseDown={(event) => { if (!embedded && event.target === event.currentTarget) setOpen(false) }}>
      <section className="rs-anyeat__panel" role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-labelledby="rs-anyeat-title">
        {!embedded && <button className="rs-anyeat__close" type="button" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>}
        {success ? (
          <div className="rs-anyeat__success" role="status"><span>✓</span><h2>Успешно отправлено</h2><p>Обещаем писать только по важным поводам ♡</p></div>
        ) : <>
          <div className="rs-anyeat__content">
            <span className="rs-anyeat__badge"><Rocket size={17} />Скоро в приложении</span>
            <h2 id="rs-anyeat-title"><span>Вся еда</span><br />в одном месте</h2>
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
    </div>
  )

  return embedded ? content : createPortal(content, document.body)
}
