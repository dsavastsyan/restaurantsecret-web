// Страница передачи входа из приложения: /auth/handoff#code=...
// Код уже стёрт из адреса встроенным скриптом index.html; здесь он обменивается на сессию.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { apiPostAuth, fetchCurrentUser } from "@/lib/api";
import { maskEmail, safeHandoffNext, takeHandoffCode } from "@/lib/appHandoff";
import { SUBSCRIPTION_CHECKOUT_PATH } from "@/lib/subscriptionCta";
import { getAuthState } from "@/store/auth";
import mobileDayBackground from "@/assets/login/Login bacground mobile day.png";
import desktopDayBackground from "@/assets/login/Login bachround desctop day.png";

type View =
  | { kind: "loading" }
  | { kind: "error"; network: boolean }
  | { kind: "conflict"; email: string };

// Тексты вычитаны через Codex (gpt-5.6-sol), 07.11: на «ты», без точки в конце подписей.
const TEXTS = {
  loadingTitle: "Входим в аккаунт",
  loadingText: "Секунду, открываем оформление подписки",
  errorTitle: "Автоматический вход не сработал",
  errorText: "Код для автоматического входа одноразовый и действует 90 секунд. Попробуй войти по коду из письма — это займёт минуту",
  errorButton: "Войти по коду",
  networkTitle: "Не удалось подключиться",
  networkText: "Проверь подключение к интернету и попробуй ещё раз",
  networkButton: "Повторить",
  // Заголовок нейтральный: мы не знаем, тот же это аккаунт или другой.
  conflictTitle: "На сайте уже выполнен вход",
  conflictText: "Продолжить с этим аккаунтом или войти в аккаунт из приложения?",
  keepButton: "Продолжить с этим аккаунтом",
  switchButton: "Войти в аккаунт из приложения",
};

function ensureNoReferrer() {
  if (typeof document === "undefined") return;
  for (const [name, content] of [["referrer", "no-referrer"], ["robots", "noindex"]]) {
    if (document.querySelector(`meta[name="${name}"]`)) continue;
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  }
}

export default function AuthHandoff() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ kind: "loading" });
  // Код живёт только в памяти этой страницы и расходуется ровно одним обменом.
  const codeRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const redeemingRef = useRef(false);

  const goToLogin = useCallback(() => {
    navigate("/login", { replace: true, state: { from: SUBSCRIPTION_CHECKOUT_PATH } });
  }, [navigate]);

  const redeem = useCallback(async () => {
    const code = codeRef.current;
    if (!code) {
      setView({ kind: "error", network: false });
      return;
    }
    if (redeemingRef.current) return;
    redeemingRef.current = true;
    setView({ kind: "loading" });
    try {
      const res = await apiPostAuth("/auth/handoff/redeem", { code });
      let data: { ok?: boolean; access_token?: string; next?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.ok && data?.ok && data.access_token) {
        codeRef.current = null;
        getAuthState().setToken(data.access_token);
        navigate(safeHandoffNext(data.next), { replace: true });
        return;
      }
      // Сервер ответил отказом: код использован, повторять нельзя.
      codeRef.current = null;
      setView({ kind: "error", network: false });
    } catch {
      // Запрос не дошёл: код не потрачен, можно повторить.
      setView({ kind: "error", network: true });
    } finally {
      redeemingRef.current = false;
    }
  }, [navigate]);

  useEffect(() => {
    ensureNoReferrer();
    if (startedRef.current) return;
    startedRef.current = true;
    codeRef.current = takeHandoffCode();
    if (!codeRef.current) {
      setView({ kind: "error", network: false });
      return;
    }
    (async () => {
      const existing = getAuthState().accessToken;
      if (existing) {
        try {
          const me = await fetchCurrentUser(existing);
          if (me?.ok && me.user?.email) {
            setView({ kind: "conflict", email: maskEmail(me.user.email) });
            return;
          }
        } catch {
          /* старый или недействительный токен: входим как в приложении */
        }
      }
      await redeem();
    })();
  }, [redeem]);

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
          <div className="login__card" role="status" aria-live="polite">
            {view.kind === "loading" && (
              <>
                <h1 className="login__title">{TEXTS.loadingTitle}</h1>
                <p className="login__subtitle">{TEXTS.loadingText}</p>
              </>
            )}
            {view.kind === "error" && (
              <>
                <h1 className="login__title">{view.network ? TEXTS.networkTitle : TEXTS.errorTitle}</h1>
                <p className="login__subtitle">{view.network ? TEXTS.networkText : TEXTS.errorText}</p>
                <div className="login__form">
                  {view.network ? (
                    <button className="login__submit" onClick={redeem}>{TEXTS.networkButton}</button>
                  ) : (
                    <button className="login__submit" onClick={goToLogin}>{TEXTS.errorButton}</button>
                  )}
                </div>
              </>
            )}
            {view.kind === "conflict" && (
              <>
                <h1 className="login__title">{TEXTS.conflictTitle}</h1>
                <p className="login__subtitle">{TEXTS.conflictText}</p>
                <p className="login__subtitle login__subtitle--plain">{view.email}</p>
                <div className="login__form">
                  <button className="login__submit" onClick={() => navigate(safeHandoffNext(null), { replace: true })}>
                    {TEXTS.keepButton}
                  </button>
                  <button className="login__resend" onClick={redeem}>{TEXTS.switchButton}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
