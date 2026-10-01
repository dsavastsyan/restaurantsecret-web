import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, apiPost } from '@/lib/api'
import { requestTurnstileToken } from '@/lib/turnstile'
import { useAuth } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import preview from '@/assets/anyeat-phone-left.png'
import { Apple, BookText, Mail, Rocket, Utensils } from 'lucide-react'
import './AnyEatLaunchModal.css'

const CONSENT_VERSION = 'restaurantsecret-communications-2026-09-16'
const PUBLIC_CONSENT_VERSION = 'anyeat-waitlist-2026-10-01'
const PUBLIC_CONSENT_SOURCE = 'restaurantsecret.ru/anyeat-modal'
// Same Cloudflare Turnstile widget already used by the anti-scraping gate on
// restaurantsecret.ru (see RestaurantSecret/wrangler.toml, TURNSTILE_SITEKEY) —
// one widget, reused here since this form also needs bot protection.
const TURNSTILE_SITEKEY = '0x4AAAAAACJwMg9S_HNbAcRc'
const YANDEX_METRIKA_COUNTER_ID = 108992733
let launchModalRequested = false

function trackGoal(name) {
  try { window.ym?.(YANDEX_METRIKA_COUNTER_ID, 'reachGoal', name) } catch { /* ym not loaded */ }
}

export function openAnyEatLaunchModal() {
  launchModalRequested = true
  window.dispatchEvent(new CustomEvent('rs:anyeat-launch-open'))
}

export default function AnyEatLaunchModal({ embedded = false }) {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('anyeatPreview') === '1'
  const previewOpened = useRef(false)
  const token = useAuth((state) => state.accessToken)
  const hasActiveSub = useSubscriptionStore((state) => state.hasActiveSub)
  const [open, setOpen] = useState(() => {
    const requested = launchModalRequested
    launchModalRequested = false
    return embedded || (previewMode && requested)
  })
  const [email, setEmail] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [consents, setConsents] = useState({ personal_data_advertising: false, marketing_communications: false })
  const [knownConsents, setKnownConsents] = useState({ personal_data_advertising: false, marketing_communications: false })
  const [publicConsent, setPublicConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const segment = token && hasActiveSub ? 'active' : 'default'

  useEffect(() => {
    if (embedded) return
    if (!previewMode || previewOpened.current) return
    previewOpened.current = true
    setOpen(true)
  }, [embedded, previewMode])

  useEffect(() => {
    if (embedded) return
    const show = () => setOpen(true)
    window.addEventListener('rs:anyeat-launch-open', show)
    return () => window.removeEventListener('rs:anyeat-launch-open', show)
  }, [embedded])

  // Load the account's known email/consent for logged-in visitors so the
  // form can prefill and skip questions it already has answers to.
  useEffect(() => {
    if (!open || !token) return
    let active = true

    Promise.all([
      apiGet('/api/v1/me', token),
      apiGet('/api/consent/communications', token),
    ]).then(([me, consent]) => {
      if (!active) return
      const value = me?.user?.email || ''
      setAccountEmail(value)
      setEmail(value)
      const known = {
        personal_data_advertising: consent?.personal_data_advertising === true,
        marketing_communications: consent?.marketing_communications === true,
      }
      setKnownConsents(known)
      setConsents(known)
    }).catch(() => { /* account details are a nice-to-have prefill, not required */ })

    return () => { active = false }
  }, [open, token])

  useEffect(() => {
    if (!open) return
    trackGoal(`anyeat_modal_open_${segment}`)
  }, [open, segment])

  useEffect(() => {
    if (!open) return
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const canSubmit = token
    ? /^\S+@\S+\.\S+$/.test(email.trim()) &&
      consents.personal_data_advertising && consents.marketing_communications && !submitting
    : /^\S+@\S+\.\S+$/.test(email.trim()) && publicConsent && !submitting

  const submitAccountLinked = async () => {
    if (!accountEmail || email.trim().toLowerCase() !== accountEmail.toLowerCase()) {
      setError('Укажите почту вашего аккаунта RestaurantSecret.')
      return
    }
    await apiPost('/api/consent/communications', {
      personal_data_advertising: true,
      marketing_communications: true,
      consent_version: CONSENT_VERSION,
    }, token)
  }

  const submitPublic = async () => {
    let turnstileToken
    try {
      turnstileToken = await requestTurnstileToken(TURNSTILE_SITEKEY)
    } catch (err) {
      if (err?.message?.includes('отмен')) return // widget closed/expired — not an error to surface
      throw err
    }
    await apiPost('/api/marketing-consent', {
      email: email.trim().toLowerCase(),
      status: 'granted',
      consent_version: PUBLIC_CONSENT_VERSION,
      source: PUBLIC_CONSENT_SOURCE,
      turnstile_token: turnstileToken,
    })
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      if (token) {
        await submitAccountLinked()
      } else {
        await submitPublic()
      }
      setSuccess(true)
      trackGoal(`anyeat_modal_submit_${segment}`)
      window.dispatchEvent(new CustomEvent('rs:anyeat-launch-submitted'))
    } catch {
      setError('Не удалось сохранить заявку. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  const headline = segment === 'active'
    ? <h2 id="rs-anyeat-title"><span>Твоя цена</span><br />останется с тобой</h2>
    : <h2 id="rs-anyeat-title"><span>Вся еда</span><br />в одном месте</h2>

  const lead = segment === 'active'
    ? 'Подписка перейдёт в AnyEat автоматически, тем же аккаунтом — платить по текущей цене навсегда.'
    : null

  const content = (
    <div className={`rs-anyeat${embedded ? ' rs-anyeat--embedded' : ''}`} onMouseDown={(event) => { if (!embedded && event.target === event.currentTarget) setOpen(false) }}>
      <section className="rs-anyeat__panel" role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-labelledby="rs-anyeat-title">
        {!embedded && <button className="rs-anyeat__close" type="button" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>}
        {success ? (
          <div className="rs-anyeat__success" role="status"><span>✓</span><h2>Успешно отправлено</h2><p>Обещаем писать только по важным поводам ♡</p></div>
        ) : <>
          <div className="rs-anyeat__content">
            <span className="rs-anyeat__badge"><Rocket size={17} />Скоро в приложении</span>
            {headline}
            {lead && <p className="rs-anyeat__lead">{lead}</p>}
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
            {token ? (
              (!knownConsents.personal_data_advertising || !knownConsents.marketing_communications) && <div className="rs-anyeat__consents">
                {!knownConsents.personal_data_advertising && <label><input type="checkbox" checked={consents.personal_data_advertising} onChange={(event) => setConsents({ ...consents, personal_data_advertising: event.target.checked })} /><span>Даю согласие на <a href="/legal/pdn-consent.pdf" target="_blank" rel="noopener noreferrer">обработку персональных данных</a> в целях отправки рекламных сообщений.</span></label>}
                {!knownConsents.marketing_communications && <label><input type="checkbox" checked={consents.marketing_communications} onChange={(event) => setConsents({ ...consents, marketing_communications: event.target.checked })} /><span>Соглашаюсь получать рассылку RestaurantSecret о запуске AnyEat и других предложениях.</span></label>}
              </div>
            ) : (
              <div className="rs-anyeat__consents">
                <label><input type="checkbox" checked={publicConsent} onChange={(event) => setPublicConsent(event.target.checked)} /><span>Даю согласие на <a href="/legal/pdn-consent.pdf" target="_blank" rel="noopener noreferrer">обработку персональных данных</a> и согласен получить одно письмо о запуске AnyEat.</span></label>
              </div>
            )}
            {error && <p className="rs-anyeat__error" role="alert">{error}</p>}
            <small className="rs-anyeat__fine">Обещаем писать только по важным поводам <span aria-hidden="true">♡</span></small>
          </form>
        </>}
      </section>
    </div>
  )

  return embedded ? content : createPortal(content, document.body)
}
