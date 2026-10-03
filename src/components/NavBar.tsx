import { Link, useLocation, useNavigate } from "react-router-dom";

import { analytics } from "@/services/analytics";
import { getSubscriptionCheckoutLink } from "@/lib/subscriptionCta";
import { useAuth } from "@/store/auth";
import { useSubscriptionStore } from "@/store/subscription";

import AccountButton from "./AccountButton";
import HomeIcon from "./HomeIcon";

export default function NavBar({ forceGuest = false }: { forceGuest?: boolean }) {
  const token = useAuth((state) => state.accessToken);
  const { showAccountAction, isSubscriptionStatusLoaded } = useSubscriptionStore((state) => ({
    showAccountAction: state.hasActiveSub || state.hasSubscriptionHistory,
    isSubscriptionStatusLoaded: state.isStatusLoaded,
  }));
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === "/login";
  const isOnboardingPage = location.pathname.startsWith("/onboarding");
  const isRestaurantMenuPage = /^\/(?:restaurants|r)\/[^/]+\/menu\/?$/.test(location.pathname);
  const isCatalogPage =
    location.pathname === "/catalog" ||
    location.pathname.startsWith("/catalog/") ||
    location.pathname === "/restaurants" ||
    location.pathname === "/restaurants/";
  const currentPath = location.pathname + location.search;
  const subscriptionCheckoutLink = getSubscriptionCheckoutLink(token, currentPath);
  const goBackToCatalog = () => navigate("/catalog");

  // Полная «лендинговая» шапка: для гостей везде, а для авторизованных —
  // на каталоге и в меню ресторана, чтобы основные разделы были доступны
  // из публичного пользовательского сценария.
  const showFullNav = forceGuest || !token || isCatalogPage || isRestaurantMenuPage;

  if (showFullNav) {
    const isGuestView = forceGuest || !token;

    return (
      <header className="navbar navbar--guest">
        <div className="navbar__inner navbar__inner--guest">
          <div className="navbar__left navbar__brand-group">
            {isRestaurantMenuPage ? (
              <button
                type="button"
                className="navbar__home navbar__menu-back"
                onClick={goBackToCatalog}
                aria-label="Назад к каталогу ресторанов"
              >
                <BackIcon />
              </button>
            ) : (
              <Link to="/" className="navbar__home" aria-label="На главную">
                <HomeIcon />
              </Link>
            )}

            <Link to="/" className="navbar__brand navbar__brand--guest">
              <span>RestaurantSecret</span>
            </Link>
          </div>

          <nav className="navbar__center" aria-label="Разделы">
            <Link to="/catalog/">Рестораны</Link>
            <Link to="/how-it-works">Как работает</Link>
            <Link to="/tariffs">Тарифы</Link>
            <a href="https://t.me/RestSecretSupport_bot" target="_blank" rel="noopener noreferrer">Поддержка</a>
          </nav>

          <div className="navbar__right">
            {isGuestView ? (
              !isLoginPage && (
                <div className="navbar__guest-actions">
                  <Link
                    to="/login"
                    state={{ from: currentPath }}
                    className="navbar__login-link"
                  >
                    Войти
                  </Link>
                  <Link
                    to={subscriptionCheckoutLink.to}
                    state={subscriptionCheckoutLink.state}
                    className="navbar__trial-link"
                    onClick={() => analytics.track("cta_clicked", { location: "nav", text: "Попробовать бесплатно" })}
                  >
                    Попробовать бесплатно
                  </Link>
                </div>
              )
            ) : (
              <div className="navbar__guest-actions">
                {showAccountAction ? (
                  <AccountButton />
                ) : (
                  isSubscriptionStatusLoaded && (
                    <Link
                      to={subscriptionCheckoutLink.to}
                      state={subscriptionCheckoutLink.state}
                      className="navbar__trial-link"
                      onClick={() => analytics.track("cta_clicked", { location: "nav", text: "Попробовать бесплатно" })}
                    >
                      Попробовать бесплатно
                    </Link>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <div className="navbar__left">
          {isRestaurantMenuPage ? (
            <button
              type="button"
              className="navbar__home navbar__menu-back"
              onClick={goBackToCatalog}
              aria-label="Назад к меню ресторанов"
            >
              <BackIcon />
            </button>
          ) : (
            <Link to="/" className="navbar__home" aria-label="На главную">
              <HomeIcon />
            </Link>
          )}
        </div>

        <Link to="/" className="navbar__brand navbar__brand--center">
          <span>RestaurantSecret</span>
        </Link>

        <div className="navbar__right">
          {token && showAccountAction && !location.pathname.startsWith("/account") && !isOnboardingPage && (
            <AccountButton />
          )}
          {token && isSubscriptionStatusLoaded && !showAccountAction && !isOnboardingPage && (
            <Link
              to={subscriptionCheckoutLink.to}
              state={subscriptionCheckoutLink.state}
              className="navbar__trial-link"
              onClick={() => analytics.track("cta_clicked", { location: "nav", text: "Попробовать бесплатно" })}
            >
              Попробовать бесплатно
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function BackIcon({ className = "" }: { className?: string }) {
  return (
    <span className={`rs-home-icon rs-back-icon ${className}`} aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" focusable="false" fill="none">
        <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
