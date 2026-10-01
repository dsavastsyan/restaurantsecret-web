import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { computeMacroGeometry, formatNumeric, formatPortionLabel, formatPriceRub } from '@/lib/nutrition';
import { useAuth } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useFavoritesStore } from '@/store/favorites';
import { useDiaryStore } from '@/store/diary';
import { analytics } from '@/services/analytics';
import MacroRing from './MacroRing';
import { HeartIcon } from './icons';

type DishTileV2Props = {
  dish: any;
  restaurantSlug: string;
  restaurantName?: string;
  isFreeAccess?: boolean;
  interactive?: boolean;
  readOnly?: boolean;
  onClick?: () => void;
};

// Redesigned desktop grid card. Mirrors DishCard.tsx's data/handlers 1:1 for
// functional parity (favorite, diary add, subscribe redirect) but renders
// the new visual language. Photos are not yet part of the data model, so
// every card renders the "plaque" (photo-less) cover today — the photo
// branch below is future-proofing per the design handoff.
export default function DishTileV2({ dish, restaurantSlug, restaurantName, isFreeAccess = false, interactive = true, readOnly = false, onClick }: DishTileV2Props) {
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
  const addDiaryEntry = useDiaryStore((s) => s.addEntry);

  const favorited = isFavorite;
  const hasDishAccess = hasActiveSub || isFreeAccess;
  const subscriptionCtaText = hasSubscriptionHistory ? 'Возобновить подписку' : 'Попробовать бесплатно';
  const photoUrl = dish.photoUrl || dish.photo_url || null;

  const geometry = useMemo(() => computeMacroGeometry(dish.protein, dish.fat, dish.carbs), [dish.protein, dish.fat, dish.carbs]);
  const price = formatPriceRub(dish.price);
  const portion = formatPortionLabel(dish);

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
      analytics.track('favorite_add', { type: 'dish', dish_id: dish.id, name: dish.name });
    } else {
      analytics.track('favorite_remove', { type: 'dish', dish_id: dish.id, name: dish.name });
    }
    await toggle(accessToken, Number(dish.id), restaurantSlug);
  };

  const handleDiaryAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    if (!accessToken) {
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    if (!hasDishAccess) {
      navigate('/account/subscription', { state: { from: location.pathname + location.search } });
      return;
    }
    const safeNum = (val: any) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    };
    const dishId = Number(dish.id);
    await addDiaryEntry(accessToken, {
      date: new Date().toISOString().split('T')[0],
      dish_id: Number.isFinite(dishId) ? dishId : undefined,
      restaurant_slug: restaurantSlug,
      restaurant_name: restaurantName || undefined,
      name: dish.name || 'Блюдо',
      calories: safeNum(dish.kcal),
      protein: safeNum(dish.protein),
      fat: safeNum(dish.fat),
      carbs: safeNum(dish.carbs),
      weight: safeNum(dish.weight) || undefined,
    });
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

  const handleTileClick = () => {
    if (!interactive) return;
    onClick?.();
  };

  return (
    <div
      className="rsm2-tile"
      onClick={handleTileClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className={`${hasDishAccess ? '' : 'rsm2-tile__cover--paywalled'}`} style={{ position: 'relative' }}>
        {photoUrl ? (
          <div className="rsm2-tile__cover" style={{ padding: 0, background: 'none' }}>
            <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {hasDishAccess && (
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span className="rsm2-serif" style={{ font: '400 22px/1.05 "DM Serif Display", Georgia, serif', color: '#fffdf8' }}>{dish.name}</span>
                  {portion && <span style={{ font: '700 11px/1 Inter, sans-serif', letterSpacing: '.04em', color: 'rgba(255,253,248,.78)' }}>{portion}</span>}
                </span>
                {price && <span style={{ flex: 'none', padding: '7px 12px', borderRadius: 999, background: 'rgba(255,253,251,.94)', font: '800 13px/1 Inter, sans-serif', color: '#25221d' }}>{price}</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="rsm2-tile__cover">
            <div className="rsm2-tile__cover-ring" aria-hidden="true" />
            <div className="rsm2-tile__cover-ring rsm2-tile__cover-ring--inner" aria-hidden="true" />
            <span />
            {hasDishAccess && (
              <>
                <span className="rsm2-tile__cover-name">{dish.name}</span>
                {(portion || price) && (
                  <div className="rsm2-tile__cover-meta">
                    {portion && <span className="rsm2-tile__portion">{portion}</span>}
                    {portion && price && <span className="rsm2-tile__meta-sep" aria-hidden="true">·</span>}
                    {price && <span className="rsm2-tile__cover-price">{price}</span>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!hasDishAccess && (
          <div className="rsm2-paywall">
            <span className="rsm2-paywall__name">{dish.name}</span>
            <span className="rsm2-paywall__text">КБЖУ и состав — по подписке</span>
            <button type="button" className="rsm2-paywall__cta" onClick={handleSubscribe}>
              {subscriptionCtaText}
            </button>
          </div>
        )}
      </div>

      <div className="rsm2-tile__body">
        {hasDishAccess ? (
          <button type="button" className="rsm2-composition-btn" onClick={handleTileClick}>
            Посмотреть состав
          </button>
        ) : (
          <div className="rsm2-tile__composition-row">
            <span className="rsm2-composition-btn rsm2-composition-btn--locked">Состав</span>
            {price && <span className="rsm2-tile__price">{price}</span>}
          </div>
        )}

        <div className={`rsm2-nutrition ${hasDishAccess ? '' : 'rsm2-nutrition--teaser'}`}>
          <MacroRing geometry={geometry} kcal={dish.kcal} size="tile" concealed={!hasDishAccess} />
          <div>
            <div className="rsm2-macrobar" aria-hidden="true">
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--protein" style={{ width: `${geometry.proteinPct}%` }} />
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--fat" style={{ width: `${geometry.fatPct}%` }} />
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--carb" style={{ width: `${geometry.carbPct}%` }} />
            </div>
            <div className="rsm2-legend">
              <span className="rsm2-legend__item"><span className="rsm2-legend__dot rsm2-legend__dot--protein" />Б {hasDishAccess ? `${formatNumeric(dish.protein)}г` : '—'}</span>
              <span className="rsm2-legend__item"><span className="rsm2-legend__dot rsm2-legend__dot--fat" />Ж {hasDishAccess ? `${formatNumeric(dish.fat)}г` : '—'}</span>
              <span className="rsm2-legend__item"><span className="rsm2-legend__dot rsm2-legend__dot--carb" />У {hasDishAccess ? `${formatNumeric(dish.carbs)}г` : '—'}</span>
            </div>
          </div>
        </div>

        {!readOnly && (
          <div className="rsm2-tile__footer">
            <button type="button" className="rsm2-fav" onClick={handleFavoriteClick} aria-label={favorited ? 'Удалить из избранного' : 'Добавить в избранное'}>
              <HeartIcon filled={favorited} size={24} />
            </button>
            <button type="button" className="rsm2-dbtn" onClick={handleDiaryAdd}>
              <span>В дневник</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
