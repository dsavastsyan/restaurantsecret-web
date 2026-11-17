// Страница по персональной ссылке из письма: /promo/<token>.
// Показывает аккаунт (почта частично скрыта) и одним нажатием применяет промокод без входа.
// API: GET /api/promo/link/:token и POST /api/promo/link/:token/redeem (pd-api, routes/promos.js).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PD_API_BASE } from "@/config/api";
import "./PromoLink.css";

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const APP_STORE_URL = env.VITE_ANYEAT_APP_STORE_URL || "https://anyeat.ru";
const ANDROID_APK_URL = env.VITE_ANYEAT_ANDROID_APK_URL || "https://anyeat.ru";
const SUPPORT_URL = "/support";

type LinkInfo = { email: string; code: string; days: number; available: boolean; reason: string | null };
type Phase = "loading" | "ready" | "applying" | "done" | "used" | "invalid" | "error";

const TEXT = {
  badge: "Подарок от AnyEat",
  free: "бесплатно",
  sub: "Все функции приложения",
  account: "Для аккаунта",
  apply: "Применить",
  doneTitle: "Готово!",
  doneText: "Войди в AnyEat с той же почтой",
  stores: "Скачай AnyEat",
  usedTitle: "Промокод уже применён",
  usedText: "Промокод можно применить только один раз. Войди в AnyEat с той же почтой",
  invalidTitle: "Ссылка недействительна",
  invalidText: "Возможно, она устарела. Напиши нам — поможем",
  support: "Написать в поддержку",
  error: "Не удалось применить промокод. Попробуй ещё раз",
};

function daysWord(n: number) {
  const a = n % 100;
  const b = n % 10;
  if (a >= 11 && a <= 14) return "дней";
  if (b === 1) return "день";
  if (b >= 2 && b <= 4) return "дня";
  return "дней";
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${PD_API_BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* пустой ответ */
  }
  return { ok: res.ok, status: res.status, body };
}

// ---------- праздничный салют на canvas ----------
const COLORS = ["#FE6258", "#FF8121", "#FFB547", "#FFD6C9", "#2B1D18", "#7BC8A4"];

function useConfetti() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const fire = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const parts = Array.from({ length: 220 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -62 : -118) + (Math.random() - 0.5) * 40;
      const speed = 14 + Math.random() * 12;
      return {
        x: fromLeft ? w * 0.06 : w * 0.94,
        y: h * 0.95,
        vx: Math.cos((angle * Math.PI) / 180) * speed,
        vy: Math.sin((angle * Math.PI) / 180) * speed,
        size: 6 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[i % COLORS.length],
        shape: i % 3,
        life: 0,
      };
    });
    let frame = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const p of parts) {
        p.life += 1;
        p.vy += 0.32;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const fade = Math.max(0, 1 - p.life / 190);
        if (fade <= 0 || p.y > h + 20) continue;
        alive += 1;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive > 0 && frame < 400) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    requestAnimationFrame(tick);
  }, []);
  return { ref, fire };
}

function Stores() {
  return (
    <div className="pl-stores">
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="pl-store">
        <img src="/assets/promo/badge_appstore.png" alt="Загрузите в App Store" width={172} height={52} />
      </a>
      <a href={ANDROID_APK_URL} target="_blank" rel="noopener noreferrer" className="pl-store">
        <img src="/assets/promo/badge_android.png" alt="Скачать APK для Android" width={172} height={52} />
      </a>
    </div>
  );
}

export default function PromoLink() {
  const { token = "" } = useParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const { ref: confettiRef, fire } = useConfetti();

  useEffect(() => {
    document.title = "Подарок от AnyEat";
    let cancelled = false;
    (async () => {
      try {
        const r = await api(`/promo/link/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!r.ok) {
          setPhase("invalid");
          return;
        }
        const data = r.body as unknown as LinkInfo;
        setInfo(data);
        if (data.available) setPhase("ready");
        else if (data.reason === "user_limit_reached") setPhase("used");
        else setPhase("invalid");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const apply = async () => {
    setPhase("applying");
    setErrorText(null);
    try {
      const r = await api(`/promo/link/${encodeURIComponent(token)}/redeem`, { method: "POST", body: "{}" });
      if (r.ok && r.body.next_step === "done") {
        setPhase("done");
        requestAnimationFrame(() => fire());
        return;
      }
      if (r.body.error === "user_limit_reached") {
        setPhase("used");
        return;
      }
      if (r.body.error === "invalid_link" || r.body.error === "not_found") {
        setPhase("invalid");
        return;
      }
      setErrorText(TEXT.error);
      setPhase("ready");
    } catch {
      setErrorText(TEXT.error);
      setPhase("ready");
    }
  };

  const days = info?.days ?? 7;

  return (
    <div className="pl-page">
      <div className="pl-blob pl-blob--a" aria-hidden />
      <div className="pl-blob pl-blob--b" aria-hidden />
      <canvas ref={confettiRef} className="pl-confetti" aria-hidden />
      <main className="pl-card" aria-live="polite">
        <img className="pl-logo" src="/assets/promo/header.png" alt="AnyEat" width={141} height={44} />

        {phase === "loading" && (
          <div className="pl-skeleton" aria-label="Загрузка">
            <span />
            <span />
            <span />
          </div>
        )}

        {(phase === "ready" || phase === "applying") && info && (
          <section className="pl-state pl-enter">
            <div className="pl-badge"><span aria-hidden>🎁</span>{TEXT.badge}</div>
            <h1 className="pl-days">
              <span className="pl-days__num">{days}</span>
              <span className="pl-days__word">
                {daysWord(days)}
                <br />
                {TEXT.free}
              </span>
            </h1>
            <p className="pl-sub">{TEXT.sub}</p>
            <div className="pl-account">
              <div className="pl-avatar" aria-hidden>
                {info.email.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="pl-account__label">{TEXT.account}</div>
                <div className="pl-account__email">{info.email}</div>
              </div>
            </div>
            <div className="pl-code">
              Промокод <b>{info.code}</b>
            </div>
            <button type="button" className="pl-btn" onClick={apply} disabled={phase === "applying"}>
              {phase === "applying" ? <span className="pl-spinner" aria-label="Применяем" /> : TEXT.apply}
            </button>
            {errorText && <p className="pl-error">{errorText}</p>}
          </section>
        )}

        {phase === "done" && (
          <section className="pl-state pl-enter">
            <div className="pl-check" aria-hidden>
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27 l7.5 7.5 L37.5 19" />
              </svg>
            </div>
            <h1 className="pl-title">{TEXT.doneTitle}</h1>
            <p className="pl-text">{TEXT.doneText}</p>
            {info?.email && <div className="pl-email-chip">{info.email}</div>}
            <div className="pl-stores-label">{TEXT.stores}</div>
            <Stores />
          </section>
        )}

        {phase === "used" && (
          <section className="pl-state pl-enter">
            <div className="pl-icon">✓</div>
            <h1 className="pl-title">{TEXT.usedTitle}</h1>
            <p className="pl-text">{TEXT.usedText}</p>
            {info?.email && <div className="pl-email-chip">{info.email}</div>}
            <div className="pl-stores-label">{TEXT.stores}</div>
            <Stores />
          </section>
        )}

        {(phase === "invalid" || phase === "error") && (
          <section className="pl-state pl-enter">
            <div className="pl-icon pl-icon--muted">!</div>
            <h1 className="pl-title">{phase === "invalid" ? TEXT.invalidTitle : TEXT.error}</h1>
            {phase === "invalid" && <p className="pl-text">{TEXT.invalidText}</p>}
            <a className="pl-btn pl-btn--ghost" href={SUPPORT_URL}>
              {TEXT.support}
            </a>
          </section>
        )}
      </main>
    </div>
  );
}
