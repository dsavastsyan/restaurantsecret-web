import { useEffect, useState } from 'react'
import { Rocket } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import { openAnyEatLaunchModal } from '@/components/AnyEatLaunchModal'
import './AnyEatLaunchBanner.css'

const DISMISS_KEY = 'rs_anyeat_banner_dismissed_v1'
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

const COPY = {
  active: {
    text: 'Твоя подписка переходит в AnyEat автоматически — цена останется прежней.',
    cta: 'Подробнее',
  },
  default: {
    text: 'Скоро AnyEat — рестораны, продукты и дневник питания в одном приложении.',
    cta: 'Узнать первым',
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
  }

  const handleCtaClick = () => {
    trackGoal(`anyeat_banner_cta_${segment}`)
    openAnyEatLaunchModal()
  }

  return (
    <div className="rs-anyeat-banner" role="note">
      <div className="rs-anyeat-banner__inner">
        <Rocket size={16} className="rs-anyeat-banner__icon" aria-hidden="true" />
        <span className="rs-anyeat-banner__text">{copy.text}</span>
        <button type="button" className="rs-anyeat-banner__cta" onClick={handleCtaClick}>
          {copy.cta}
        </button>
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
