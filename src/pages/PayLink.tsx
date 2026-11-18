// Страница оплаты по персональной ссылке из письма: /pay?t=<токен>.
// Только выбор тарифа и переход на ЮKassa, без входа и без шапки сайта.
// Токен открывает лишь тарифы и создание платежа для своего аккаунта
// (pd-api: POST /api/pay-link/info и /api/pay-link/create, lib/pay-link.js).
import React, { useEffect, useRef, useState } from "react";
import { PD_API_BASE } from "@/config/api";
import "./PromoLink.css";
import "./PayLink.css";

type Info = { email: string; has_active_subscription: boolean; prices: { monthly: number; annual: number } };
type Phase = "loading" | "ready" | "paying" | "active" | "invalid" | "error";
type Plan = "monthly" | "annual";

const rub = (n: number) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;

async function api(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${PD_API_BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* пустой ответ */
  }
  return { ok: res.ok, status: res.status, data };
}

export default function PayLink() {
  const tokenRef = useRef<string>("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<Info | null>(null);
  const [payingPlan, setPayingPlan] = useState<Plan | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Подписка AnyEat";
    // Токен берём один раз и убираем из адресной строки: он не попадёт в историю и скриншоты
    const t = new URLSearchParams(window.location.search).get("t") || "";
    tokenRef.current = t;
    try {
      window.history.replaceState(null, "", "/pay");
    } catch {
      /* ignore */
    }
    if (!t) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api("/pay-link/info", { token: t });
        if (cancelled) return;
        if (r.status === 401) return setPhase("invalid");
        if (!r.ok) return setPhase("error");
        const data = r.data as unknown as Info;
        setInfo(data);
        setPhase(data.has_active_subscription ? "active" : "ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pay = async (plan: Plan) => {
    setPhase("paying");
    setPayingPlan(plan);
    setErrorText(null);
    try {
      const r = await api("/pay-link/create", { token: tokenRef.current, plan });
      const url = typeof r.data.confirmation_url === "string" ? r.data.confirmation_url : "";
      if (r.ok && url.startsWith("https://")) {
        window.location.href = url;
        return;
      }
      if (r.status === 401) return setPhase("invalid");
      setErrorText(r.status === 429 ? "Слишком много попыток. Попробуй чуть позже" : "Не удалось открыть оплату. Попробуй ещё раз");
    } catch {
      setErrorText("Не удалось открыть оплату. Попробуй ещё раз");
    }
    setPhase("ready");
  };

  const prices = info?.prices ?? { monthly: 199, annual: 1490 };
  const perMonth = Math.round(prices.annual / 12);

  return (
    <div className="pl-page">
      <div className="pl-blob pl-blob--a" aria-hidden />
      <div className="pl-blob pl-blob--b" aria-hidden />
      <main className="pl-card" aria-live="polite">
        <img className="pl-logo" src="/assets/promo/header.png" alt="AnyEat" width={141} height={44} />

        {phase === "loading" && (
          <div className="pl-skeleton" aria-label="Загрузка">
            <span />
            <span />
            <span />
          </div>
        )}

        {(phase === "ready" || phase === "paying") && info && (
          <section className="pl-state pl-enter">
            <h1 className="pl-title pl-title--sm">Выбери подписку</h1>
            <div className="pl-account" style={{ marginTop: 16 }}>
              <div className="pl-avatar" aria-hidden>{info.email.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="pl-account__label">Для аккаунта</div>
                <div className="pl-account__email">{info.email}</div>
              </div>
            </div>
            <div className="pay-plans">
              <button type="button" className="pay-plan" disabled={phase === "paying"} onClick={() => pay("monthly")}>
                <span>
                  <div className="pay-plan__name">Месяц</div>
                  <div className="pay-plan__note">Продлевается каждый месяц</div>
                </span>
                {phase === "paying" && payingPlan === "monthly" ? <span className="pl-spinner" aria-label="Открываем оплату" /> : <span className="pay-plan__price">{rub(prices.monthly)}</span>}
              </button>
              <button type="button" className="pay-plan pay-plan--best" disabled={phase === "paying"} onClick={() => pay("annual")}>
                <span>
                  <div className="pay-plan__name">Год<span className="pay-plan__tag">ВЫГОДНЕЕ</span></div>
                  <div className="pay-plan__note">{rub(perMonth)} в месяц</div>
                </span>
                {phase === "paying" && payingPlan === "annual" ? <span className="pl-spinner" aria-label="Открываем оплату" /> : <span className="pay-plan__price">{rub(prices.annual)}</span>}
              </button>
            </div>
            {errorText && <p className="pl-error">{errorText}</p>}
            <p className="pay-consent">
              Нажимая на тариф, ты соглашаешься с <a href="/legal">условиями</a> и автоматическим продлением подписки.
              Отменить можно в любой момент. Оплата картой или СБП через ЮKassa.
            </p>
          </section>
        )}

        {phase === "active" && (
          <section className="pl-state pl-enter">
            <div className="pl-icon">✓</div>
            <h1 className="pl-title">Подписка уже активна</h1>
            <p className="pl-text">Ничего оплачивать не нужно. Войди в AnyEat с той же почтой</p>
            {info?.email && <div className="pl-email-chip">{info.email}</div>}
          </section>
        )}

        {(phase === "invalid" || phase === "error") && (
          <section className="pl-state pl-enter">
            <div className="pl-icon pl-icon--muted">!</div>
            <h1 className="pl-title">{phase === "invalid" ? "Ссылка недействительна" : "Не удалось загрузить тарифы"}</h1>
            {phase === "invalid" && <p className="pl-text">Возможно, она устарела. Напиши нам, поможем</p>}
            <a className="pl-btn pl-btn--ghost" href="/support">Написать в поддержку</a>
          </section>
        )}
      </main>
    </div>
  );
}
