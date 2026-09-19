import { useMemo } from 'react';
import { formatNumeric } from '@/lib/nutrition';
import { useAuth } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useFavoritesStore } from '@/store/favorites';
import { openAnyEatLaunchModal } from '@/components/AnyEatLaunchModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { analytics } from '@/services/analytics';

type DishCardProps = {
    dish: any;
    restaurantSlug: string;
    restaurantName?: string;
    showRestaurantName?: boolean;
    isFreeAccess?: boolean;
    // If true, clicking on the card opens the modal (default behavior)
    interactive?: boolean;
    readOnly?: boolean;
    // Custom click handler if needed
    onClick?: () => void;
};

export default function DishCard({ dish, restaurantSlug, restaurantName, showRestaurantName = true, isFreeAccess = false, interactive = true, readOnly = false, onClick }: DishCardProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const accessToken = useAuth((state) => state.accessToken);
    const { hasActiveSub, hasSubscriptionHistory } = useSubscriptionStore((state) => ({
        hasActiveSub: state.hasActiveSub,
        hasSubscriptionHistory: state.hasSubscriptionHistory,
    }));
    const { isFavorite, toggle } = useFavoritesStore((state) => ({
        isFavorite: state.isFavorite(Number(dish.id)),
        toggle: state.toggle,
    }));

    const favorited = isFavorite;
    const hasDishAccess = hasActiveSub || isFreeAccess;
    const subscriptionCtaText = hasSubscriptionHistory ? 'Возобновить подписку' : 'Попробовать бесплатно';
    const macros = useMemo(() => {
        const protein = Number.isFinite(dish.protein) ? Number(dish.protein) : 0;
        const fat = Number.isFinite(dish.fat) ? Number(dish.fat) : 0;
        const carbs = Number.isFinite(dish.carbs) ? Number(dish.carbs) : 0;
        const total = protein + fat + carbs;
        const fallback = total > 0 ? 0 : 100 / 3;
        const proteinPct = total > 0 ? (protein / total) * 100 : fallback;
        const fatPct = total > 0 ? (fat / total) * 100 : fallback;
        const carbsPct = total > 0 ? Math.max(0, 100 - proteinPct - fatPct) : fallback;

        return {
            proteinPct,
            fatPct,
            carbsPct,
            proteinDeg: proteinPct * 3.6,
            fatDeg: fatPct * 3.6,
        };
    }, [dish.protein, dish.fat, dish.carbs]);

    const handleFavoriteClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (readOnly) return;
        if (!accessToken) {
            navigate('/login', { state: { from: location.pathname + location.search } });
            return;
        }

        if (!favorited && !hasDishAccess) {
            navigate('/account/subscription', { state: { from: location.pathname + location.search } });
            return;
        }

        if (!favorited) {
            analytics.track("favorite_add", { type: "dish", dish_id: dish.id, name: dish.name });
        } else {
            analytics.track("favorite_remove", { type: "dish", dish_id: dish.id, name: dish.name });
        }
        await toggle(accessToken, Number(dish.id), restaurantSlug);
    };

    const handleDiaryAdd = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (readOnly) return;
        openAnyEatLaunchModal();
    };

    const handleSubscribe = (e: React.MouseEvent) => {
        e.stopPropagation();
        const returnTo = location.pathname + location.search;
        if (accessToken) {
            navigate('/account/subscription', { state: { from: returnTo } });
            return;
        }
        navigate('/login', { state: { from: '/account/subscription', returnTo } });
    };

    const handleDetailsClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!interactive) return;
        onClick?.();
    };

    return (
        <div className={`menu-card ${interactive ? 'is-interactive' : ''}`} onClick={handleDetailsClick}>
            <div className="menu-card__top">
                <div className="menu-card__title-row">
                    <div className="menu-card__heading">
                        {showRestaurantName && restaurantName && <div className="menu-card__restaurant">{restaurantName}</div>}
                        <h3 className="menu-card__title">{dish.name}</h3>
                        {Number.isFinite(dish.price) && <div className="menu-card__price">{Math.round(dish.price)} ₽</div>}
                    </div>
                </div>

                {hasDishAccess ? (
                    <>
                        <div className="menu-card__nutrition">
                            <div
                                className="menu-card__kcal-ring"
                                style={{
                                    '--protein-deg': `${macros.proteinDeg}deg`,
                                    '--fat-deg': `${macros.fatDeg}deg`,
                                } as React.CSSProperties}
                                aria-label={`${formatNumeric(dish.kcal)} ккал`}
                            >
                                <div className="menu-card__kcal-core">
                                    <strong>{formatNumeric(dish.kcal)}</strong>
                                    <span>ккал</span>
                                </div>
                            </div>

                            <div className="menu-card__macro-panel">
                                <div className="menu-card__macro-bar" aria-hidden="true">
                                    <span className="menu-card__macro-segment menu-card__macro-segment--protein" style={{ width: `${macros.proteinPct}%` }} />
                                    <span className="menu-card__macro-segment menu-card__macro-segment--fat" style={{ width: `${macros.fatPct}%` }} />
                                    <span className="menu-card__macro-segment menu-card__macro-segment--carbs" style={{ width: `${macros.carbsPct}%` }} />
                                </div>

                                <div className="menu-card__macro-list">
                                    <div className="menu-card__macro-item menu-card__macro-item--protein">
                                        <span className="menu-card__macro-dot" aria-hidden="true" />
                                        <span><strong>Б</strong> {formatNumeric(dish.protein)}г</span>
                                    </div>
                                    <div className="menu-card__macro-item menu-card__macro-item--fat">
                                        <span className="menu-card__macro-dot" aria-hidden="true" />
                                        <span><strong>Ж</strong> {formatNumeric(dish.fat)}г</span>
                                    </div>
                                    <div className="menu-card__macro-item menu-card__macro-item--carbs">
                                        <span className="menu-card__macro-dot" aria-hidden="true" />
                                        <span><strong>У</strong> {formatNumeric(dish.carbs)}г</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="menu-paywall">
                        <p className="menu-paywall__text">Эта информация доступна только по подписке.</p>
                        <button type="button" className="subscribe-btn" onClick={handleSubscribe}>
                            {subscriptionCtaText}
                        </button>
                    </div>
                )}

                <div className="menu-card__footer">
                    <button
                        type="button"
                        className={`menu-card__fav-btn ${favorited ? 'is-active' : ''}`}
                        onClick={handleFavoriteClick}
                        aria-label={favorited ? "Удалить из избранного" : "Добавить в избранное"}
                    >
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z"
                                fill={favorited ? "#D8733B" : "none"}
                                stroke={favorited ? "#D8733B" : "currentColor"}
                                strokeWidth="1.8"
                            />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="menu-card__diary-btn"
                        onClick={handleDiaryAdd}
                        title="Добавить в съеденное сегодня"
                    >
                        <span>В дневник</span>
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
