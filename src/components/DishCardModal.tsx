import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";

import { useDishCardStore } from "@/store/dishCard";
import { useAuth } from "@/store/auth";
import { useSubscriptionStore } from "@/store/subscription";
import { postSuggest } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useFavoritesStore } from "@/store/favorites";
import { openAnyEatLaunchModal } from "@/components/AnyEatLaunchModal";
import { computeMacroGeometry, formatNumeric, formatPriceRub } from "@/lib/nutrition";
import { analytics } from "@/services/analytics";
import MacroRing from "@/components/MenuRedesign/MacroRing";
import { HeartIcon } from "@/components/MenuRedesign/icons";
import "@/pages/menu-redesign.css";

const root = typeof document !== "undefined" ? document.body : null;

export default function DishCardModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOpen, isLoading, isReadOnly, data, error, close } = useDishCardStore((s) => ({
    isOpen: s.isOpen,
    isLoading: s.isLoading,
    isReadOnly: s.isReadOnly,
    data: s.data,
    error: s.error,
    close: s.close,
  }));
  const accessToken = useAuth((state) => state.accessToken);
  const { hasActiveSub, hasSubscriptionHistory, fetchStatus } = useSubscriptionStore((state) => ({
    hasActiveSub: state.hasActiveSub,
    hasSubscriptionHistory: state.hasSubscriptionHistory,
    fetchStatus: state.fetchStatus,
  }));
  const { isFavorite, toggleFavorite } = useFavoritesStore((state) => ({
    isFavorite: state.isFavorite(Number(data?.id)),
    toggleFavorite: state.toggle,
  }));
  const hasDishAccess = isReadOnly || hasActiveSub || Boolean(data?.isFreeAccess);
  const subscriptionCtaText = hasSubscriptionHistory ? "Возобновить подписку" : "Попробовать бесплатно";

  const [isOutdatedOpen, setIsOutdatedOpen] = useState(false);
  const [reason, setReason] = useState<
    "wrong_kbju" | "missing_from_menu" | "other"
  >("wrong_kbju");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!isOpen || !root) return undefined;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isReadOnly) return;
    fetchStatus(accessToken);
    if (data) {
      analytics.track("dish_open", { dish_id: data.id, name: data.name, restaurant: data.restaurantSlug });
    }
  }, [accessToken, fetchStatus, isOpen, isReadOnly, data]);

  useEffect(() => {
    if (!isOpen || isReadOnly || !hasDishAccess || !data) return;
    try { ym(108992733, 'reachGoal', 'dish_kbju_view'); } catch { /* ym not loaded */ }
  }, [isOpen, isReadOnly, hasDishAccess, data]);

  const handleSubscribeClick = () => {
    const returnTo = location.pathname + location.search;
    if (accessToken) {
      close();
      navigate("/account/subscription", { state: { from: returnTo } });
      return;
    }
    close();
    navigate("/login", { state: { from: "/account/subscription", returnTo } });
  };

  const resetOutdatedForm = () => {
    setReason("wrong_kbju");
    setComment("");
    setFormError("");
  };

  const handleOutdatedSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;

    if (reason === "other" && !comment.trim()) {
      setFormError("Добавьте комментарий");
      return;
    }

    setFormError("");
    setIsSubmitting(true);
    try {
      await postSuggest({
        kind: "dish_outdated",
        reason,
        name: data.restaurantName || "Ресторан",
        dish_name: data.name,
        comment: comment.trim() || undefined,
      });
      toast.success("Спасибо, мы проверим");
      setIsOutdatedOpen(false);
      resetOutdatedForm();
    } catch (err) {
      console.error("Failed to submit outdated dish", err);
      toast.error("Не удалось отправить сообщение. Попробуйте позже.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly || !data) return;
    if (!accessToken) {
      close();
      navigate("/login", { state: { from: location.pathname + location.search } });
      return;
    }
    if (!isFavorite && !hasDishAccess) {
      close();
      navigate("/account/subscription", { state: { from: location.pathname + location.search } });
      return;
    }
    if (!isFavorite) {
      analytics.track("favorite_add", { type: "dish", dish_id: data.id, name: data.name });
    } else {
      analytics.track("favorite_remove", { type: "dish", dish_id: data.id, name: data.name });
    }
    await toggleFavorite(accessToken, Number(data.id), data.restaurantSlug);
  };

  const handleDiaryAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly || !data) return;
    close();
    openAnyEatLaunchModal();
  };

  if (!isOpen || !root) return null;

  // The "report outdated menu" form was not part of the visual redesign, so it
  // keeps its existing feedback-modal styling; only its trigger lives in the
  // new card body.
  const outdatedFormOverlay = !isReadOnly && isOutdatedOpen && (
    <div
      className="feedback-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Сообщить об устаревшем меню"
      onClick={(event) => {
        event.stopPropagation();
        setIsOutdatedOpen(false);
        resetOutdatedForm();
      }}
    >
      <div
        className="feedback-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="feedback-modal__header">
          <h4 className="feedback-modal__title">Меню устарело</h4>
          <button
            type="button"
            className="feedback-modal__close"
            aria-label="Закрыть"
            onClick={() => {
              setIsOutdatedOpen(false);
              resetOutdatedForm();
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form className="feedback-modal__form" onSubmit={handleOutdatedSubmit}>
          <fieldset className="feedback-modal__fieldset">
            <legend className="feedback-modal__legend">Причина</legend>
            <label className="feedback-modal__option">
              <input
                type="radio"
                name="outdated-reason"
                value="wrong_kbju"
                checked={reason === "wrong_kbju"}
                onChange={() => setReason("wrong_kbju")}
              />
              <span>Неверное КБЖУ</span>
            </label>
            <label className="feedback-modal__option">
              <input
                type="radio"
                name="outdated-reason"
                value="missing_from_menu"
                checked={reason === "missing_from_menu"}
                onChange={() => setReason("missing_from_menu")}
              />
              <span>Блюда нет в меню</span>
            </label>
            <label className="feedback-modal__option">
              <input
                type="radio"
                name="outdated-reason"
                value="other"
                checked={reason === "other"}
                onChange={() => setReason("other")}
              />
              <span>Другое</span>
            </label>
          </fieldset>

          {reason === "other" && (
            <label className="feedback-modal__field">
              <span>Комментарий</span>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Опишите проблему"
                rows={3}
              />
            </label>
          )}

          {formError && (
            <p className="feedback-modal__error" role="status">
              {formError}
            </p>
          )}

          <div className="feedback-modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setIsOutdatedOpen(false);
                resetOutdatedForm();
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Отправляем…" : "Отправить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const contentV2 = (
    <div className="rsm2-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dish-card-title-v2" onClick={close}>
      <div className="rsm2-modal" onClick={(event) => event.stopPropagation()}>
        <div className="rsm2-modal__hero">
          <div className="rsm2-modal__hero-mark" aria-hidden="true" />
          <button className="rsm2-modal__close" type="button" aria-label="Закрыть" onClick={close}>
            ✕
          </button>
        </div>

        {isLoading && (
          <div className="dish-card__loading">
            <div className="dish-card__spinner" aria-hidden />
            <p>Загружаем карточку блюда…</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="dish-card__error">
            <p>{error}</p>
            <button type="button" className="btn btn--primary" onClick={close}>
              Закрыть
            </button>
          </div>
        )}

        {!isLoading && data && (
          <DishModalBodyV2
            data={data}
            hasDishAccess={hasDishAccess}
            readOnly={isReadOnly}
            subscriptionCtaText={subscriptionCtaText}
            isFavorite={isFavorite}
            onSubscribeClick={handleSubscribeClick}
            onFavoriteClick={handleFavoriteClick}
            onDiaryAdd={handleDiaryAdd}
            onReportOutdated={() => setIsOutdatedOpen(true)}
          />
        )}
      </div>

      {outdatedFormOverlay}
    </div>
  );

  return createPortal(contentV2, root);
}

// Body of the redesigned full dish card (design_handoff_restaurant_menu,
// section 1d). Pure presentation — all data comes from the dishCard store via
// props, all mutations go back through the same handlers as the legacy card.
function DishModalBodyV2({
  data,
  hasDishAccess,
  readOnly,
  subscriptionCtaText,
  isFavorite,
  onSubscribeClick,
  onFavoriteClick,
  onDiaryAdd,
  onReportOutdated,
}: {
  data: any;
  hasDishAccess: boolean;
  readOnly: boolean;
  subscriptionCtaText: string;
  isFavorite: boolean;
  onSubscribeClick: () => void;
  onFavoriteClick: (e: React.MouseEvent) => void;
  onDiaryAdd: (e: React.MouseEvent) => void;
  onReportOutdated: () => void;
}) {
  const geometry = useMemo(
    () => computeMacroGeometry(data.proteins_g, data.fats_g, data.carbs_g),
    [data.proteins_g, data.fats_g, data.carbs_g],
  );
  const price = formatPriceRub(data.price);
  // `portionLabel` is already derived in the dishCard store (falls back to
  // "1 порция" when the restaurant gave us no weight), so we only surface it
  // when it carries a real number.
  const portion = /\d/.test(String(data.portionLabel || '')) ? data.portionLabel : null;

  const macroRows = [
    { key: "proteins_g", label: "Белки", value: data.proteins_g, pct: geometry.proteinPct, dot: "var(--rsm2-protein)" },
    { key: "fats_g", label: "Жиры", value: data.fats_g, pct: geometry.fatPct, dot: "var(--rsm2-fat)" },
    { key: "carbs_g", label: "Углеводы", value: data.carbs_g, pct: geometry.carbPct, dot: "var(--rsm2-carb)" },
  ];

  return (
    <div className="rsm2-modal__body">
      <div>
        <div className="rsm2-modal__eyebrow">
          {[data.restaurantName || "Ресторан", portion].filter(Boolean).join(" · ")}
        </div>
        <div className="rsm2-modal__title-row">
          <h3 id="dish-card-title-v2" className="rsm2-modal__title">{data.name}</h3>
          {price && <span className="rsm2-modal__price">{price}</span>}
        </div>
        <p className="rsm2-modal__composition">
          {hasDishAccess
            ? data.composition_text || "Ресторан не поделился данными о составе"
            : "Состав доступен по подписке."}
        </p>
      </div>

      {hasDishAccess ? (
        <div className="rsm2-modal__panel">
          <MacroRing geometry={geometry} kcal={data.kcal} size="modal" />
          <div className="rsm2-modal__macros">
            {macroRows.map((row) => (
              <div className="rsm2-modal__macro-row" key={row.key}>
                <span className="rsm2-modal__macro-dot" style={{ background: row.dot }} />
                <span className="rsm2-modal__macro-label">{row.label}</span>
                <span className="rsm2-modal__macro-value">{formatNumeric(row.value)} г</span>
                <span className="rsm2-modal__macro-pct">{Math.round(row.pct)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rsm2-modal__paywall">
          <p className="rsm2-modal__paywall-text">Эта информация доступна только по подписке.</p>
          <button type="button" className="rsm2-paywall__cta" onClick={onSubscribeClick}>
            {subscriptionCtaText}
          </button>
        </div>
      )}

      {readOnly ? (
        <div className="rsm2-modal__actions">
          <span className="rsm2-modal__meta">Предпросмотр карточки блюда</span>
        </div>
      ) : (
        <div className="rsm2-modal__actions">
          <button type="button" className="rsm2-modal__cta" onClick={onDiaryAdd}>
            <span>В дневник</span>
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="rsm2-modal__fav"
            onClick={onFavoriteClick}
            aria-label={isFavorite ? "Удалить из избранного" : "Добавить в избранное"}
          >
            <HeartIcon filled={isFavorite} size={22} />
          </button>
          {data.menuCapturedAtLabel && (
            <span className="rsm2-modal__meta">Данные ресторана от {data.menuCapturedAtLabel}</span>
          )}
        </div>
      )}

      {!readOnly && data.menuCapturedAtLabel && (
        <div className="rsm2-modal__footer-note">
          <button type="button" className="rsm2-modal__outdated" onClick={onReportOutdated}>
            <span aria-hidden="true">⟳</span> Меню устарело?
          </button>
        </div>
      )}
    </div>
  );
}
