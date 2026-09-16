// src/pages/Login.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { apiPost } from "@/lib/api";
import { resetImmersiveViewport, useImmersiveViewport } from "@/hooks/useImmersiveViewport";
import { SUBSCRIPTION_CHECKOUT_PATH } from "@/lib/subscriptionCta";
import { useAuth, selectSetToken } from "@/store/auth"; // <— меняем импорт
import { useSubscriptionStore, selectFetchStatus } from "@/store/subscription";
import { analytics } from "@/services/analytics";
import mobileDayBackground from "@/assets/login/Login bacground mobile day.png";
import desktopDayBackground from "@/assets/login/Login bachround desctop day.png";

const COMMUNICATION_CONSENT_VERSION = "restaurantsecret-communications-2026-09-16";

type PendingLogin = {
  token: string;
  nextPath: string;
  needsOnboarding: boolean;
};

const normalizeAppPath = (value: unknown) => {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
};

const toPathFromLocationState = (value: unknown) => {
  if (value && typeof value === "object" && "pathname" in value) {
    const locationLike = value as { pathname?: unknown; search?: unknown };
    const pathname = typeof locationLike.pathname === "string" ? locationLike.pathname : "";
    const search = typeof locationLike.search === "string" ? locationLike.search : "";
    return normalizeAppPath(pathname + search);
  }

  return normalizeAppPath(value);
};

export default function LoginPage() {
  const setToken = useAuth(selectSetToken); // <— берём сеттер из стора
  const fetchSubscriptionStatus = useSubscriptionStore(selectFetchStatus);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"enter" | "code" | "consent">("enter");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);
  const [personalDataAdvertising, setPersonalDataAdvertising] = useState(false);
  const [marketingCommunications, setMarketingCommunications] = useState(false);
  const shouldAutoFocus = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches,
    []
  );

  useImmersiveViewport(`${location.key}:${step}`);

  const redirectTo = useMemo(() => {
    const from = toPathFromLocationState(location.state?.from);
    const queryNext = searchParams.get("next");
    const queryNextPath = normalizeAppPath(queryNext);
    if (queryNextPath) return queryNextPath;
    if (from) return from;
    return "/account";
  }, [location.state, searchParams]);

  const returnTo = useMemo(() => {
    const stateReturnTo = toPathFromLocationState(location.state?.returnTo);
    if (stateReturnTo && stateReturnTo !== "/login" && stateReturnTo !== SUBSCRIPTION_CHECKOUT_PATH) {
      return stateReturnTo;
    }

    const queryReturnTo = normalizeAppPath(searchParams.get("returnTo"));
    if (queryReturnTo && queryReturnTo !== "/login" && queryReturnTo !== SUBSCRIPTION_CHECKOUT_PATH) {
      return queryReturnTo;
    }

    return null;
  }, [location.state, searchParams]);

  const resolvePostLoginRedirect = async (token: string) => {
    if (redirectTo !== SUBSCRIPTION_CHECKOUT_PATH || !returnTo) return redirectTo;

    const hasActiveSubscription = await fetchSubscriptionStatus(token);
    return hasActiveSubscription ? returnTo : redirectTo;
  };

  const finishLogin = (token: string, needsOnboarding: boolean, nextPath: string) => {
    setToken(token);
    analytics.recordPolicyAcceptance();
    resetImmersiveViewport({ blurActiveElement: true });
    if (needsOnboarding) {
      navigate("/onboarding/welcome", { replace: true, state: { next: nextPath } });
    } else {
      navigate(nextPath, { replace: true });
    }
  };

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const sendCode = async () => {
    setErr(null);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setErr("Укажите корректный e-mail");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/request-otp", { email });
      if (res?.ok) {
        resetImmersiveViewport({ blurActiveElement: true });
        setStep("code");
        setTimer(60);
        analytics.track("otp_request");
      } else {
        setErr(res?.message || "Не удалось отправить код");
      }
    } catch {
      setErr("Не удалось отправить код");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setErr(null);
    if (!code || code.length < 4) {
      setErr("Введите код из письма");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/verify-otp", { email, code });
      if (res?.ok && res?.access_token) {
        const nextPath = await resolvePostLoginRedirect(res.access_token);

        const needsOnboarding = res.onboarding_completed !== true;

        if (res.created && needsOnboarding) {
          analytics.reachGoal("signup_completed", { source_page: "login" });
          analytics.track("signup_completed", { source_page: "login" });
          analytics.track("onboarding_started", { step: "welcome" });
        }
        analytics.track("login_success", { source_page: "login" });

        if (res.communication_consents_required === true) {
          setPendingLogin({ token: res.access_token, nextPath, needsOnboarding });
          resetImmersiveViewport({ blurActiveElement: true });
          setStep("consent");
        } else {
          finishLogin(res.access_token, needsOnboarding, nextPath);
        }
      } else {
        setErr(res?.message || "Неверный код");
      }
    } catch {
      setErr("Не удалось подтвердить код");
    } finally {
      setLoading(false);
    }
  };

  const saveCommunicationConsents = async () => {
    if (!pendingLogin) return;
    setErr(null);
    setLoading(true);
    try {
      await apiPost(
        "/api/consent/communications",
        {
          personal_data_advertising: personalDataAdvertising,
          marketing_communications: marketingCommunications,
          consent_version: COMMUNICATION_CONSENT_VERSION,
        },
        pendingLogin.token,
      );
      finishLogin(pendingLogin.token, pendingLogin.needsOnboarding, pendingLogin.nextPath);
    } catch {
      setErr("Не удалось сохранить выбор. Попробуйте ещё раз");
    } finally {
      setLoading(false);
    }
  };

  const resend = () => {
    if (timer > 0) return;
    sendCode();
  };

  const backToEmail = () => {
    if (loading) return;
    resetImmersiveViewport({ blurActiveElement: true });
    setStep("enter");
    setCode("");
    setErr(null);
    setTimer(0);
  };

  return (
    <div
      className="login"
      style={
        {
          "--login-bg-mobile": `url(${mobileDayBackground})`,
          "--login-bg-desktop": `url(${desktopDayBackground})`,
        } as CSSProperties
      }
    >
      <div className="login__stage">
        <div className="login__wrap">
          {step !== "consent" && <div className="login__card">
            {step === "enter" && <h1 className="login__title">Выбирай легко</h1>}
            <p className={`login__subtitle ${step === "code" ? "login__subtitle--plain" : ""}`}>
              {step === "code" ? "Отправили код на почту" : "Ешь вкусно, выбирай осознанно"}
            </p>

            {err && <div className="login__alert">{err}</div>}

            {step === "enter" && (
              <div className="login__form">
                <div className="login__input-wrap">
                  <span className="login__input-icon" aria-hidden="true">
                    <svg width="18" height="14" viewBox="0 0 24 18" fill="none">
                      <path
                        d="M2.5 4.5 12 10.5l9.5-6"
                        stroke="#8AA3A0"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M3.5 2.5h17a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"
                        stroke="#8AA3A0"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    className="login__input"
                    placeholder="Введите email..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus={shouldAutoFocus}
                    disabled={loading}
                    aria-invalid={!!err}
                  />
                </div>
                <button className="login__submit" onClick={sendCode} disabled={loading}>
                  {loading ? "Отправляем…" : "Продолжить"}
                </button>
              </div>
            )}

            {step === "code" && (
              <div className="login__form">
                <label className="login__label sr-only" htmlFor="code">Код из письма</label>
                <div className="login__input-wrap login__input-wrap--plain login__otp-wrap">
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    className="login__input"
                    placeholder="Введите код"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").trim())}
                    autoFocus={shouldAutoFocus}
                    disabled={loading}
                    aria-invalid={!!err}
                  />
                </div>
                <button className="login__submit" onClick={verifyCode} disabled={loading}>
                  {loading ? "Проверяем…" : "Войти"}
                </button>
                <button
                  type="button"
                  className="login__resend"
                  onClick={backToEmail}
                  disabled={loading}
                >
                  Назад к email
                </button>

                <button
                  type="button"
                  className="login__resend"
                  onClick={resend}
                  disabled={loading || timer > 0}
                  aria-disabled={loading || timer > 0}
                  title={timer > 0 ? `Повторно через ${timer} сек` : "Отправить код ещё раз"}
                >
                  {timer > 0 ? `Отправить код ещё раз — через ${timer} сек` : "Отправить код ещё раз"}
                </button>

                <p className="login__hint">
                  Код придёт с адреса <b>noreply@restaurantsecret.ru</b>.
                  <br />
                  Не видите письмо? Проверьте папку Спам.
                </p>

                <div className="login__legal">
                  <p>
                    Продолжая, вы принимаете{" "}
                    <a href="https://restaurantsecret.ru/legal" target="_blank" rel="noopener noreferrer">
                      Пользовательское соглашение
                    </a>.
                  </p>
                  <p>
                    Обработка персональных данных осуществляется в соответствии с{" "}
                    <a href="https://restaurantsecret.ru/privacy" target="_blank" rel="noopener noreferrer">
                      Политикой конфиденциальности
                    </a>.
                  </p>
                </div>
              </div>
            )}
          </div>}
        </div>
      </div>

      {step === "consent" && (
        <div className="login-consent" role="dialog" aria-modal="true" aria-labelledby="communication-consent-title">
          <div className="login-consent__card">
            <h1 id="communication-consent-title" className="login-consent__title">Оставайтесь на связи</h1>
            <p className="login-consent__subtitle">Выберите, какие материалы хотите получать. Оба пункта необязательны.</p>

            {err && <div className="login__alert">{err}</div>}

            <label className="login-consent__option">
              <input
                type="checkbox"
                checked={personalDataAdvertising}
                onChange={(event) => setPersonalDataAdvertising(event.target.checked)}
                disabled={loading}
              />
              <span>
                Даю согласие на обработку персональных данных, в том числе с целью получения рекламных предложений ({" "}
                <a href="https://restaurantsecret.ru/legal/pdn-consent.pdf" target="_blank" rel="noopener noreferrer">
                  текст согласия
                </a>)
              </span>
            </label>

            <label className="login-consent__option">
              <input
                type="checkbox"
                checked={marketingCommunications}
                onChange={(event) => setMarketingCommunications(event.target.checked)}
                disabled={loading}
              />
              <span>Хочу получать от RestaurantSecret персональные рекомендации, полезные материалы и рекламные предложения.</span>
            </label>

            <button className="login__submit login-consent__submit" onClick={saveCommunicationConsents} disabled={loading}>
              {loading ? "Сохраняем…" : "Продолжить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
