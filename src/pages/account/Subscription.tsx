import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError, apiGet, apiPost, quotePromo, redeemPromo, isUnauthorizedError, PromoQuote, attachPaymentMethod, syncTrialPayment } from "@/lib/api";
import { useAuth } from "@/store/auth";
import {
  selectHasActiveSub,
  selectSetHasSubscriptionHistory,
  selectSetHasActiveSub,
  useSubscriptionStore,
} from "@/store/subscription";
import SubscriptionPlans from "@/components/subscription/SubscriptionPlans";
import { analytics } from "@/services/analytics";

import subscriptionExpiredPng from "@/assets/subscription/subscription-expired.png";

type SubscriptionStatusResponse = {
  ok?: boolean;
  plan?: string | null;
  status?: string | null;
  status_label?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  payment_method?: string | null;
  can_cancel?: boolean;
  canceled_at?: string | null;
  next_charge_at?: string | null;
  source?: string | null;
  is_trial?: boolean;
  promo_requires_subscribing?: boolean | null;
  auto_renewal_enabled?: boolean;
  payment_retry_scheduled?: boolean;
  error?: string | null;
};

type UiPlan = "month" | "year";

type ApiPlan = "monthly" | "annual";
type SubscriptionLocationState = { from?: string } | null;
type CancellationReason =
  | "too_expensive"
  | "rarely_use"
  | "missing_restaurants"
  | "missing_features"
  | "other_app"
  | "technical_issues"
  | "taking_break"
  | "other";

const PLAN_LABELS: Record<string, string> = {
  monthly: "Месячная",
  annual: "Годовая",
  mock: "Бесплатный период",
};

const PLAN_PRICE_BADGES: Record<string, string> = {
  monthly: "199 РУБ / МЕСЯЦ",
  annual: "1 490 РУБ / ГОД",
  mock: "ПРОБНЫЙ ПЕРИОД",
};

const INTRO_TRIAL_PROMO_CODE = "RS7FREE";
const PENDING_TRIAL_PAYMENT_KEY = "rs_pending_intro_trial_payment_id";
const RESUME_AFTER_CARD_BIND_KEY = "rs_resume_after_card_bind";

const CANCELLATION_REASONS: Array<{ value: CancellationReason; label: string }> = [
  { value: "too_expensive", label: "Слишком дорого" },
  { value: "rarely_use", label: "Пользуюсь редко" },
  { value: "missing_restaurants", label: "Не нашел нужные рестораны" },
  { value: "missing_features", label: "Не хватает нужных функций" },
  { value: "other_app", label: "Есть другое приложение" },
  { value: "technical_issues", label: "Были технические проблемы" },
  { value: "taking_break", label: "Хочу сделать перерыв" },
  { value: "other", label: "Другое" },
];

function CancellationReasonIcon({ reason }: { reason: CancellationReason }) {
  if (reason === "too_expensive") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 7.2h4.8a2.4 2.4 0 0 1 0 4.8H9V5.8M9 12v6.2M9 14.8h6.2M7.2 12H15" />
      </svg>
    );
  }

  if (reason === "rarely_use") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.2V12l3.4 2.1" />
        <path d="M7.5 4.8 5.2 2.8M16.5 4.8l2.3-2" />
      </svg>
    );
  }

  if (reason === "missing_restaurants") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6.5-5.8 6.5-11.2A6.5 6.5 0 0 0 5.5 9.8C5.5 15.2 12 21 12 21Z" />
      </svg>
    );
  }

  if (reason === "missing_features") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.5v15M4.5 12h15" />
        <path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" />
      </svg>
    );
  }

  if (reason === "other_app") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="2.8" width="10" height="18.4" rx="2.6" />
        <path d="M10.2 17.8h3.6M10 6h4" />
      </svg>
    );
  }

  if (reason === "technical_issues") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5.5" y="7" width="13" height="11" rx="3" />
        <path d="M8 4.5 10 7M16 4.5 14 7M9 11h.1M15 11h.1M9 15h6M3.5 11h2M18.5 11h2M3.5 15h2M18.5 15h2" />
      </svg>
    );
  }

  if (reason === "taking_break") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.2 8.5v7M14.8 8.5v7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19.2h4.2L19 9.4a2.8 2.8 0 0 0-4-4L5.2 15.2 5 19.2Z" />
      <path d="m13.2 7.2 3.6 3.6M4.5 20h15" />
    </svg>
  );
}

const ERROR_LABELS: Record<string, string> = {
  invalid_code: "Промокод не найден",
  not_found: "Промокод не найден",
  expired_code: "Срок действия промокода истёк",
  expired: "Срок действия промокода истёк",
  already_used: "Вы уже использовали этот промокод",
  not_started: "Акция еще не началась",
  global_limit_reached: "Лимит использований исчерпан",
  user_limit_reached: "Вы уже использовали этот промокод",
  intro_trial_unavailable: "Пробный период доступен только пользователям без прошлых подписок",
  trial_requires_card_binding: "Для пробного периода нужно привязать карту",
  invalid_plan_for_promo: "Этот промокод недоступен для выбранного тарифа",
  network_error: "Ошибка сети. Попробуйте позже.",
};

function mapUiPlanToApi(plan: UiPlan): ApiPlan {
  if (plan === "month") return "monthly";
  return "annual";
}

function rememberPendingTrialPayment(paymentId?: string) {
  if (typeof window === "undefined" || !paymentId) return;
  try {
    window.sessionStorage.setItem(PENDING_TRIAL_PAYMENT_KEY, paymentId);
  } catch { /* ignore */ }
}

function forgetPendingTrialPayment() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_TRIAL_PAYMENT_KEY);
  } catch { /* ignore */ }
}

function rememberResumeAfterCardBind() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RESUME_AFTER_CARD_BIND_KEY, "1");
  } catch { /* ignore */ }
}

function forgetResumeAfterCardBind() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RESUME_AFTER_CARD_BIND_KEY);
  } catch { /* ignore */ }
}

function SubscriptionSkeleton() {
  return (
    <div className="account-subscription__grid" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="account-subscription__tile account-skeleton">
          <div className="account-skeleton__line" />
          <div className="account-skeleton__line account-skeleton__line--wide" />
          <div className="account-skeleton__line account-skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}

export default function AccountSubscription() {
  const location = useLocation() as { state: SubscriptionLocationState };
  const { accessToken, logout } = useAuth((state) => ({
    accessToken: state.accessToken || undefined,
    logout: state.logout,
  }));
  const hasActiveSub = useSubscriptionStore(selectHasActiveSub);
  const setHasActiveSub = useSubscriptionStore(selectSetHasActiveSub);
  const setHasSubscriptionHistory = useSubscriptionStore(selectSetHasSubscriptionHistory);
  const [statusData, setStatusData] = useState<SubscriptionStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<UiPlan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<UiPlan | null>('year');
  const [promoError, setPromoError] = useState<string | null>(null);


  const [promoLoading, setPromoLoading] = useState(false);
  const [renewPlansOpen, setRenewPlansOpen] = useState(false);
  const [annualOfferOpen, setAnnualOfferOpen] = useState(false);
  const [promoQuote, setPromoQuote] = useState<PromoQuote | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [isCancelReasonOpen, setIsCancelReasonOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancellationReason | null>(null);
  const [cancelReasonDetails, setCancelReasonDetails] = useState("");
  const resumingRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (!accessToken) {
      setStatusData(null);
      setLoading(false);
      if (hasActiveSub) {
        setHasActiveSub(false);
      }
      setHasSubscriptionHistory(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<SubscriptionStatusResponse>(
        "/api/subscriptions/status",
        accessToken,
      );

      if (response && typeof response === "object" && response.ok === false) {
        setStatusData(null);
        setError(
          typeof response.error === "string" && response.error.trim()
            ? response.error
            : "Не удалось загрузить статус подписки. Попробуйте позже.",
        );
        return;
      }

      const normalizeStatus = (value?: string | null, expiresAt?: string | null) => {
        if (typeof value !== "string") return "none" as const;
        const trimmed = value.trim().toLowerCase();

        if ((trimmed === "active" || trimmed === "canceled") && expiresAt) {
          const expiresDate = new Date(expiresAt);
          if (!isNaN(expiresDate.getTime()) && expiresDate < new Date()) {
            return "expired";
          }
          return "active";
        }

        const known = ["active", "expired", "canceled", "none"] as const;
        if (known.includes(trimmed as (typeof known)[number])) {
          return trimmed as (typeof known)[number];
        }
        return (trimmed || "none") as (typeof known)[number] | string;
      };

      const normalized = {
        ...response,
        status: normalizeStatus(response?.status, response?.expires_at),
        plan: typeof response?.plan === "string" ? response.plan.trim() : response?.plan ?? null,
        payment_method:
          typeof response?.payment_method === "string" && response.payment_method.trim()
            ? response.payment_method.trim()
            : response?.payment_method ?? null,
      } satisfies SubscriptionStatusResponse;

      setStatusData(normalized);
      setHasActiveSub(normalized.status === "active");
      setHasSubscriptionHistory(Boolean(normalized.status && normalized.status !== "none"));
    } catch (err) {
      if (isUnauthorizedError(err)) {
        logout();
        setStatusData(null);
        setError(null);
        setHasActiveSub(false);
        setHasSubscriptionHistory(false);
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setStatusData({ status: "none", status_label: null, expires_at: null });
        setError(null);
        setHasActiveSub(false);
        setHasSubscriptionHistory(false);
        return;
      }
      console.error("Failed to load subscription status", err);
      setError("Не удалось загрузить статус подписки. Попробуйте позже.");
      setHasActiveSub(false);
      setHasSubscriptionHistory(false);
    } finally {
      setLoading(false);
    }
  }, [accessToken, hasActiveSub, logout, setHasActiveSub, setHasSubscriptionHistory]);

  useEffect(() => {
    fetchStatus();
    const stateFrom = location.state && typeof location.state.from === "string" ? location.state.from : null;
    const prevPath = typeof window !== "undefined" ? window.sessionStorage.getItem("rs_prev_path") : null;
    const sourcePage = stateFrom || prevPath || document.referrer || "direct";
    analytics.track("subscription_page_view", {
      source_context: sourcePage,
      source_page: sourcePage,
      current_status: statusData?.status || "none"
    });
  }, []); // Only once on mount

  useEffect(() => {
    if (!accessToken || typeof window === "undefined") return;

    let canceled = false;
    const pendingPaymentId = window.sessionStorage.getItem(PENDING_TRIAL_PAYMENT_KEY) || "";
    if (!pendingPaymentId) return;

    const pollTrialActivation = async () => {
      for (let attempt = 0; attempt < 12 && !canceled; attempt += 1) {
        try {
          const syncRes = await syncTrialPayment(accessToken, {
            payment_id: pendingPaymentId || undefined,
          });
          await fetchStatus();

          if (syncRes?.active) {
            forgetPendingTrialPayment();
            return;
          }
        } catch (err) {
          if (isUnauthorizedError(err)) {
            logout();
            return;
          }
          console.error("Failed to sync trial payment", err);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    };

    pollTrialActivation();

    return () => {
      canceled = true;
    };
  }, [accessToken, fetchStatus, logout]);

  const formatDate = useCallback((value?: string | null) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch (err) {
      console.error("Failed to format subscription expires_at", err);
      return value;
    }
  }, []);

  const status = statusData?.status || "none";
  const isActive = status === "active";
  const isCanceled = status === "canceled";
  const isExpired = status === "expired";
  const isCancellationScheduled = Boolean(statusData?.canceled_at);
  const isPaymentRetryScheduled = Boolean(
    isExpired && statusData?.payment_retry_scheduled && statusData?.can_cancel,
  );
  const expiresLabel = useMemo(() => formatDate(statusData?.expires_at), [statusData?.expires_at, formatDate]);
  const currentPlanKey = typeof statusData?.plan === "string" ? statusData.plan.trim().toLowerCase() : "";
  const currentUiPlan: UiPlan | null = currentPlanKey === "monthly" ? "month" : currentPlanKey === "annual" ? "year" : null;
  const planTitle = PLAN_LABELS[currentPlanKey] || "Тариф";
  const planPriceBadge = PLAN_PRICE_BADGES[currentPlanKey] || "ТЕКУЩИЙ ТАРИФ";
  const expiredTitle = isPaymentRetryScheduled ? "Оплата не прошла" : "Подписка истекла";
  const expiredDescription = isPaymentRetryScheduled
    ? statusData?.next_charge_at
      ? `Мы повторим списание ${formatDate(statusData.next_charge_at) ?? "в ближайшее время"}. Вы можете отменить повторное списание ниже.`
      : "Мы попробуем списать оплату ещё раз. Вы можете отменить повторное списание ниже."
    : `Ваша подписка на ${planTitle} закончилась ${expiresLabel ?? ""}`.trim();
  const isAnnualPlan = currentPlanKey === "annual";
  const canShowAnnualOffer = isActive && currentPlanKey === "monthly";
  const isNonRenewingPromoAccess =
    statusData?.source?.startsWith("promo:") && statusData?.promo_requires_subscribing === false;
  const isAutoRenewalEnabled = Boolean(statusData?.auto_renewal_enabled);
  const activePlanTitle = isNonRenewingPromoAccess ? "Промодоступ" : currentPlanKey === "annual" ? "Год" : currentPlanKey === "monthly" ? "Месяц" : currentPlanKey === "mock" ? "Промодоступ" : planTitle;
  const activePlanPrice = isNonRenewingPromoAccess ? "0 ₽" : currentPlanKey === "annual" ? "1 490 ₽" : currentPlanKey === "monthly" ? "199 ₽" : currentPlanKey === "mock" ? "0 ₽" : planPriceBadge;
  const activePlanPeriod = isNonRenewingPromoAccess ? "" : currentPlanKey === "annual" ? "/год" : currentPlanKey === "monthly" ? "/мес" : "";
  const activeRenewalLabel = isCancellationScheduled
    ? "Автопродление отключено"
    : isAutoRenewalEnabled
      ? "Автопродление включено"
      : "Автопродление не подключено";
  const activeBillingLabel = isCancellationScheduled
    ? `Подписка действует до: ${expiresLabel ?? "—"}`
    : !isAutoRenewalEnabled
      ? `${statusData?.is_trial || isNonRenewingPromoAccess ? "Доступ по промокоду" : "Подписка"} действует до: ${expiresLabel ?? "—"}`
    : statusData?.next_charge_at
      ? `Следующее списание: ${formatDate(statusData.next_charge_at) ?? "—"}`
      : statusData?.is_trial
        ? `Окончание пробного периода: ${expiresLabel ?? "—"}`
        : `Следующее списание: ${expiresLabel ?? "—"}`;

  const showHistory = (isActive || isCanceled || isExpired) && !loading;
  const isNeverSubscribed = status === "none" && !showHistory;
  const showAnnualOffer = annualOfferOpen && canShowAnnualOffer && !isNonRenewingPromoAccess;
  const showRenewCheckout = (isExpired || isCanceled) && renewPlansOpen;

  const pageTitle = showAnnualOffer
    ? "Сэкономь с годовым тарифом"
    : showRenewCheckout
      ? "Возобновить подписку"
      : isPaymentRetryScheduled
        ? "Управление подпиской"
        : isNeverSubscribed
          ? "Оформить подписку"
          : isActive
            ? "Моя подписка"
            : "Управление подпиской";

  const promoErrorLabel = useMemo(() => {
    if (!promoError) return null;
    return ERROR_LABELS[promoError] ?? promoError ?? "Не удалось применить промокод";
  }, [promoError]);

  const createPayment = useCallback(
    async (plan: UiPlan, code?: string, deferUntilPeriodEnd?: boolean) => {
      if (!accessToken || paymentPlan) return;

      setPaymentError(null);
      setPaymentPlan(plan);
      const apiPlan = mapUiPlanToApi(plan);

      analytics.track("checkout_started", { plan, source_page: "subscription_management" });
      // Force Metrika to load now (it's normally lazy) so the goal is sent
      // before we redirect away from this page.
      window.__loadYandexMetrika?.();
      try { ym(108992733, 'reachGoal', 'checkout_started'); } catch { /* ym not loaded */ }

      try {
        const body: any = { plan: apiPlan, autopay_consent: true };
        if (code) body.promo_code = code;
        if (deferUntilPeriodEnd) body.defer_until_period_end = true;

        const res = await apiPost<{ confirmation_url?: string; error?: string }>(
          "/api/payments/create",
          body,
          accessToken,
        );

        const confirmationUrl =
          typeof res?.confirmation_url === "string" && res.confirmation_url.trim()
            ? res.confirmation_url.trim()
            : null;

        if (confirmationUrl) {
          // Persist plan so PaySuccess / PaymentResult can read it after redirect.
          try { sessionStorage.setItem("rs_checkout_plan", plan); } catch { /* ignore */ }
          // Wait 400ms so Metrika has time to send the checkout_started beacon
          // before the browser navigates away to YooKassa.
          await new Promise((r) => setTimeout(r, 400));
          window.location.href = confirmationUrl;
          return;
        }

        const message =
          typeof res?.error === "string" && res.error.trim()
            ? res.error.trim()
            : "Не удалось создать платёж. Попробуйте позже.";
        setPaymentError(message);
      } catch (err) {
        if (isUnauthorizedError(err)) {
          logout();
          setPaymentError(null);
          setPaymentPlan(null);
          return;
        }
        console.error("Failed to create payment", err);
        setPaymentError("Не удалось создать платёж. Попробуйте позже.");
      } finally {
        setPaymentPlan(null);
      }
    },
    [accessToken, logout, paymentPlan],
  );

  const startIntroTrial = useCallback(
    async (plan: UiPlan) => {
      if (!accessToken || paymentPlan) return;

      setPaymentError(null);
      setPaymentPlan(plan);
      const apiPlan = mapUiPlanToApi(plan);

      analytics.track("checkout_started", {
        plan,
        source_page: "subscription_management",
        method: "intro_trial_attach",
      });
      window.__loadYandexMetrika?.();
      try { ym(108992733, 'reachGoal', 'checkout_started'); } catch { /* ym not loaded */ }

      try {
        const attachRes = await attachPaymentMethod(accessToken, {
          promo_code: INTRO_TRIAL_PROMO_CODE,
          plan: apiPlan,
          return_url: window.location.origin + "/account/subscription",
        });

        const confirmationUrl =
          typeof attachRes?.confirmation_url === "string" && attachRes.confirmation_url.trim()
            ? attachRes.confirmation_url.trim()
            : null;

        if (confirmationUrl) {
          try { sessionStorage.setItem("rs_checkout_plan", plan); } catch { /* ignore */ }
          rememberPendingTrialPayment(attachRes.payment_id);
          await new Promise((r) => setTimeout(r, 400));
          window.location.href = confirmationUrl;
          return;
        }

        setPaymentError("Не удалось начать пробный период. Попробуйте позже.");
      } catch (err) {
        if (isUnauthorizedError(err)) {
          logout();
          setPaymentError(null);
          setPaymentPlan(null);
          return;
        }

        if (err instanceof ApiError && err.payload && typeof err.payload === "object") {
          const payload = err.payload as { error?: string };
          const code = typeof payload.error === "string" ? payload.error : null;
          setPaymentError(code ? ERROR_LABELS[code] ?? code : "Не удалось начать пробный период. Попробуйте позже.");
        } else {
          console.error("Failed to attach payment method for trial", err);
          setPaymentError("Не удалось начать пробный период. Попробуйте позже.");
        }
      } finally {
        setPaymentPlan(null);
      }
    },
    [accessToken, logout, paymentPlan],
  );

  const handleSelectPlan = useCallback((plan: UiPlan) => {
    setSelectedPlan(plan);
    analytics.track("plan_selected", { plan });
  }, []);

  const handleQuotePromo = useCallback(async (code: string) => {
    const trimmedCode = code.trim();
    if (!accessToken || !trimmedCode || promoLoading) return;

    setPromoLoading(true);
    setPromoError(null);
    setPromoQuote(null);

    try {
      const res = await quotePromo(trimmedCode, accessToken);
      if (res?.valid) {
        setPromoQuote(res);
      } else {
        setPromoError(res?.error || "invalid_code");
      }
    } catch (err) {
      console.error("promo quote error", err);
      if (err instanceof ApiError && err.payload && typeof err.payload === 'object') {
        const payload = err.payload as any;
        setPromoError(payload.error || "network_error");
      } else {
        setPromoError("network_error");
      }
    } finally {
      setPromoLoading(false);
    }
  }, [accessToken, promoLoading]);

  const handleRedeemPromo = useCallback(async (code: string) => {
    const trimmedCode = code.trim();
    if (!accessToken || !trimmedCode || promoLoading) return;

    setPromoLoading(true);
    setPromoError(null);

    try {
      const res = await redeemPromo(trimmedCode, accessToken, selectedPlan ? mapUiPlanToApi(selectedPlan) : undefined);
      if (res?.success) {
        analytics.track("promo_redeemed", { code: trimmedCode });
        if (res.next_step === 'link_card') {
          // Zero-Auth attach
          let planToUse: UiPlan | null = selectedPlan;
          if (promoQuote?.plan === 'annual') planToUse = 'year';
          if (promoQuote?.plan === 'monthly') planToUse = 'month';
          if (!planToUse) planToUse = 'month';

          const attachRes = await attachPaymentMethod(accessToken, {
            promo_code: trimmedCode,
            plan: mapUiPlanToApi(planToUse),
            return_url: window.location.origin + '/account/subscription'
          });

          analytics.track("checkout_started", { plan: planToUse, source_page: "subscription_management", method: "promo_attach" });

          if (attachRes?.confirmation_url) {
            rememberPendingTrialPayment(attachRes.payment_id);
            window.location.href = attachRes.confirmation_url;
            return;
          }
        } else if (res.next_step === 'payment') {
          // Use selected plan or default
          let planToUse: UiPlan | null = selectedPlan;

          // If promo forces a plan, use it
          if (promoQuote?.plan === 'annual') planToUse = 'year';
          if (promoQuote?.plan === 'monthly') planToUse = 'month';

          // Default fallback
          if (!planToUse) planToUse = 'month';

          createPayment(planToUse, trimmedCode);
        } else {
          setPromoQuote(null);
          setRenewPlansOpen(false);
          await fetchStatus();
        }
      } else {
        setPromoError(res?.error || "unknown_error");
      }
    } catch (err) {
      console.error("promo redeem error", err);
      if (err instanceof ApiError && err.payload && typeof err.payload === 'object') {
        const payload = err.payload as any;
        setPromoError(payload.error || "network_error");
      } else {
        setPromoError("network_error");
      }
    } finally {
      setPromoLoading(false);
    }
  }, [accessToken, promoLoading, promoQuote, createPayment, fetchStatus, selectedPlan]);

  const handleProceed = useCallback(() => {
    const isFreeAccessNoCard = promoQuote?.type === 'free_days' && !promoQuote.requires_subscribing;

    if (selectedPlan || isFreeAccessNoCard) {
      if (promoQuote?.type === 'free_days') {
        // Use either the code from quote (preferred) or what we might have elsewhere
        handleRedeemPromo(promoQuote.code || '');
      } else if (selectedPlan) {
        if (isNeverSubscribed && !promoQuote) {
          startIntroTrial(selectedPlan);
        } else {
          createPayment(selectedPlan, promoQuote?.code);
        }
      }
    }
  }, [selectedPlan, createPayment, promoQuote, handleRedeemPromo, isNeverSubscribed, startIntroTrial]);

  const handleResetPromo = useCallback(() => {
    setPromoQuote(null);
    setPromoError(null);
  }, []);

  const handleOpenAnnualOffer = useCallback(() => {
    setAnnualOfferOpen(true);
    analytics.track("annual_upgrade_offer_opened", { source_page: "subscription_management" });
  }, []);

  const handleOpenRenewCheckout = useCallback(() => {
    setRenewPlansOpen(true);
    setPaymentError(null);
    if (!selectedPlan) {
      setSelectedPlan("year");
    }
    analytics.track("renew_checkout_opened", {
      plan: statusData?.plan || "unknown",
      source_page: "subscription_management",
    });
  }, [selectedPlan, statusData?.plan]);

  const handleAnnualUpgrade = useCallback(() => {
    createPayment("year", undefined, Boolean(isActive && currentUiPlan === "month"));
  }, [createPayment, currentUiPlan, isActive]);

  useEffect(() => {
    if (!canShowAnnualOffer && annualOfferOpen) {
      setAnnualOfferOpen(false);
    }
  }, [annualOfferOpen, canShowAnnualOffer]);

  useEffect(() => {
    if (!isExpired && !isCanceled && renewPlansOpen) {
      setRenewPlansOpen(false);
    }
  }, [isCanceled, isExpired, renewPlansOpen]);

  const handleOpenCancelReason = useCallback(() => {
    if (!accessToken || canceling) return;
    setCancelReason(null);
    setCancelReasonDetails("");
    setIsCancelReasonOpen(true);
    analytics.track("subscription_cancel_reason_opened", {
      plan: statusData?.plan || "unknown",
      source_page: "subscription_management",
    });
  }, [accessToken, canceling, statusData?.plan]);

  const handleCloseCancelReason = useCallback(() => {
    if (canceling) return;
    setIsCancelReasonOpen(false);
  }, [canceling]);

  useEffect(() => {
    if (!isCancelReasonOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseCancelReason();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCloseCancelReason, isCancelReasonOpen]);

  const handleCancel = useCallback(async () => {
    if (!accessToken || canceling || !cancelReason) return;

    const selectedReason = cancelReason;
    const selectedReasonDetails = selectedReason === "other" ? cancelReasonDetails.trim().slice(0, 500) : "";

    setCanceling(true);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>(
        "/api/subscriptions/cancel",
        {
          reason: selectedReason,
          details: selectedReasonDetails || undefined,
          source_page: "subscription_management",
        },
        accessToken,
      );
      if (res?.ok) {
        analytics.track(
          "subscription_canceled",
          {
            plan: statusData?.plan || "unknown",
            cancel_reason: selectedReason,
            cancel_reason_details: selectedReasonDetails || undefined,
          },
          { ignoreConsent: true },
        );
        setIsCancelReasonOpen(false);
        await fetchStatus();
      } else {
        alert(res?.error || "Не удалось отменить подписку");
      }
    } catch (err) {
      console.error("Cancel sub error", err);
      alert("Ошибка при отмене подписки");
    } finally {
      setCanceling(false);
    }
  }, [accessToken, cancelReason, cancelReasonDetails, canceling, fetchStatus, statusData?.plan]);

  const resumeAutopay = useCallback(async ({
    attachIfMissing,
    silentMissingCard = false,
  }: {
    attachIfMissing: boolean;
    silentMissingCard?: boolean;
  }) => {
    if (!accessToken || resumingRef.current) return "busy" as const;

    resumingRef.current = true;
    setResuming(true);
    setPaymentError(null);
    try {
      await apiGet(`/api/payment-methods?t=${Date.now()}`, accessToken).catch(() => null);

      const res = await apiPost<{ ok: boolean; error?: string }>("/api/subscriptions/resume", {}, accessToken);
      if (res?.ok) {
        forgetResumeAfterCardBind();
        analytics.track("subscription_resumed", { plan: statusData?.plan || "unknown" }, { ignoreConsent: true });
        await fetchStatus();
        return "resumed" as const;
      }

      if (res?.error === "no_payment_method" && attachIfMissing) {
        rememberResumeAfterCardBind();
        analytics.track("payment_method_attach_started", {
          source_page: "subscription_management",
          reason: "resume_subscription",
        });

        const attachRes = await attachPaymentMethod(accessToken, {
          return_url: `${window.location.origin}/account/subscription?resume_autopay=1`,
        });

        const confirmationUrl =
          typeof attachRes?.confirmation_url === "string" && attachRes.confirmation_url.trim()
            ? attachRes.confirmation_url.trim()
            : null;

        if (confirmationUrl) {
          window.location.href = confirmationUrl;
          return "attaching" as const;
        }

        forgetResumeAfterCardBind();
        setPaymentError("Не удалось открыть привязку карты. Попробуйте позже.");
        return "error" as const;
      }

      if (res?.error === "no_payment_method" && silentMissingCard) {
        return "missing_card" as const;
      }

      const message =
        res?.error === "no_payment_method"
          ? "Карта ещё не привязалась. Попробуйте ещё раз через несколько секунд."
          : res?.error || "Не удалось возобновить подписку";
      setPaymentError(message);
      return "error" as const;
    } catch (err) {
      if (isUnauthorizedError(err)) {
        logout();
        setPaymentError(null);
        return "unauthorized" as const;
      }
      console.error("Resume sub error", err);
      setPaymentError("Ошибка при возобновлении подписки");
      return "error" as const;
    } finally {
      resumingRef.current = false;
      setResuming(false);
    }
  }, [accessToken, fetchStatus, logout, statusData?.plan]);

  const handleResume = useCallback(() => {
    resumeAutopay({ attachIfMissing: true });
  }, [resumeAutopay]);

  useEffect(() => {
    if (!accessToken || typeof window === "undefined") return;

    const shouldResume =
      new URLSearchParams(window.location.search).get("resume_autopay") === "1" ||
      window.sessionStorage.getItem(RESUME_AFTER_CARD_BIND_KEY) === "1";

    if (!shouldResume) return;

    let canceled = false;

    const pollResume = async () => {
      for (let attempt = 0; attempt < 10 && !canceled; attempt += 1) {
        const result = await resumeAutopay({ attachIfMissing: false, silentMissingCard: true });
        await fetchStatus();

        const fresh = await apiGet<SubscriptionStatusResponse>(
          `/api/subscriptions/status?t=${Date.now()}`,
          accessToken,
        ).catch(() => null);

        if (fresh?.status === "active" && !fresh?.canceled_at) {
          forgetResumeAfterCardBind();
          if (window.location.search.includes("resume_autopay=1")) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
          return;
        }

        if (result === "resumed") return;

        await new Promise((resolve) => window.setTimeout(resolve, 1800));
      }

      if (!canceled) {
        forgetResumeAfterCardBind();
        setPaymentError("Карта ещё не привязалась. Попробуйте возобновить подписку через несколько секунд.");
      }
    };

    pollResume();

    return () => {
      canceled = true;
    };
  }, [accessToken, fetchStatus, resumeAutopay]);

  const renderActiveSubscriptionAction = useCallback((modifier: "desktop" | "mobile") => {
    if (!isCancellationScheduled && !statusData?.can_cancel) return null;

    return (
      <div className={`account-subscription-v2__active-actions account-subscription-v2__active-actions--${modifier}`}>
        {isCancellationScheduled ? (
          <button
            className="account-subscription-v2__btn-resume-inline"
            type="button"
            onClick={handleResume}
            disabled={resuming}
          >
            {resuming ? "Возобновляем..." : "Возобновить подписку"}
          </button>
        ) : (
          <button
            className="account-subscription-v2__btn-cancel-inline"
            type="button"
            onClick={handleOpenCancelReason}
            disabled={canceling}
          >
            {canceling ? "Отмена..." : "Отменить подписку"}
          </button>
        )}
      </div>
    );
  }, [canceling, handleOpenCancelReason, handleResume, isCancellationScheduled, resuming, statusData?.can_cancel]);

  return (
    <section className={`account-panel-v2 account-subscription-panel${isActive ? " is-active-subscription" : ""}${showAnnualOffer ? " is-annual-upgrade" : ""}`} aria-labelledby="account-subscription-heading">
      <header className="account-panel-v2__header">
        <h2 id="account-subscription-heading" className="account-panel-v2__title">
          {pageTitle}
        </h2>
        {isNeverSubscribed && (
          <p className="account-panel-v2__subtitle">Выберите подходящий тариф</p>
        )}
        {showRenewCheckout && (
          <p className="account-panel-v2__subtitle">Выберите месячный или годовой тариф</p>
        )}
        {isActive && !showAnnualOffer && (
          <p className="account-panel-v2__subtitle">
            {isNonRenewingPromoAccess ? "Доступ активен до окончания промопериода" : "Управляйте тарифом и следите за продлением"}
          </p>
        )}
        {showAnnualOffer && (
          <p className="account-panel-v2__subtitle">Сейчас у тебя месячный план — 199 ₽/мес</p>
        )}
      </header>

      {loading && <SubscriptionSkeleton />}

      {!loading && (
        <div className="account-subscription-v2">
          {showAnnualOffer && (
            <div className="account-subscription-v2__annual-upgrade" aria-label="Переход на годовой тариф">
              <div className="account-subscription-v2__annual-toolbar">
                <button
                  className="account-subscription-v2__annual-back"
                  type="button"
                  onClick={() => setAnnualOfferOpen(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Назад
                </button>
                <span className="account-subscription-v2__annual-current">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                    <path d="M7 3v4M17 3v4M4 9h16" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="4" y="5" width="16" height="16" rx="3" />
                  </svg>
                  Текущий план: месяц
                </span>
              </div>

              <div className="account-subscription-v2__annual-card">
                <div className="account-subscription-v2__annual-content">
                  <span className="account-subscription-v2__annual-badge">
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="m10 1.8 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L10 1.8Z" />
                    </svg>
                    Самый выгодный
                  </span>
                  <h3>Годовой тариф</h3>
                  <div className="account-subscription-v2__annual-price">
                    <strong>1 490 ₽</strong>
                    <span>/год</span>
                  </div>
                  <div className="account-subscription-v2__annual-month">
                    <b>124 ₽/мес</b>
                    <s>199 ₽/мес</s>
                  </div>
                  <div className="account-subscription-v2__annual-saving">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 7H2v5h20V7ZM12 22V7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12 7H7.5A2.5 2.5 0 1 1 12 4.5V7Zm0 0h4.5A2.5 2.5 0 1 0 12 4.5V7Z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Экономия 898 ₽ в год
                  </div>
                </div>

                <div className="account-subscription-v2__annual-visual" aria-hidden="true">
                  <svg viewBox="0 0 180 150" fill="none">
                    <path d="M114 35c22 3 39 21 39 45 0 29-25 51-58 51-34 0-61-21-61-49 0-26 22-47 51-48 7-11 21-18 29 1Z" fill="#eef1df" />
                    <path d="M68 42h58a8 8 0 0 1 8 8v55a8 8 0 0 1-8 8H68a8 8 0 0 1-8-8V50a8 8 0 0 1 8-8Z" fill="#fbf8ee" stroke="#d5c8ae" strokeWidth="3" />
                    <path d="M60 58h74" stroke="#7b8d58" strokeWidth="13" />
                    <path d="M78 34v18M100 34v18M122 34v18" stroke="#64784a" strokeWidth="8" strokeLinecap="round" />
                    <circle cx="97" cy="86" r="22" fill="#97a86f" />
                    <path d="m86 86 8 8 17-19" stroke="#fffdf6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="136" cy="105" r="17" fill="#e0bd79" stroke="#fff8e8" strokeWidth="5" />
                    <path d="M131 106h10M131 99h7a6 6 0 0 1 0 12h-7V96" stroke="#fff8e8" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="153" cy="91" r="14" fill="#d8ae65" stroke="#fff8e8" strokeWidth="4" />
                    <path d="M149 92h8M149 86h5a5 5 0 0 1 0 10h-5V84" stroke="#fff8e8" strokeWidth="3" strokeLinecap="round" />
                    <path d="M43 38c-10-12-16-23-16-23M39 48c-14-4-25-9-31-15M145 31c9-11 17-18 26-22M151 42c12-5 22-8 30-8" stroke="#c9d4b4" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              <div className="account-subscription-v2__annual-summary">
                <span className="account-subscription-v2__annual-summary-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7M8 12l4-4 4 1 4-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <p>
                  При помесячной оплате за год: <s>2 388 ₽</s>
                  <br />
                  С годовым тарифом: <b>1 490 ₽</b>
                </p>
              </div>

              <p className="account-subscription-v2__annual-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 10v6M12 7.5h.01" strokeLinecap="round" />
                </svg>
                Можно перейти на годовой тариф в любой момент. Автопродление можно отключить позже.
              </p>

              <div className="account-subscription-v2__annual-actions">
                <button
                  className="account-subscription-v2__annual-primary"
                  type="button"
                  onClick={handleAnnualUpgrade}
                  disabled={Boolean(paymentPlan)}
                >
                  {paymentPlan === "year" ? "Переходим..." : "Перейти на годовой за 1 490 ₽"}
                </button>
                <button
                  className="account-subscription-v2__annual-secondary"
                  type="button"
                  onClick={() => setAnnualOfferOpen(false)}
                  disabled={Boolean(paymentPlan)}
                >
                  Оставить месячный тариф
                </button>
              </div>
            </div>
          )}

          {!showAnnualOffer && (
            <>
          {(isActive || ((isExpired || isCanceled) && !showRenewCheckout)) && (
            <div className={`account-subscription-v2__card ${isActive ? 'is-active' : 'is-expired'}`}>
              <div className="account-subscription-v2__mobile-surface">
                {isActive ? (
                  <>
                    <div className="account-subscription-v2__active-card">
                      <div className="account-subscription-v2__active-content">
                        <div className="account-subscription-v2__active-badges">
                          <span className="account-subscription-v2__status-pill">
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.7a1 1 0 0 0-1.4-1.4L9 10.2 7.7 8.9a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" clipRule="evenodd" />
                            </svg>
                            Активна
                          </span>
                          <span className="account-subscription-v2__current-pill">Текущий план</span>
                        </div>

                        <div className="account-subscription-v2__active-plan-row">
                          <h3 className="account-subscription-v2__active-title">{activePlanTitle}</h3>
                          <div className="account-subscription-v2__active-price-column">
                            <p className="account-subscription-v2__active-price">
                              <span>{activePlanPrice}</span>
                              {activePlanPeriod && <small>{activePlanPeriod}</small>}
                            </p>

                            {renderActiveSubscriptionAction("desktop")}
                          </div>
                        </div>

                        <div className="account-subscription-v2__active-meta">
                          <p>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                              <path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M3 11V9a3 3 0 0 1 3-3h15" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M21 13v2a3 3 0 0 1-3 3H3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {activeRenewalLabel}
                          </p>
                          <p>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                              <path d="M7 3v4M17 3v4M4 9h16" strokeLinecap="round" strokeLinejoin="round" />
                              <rect x="4" y="5" width="16" height="16" rx="3" />
                            </svg>
                            {activeBillingLabel}
                          </p>
                        </div>

                        {renderActiveSubscriptionAction("mobile")}
                      </div>
                    </div>

                    <div className="account-subscription-v2__subscriber-notes" aria-label="Информация для подписчика">
                      <div className="account-subscription-v2__subscriber-note account-subscription-v2__subscriber-note--gold">
                        <span className="account-subscription-v2__subscriber-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                            <path d="M12 3.5a6 6 0 0 0-3.4 11c.6.4.9 1 .9 1.7V17h5v-.8c0-.7.4-1.3.9-1.7A6 6 0 0 0 12 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M9.5 20h5M10 17h4" strokeLinecap="round" />
                          </svg>
                        </span>
                        <p>
                          Будем благодарны за{" "}
                          <a href="https://restaurantsecret.ru/feedback" target="_blank" rel="noreferrer">
                            отзыв, идеи и рекомендации
                          </a>.
                        </p>
                      </div>
                    </div>

                    {!isAnnualPlan && !isNonRenewingPromoAccess && (
                      <button
                        className="account-subscription-v2__saving-card"
                        type="button"
                        onClick={handleOpenAnnualOffer}
                        disabled={Boolean(paymentPlan)}
                      >
                        <span className="account-subscription-v2__saving-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                            <path d="M20 12v8H4v-8M22 7H2v5h20V7ZM12 22V7" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12 7H7.5A2.5 2.5 0 1 1 12 4.5V7Zm0 0h4.5A2.5 2.5 0 1 0 12 4.5V7Z" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className="account-subscription-v2__saving-copy">
                          <strong>Хочешь сэкономить?</strong>
                          <span>Перейди на годовой тариф — <b>1 490 ₽/год</b></span>
                        </span>
                        <span className="account-subscription-v2__saving-link">
                          Посмотреть варианты
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  isPaymentRetryScheduled ? (
                    <div className="account-subscription-v2__retry-card">
                      <div className="account-subscription-v2__retry-visual" aria-hidden="true">
                        <img src={subscriptionExpiredPng} alt="" />
                      </div>
                      <div className="account-subscription-v2__retry-content">
                        <span className="account-subscription-v2__retry-label">Платёж не прошёл</span>
                        <h3>Не удалось продлить подписку</h3>
                        <p className="account-subscription-v2__retry-description">
                          Мы повторим списание <strong>{formatDate(statusData?.next_charge_at) ?? "в ближайшее время"}</strong>.
                          До этого времени можно проверить карту или отменить повторную попытку.
                        </p>
                        <div className="account-subscription-v2__retry-actions">
                          <button
                            className="account-subscription-v2__btn-renew"
                            type="button"
                            onClick={handleOpenRenewCheckout}
                            disabled={Boolean(paymentPlan)}
                          >
                            Возобновить подписку
                          </button>
                          <button
                            className="account-subscription-v2__retry-cancel"
                            type="button"
                            onClick={handleOpenCancelReason}
                            disabled={canceling}
                          >
                            {canceling ? "Отменяем..." : "Отменить повторное списание"}
                          </button>
                        </div>
                        <p className="account-subscription-v2__retry-note">
                          После отмены новых попыток списания не будет
                        </p>
                      </div>
                    </div>
                  ) : (
                  <>
                    <div className="account-subscription-v2__floating-frame account-subscription-v2__floating-frame--expired">
                      <h3 className="account-subscription-v2__floating-title account-subscription-v2__floating-title--center">{expiredTitle}</h3>
                      <p className="account-subscription-v2__expired-description">{expiredDescription}</p>
                      <button
                        className="account-subscription-v2__btn-renew"
                        type="button"
                        onClick={handleOpenRenewCheckout}
                        disabled={Boolean(paymentPlan)}
                      >
                        Возобновить подписку
                      </button>
                    </div>
                    <div className="account-subscription-v2__mobile-illus account-subscription-v2__mobile-illus--expired">
                      <img
                        src={subscriptionExpiredPng}
                        alt=""
                      />
                    </div>
                    <p className="account-subscription-v2__notice account-subscription-v2__notice--expired">
                      Чтобы и дальше продолжать пользоваться Премиум функциями, обновите подписку
                    </p>
                  </>
                  )
                )}

                {showHistory && !isActive && (
                  <div className="account-subscription-v2__card-history">
                    <Link to="/account/subscription/history" className="account-subscription-v2__btn-history">
                      История подписок
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {isNeverSubscribed && (
            <div className="account-subscription-v2__intro">
              <SubscriptionPlans
                selectedPlan={selectedPlan}
                onSelectPlan={handleSelectPlan}
                onProceed={handleProceed}
                onQuotePromo={handleQuotePromo}
                onRedeemPromo={handleRedeemPromo}
                onResetPromo={handleResetPromo}
                loading={promoLoading || Boolean(paymentPlan)}
                promoError={promoErrorLabel}
                promoQuote={promoQuote}
                showTrialPricing
                trialDays={7}
              />
            </div>
          )}

          {showRenewCheckout && (
            <div className="account-subscription-v2__intro account-subscription-v2__intro--renew">
              <SubscriptionPlans
                selectedPlan={selectedPlan}
                onSelectPlan={handleSelectPlan}
                onProceed={handleProceed}
                onQuotePromo={handleQuotePromo}
                onRedeemPromo={handleRedeemPromo}
                onResetPromo={handleResetPromo}
                loading={promoLoading || Boolean(paymentPlan)}
                promoError={promoErrorLabel}
                promoQuote={promoQuote}
              />
            </div>
          )}
          </>
          )}

          {error && (
            <div className="account-subscription-v2__error-box" role="alert">
              <p>{error}</p>
            </div>
          )}

          {/* Note: promoErrorLabel is now passed into components, but if we need a global error box we can keep it here or remove if redundant */}
          {paymentError && (
            <div className="account-subscription-v2__error-box" role="alert">
              <p>{paymentError}</p>
            </div>
          )}
        </div>
      )}

      {isCancelReasonOpen && (
        <div
          className="subscription-cancel-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subscription-cancel-modal-title"
          aria-describedby="subscription-cancel-modal-description"
          onMouseDown={handleCloseCancelReason}
        >
          <div className="subscription-cancel-modal__dialog" onMouseDown={(event) => event.stopPropagation()}>
            <button
              className="subscription-cancel-modal__close"
              type="button"
              onClick={handleCloseCancelReason}
              disabled={canceling}
              aria-label="Закрыть"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="subscription-cancel-modal__header">
              <h3 id="subscription-cancel-modal-title" className="subscription-cancel-modal__title">
                Жаль, что Вы уходите 😔
              </h3>
              <p id="subscription-cancel-modal-description" className="subscription-cancel-modal__description">
                Что стало основной причиной? Ответ займет всего несколько секунд
              </p>
            </div>

            <div className="subscription-cancel-modal__options" role="radiogroup" aria-label="Основная причина отмены подписки">
              {CANCELLATION_REASONS.map((reason) => {
                const isSelected = cancelReason === reason.value;

                return (
                  <label
                    key={reason.value}
                    className={`subscription-cancel-modal__option${isSelected ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="subscription-cancel-reason"
                      value={reason.value}
                      checked={isSelected}
                      onChange={() => {
                        setCancelReason(reason.value);
                        if (reason.value !== "other") {
                          setCancelReasonDetails("");
                        }
                      }}
                      disabled={canceling}
                    />
                    <span className={`subscription-cancel-modal__option-icon subscription-cancel-modal__option-icon--${reason.value}`}>
                      <CancellationReasonIcon reason={reason.value} />
                    </span>
                    <span className="subscription-cancel-modal__option-label">{reason.label}</span>
                  </label>
                );
              })}
            </div>

            {cancelReason === "other" && (
              <label className="subscription-cancel-modal__details">
                <span>Расскажите коротко, что стало причиной</span>
                <input
                  type="text"
                  value={cancelReasonDetails}
                  onChange={(event) => setCancelReasonDetails(event.target.value)}
                  placeholder="Например: не подошел формат"
                  maxLength={500}
                  disabled={canceling}
                  autoFocus
                />
              </label>
            )}

            <div className="subscription-cancel-modal__actions">
              <button
                className="subscription-cancel-modal__secondary"
                type="button"
                onClick={handleCloseCancelReason}
                disabled={canceling}
              >
                Оставить подписку
              </button>
              <button
                className="subscription-cancel-modal__primary"
                type="button"
                onClick={handleCancel}
                disabled={!cancelReason || canceling}
              >
                {canceling ? "Отмена..." : "Отменить подписку"}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
