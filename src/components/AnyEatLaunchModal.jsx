import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import { analytics } from '@/services/analytics'
import preview from '@/assets/anyeat-phone-left.png'
import { Apple, BookText, Rocket, Utensils } from 'lucide-react'
import './AnyEatLaunchModal.css'

const YANDEX_METRIKA_COUNTER_ID = 108992733
const MODAL_ID = 'anyeat_launch'
const DEFAULT_OPEN_SOURCE = 'unknown'
let launchModalRequested = false
let launchModalSource = DEFAULT_OPEN_SOURCE

function trackGoal(name) {
  try { window.ym?.(YANDEX_METRIKA_COUNTER_ID, 'reachGoal', name) } catch { /* ym not loaded */ }
}

function trackModalEvent(eventName, props = {}) {
  analytics.track(eventName, { modal: MODAL_ID, ...props })
}

export function trackAnyEatStoreClick(store) {
  if (!store) return
  trackModalEvent('anyeat_modal_store_clicked', { store })
}

// AnyEat is in beta: every "AnyEat" CTA on the site opens this window with the
// store buttons (App Store, APK) instead of the old waitlist form.
// `source` names the CTA (banner, dish_card, ...), so clicks stay splittable by
// entry point in analytics_event.
export const ANYEAT_SITE_URL = 'https://anyeat.ru/'
export const APP_STORE_URL = 'https://apps.apple.com/ru/app/id6799767816'
export const APK_URL = 'https://anyeat.ru/downloads/AnyEat-0.1.0.apk'

export function openAnyEatLaunchModal(source = DEFAULT_OPEN_SOURCE) {
  window.dispatchEvent(new CustomEvent('rs:anyeat-launch-open', { detail: { source } }))
}

export default function AnyEatLaunchModal({ embedded = false }) {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('anyeatPreview') === '1'
  const previewOpened = useRef(false)
  const token = useAuth((state) => state.accessToken)
  const hasActiveSub = useSubscriptionStore((state) => state.hasActiveSub)
  const [openSource, setOpenSource] = useState(launchModalSource)
  const [open, setOpen] = useState(() => {
    const requested = launchModalRequested
    launchModalRequested = false
    return embedded || (previewMode && requested)
  })

  const segment = token && hasActiveSub ? 'active' : 'default'
  const closeModal = (reason) => {
    if (!open || embedded) return
    trackModalEvent('anyeat_modal_closed', { segment, reason, source: openSource })
    setOpen(false)
  }

  useEffect(() => {
    if (embedded) return
    if (!previewMode || previewOpened.current) return
    previewOpened.current = true
    setOpen(true)
  }, [embedded, previewMode])

  useEffect(() => {
    if (embedded) return
    const show = (event) => {
      setOpenSource(event?.detail?.source || DEFAULT_OPEN_SOURCE)
      setOpen(true)
    }
    window.addEventListener('rs:anyeat-launch-open', show)
    return () => window.removeEventListener('rs:anyeat-launch-open', show)
  }, [embedded])

  useEffect(() => {
    if (!open || embedded) return
    trackModalEvent('anyeat_modal_viewed', { segment, source: openSource })
    trackGoal(`anyeat_modal_open_${segment}`)
  }, [embedded, open, segment])

  useEffect(() => {
    if (!open || embedded) return
    const onKey = (event) => {
      if (event.key === 'Escape') closeModal('escape')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, segment, embedded])

  if (!open) return null

  const headline = segment === 'active'
    ? <h2 id="rs-anyeat-title"><span>Твоя подписка</span><br />уже в приложении</h2>
    : <h2 id="rs-anyeat-title"><span>Вся еда</span><br />в одном месте</h2>

  const content = (
    <div className={`rs-anyeat${embedded ? ' rs-anyeat--embedded' : ''}`} onMouseDown={(event) => { if (!embedded && event.target === event.currentTarget) closeModal('backdrop') }}>
      <section className="rs-anyeat__panel" role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-labelledby="rs-anyeat-title">
        {!embedded && <button className="rs-anyeat__close" type="button" onClick={() => closeModal('button')} aria-label="Закрыть">×</button>}
        <div className="rs-anyeat__content">
          <span className="rs-anyeat__badge"><Rocket size={17} />Бета-версия · ранний доступ</span>
          {headline}
        </div>
        <div className="rs-anyeat__visual" aria-hidden="true">
          <div className="rs-anyeat__orb rs-anyeat__orb--one" /><div className="rs-anyeat__orb rs-anyeat__orb--two" />
          <img src={preview} alt="" />
          <span className="rs-anyeat__note rs-anyeat__note--top">Больше возможностей<br />для вашего рациона</span>
          <span className="rs-anyeat__note rs-anyeat__note--bottom">Здоровые привычки<br />всегда под рукой ♡</span>
        </div>
        <div className="rs-anyeat__features" aria-label="Возможности приложения">
          <div><span className="rs-anyeat__icon"><Utensils size={19} /></span><strong>Рестораны</strong></div>
          <div><span className="rs-anyeat__icon"><Apple size={19} /></span><strong>Продукты</strong></div>
          <div><span className="rs-anyeat__icon"><BookText size={19} /></span><strong>Дневник</strong></div>
        </div>
        <div className="rs-anyeat__stores">
          <a className="rs-anyeat__store rs-anyeat__store--dark" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackAnyEatStoreClick('appstore')}>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3.1.7c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.6-1-2.6-3.7zM14.1 5.8c.6-.8 1.1-1.9.9-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.9-1.3z" /></svg>
            <span><small>Загрузить в</small>App Store</span>
          </a>
          <a className="rs-anyeat__store rs-anyeat__store--light" href={APK_URL} download onClick={() => trackAnyEatStoreClick('apk')}>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.9 15.5c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm10.2 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zM17.3 9.8l1.7-3c.1-.2 0-.4-.2-.5-.2-.1-.4 0-.5.2l-1.7 3.1c-1.3-.6-2.8-.9-4.4-.9-1.6 0-3.1.3-4.4.9L5.1 6.5c-.1-.2-.3-.3-.5-.2-.2.1-.3.3-.2.5l1.7 3C3.2 11.5 1.3 14.1 1 17.2h22c-.3-3.1-2.2-5.7-5.7-7.4z" /></svg>
            <span><small>Для Android</small>Скачать APK</span>
          </a>
          <small className="rs-anyeat__fine">Вместе создаём твой идеальный трекер</small>
        </div>
      </section>
    </div>
  )

  return embedded ? content : createPortal(content, document.body)
}
