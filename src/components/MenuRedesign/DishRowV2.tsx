import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { computeMacroGeometry, formatNumeric, formatPortionLabel, formatPriceRub } from '@/lib/nutrition';
import { useAuth } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useFavoritesStore } from '@/store/favorites';
import { openAnyEatLaunchModal } from '@/components/AnyEatLaunchModal';
import { analytics } from '@/services/analytics';
import MacroRing from './MacroRing';
import { HeartIcon, DiaryIcon, LockIcon } from './icons';
import VariantPicker from './VariantPicker';

type DishRowV2Props = {
  dish: any;
  restaurantSlug: string;
  restaurantName?: string;
  isFreeAccess?: boolean;
  interactive?: boolean;
  readOnly?: boolean;
  guideFavoriteTarget?: boolean;
  onGuideFavorite?: () => void;
  onClick?: (dish: any) => void;
};

// Redesigned mobile feed row. Same data/handlers as DishTileV2 — the two
// only differ in markup so they read correctly at 72px-row vs. tile scale.
export default function DishRowV2({ dish, restaurantSlug, restaurantName, isFreeAccess = false, interactive = true, readOnly = false, guideFavoriteTarget = false, onGuideFavorite, onClick }: DishRowV2Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuth((state) => state.accessToken);
  const { hasActiveSub, hasSubscriptionHistory } = useSubscriptionStore((state) => ({
    hasActiveSub: state.hasActiveSub,
    hasSubscriptionHistory: state.hasSubscriptionHistory,
  }));
  const variants = Array.isArray(dish.variants) ? dish.variants : [];
  const [selectedVariantId, setSelectedVariantId] = useState(dish.id);
  useEffect(() => {
    if (!variants.some((variant) => variant.id === selectedVariantId)) setSelectedVariantId(variants[0]?.id ?? dish.id);
  }, [dish.id, selectedVariantId, variants]);
  const selectedDish = variants.find((variant) => variant.id === selectedVariantId) || dish;
  const { isFavorite, toggle } = useFavoritesStore((state) => ({
    isFavorite: state.isFavorite(Number(selectedDish.id)),
    toggle: state.toggle,
  }));
  const favorited = isFavorite;
  const hasDishAccess = hasActiveSub || isFreeAccess;
  const photoUrl = selectedDish.photoUrl || selectedDish.photo_url || null;
  void hasSubscriptionHistory;

  const geometry = useMemo(() => computeMacroGeometry(selectedDish.protein, selectedDish.fat, selectedDish.carbs), [selectedDish.protein, selectedDish.fat, selectedDish.carbs]);
  const price = formatPriceRub(selectedDish.price);
  const portion = formatPortionLabel(selectedDish);

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
      analytics.track('favorite_add', { type: 'dish', dish_id: selectedDish.id, name: selectedDish.name });
    } else {
      analytics.track('favorite_remove', { type: 'dish', dish_id: selectedDish.id, name: selectedDish.name });
    }
    await toggle(accessToken, Number(selectedDish.id), restaurantSlug);
    onGuideFavorite?.();
  };

  const handleDiaryAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    openAnyEatLaunchModal();
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
    onClick?.(selectedDish);
  };

  const handleRowClick = () => {
    if (!interactive) return;
    onClick?.(selectedDish);
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

        {hasDishAccess && variants.length > 1 && (
          <VariantPicker
            variants={variants}
            selected={selectedDish}
            onChange={(variant) => setSelectedVariantId(variant.id)}
          />
        )}

        {/*
          The ring sits in its own grid column spanning both the macro row and
          the action row, so it can be much larger than the 30px it had when it
          was trapped inside a single line. Everything else stacks to its right.
        */}
        <div className={`rsm2-row__lower ${hasDishAccess ? '' : 'rsm2-row__lower--teaser'}`}>
          <MacroRing geometry={geometry} kcal={selectedDish.kcal} size="row" className="rsm2-row__ring--tall" concealed={!hasDishAccess} />

          <div className="rsm2-row__macro-col">
            <div className="rsm2-row__macrobar" aria-hidden="true">
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--protein" style={{ width: `${geometry.proteinPct}%` }} />
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--fat" style={{ width: `${geometry.fatPct}%` }} />
              <span className="rsm2-macrobar__seg rsm2-macrobar__seg--carb" style={{ width: `${geometry.carbPct}%` }} />
            </div>
            <span className="rsm2-row__macro-text">
              {hasDishAccess
                ? `Б ${formatNumeric(selectedDish.protein)} · Ж ${formatNumeric(selectedDish.fat)} · У ${formatNumeric(selectedDish.carbs)}`
                : 'Б — · Ж — · У —'}
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
                    <button type="button" className={`rsm2-fav rsm2-fav--row ${guideFavoriteTarget ? 'is-guide-target' : ''}`} onClick={handleFavoriteClick} aria-label={favorited ? 'Удалить из избранного' : 'Добавить в избранное'}>
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
                  <button type="button" className={`rsm2-fav rsm2-fav--row ${guideFavoriteTarget ? 'is-guide-target' : ''}`} onClick={handleFavoriteClick} aria-label={favorited ? 'Удалить из избранного' : 'Добавить в избранное'}>
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
