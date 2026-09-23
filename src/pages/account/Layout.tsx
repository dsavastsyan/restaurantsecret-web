import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import HomeIcon from "@/components/HomeIcon";
import { apiGet, apiPostAuth, isUnauthorizedError } from "@/lib/api";
import { useAuth } from "@/store/auth";

export type Sub = {
  plan: string;
  status: string;
  expires_at: string;
  expired: boolean;
  payment_provider?: string | null;
  payment_method?: string | null;
  provider?: string | null;
  gateway?: string | null;
};
export type Me = {
  ok: boolean;
  user?: {
    id: string;
    email: string;
    first_name?: string | null;
    profile_about?: string | null;
    created_at: string;
    onboarding_completed?: boolean;
    onboarding_completed_at?: string | null;
    subscription: Sub | null;
  };
};

export type AccountOutletContext = {
  me: Me | null;
  sub: Sub | null;
  daysLeft: number | null;
  reload: () => Promise<void>;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  incomingFriendRequestsCount: number;
};

export default function AccountLayout() {
  const navigate = useNavigate();
  const { accessToken, logout } = useAuth((state) => ({
    accessToken: state.accessToken,
    logout: state.logout,
  }));
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(accessToken));
  const [error, setError] = useState<string | null>(null);
  const [incomingFriendRequestsCount, setIncomingFriendRequestsCount] = useState(0);

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const handleOpenLogoutModal = useCallback(() => {
    setIsLogoutModalOpen(true);
  }, []);

  const handleCloseLogoutModal = useCallback(() => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(false);
  }, [isLoggingOut]);

  const handleConfirmLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      if (accessToken) {
        const response = await apiPostAuth("/auth/logout", undefined, accessToken);
        if (!response.ok) {
          console.error("Logout request failed", response.status);
        }
      }
    } catch (error) {
      console.error("Failed to log out", error);
    } finally {
      setIsLoggingOut(false);
      setIsLogoutModalOpen(false);
      logout();
      navigate("/login", { replace: true });
    }
  }, [accessToken, logout, navigate]);

  const load = useCallback(async () => {
    if (!accessToken) {
      setMe(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<Me>("/users/me", accessToken);
      if (!response?.ok) {
        throw new Error("ME_NOT_OK");
      }
      setMe(response);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        logout();
        setMe(null);
        setError(null);
        return;
      }
      console.error("Failed to load account data", err);
      setMe((prev) => prev);
      setError("Не удалось загрузить данные. Попробуйте обновить страницу.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, logout]);

  /* Friends are temporarily disabled. Keep the loader for reactivation.
  const loadIncomingFriendRequestsCount = useCallback(async () => {
    if (!accessToken) {
      setIncomingFriendRequestsCount(0);
      return;
    }

    try {
      const response = await apiGet<{ ok: boolean; incoming_requests?: unknown[] }>("/api/friends", accessToken);
      if (!response?.ok) {
        throw new Error("FRIENDS_NOT_OK");
      }
      const incoming = Array.isArray(response.incoming_requests) ? response.incoming_requests : [];
      setIncomingFriendRequestsCount(incoming.length);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        logout();
        setIncomingFriendRequestsCount(0);
        return;
      }
      console.error("Failed to load incoming friend requests count", err);
      setIncomingFriendRequestsCount(0);
    }
  }, [accessToken, logout]);

  useEffect(() => {
    if (accessToken) {
      load();
    }
  }, [accessToken, load]);

  useEffect(() => {
    if (accessToken) {
      loadIncomingFriendRequestsCount();
    } else {
      setIncomingFriendRequestsCount(0);
    }
  }, [accessToken, loadIncomingFriendRequestsCount, location.pathname]);

  useEffect(() => {
    const onIncomingRequestsCountUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ count?: number }>;
      const count = Number(customEvent.detail?.count);
      if (Number.isFinite(count) && count >= 0) {
        setIncomingFriendRequestsCount(count);
      }
    };
    window.addEventListener("rs:friends-incoming-count", onIncomingRequestsCountUpdate as EventListener);
    return () => {
      window.removeEventListener("rs:friends-incoming-count", onIncomingRequestsCountUpdate as EventListener);
    };
  }, []);
  */

  const sub = me?.user?.subscription || null;
  const hasPremium = Boolean(sub && sub.status !== "none" && !sub.expired);
  const hasSubscriptionHistory = Boolean(sub && sub.status !== "none");
  const showPremiumUpsell = !loading && Boolean(me?.user) && !hasPremium;
  const isAccountRoot = location.pathname === "/account";
  const isProfileSection = isAccountRoot || location.pathname === "/account/profile";
  const isStatisticsPage = location.pathname.startsWith("/account/statistics");

  const navItems = [
    { to: "/account", label: "Профиль", end: true },
    { to: "/account/subscription", label: hasSubscriptionHistory ? "Управлять подпиской" : "Оформить подписку" },
    { to: "/account/payment-methods", label: "Способы оплаты" },
    { to: "/account/goals", label: "Мои цели" },
    { to: "/account/statistics", label: "Дневник питания" },
    { to: "/account/favorites", label: "Избранное" },
  ];
  const mobileTopNavItems = [
    { to: "/account/subscription", label: "Управлять подпиской" },
    { to: "/account/payment-methods", label: "Способы оплаты" },
  ];
  const mobileTabItems = [
    { to: "/catalog", label: "Поиск", icon: "search" },
    { to: "/account/goals", label: "Мои цели", icon: "goals" },
    { to: "/account/statistics", label: "Дневник", icon: "diary" },
    { to: "/account/favorites", label: "Избранное", icon: "favorites" },
    { to: "/account", label: "Профиль", icon: "profile", end: true },
  ];

  const daysLeft = useMemo(() => {
    if (!sub?.expires_at) return null;
    const expiresAt = new Date(sub.expires_at).getTime();
    const diff = Math.ceil((expiresAt - Date.now()) / 86400000);
    return Math.max(0, diff);
  }, [sub?.expires_at]);

  const outletContext: AccountOutletContext = useMemo(
    () => ({
      me,
      sub,
      daysLeft,
      reload: load,
      token: accessToken || null,
      isLoading: loading,
      error,
      incomingFriendRequestsCount,
    }),
    [me, sub, daysLeft, load, accessToken, loading, error, incomingFriendRequestsCount]
  );

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className={`account${isStatisticsPage ? " account--statistics" : ""}`}>
      <div className="account__inner">
        <div className="account__layout">
          <aside className="account__sidebar">
            <Link className="account-brand" to="/" aria-label="На главную страницу RestSecret">
              <HomeIcon className="account-brand__home" />
              <div className="account-brand__copy">
                <span className="account-brand__name">RestSecret</span>
                <span className="account-brand__tagline">
                  <span className="account-brand__tagline-line">Ешь вкусно -</span>
                  <span className="account-brand__tagline-line">выбирай осознанно</span>
                </span>
              </div>
            </Link>

            <nav className="account-nav" aria-label="Навигация по личному кабинету">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `account-nav__link${isActive ? " account-nav__link--active" : ""}`
                  }
                >
                  <AccountNavIcon label={item.label} />
                  <span className="account-nav__label">{item.label}</span>
                  {item.badge ? <span className="account-nav__badge">{item.badge}</span> : null}
                </NavLink>
              ))}
            </nav>

            {showPremiumUpsell && (
              <div className="account-premium-card">
                <span className="account-premium-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m3.5 9 3.8 2.7L12 4l4.7 7.7L20.5 9l-2 9.5h-13L3.5 9Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6.5 21h11" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="account-premium-card__copy">
                  <strong>RestSecret Премиум</strong>
                  <span>Больше возможностей<br />для осознанного выбора</span>
                </div>
                <NavLink className="account-premium-card__link" to="/account/subscription">
                  <span>Узнать больше</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </NavLink>
              </div>
            )}
          </aside>

          <div className="account__main">
            <header className="account__header">
              <div className="account__header-desktop">
                {isProfileSection && (
                  <div className="account__title-row">
                    <h1 className="account__title">Личный кабинет</h1>
                    {hasPremium && (
                      <span className="account-premium-crown" tabIndex={0} aria-label="Премиум пользователь">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                          <path d="m3.5 9 3.8 2.7L12 4l4.7 7.7L20.5 9l-2 9.5h-13L3.5 9Z" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M6.5 21h11" strokeLinecap="round" />
                        </svg>
                        <span className="account-premium-crown__tooltip" role="tooltip">Премиум пользователь</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="account__header-mobile">
                {isAccountRoot ? (
                  <Link className="account-mobile-brand" to="/" aria-label="На главную страницу RestSecret">
                    <HomeIcon className="account-mobile-brand__home" />
                    <span className="account-mobile-brand__name">RestSecret</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="account__mobile-back"
                    onClick={() => navigate("/account")}
                    aria-label="Назад в личный кабинет"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Назад в личный кабинет</span>
                  </button>
                )}
                <div className="account__mobile-controls">
                  <button
                    type="button"
                    className="account-logout-btn account-logout-btn--mobile"
                    onClick={handleOpenLogoutModal}
                    title="Выйти"
                    aria-label="Выйти"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="account__header-actions">
                <button
                  type="button"
                  className="account-logout-btn"
                  onClick={handleOpenLogoutModal}
                  title="Выйти"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="account-logout-btn__label">Выйти</span>
                </button>
              </div>
            </header>

            {isAccountRoot && (
              <div className="account-mobile-dashboard" aria-label="Личный кабинет">
                <h1 className="account-mobile-dashboard__title">Личный кабинет</h1>

                <nav className="account-mobile-nav" aria-label="Навигация по личному кабинету">
                  {mobileTopNavItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `account-mobile-nav__link${isActive ? " account-mobile-nav__link--active" : ""}`
                      }
                    >
                      <span className="account-mobile-nav__icon" aria-hidden="true">
                        <AccountNavIcon label={item.label} />
                      </span>
                      <span className="account-mobile-nav__label">{item.label}</span>
                    </NavLink>
                  ))}
                </nav>

                {showPremiumUpsell && (
                  <div className="account-mobile-premium">
                    <span className="account-mobile-premium__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m3.5 9 3.8 2.7L12 4l4.7 7.7L20.5 9l-2 9.5h-13L3.5 9Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6.5 21h11" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div className="account-mobile-premium__copy">
                      <strong>RestSecret Премиум</strong>
                      <span>Больше возможностей<br />для осознанного выбора</span>
                    </div>
                    <NavLink className="account-mobile-premium__link" to="/account/subscription">
                      <span>Узнать больше</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </NavLink>
                  </div>
                )}
              </div>
            )}

            <div className="account__content">
              <Outlet context={outletContext} />
            </div>
          </div>
        </div>
      </div>

      {isLogoutModalOpen && (
        <div
          className="logout-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          aria-describedby="logout-modal-description"
        >
          <div className="logout-modal__dialog">
            <h3 id="logout-modal-title" className="logout-modal__title">
              Вы уверены, что хотите выйти?
            </h3>
            <p id="logout-modal-description" className="logout-modal__description">
              Вы всегда сможете вернуться, используя свою почту.
            </p>
            <div className="logout-modal__actions">
              <button
                type="button"
                className="account-button account-button--outline"
                onClick={handleCloseLogoutModal}
                disabled={isLoggingOut}
              >
                Отмена
              </button>
              <button
                type="button"
                className="account-button account-button--danger"
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
              >
                Да
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="account-mobile-tabbar" aria-label="Основная навигация">
        {mobileTabItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `account-mobile-tabbar__link${isActive ? " account-mobile-tabbar__link--active" : ""}`
            }
          >
            <AccountTabIcon icon={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function AccountNavIcon({ label }: { label: string }) {
  if (label === "Профиль") {
    return (
      <svg className="account-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20c1.35-3.6 3.7-5.4 7-5.4s5.65 1.8 7 5.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (label.includes("подписк")) {
    return (
      <svg className="account-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M8 4v4M16 4v4M4 11h16M8 15h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (label === "Способы оплаты") {
    return (
      <svg className="account-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
        <path d="M3.5 10h17M7 14h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (label === "Мои цели") {
    return (
      <svg className="account-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 17.5 8.2 13l3.1 3.2 5.2-7.4 3.5 4.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m15.8 8.8 2.7-.5.5 2.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (label === "Дневник питания") {
    return (
      <svg className="account-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9 4v3M15 4v3M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (label === "Избранное") {
    return (
      <svg className="account-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20s-7-4.3-8.4-9.1C2.7 7.6 4.7 5 7.6 5c1.8 0 3.2.9 4.4 2.4C13.2 5.9 14.6 5 16.4 5c2.9 0 4.9 2.6 4 5.9C19 15.7 12 20 12 20Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="account-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M3.5 19c1.1-3 3-4.5 5.5-4.5s4.4 1.5 5.5 4.5" strokeLinecap="round" />
      <path d="M14.8 18.4c.7-1.8 1.9-2.7 3.5-2.7 1.3 0 2.3.5 3.2 1.6" strokeLinecap="round" />
    </svg>
  );
}

function AccountTabIcon({ icon }: { icon: string }) {
  if (icon === "search") {
    return (
      <svg className="account-mobile-tabbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <circle cx="11" cy="11" r="7" />
        <path d="m16.5 16.5 4 4" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "goals") {
    return (
      <svg className="account-mobile-tabbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "diary") {
    return (
      <svg className="account-mobile-tabbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M4 14h16" strokeLinecap="round" />
        <path d="M7 14a5 5 0 0 1 10 0" />
        <path d="M12 6V4" strokeLinecap="round" />
        <path d="M5 18h14" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "favorites") {
    return (
      <svg className="account-mobile-tabbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M12 20s-7-4.3-8.4-9.1C2.7 7.6 4.7 5 7.6 5c1.8 0 3.2.9 4.4 2.4C13.2 5.9 14.6 5 16.4 5c2.9 0 4.9 2.6 4 5.9C19 15.7 12 20 12 20Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="account-mobile-tabbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c1.35-3.6 3.7-5.4 7-5.4s5.65 1.8 7 5.4" strokeLinecap="round" />
    </svg>
  );
}
