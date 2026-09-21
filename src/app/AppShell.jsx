// Shared layout for authenticated areas. Manages subscription state and toggles
// the paywall overlay when required.
import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { PD_API_BASE } from '@/config/api'
import { loadTelegramWebApp } from '@/lib/telegram'
import { toast } from '@/lib/toast'
import { useAuth } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'
import { clearQrMenuSession, expiredQrMenuSlug, touchQrMenuActivity } from '@/lib/qrMenuAccess'

const NavBar = lazy(() => import('@/components/NavBar'))
const SearchInput = lazy(() => import('@/components/SearchInput'))
const DishCardModal = lazy(() => import('@/components/DishCardModal'))
// Web diary navigation is temporarily disabled while the feature moves to AnyEat.
// const DiaryFloatingButton = lazy(() => import('@/components/DiaryFloatingButton'))
const Footer = lazy(() => import('@/components/Footer.jsx'))
const AnyEatLaunchModal = lazy(() => import('@/components/AnyEatLaunchModal.jsx'))

// Default shape for the subscription/access status persisted in localStorage.
const defaultAccess = { ok: false, isActive: false, expiresAt: null, event: null }

const accessEventMessages = {
  subscription_pending: {
    variant: 'info',
    message: 'Оплата обрабатывается. Повторите проверку доступа через несколько секунд.'
  },
  subscription_expired: {
    variant: 'warning',
    message: 'Подписка истекла. Оформите продление, чтобы открыть доступ.'
  },
  subscription_inactive: {
    variant: 'warning',
    message: 'Подписка пока не активна. Проверьте статус оплаты или попробуйте позже.'
  },
  subscription_error: {
    variant: 'error',
    message: 'Не удалось подтвердить подписку. Попробуйте позже или обратитесь в поддержку.'
  }
}

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const accessToken = useAuth((state) => state.accessToken)
  const fetchSubscriptionStatus = useSubscriptionStore((state) => state.fetchStatus)
  const [access, setAccess] = useState(() => {
    if (typeof window === 'undefined') return defaultAccess
    try {
      const stored = window.localStorage.getItem('rs_access_state')
      if (!stored) return defaultAccess
      const parsed = JSON.parse(stored)
      return { ...defaultAccess, ...parsed }
    } catch (err) {
      console.warn('Failed to parse access state', err)
      return defaultAccess
    }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const lastAccessEventRef = useRef(null)

  // Merge new access info into state. A falsy value resets to defaults.
  const handleAccessUpdate = useCallback((next) => {
    if (!next) {
      setAccess(defaultAccess)
      return
    }
    setAccess(prev => ({ ...prev, ...next }))
  }, [])

  // Persist subscription state so that a refresh keeps the paywall status.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('rs_access_state', JSON.stringify(access))
    } catch (err) {
      console.warn('Failed to persist access state', err)
    }
  }, [access])

  // Sync access state across tabs/windows via the storage event.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (event) => {
      if (event.key !== 'rs_access_state') return
      if (!event.newValue) {
        handleAccessUpdate(defaultAccess)
        return
      }
      try {
        const parsed = JSON.parse(event.newValue)
        handleAccessUpdate(parsed)
      } catch (err) {
        console.warn('Failed to sync access state', err)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [handleAccessUpdate])

  // Listen for custom `rs-access-update` events fired by Paywall and other
  // components to update access immediately after purchase.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event) => {
      if (!event?.detail) return
      handleAccessUpdate(event.detail)
    }
    window.addEventListener('rs-access-update', handler)
    return () => {
      window.removeEventListener('rs-access-update', handler)
    }
  }, [handleAccessUpdate])

  // Surface notable access-related events to the user through toasts.
  useEffect(() => {
    const eventName = access?.event
    if (!eventName) {
      lastAccessEventRef.current = null
      return
    }

    if (lastAccessEventRef.current === eventName) return
    lastAccessEventRef.current = eventName

    const config = accessEventMessages[eventName]
    if (config && typeof toast[config.variant] === 'function') {
      toast[config.variant](config.message)
    }
  }, [access?.event])

  // Apply Telegram-specific tweaks when running inside the WebApp container.
  useEffect(() => {
    let isCancelled = false

    loadTelegramWebApp()
      .then((tg) => {
        if (isCancelled || !tg) return

        tg.ready()
        tg.expand()
        tg.setHeaderColor('bg_color')
      })
      .catch(() => { })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleToastNavigate = (event) => {
      const to = event?.detail?.to
      if (typeof to !== 'string' || !to) return
      navigate(to)
    }
    window.addEventListener('rs:navigate', handleToastNavigate)
    return () => window.removeEventListener('rs:navigate', handleToastNavigate)
  }, [navigate])

  // Expose helpers to descendants through React Router outlet context.
  const requestPaywall = useCallback(() => {
    // Paywall functionality disabled.
  }, [])

  const closePaywall = useCallback(() => {
    // Paywall functionality disabled.
  }, [])

  const requireAccess = useCallback(() => {
    return true
  }, [])

  const showPaywall = false

  useEffect(() => {
    fetchSubscriptionStatus(accessToken)
  }, [accessToken, fetchSubscriptionStatus])

  // Keep a lightweight previous-route pointer for analytics attribution in SPA navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const currentPath = `${location.pathname}${location.search || ''}`
    const previousCurrent = window.sessionStorage.getItem('rs_current_path')
    if (previousCurrent && previousCurrent !== currentPath) {
      window.sessionStorage.setItem('rs_prev_path', previousCurrent)
    }
    window.sessionStorage.setItem('rs_current_path', currentPath)
  }, [location.pathname, location.search])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const scrollToPageTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }

    scrollToPageTop()
    const frame = window.requestAnimationFrame(scrollToPageTop)

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [location.pathname, location.search])

  // Manual refresh triggered by the user after completing payment.
  const refreshAccess = useCallback(async () => {
    try {
      if (!accessToken) {
        toast.info('Войдите в аккаунт, чтобы проверить доступ')
        return
      }
      const response = await fetch(`${PD_API_BASE}/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}`)
      }

      const me = await response.json()
      const derivedEvent = me?.event ?? me?.status ?? (!me?.ok ? 'subscription_error' : null)
      const detail = {
        ok: me?.ok ?? true,
        isActive: Boolean(me?.isActive),
        expiresAt: me?.expiresAt ?? null,
        event: derivedEvent
      }

      handleAccessUpdate(detail)

      if (!detail.isActive && !detail.event) {
        toast.info('Подписка пока не активна. Попробуйте повторить проверку позже.')
      }
    } catch (err) {
      console.error('Failed to refresh access', err)
      toast.error('Не удалось проверить доступ. Попробуйте позже.')
    }
  }, [accessToken, handleAccessUpdate])

  // Values passed to nested routes via useOutletContext.
  const outletContext = useMemo(() => ({
    access,
    handleAccessUpdate,
    refreshAccess,
    requestPaywall,
    closePaywall,
    requireAccess
  }), [access, handleAccessUpdate, refreshAccess, requestPaywall, closePaywall, requireAccess])

  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const isContact = normalizedPath.startsWith('/support')
  const isFeedbackPage = normalizedPath === '/feedback'
  const isLanding = normalizedPath === '/'
  const isTariffsPage = normalizedPath === '/tariffs'
  const isHowItWorksPage = normalizedPath === '/how-it-works'
  const isLoginPage = normalizedPath === '/login'
  const isAccountPage = normalizedPath.startsWith('/account')
  const isImmersivePage = isLoginPage || isAccountPage
  const isMarketingPage = isLanding || isTariffsPage || isHowItWorksPage
  const isRestaurantMenuPage = /^\/(?:restaurants|r)\/[^/]+\/menu\/?$/.test(location.pathname)
  const isRestaurantsCatalogPage =
    normalizedPath === '/restaurants' ||
    normalizedPath === '/catalog' ||
    normalizedPath === '/app/catalog'
  // A chain's bare URL (e.g. /restaurants/syrovarnya) — the hub page, not a
  // single restaurant's menu, so it's excluded by isRestaurantMenuPage's
  // /menu suffix requirement and needs its own, equally full-width container.
  const isChainHubPage = /^\/restaurants\/[^/]+\/?$/.test(normalizedPath)
  const isSearchPage = normalizedPath === '/search' || normalizedPath === '/app/search'

  // Idle guard for QR-scanned menu access: any interaction resets the clock,
  // and 15 minutes of inactivity revokes the temporary pass and, if the user
  // is still looking at that menu, sends them back to the catalog.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const onActivity = () => touchQrMenuActivity()
    const activityEvents = ['click', 'keydown', 'scroll', 'touchstart', 'pointerdown']
    activityEvents.forEach((event) => window.addEventListener(event, onActivity, { passive: true }))

    const checkExpiry = () => {
      const expiredSlug = expiredQrMenuSlug()
      if (!expiredSlug) return
      clearQrMenuSession()
      const currentSlugMatch = /^\/(?:restaurants|r)\/([^/]+)\/menu\/?$/.exec(window.location.pathname)
      if (currentSlugMatch && currentSlugMatch[1] === expiredSlug) {
        navigate('/catalog', { replace: true })
      }
    }
    const interval = window.setInterval(checkExpiry, 30 * 1000)

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, onActivity))
      window.clearInterval(interval)
    }
  }, [navigate])

  // Keep the app in the light theme and expose it via html/body dataset.
  useEffect(() => {
    document.documentElement.setAttribute('data-rs-theme', 'day')
    document.body.setAttribute('data-rs-theme', 'day')
    try {
      window.localStorage.removeItem('rs_theme_preference')
    } catch {
      // Ignore storage errors in restricted browser contexts.
    }
  }, [])

  const showGlobalSearch = useMemo(() => {
    const allowedPrefixes = ['/catalog', '/app']
    const matchesPrefix = allowedPrefixes.some((prefix) =>
      location.pathname === prefix || location.pathname.startsWith(`${prefix}/`)
    )

    const isCatalogRoute =
      location.pathname === '/catalog' ||
      location.pathname.startsWith('/catalog/') ||
      location.pathname === '/app/catalog' ||
      location.pathname.startsWith('/app/catalog/')

    // Каталог ресторанов имеет собственный поисковый блок, поэтому общий поиск
    // здесь не показываем, чтобы избежать дублирования.
    if (isCatalogRoute || location.pathname === '/restaurants' || location.pathname.startsWith('/restaurants/')) {
      return false
    }

    return matchesPrefix
  }, [location.pathname])

  return (
    <div className={`min-h-screen flex flex-col app-theme app-theme--day${isSearchPage ? ' app-theme--search' : ''}`}>
      <Suspense fallback={null}><AnyEatLaunchModal eligible={isLanding || isRestaurantsCatalogPage || isSearchPage || isRestaurantMenuPage} /></Suspense>
      <Suspense fallback={null}>
        {!isMarketingPage && !isImmersivePage && <NavBar forceGuest={isFeedbackPage} />}
        {!isMarketingPage && <DishCardModal />}
        {/* DiaryFloatingButton is kept in the codebase for possible reactivation. */}
      </Suspense>
      <main className="flex-1">
        {isMarketingPage ? (
          <Outlet context={outletContext} />
        ) : isImmersivePage ? (
          <Outlet context={outletContext} />
        ) : isContact ? (
          <div className={showPaywall ? 'contact-wrapper locked' : 'contact-wrapper'}>
            <Outlet context={outletContext} />
          </div>
        ) : isFeedbackPage ? (
          <Outlet context={outletContext} />
        ) : (
          <div className={`${showPaywall ? 'container locked' : 'container'}${isRestaurantMenuPage ? ' container--menu' : ''}${isRestaurantsCatalogPage ? ' container--catalog' : ''}${isChainHubPage ? ' container--chain-hub' : ''}${isSearchPage ? ' container--search' : ''}`}>
            {showGlobalSearch && (
              <div className="app-shell__search">
                <div className="app-shell__search-inner">
                  <Suspense fallback={null}>
                    <SearchInput value={searchQuery} onChange={setSearchQuery} />
                  </Suspense>
                </div>
              </div>
            )}
            <Outlet context={outletContext} />
          </div>
        )}
      </main>
      <Suspense fallback={null}>
        {!isImmersivePage && !isMarketingPage && !isFeedbackPage && <Footer />}
      </Suspense>
    </div>
  )
}
