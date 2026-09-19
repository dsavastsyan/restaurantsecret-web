// Application-level router wiring. The Router component picks between
// BrowserRouter (regular web) and HashRouter (Telegram WebApp) and renders the
// full route tree.
import React, { Suspense, lazy } from 'react'
import { BrowserRouter, HashRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import AppShell from '../app/AppShell.jsx'
import { isTelegramLaunch } from '../lib/telegram'
import NotFound from '../pages/NotFound.jsx'
import { analytics } from '../services/analytics'
import { PARTNER_ADMIN_ENABLED } from '../pages/admin/adminFeatures'

const Landing = lazy(() => import('../pages/Landing.jsx'))
const QrMenuAccess = lazy(() => import('../pages/QrMenuAccess.jsx'))
const Catalog = lazy(() => import('../pages/Catalog.jsx'))
const Menu = lazy(() => import('../pages/Menu.jsx'))
const ChainHub = lazy(() => import('../pages/ChainHub.jsx'))
const Search = lazy(() => import('../pages/Search.jsx'))
const PaySuccess = lazy(() => import('../pages/PaySuccess.jsx'))
const PaymentResult = lazy(() => import('../pages/PaymentResult.jsx'))
const Login = lazy(() => import('../pages/Login.tsx'))
const OnboardingWelcome = lazy(() => import('../pages/OnboardingWelcome.tsx'))
const OnboardingProfile = lazy(() => import('../pages/OnboardingProfile.tsx'))
const Contact = lazy(() => import('../pages/Contact.jsx'))
const Legal = lazy(() => import('../pages/Legal.jsx'))
const Privacy = lazy(() => import('../pages/Privacy.jsx'))
const IOSLegalDocument = lazy(() => import('../pages/IOSLegalDocument.jsx'))
const IOSLegalTerms = lazy(() => import('../pages/IOSLegalTerms.jsx'))
const LegalVersionRoute = lazy(() => import('../pages/LegalVersionRoute.jsx'))
const PrivacyVersionRoute = lazy(() => import('../pages/PrivacyVersionRoute.jsx'))
const Tariffs = lazy(() => import('../pages/Tariffs.jsx'))
const Licenses = lazy(() => import('../pages/Licenses.jsx'))
const PartnerShell = lazy(() => import('../pages/partners/PartnerShell.jsx'))
const PartnersLogin = lazy(() => import('../pages/partners/Login.jsx'))
const PartnersDashboard = lazy(() => import('../pages/partners/Dashboard.jsx'))
const PartnersUploadMenu = lazy(() => import('../pages/partners/UploadMenu.jsx'))
const PartnersUploadPhotos = lazy(() => import('../pages/partners/UploadPhotos.jsx'))
const PartnersMenuPreview = lazy(() => import('../pages/partners/MenuPreview.jsx'))
const PartnersSeasonalMenu = lazy(() => import('../pages/partners/SeasonalMenuFlow.jsx'))
const AdminShell = lazy(() => import('../pages/admin/AdminShell.jsx'))
const AdminLogin = lazy(() => import('../pages/admin/AdminLogin.jsx'))
const AdminRestaurants = lazy(() => import('../pages/admin/AdminRestaurantList.jsx'))
const AdminOutreach = lazy(() => import('../pages/admin/AdminOutreach.jsx'))
const AdminMenuRevisions = lazy(() => import('../pages/admin/MenuRevisionList.jsx'))
const AdminMenuRevisionDetail = lazy(() => import('../pages/admin/MenuRevisionDetail.jsx'))
const AdminProductMatches = lazy(() => import('../pages/admin/ProductMatchReview.jsx'))
const AdminKbjuFlags = lazy(() => import('../pages/admin/KbjuFlagReview.jsx'))
const AdminRestaurantAttributeReviews = lazy(() => import('../pages/admin/AdminRestaurantAttributeReviews.jsx'))
const AccountLayout = lazy(() => import('../pages/account/Layout.tsx'))
const AccountOverview = lazy(() => import('../pages/account/Overview.tsx'))
const AccountSubscription = lazy(() => import('../pages/account/Subscription.tsx'))
const Feedback = lazy(() => import('../pages/Feedback.jsx'))
const HowItWorks = lazy(() => import('../pages/HowItWorks.jsx'))
const SubscriptionHistoryPage = lazy(() => import('../pages/account/SubscriptionHistoryPage.tsx'))
const Favorites = lazy(() => import('../pages/account/Favorites.tsx'))
// Friends pages are temporarily disabled until the mobile experience launches.
// const Friends = lazy(() => import('../pages/account/Friends.tsx'))
// const FriendFavorites = lazy(() => import('../pages/account/FriendFavorites.tsx'))
const AnyEatComingSoon = lazy(() => import('../pages/account/AnyEatComingSoon.tsx'))
const PaymentMethods = lazy(() => import('../pages/account/PaymentMethods.tsx'))

// Defines the route tree shared between BrowserRouter and HashRouter. Keeping
// this as a separate component makes it easier to unit test in isolation.
function AppRoutes({ onReady }) {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route
          path="legal/ios/privacy"
          element={<IOSLegalDocument><Privacy /></IOSLegalDocument>}
        />
        <Route
          path="legal/ios/terms"
          element={<IOSLegalDocument><IOSLegalTerms /></IOSLegalDocument>}
        />

        <Route path="/" element={<AppShell />}>
          {/* Публичные страницы */}
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="onboarding/welcome" element={<OnboardingWelcome />} />
          <Route path="onboarding/profile/:step" element={<OnboardingProfile />} />
          <Route path="legal" element={<Legal />} />
          <Route path="legal/versions/:date" element={<LegalVersionRoute />} />
          <Route path="tariffs" element={<Tariffs />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="privacy/versions/:date" element={<PrivacyVersionRoute />} />
          <Route path="licenses" element={<Licenses />} />
          <Route path="support" element={<Contact />} />
          <Route path="contact" element={<Navigate to="/support" replace />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="account" element={<AccountLayout />}>
            <Route index element={<AccountOverview />} />
            <Route path="profile" element={<AccountOverview />} />
            <Route path="subscription" element={<AccountSubscription />} />
            <Route path="subscription/history" element={<SubscriptionHistoryPage />} />
            <Route path="payment-methods/*" element={<PaymentMethods />} />
            <Route path="favorites" element={<Favorites />} />
            {/* Friends routes are temporarily unavailable; implementation files are kept. */}
            <Route path="friends/*" element={<Navigate to="/account" replace />} />
            <Route path="goals" element={<AnyEatComingSoon />} />
            <Route path="statistics" element={<AnyEatComingSoon />} />
          </Route>

          {/* Основной контент */}
          <Route path="catalog" element={<Catalog />} />
          <Route path="catalog/:city" element={<Catalog />} />
          <Route path="restaurants" element={<Catalog />} />
          <Route path="search" element={<Search />} />
          <Route path="restaurants/:slug" element={<ChainHub />} />
          <Route path="restaurants/:slug/menu" element={<Menu />} />
          <Route path="qr/:token" element={<QrMenuAccess />} />
          <Route path="r/:slug" element={<ShortRestaurantRedirect />} />
          <Route path="r/:slug/menu" element={<ShortMenuRedirect />} />
          <Route path="pay/success" element={<PaySuccess />} />
          <Route path="pay/result" element={<PaymentResult />} />
          <Route path="payments/result" element={<PaymentResult />} />

          {/* AppShell зона с табами */}
          <Route path="app" element={<Outlet />}>
            <Route index element={<Catalog />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="search" element={<Search />} />
            <Route path="favorites" element={<div>TODO: Favorites</div>} />
            <Route path="profile" element={<div>TODO: Profile</div>} />
            <Route path="*" element={<Navigate to="catalog" replace />} />
          </Route>

          {/* Легаси-ссылки */}
          <Route path="restaurant/:slug" element={<LegacyRestaurantRedirect />} />
          <Route path="restaurant/:slug/menu" element={<LegacyMenuRedirect />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Restaurant self-serve portal — deliberately outside AppShell, own layout/auth. */}
        <Route path="partners" element={<PartnerShell />}>
          <Route index element={<Navigate to="/partners/dashboard" replace />} />
          <Route path="login" element={<PartnersLogin />} />
          <Route path="dashboard" element={<PartnersDashboard />} />
          <Route path="upload" element={<PartnersUploadMenu />} />
          <Route path="photos" element={<PartnersUploadPhotos />} />
          <Route path="menu-preview/:draftId" element={<PartnersMenuPreview />} />
          <Route path="seasonal/:menuId" element={<PartnersSeasonalMenu />} />
          <Route path="*" element={<Navigate to="/partners/dashboard" replace />} />
        </Route>

        <Route path="admin" element={<AdminShell />}>
          <Route index element={<Navigate to="/admin/restaurants" replace />} />
          <Route path="login" element={<AdminLogin />} />
          <Route path="restaurants" element={<AdminRestaurants />} />
          <Route path="outreach" element={<AdminOutreach />} />
          {PARTNER_ADMIN_ENABLED && <Route path="menu-revisions" element={<AdminMenuRevisions />} />}
          {PARTNER_ADMIN_ENABLED && <Route path="menu-revisions/:revisionId" element={<AdminMenuRevisionDetail />} />}
          <Route path="product-matches" element={<AdminProductMatches />} />
          <Route path="kbju-flags" element={<AdminKbjuFlags />} />
          <Route path="restaurant-reviews" element={<AdminRestaurantAttributeReviews />} />
          <Route path="*" element={<Navigate to="/admin/restaurants" replace />} />
        </Route>
      </Routes>
      <AppReadySignal onReady={onReady} />
    </Suspense>
  )
}

// Chooses the router implementation based on the environment and mounts the
// AppRoutes component.
export default function Router({ children, onReady, onRouteStart }) {
  const inTelegram = isTelegramLaunch()
  if (!inTelegram && typeof window !== 'undefined' && window.location.pathname === '/') {
    const redirectPath = window.sessionStorage.getItem('redirectPath')
    if (redirectPath && redirectPath.startsWith('/') && redirectPath !== '/') {
      window.sessionStorage.removeItem('redirectPath')
      window.history.replaceState(null, '', redirectPath)
    }
  }
  if (!inTelegram && typeof window !== 'undefined' && window.location.pathname === '/' && window.location.hash.startsWith('#/')) {
    const legacyPath = window.location.hash.slice(1)
    if (legacyPath.startsWith('/')) {
      window.history.replaceState(null, '', legacyPath)
    }
  }
  const RouterImpl = inTelegram ? HashRouter : BrowserRouter

  return (
    <RouterImpl>
      <RouteSplashController onRouteStart={onRouteStart} />
      <MetrikaRouteTracker />
      <AppRoutes onReady={onReady} />
      {children}
    </RouterImpl>
  )
}

function RouteSplashController({ onRouteStart }) {
  const location = useLocation()
  const previousKeyRef = React.useRef(location.key)

  React.useEffect(() => {
    if (previousKeyRef.current === location.key) return
    previousKeyRef.current = location.key
    onRouteStart?.()
  }, [location.key, onRouteStart])

  return null
}

function MetrikaRouteTracker() {
  const location = useLocation()
  const isInitialRenderRef = React.useRef(true)

  React.useEffect(() => {
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false
      return
    }

    const url = `${window.location.origin}${location.pathname}${location.search}${location.hash}`
    analytics.trackPageView(url)
  }, [location.pathname, location.search, location.hash])

  return null
}

function AppReadySignal({ onReady }) {
  const location = useLocation()

  React.useEffect(() => {
    onReady?.()
  }, [location.key, onReady])

  return null
}

// Redirect short public links to the canonical restaurant URL.
function ShortRestaurantRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={`/restaurants/${slug}/menu/`} replace />
}

// Redirect short public menu links to the canonical menu URL.
function ShortMenuRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={`/restaurants/${slug}/menu/`} replace />
}

// Redirect old `/restaurant/:slug` paths to the canonical structure.
function LegacyRestaurantRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={`/restaurants/${slug}/menu/`} replace />
}

// Redirect old `/restaurant/:slug/menu` paths to the canonical menu URL.
function LegacyMenuRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={`/restaurants/${slug}/menu/`} replace />
}
