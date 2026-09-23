import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { computeMacroGeometry, formatNumeric, formatPortionLabel, formatPriceRub } from '@/lib/nutrition';
import { useAuth } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useFavoritesStore } from '@/store/favorites';
import { useDiaryStore } from '@/store/diary';
import { analytics } from '@/services/analytics';
import MacroRing from './MacroRing';
import { HeartIcon, DiaryIcon, LockIcon } from './icons';

type DishRowV2Props = {
  dish: any;
  restaurantSlug: string;
  restaurantName?: string;
  isFreeAccess?: boolean;
  interactive?: boolean;
  readOnly?: boolean;
  onClick?: () => void;
};

// Redesigned mobile feed row. Same data/handlers as DishTileV2 — the two
// only differ in markup so they read correctly at 72px-row vs. tile scale.
export default function DishRowV2({ dish, restaurantSlug, restaurantName, isFreeAccess = false, interactive = true, readOnly = false, onClick }: DishRowV2Props) {
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
  const photoUrl = dish.photoUrl || dish.photo_url || null;
  void hasSubscriptionHistory;

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

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const returnTo = location.pathname + location.search;
    if (!hasDishAccess) {
      if (accessToken) {
        navigate('/account/subscription', { state: { from: returnTo } });
      } else {
        navigate('/login', { state: { from: '/account/subscription', returnTo } });
      }
      return;
    }
    onClick?.();
  };

  const handleRowClick = () => {
    if (!interactive) return;
    onClick?.();
  };

  return (
    <div className="rsm2-row" onClick={handleRowClick} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}>
      <div className={`rsm2-row__cover ${hasDishAccess ? '' : 'rsm2-row__cover--paywalled'}`}>
        {photoUrl ? (
          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        ) : (
          <span className="rsm2-row__cover-mark" aria-hidden="true" />
        )}
        {!hasDishAccess && (
          <span className="rsm2-row__cover-lock"><LockIcon size={18} /></span>
        )}
      </div>

      <div className="rsm2-row__body">
        <div className="rsm2-row__title-row">
          <span className="rsm2-row__name">{dish.name}</span>
          {(portion || price) && (
            <span className="rsm2-row__meta">
              {portion && <span className="rsm2-row__portion">{portion}</span>}
              {price && <span className="rsm2-row__price">{price}</span>}
            </span>
          )}
        </div>

        {/*
          The ring sits in its own grid column spanning both the macro row and
          the action row, so it can be much larger than the 30px it had when it
          was trapped inside a single line. Everything else stacks to its right.
        */}
        <div className={`rsm2-row__lower ${hasDishAccess ? '' : 'rsm2-row__lower--teaser'}`}>
          <MacroRing geometry={geometry} kcal={dish.kcal} size="row" className="rsm2-row__ring--tall" />

          <div className="rsm2-row__macro-col">
            <div className="rsm2-row__macrobar" aria-hidden="true">
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--protein" style={{ width: `${geometry.proteinPct}%` }} />
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--fat" style={{ width: `${geometry.fatPct}%` }} />
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--carb" style={{ width: `${geometry.carbPct}%` }} />
            </div>
            <span className="rsm2-row__macro-text">
              Б {formatNumeric(dish.protein)} · Ж {formatNumeric(dish.fat)} · У {formatNumeric(dish.carbs)}
            </span>
          </div>

          <div className="rsm2-row__footer">
            {hasDishAccess ? (
              <>
                <button type="button" className="rsm2-composition-pill" onClick={handleRowClick}>
                  Состав<span style={{ fontSize: 9 }}>▾</span>
                </button>
                {!readOnly && (
                  <div className="rsm2-row__actions">
                    <button type="button" className="rsm2-fav rsm2-fav--row" onClick={handleFavoriteClick} aria-label={favorited ? 'Удалить из избранного' : 'Добавить в избранное'}>
                      <HeartIcon filled={favorited} size={19} />
                    </button>
                    <button type="button" className="rsm2-dbtn rsm2-dbtn--icon" onClick={handleDiaryAdd} aria-label="В дневник" title="В дневник">
                      <DiaryIcon size={17} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rsm2-row__footer-actions">
                <div className="rsm2-row__actions">
                  <button type="button" className="rsm2-fav rsm2-fav--row" onClick={handleFavoriteClick} aria-label={favorited ? 'Удалить из избранного' : 'Добавить в избранное'}>
                    <HeartIcon filled={favorited} size={19} />
                  </button>
                  <button type="button" className="rsm2-row__open-btn" onClick={handleOpen}>
                    Попробовать бесплатно
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
