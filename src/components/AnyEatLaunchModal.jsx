import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, apiPost } from '@/lib/api'
import { useAuth, selectSetToken } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import preview from '@/assets/anyeat-phone-left.png'
import { Apple, BookText, Mail, Rocket, Utensils } from 'lucide-react'
import './AnyEatLaunchModal.css'

const CONSENT_VERSION = 'restaurantsecret-communications-2026-09-16'
const YANDEX_METRIKA_COUNTER_ID = 108992733
const RESEND_COOLDOWN = 60
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
  const setToken = useAuth(selectSetToken)
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
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  // Anonymous visitors go through the same email → OTP code → consent flow
  // as regular registration (/login) — there is no account, and therefore
  // no user_id to attach a consent record to, until this completes.
  const [otpStep, setOtpStep] = useState('email') // 'email' | 'code'
  const [code, setCode] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

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

  // Load the account's known email/consent for logged-in visitors (including
  // one who just completed the OTP step below) so the form can prefill and
  // skip questions it already has answers to.
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
    if (resendTimer <= 0) return
    const id = setInterval(() => setResendTimer((value) => value - 1), 1000)
    return () => clearInterval(id)
  }, [resendTimer])

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

  const doRequestOtp = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await apiPost('/auth/request-otp', { email: email.trim() })
      if (!res?.ok) throw new Error('request_otp_failed')
      setOtpStep('code')
      setResendTimer(RESEND_COOLDOWN)
      trackGoal(`anyeat_modal_otp_requested_${segment}`)
    } catch {
      setError('Не удалось отправить код. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  const requestOtp = (event) => {
    event.preventDefault()
    doRequestOtp()
  }

  const verifyOtp = async (event) => {
    event.preventDefault()
    if (code.trim().length < 4 || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await apiPost('/auth/verify-otp', { email: email.trim(), code: code.trim() })
      if (!res?.ok || !res?.access_token) throw new Error('verify_otp_failed')
      setToken(res.access_token)
      // The account consent form below (shared with already-logged-in
      // visitors) takes over once `token` is set — nothing else to do here.
    } catch {
      setError('Неверный или истёкший код. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  const resendOtp = () => {
    if (resendTimer > 0 || submitting) return
    doRequestOtp()
  }

  const backToEmailStep = () => {
    if (submitting) return
    setOtpStep('email')
    setCode('')
    setError('')
    setResendTimer(0)
  }

  const canSubmit = /^\S+@\S+\.\S+$/.test(email.trim()) &&
    consents.personal_data_advertising && consents.marketing_communications && !submitting

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    if (!accountEmail || email.trim().toLowerCase() !== accountEmail.toLowerCase()) {
      setError('Укажите почту вашего аккаунта RestaurantSecret.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await apiPost('/api/consent/communications', {
        personal_data_advertising: true,
        marketing_communications: true,
        consent_version: CONSENT_VERSION,
      }, token)
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

          {!token && otpStep === 'email' && (
            <form className="rs-anyeat__form" onSubmit={requestOtp}>
              <div className="rs-anyeat__formrow">
                <label className="rs-anyeat__field" htmlFor="rs-anyeat-email"><Mail size={20} /><input id="rs-anyeat-email" type="email" autoComplete="email" placeholder="Ваша почта" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <button className="rs-anyeat__submit" type="submit" disabled={submitting || !/^\S+@\S+\.\S+$/.test(email.trim())}>{submitting ? 'Отправляем…' : 'Получить код →'}</button>
              </div>
              {error && <p className="rs-anyeat__error" role="alert">{error}</p>}
              <small className="rs-anyeat__fine">Пришлём код на почту, как при входе в аккаунт <span aria-hidden="true">♡</span></small>
            </form>
          )}

          {!token && otpStep === 'code' && (
            <form className="rs-anyeat__form" onSubmit={verifyOtp}>
              <div className="rs-anyeat__formrow">
                <label className="rs-anyeat__field" htmlFor="rs-anyeat-code"><Mail size={20} /><input id="rs-anyeat-code" type="text" inputMode="numeric" maxLength={6} placeholder="Код из письма" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').trim())} required /></label>
                <button className="rs-anyeat__submit" type="submit" disabled={submitting || code.trim().length < 4}>{submitting ? 'Проверяем…' : 'Подтвердить'}</button>
              </div>
              {error && <p className="rs-anyeat__error" role="alert">{error}</p>}
              <div className="rs-anyeat__otp-actions">
                <button type="button" className="rs-anyeat__link" onClick={backToEmailStep} disabled={submitting}>Назад к почте</button>
                <button type="button" className="rs-anyeat__link" onClick={resendOtp} disabled={submitting || resendTimer > 0}>
                  {resendTimer > 0 ? `Отправить код ещё раз — через ${resendTimer} сек` : 'Отправить код ещё раз'}
                </button>
              </div>
              <small className="rs-anyeat__fine">Код пришёл с noreply@restaurantsecret.ru — проверьте папку «Спам» <span aria-hidden="true">♡</span></small>
            </form>
          )}

          {token && (
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
          )}
        </>}
      </section>
    </div>
  )

  return embedded ? content : createPortal(content, document.body)
}
