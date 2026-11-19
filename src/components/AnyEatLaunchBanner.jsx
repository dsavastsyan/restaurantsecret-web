import { useEffect, useState } from 'react'
import { Rocket } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import { analytics } from '@/services/analytics'
import { ANYEAT_SITE_URL, APP_STORE_URL, APK_URL } from '@/components/AnyEatLaunchModal'
import './AnyEatLaunchBanner.css'

// v2: the banner changed from "coming soon" to the beta announcement, so
// visitors who closed the old one should see the new one.
const DISMISS_KEY = 'rs_anyeat_banner_dismissed_v2'
const DISMISS_DAYS = 10
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000
const YANDEX_METRIKA_COUNTER_ID = 108992733

function readDismissedAt() {
  try { return Number(window.localStorage.getItem(DISMISS_KEY)) || 0 } catch { return 0 }
}

function writeDismissedAt() {
  try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* storage can be disabled */ }
}

function trackGoal(name) {
  try { window.ym?.(YANDEX_METRIKA_COUNTER_ID, 'reachGoal', name) } catch { /* ym not loaded */ }
}

// The counter has no goals matching the anyeat_banner_* names above, so
// impressions and clicks never reach a report; analytics_event keeps them
// queryable next to the anyeat_modal_* funnel.
function trackBannerEvent(eventName, segment) {
  analytics.track(eventName, { segment })
}

// The CTA goes straight to the store build for the visitor's OS: App Store on
// iOS (iPadOS Safari reports itself as a touch Mac), the APK on Android, and
// the anyeat.ru page with both buttons everywhere else (desktop).

function detectIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function getCtaUrl(isIos) {
  if (isIos) return APP_STORE_URL
  if (typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent || '')) return APK_URL
  return ANYEAT_SITE_URL
}

const IS_IOS = detectIos()
const CTA_URL = getCtaUrl(IS_IOS)

// Text depends on the platform and on whether the visitor has an active
// subscription (their subscription is moving to the app). Desktop gets the
// non-iOS wording.
const COPY = {
  active: {
    text: IS_IOS
      ? 'Твоя подписка переезжает в приложение. Уже в App Store.'
      : 'Твоя подписка переезжает в приложение. Установи первым.',
    cta: 'Скачать',
  },
  default: {
    text: IS_IOS
      ? 'Приложение уже доступно в App Store'
      : 'Приложение уже доступно к установке',
    cta: 'Скачать',
  },
}

export default function AnyEatLaunchBanner({ eligible = false }) {
  const token = useAuth((state) => state.accessToken)
  const hasActiveSub = useSubscriptionStore((state) => state.hasActiveSub)
  const isStatusLoaded = useSubscriptionStore((state) => state.isStatusLoaded)
  const [dismissedAt, setDismissedAt] = useState(readDismissedAt)
  const [announcedSegment, setAnnouncedSegment] = useState(null)

  // Wait for the subscription status fetch before picking a segment for a
  // logged-in visitor, otherwise this would flash the generic copy first and
  // then swap to the founding-price one a beat later.
  const statusReady = !token || isStatusLoaded
  const segment = token && hasActiveSub ? 'active' : 'default'
  const dismissed = Date.now() - dismissedAt < DISMISS_MS
  const visible = eligible && statusReady && !dismissed

  useEffect(() => {
    if (!visible || announcedSegment === segment) return
    setAnnouncedSegment(segment)
    trackGoal(`anyeat_banner_show_${segment}`)
    trackBannerEvent('anyeat_banner_viewed', segment)
  }, [visible, announcedSegment, segment])

  // A successful submission from the modal (opened via this banner or any
  // other AnyEat CTA) retires the banner for good — showing it again to
  // someone who already signed up would just be annoying.
  useEffect(() => {
    const onSubmitted = () => {
      writeDismissedAt()
      setDismissedAt(Date.now())
    }
    window.addEventListener('rs:anyeat-launch-submitted', onSubmitted)
    return () => window.removeEventListener('rs:anyeat-launch-submitted', onSubmitted)
  }, [])

  if (!visible) return null

  const copy = COPY[segment]

  const handleDismiss = () => {
    writeDismissedAt()
    setDismissedAt(Date.now())
    trackGoal(`anyeat_banner_dismiss_${segment}`)
    trackBannerEvent('anyeat_banner_dismissed', segment)
  }

  const handleCtaClick = () => {
    trackGoal(`anyeat_banner_cta_${segment}`)
    trackBannerEvent('anyeat_banner_cta_clicked', segment)
  }

  return (
    <div className="rs-anyeat-banner" role="note">
      <div className="rs-anyeat-banner__inner">
        <Rocket size={22} className="rs-anyeat-banner__icon" aria-hidden="true" />
        <span className="rs-anyeat-banner__text">{copy.text}</span>
        <a
          className="rs-anyeat-banner__cta"
          href={CTA_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleCtaClick}
        >
          {copy.cta}
        </a>
        <button
          type="button"
          className="rs-anyeat-banner__close"
          onClick={handleDismiss}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
    </div>
  )
}
