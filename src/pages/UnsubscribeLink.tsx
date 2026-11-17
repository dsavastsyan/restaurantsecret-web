// Отписка от рекламных писем по персональной ссылке из письма: /unsubscribe/<token>.
// Ссылка только открывает страницу (антивирусы ходят по ссылкам), отписка — по кнопке (POST).
// API: GET/POST /api/email/unsubscribe/:token (pd-api, routes/email-unsubscribe.js).
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PD_API_BASE } from "@/config/api";
import "./PromoLink.css";

type Phase = "loading" | "ready" | "sending" | "done" | "already" | "invalid" | "error";

const TEXT = {
  title: "Отписаться от рекламных писем AnyEat",
  sub: "Письма о твоём аккаунте и подписке будут приходить как раньше",
  account: "Адрес",
  button: "Отписаться",
  doneTitle: "Готово",
  doneText: "Рекламных писем больше не будет",
  alreadyTitle: "Рассылка уже отключена",
  alreadyText: "Рекламных писем больше не будет",
  invalidTitle: "Ссылка недействительна",
  invalidText: "Возможно, она устарела. Напиши нам — поможем",
  support: "Написать в поддержку",
  error: "Не удалось отписаться. Попробуй ещё раз",
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${PD_API_BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers || {}) },
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* пустой ответ */
  }
  return { ok: res.ok, body };
}

export default function UnsubscribeLink() {
  const { token = "" } = useParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Отписка от рассылки AnyEat";
    let cancelled = false;
    (async () => {
      try {
        const r = await api(`/email/unsubscribe/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!r.ok) return setPhase("invalid");
        setEmail(String(r.body.email || ""));
        setPhase(r.body.unsubscribed ? "already" : "ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const unsubscribe = async () => {
    setPhase("sending");
    setErrorText(null);
    try {
      const r = await api(`/email/unsubscribe/${encodeURIComponent(token)}`, { method: "POST", body: "{}" });
      if (r.ok) return setPhase(r.body.already ? "already" : "done");
      if (r.body.error === "invalid_link") return setPhase("invalid");
      setErrorText(TEXT.error);
      setPhase("ready");
    } catch {
      setErrorText(TEXT.error);
      setPhase("ready");
    }
  };

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
          </div>
        )}

        {(phase === "ready" || phase === "sending") && (
          <section className="pl-state pl-enter">
            <div className="pl-icon pl-icon--muted" aria-hidden>✉︎</div>
            <h1 className="pl-title pl-title--sm">{TEXT.title}</h1>
            <p className="pl-sub">{TEXT.sub}</p>
            {email && (
              <div className="pl-account">
                <div className="pl-avatar" aria-hidden>
                  {email.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="pl-account__label">{TEXT.account}</div>
                  <div className="pl-account__email">{email}</div>
                </div>
              </div>
            )}
            <button type="button" className="pl-btn" onClick={unsubscribe} disabled={phase === "sending"}>
              {phase === "sending" ? <span className="pl-spinner" aria-label="Отписываем" /> : TEXT.button}
            </button>
            {errorText && <p className="pl-error">{errorText}</p>}
          </section>
        )}

        {(phase === "done" || phase === "already") && (
          <section className="pl-state pl-enter">
            <div className="pl-check" aria-hidden>
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27 l7.5 7.5 L37.5 19" />
              </svg>
            </div>
            <h1 className="pl-title">{phase === "done" ? TEXT.doneTitle : TEXT.alreadyTitle}</h1>
            <p className="pl-text">{phase === "done" ? TEXT.doneText : TEXT.alreadyText}</p>
            {email && <div className="pl-email-chip">{email}</div>}
          </section>
        )}

        {(phase === "invalid" || phase === "error") && (
          <section className="pl-state pl-enter">
            <div className="pl-icon pl-icon--muted">!</div>
            <h1 className="pl-title">{phase === "invalid" ? TEXT.invalidTitle : TEXT.error}</h1>
            {phase === "invalid" && <p className="pl-text">{TEXT.invalidText}</p>}
            <a className="pl-btn pl-btn--ghost" href="/support">
              {TEXT.support}
            </a>
          </section>
        )}
      </main>
    </div>
  );
}
