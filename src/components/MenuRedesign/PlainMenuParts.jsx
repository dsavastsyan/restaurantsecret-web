// Обычные меню с нашей оценкой КБЖУ по составу (флаг plain_menus).
// Утверждённый макет: product/solutions/plain-menus/design (веб-раздел), решения 27.11:
// бейдж «≈ примерно» только у оценок, пунктирное кольцо, штрихованная полоска БЖУ,
// напитки — только калории, позиции без КБЖУ — серым блоком в самом конце.
import { useMemo, useState } from 'react';
import { computeMacroGeometry, formatNumeric, formatPriceRub } from '@/lib/nutrition';
import { useSubscriptionStore } from '@/store/subscription';
import { openAnyEatLaunchModal } from '@/components/AnyEatLaunchModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { DiaryIcon } from './icons';

const pluralPositions = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'позиция';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'позиции';
  return 'позиций';
};

const priceText = (dish) => {
  const price = formatPriceRub(dish.price);
  if (!price) return null;
  return dish.priceFrom ? `от ${price}` : price;
};

export function EstimateBadge({ className = '' }) {
  return <span className={`rsm2-est-badge ${className}`}>≈ примерно</span>;
}

const BANNER_TEXT = {
  menu: 'Ресторан не поделился КБЖУ. Мы посчитали его по составу и весу из меню, поэтому цифры примерные',
  tab: 'Этих блюд нет в КБЖУ-меню ресторана. Мы посчитали их примерно, по составу и весу из обычного меню',
};

export function PlainMenuBanner({ variant = 'menu' }) {
  return (
    <div className="rsm2-est-banner" role="note">
      <span className="rsm2-est-banner__icon" aria-hidden="true">≈</span>
      <p>{BANNER_TEXT[variant] || BANNER_TEXT.menu}</p>
    </div>
  );
}

export function KbjuTabs({ tabs, onChange }) {
  if (!tabs) return null;
  const items = [
    { key: 'restaurant', label: 'От ресторана', count: tabs.restaurantCount },
    { key: 'estimated', label: '≈ По составу', count: tabs.estimatedCount },
  ];
  return (
    <div className="rsm2-kbju-tabs" role="tablist" aria-label="Чьё КБЖУ показать">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={tabs.active === item.key}
          className={`rsm2-kbju-tab ${tabs.active === item.key ? 'is-on' : ''} ${item.key === 'estimated' ? 'rsm2-kbju-tab--est' : ''}`}
          onClick={() => onChange?.(item.key)}
        >
          {item.label}
          {Number.isFinite(item.count) && <span className="rsm2-kbju-tab__count">· {item.count}</span>}
        </button>
      ))}
    </div>
  );
}

function EstimateRing({ dish, geometry, concealed, compact }) {
  const macrosHidden = dish.estimate?.macrosHidden;
  return (
    <div
      className={`${compact ? 'rsm2-row__ring rsm2-row__ring--tall' : 'rsm2-ring'} rsm2-ring--est ${macrosHidden ? 'rsm2-ring--kcal-only' : ''}`}
      style={macrosHidden ? undefined : { background: geometry.ringGradient }}
      aria-hidden="true"
    >
      <div className={compact ? 'rsm2-row__ring-core' : 'rsm2-ring__core'}>
        <strong>{concealed ? '—' : (Number.isFinite(dish.kcal) ? `≈${Math.round(dish.kcal)}` : '—')}</strong>
        <span>ккал</span>
      </div>
    </div>
  );
}

function HowCalculated({ dish }) {
  const estimate = dish.estimate;
  if (!estimate) return null;
  return (
    <div className="rsm2-est-how">
      <b>Как посчитали</b>
      {dish.ingredients && <p><span>В меню: </span>{dish.ingredients}</p>}
      {estimate.ingredients.length > 0 && <p><span>Продукты: </span>{estimate.ingredients.join(', ')}</p>}
      {estimate.assumptions && <p><span>Допущения: </span>{estimate.assumptions}</p>}
      <p className="rsm2-est-how__src">Источник: справочник продуктов USDA и Скурихин</p>
    </div>
  );
}

// Плитка (десктоп) и строка (мобильный) позиции с оценкой. Доступ как у обычных блюд:
// первые позиции бесплатно, остальное по подписке.
export function PlainOfferTile({ dish, isFreeAccess = false, readOnly = false, compact = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuth((state) => state.accessToken);
  const { hasActiveSub, hasSubscriptionHistory } = useSubscriptionStore((state) => ({
    hasActiveSub: state.hasActiveSub,
    hasSubscriptionHistory: state.hasSubscriptionHistory,
  }));
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = hasActiveSub || isFreeAccess;
  const geometry = useMemo(() => computeMacroGeometry(dish.protein, dish.fat, dish.carbs), [dish.carbs, dish.fat, dish.protein]);
  const price = priceText(dish);
  const macrosHidden = dish.estimate?.macrosHidden;

  const toggle = () => {
    if (hasAccess) setIsOpen((value) => !value);
  };
  const handleDiaryAdd = (event) => {
    event.stopPropagation();
    if (!readOnly) openAnyEatLaunchModal('plain_offer_tile');
  };
  const handleSubscribe = (event) => {
    event.stopPropagation();
    const returnTo = location.pathname + location.search;
    if (accessToken) navigate('/account/subscription', { state: { from: returnTo } });
    else navigate('/login', { state: { from: '/account/subscription', returnTo } });
  };

  const macros = macrosHidden ? (
    <span className="rsm2-est-kcal-only">Для напитков считаем только калории</span>
  ) : (
    <>
      <div className={`${compact ? 'rsm2-row__macrobar' : 'rsm2-macrobar'} rsm2-macrobar--est`} aria-hidden="true">
        <span className="rsm2-macrobar__seg rsm2-macrobar__seg--protein" style={{ width: `${geometry.proteinPct}%` }} />
        <span className="rsm2-macrobar__seg rsm2-macrobar__seg--fat" style={{ width: `${geometry.fatPct}%` }} />
        <span className="rsm2-macrobar__seg rsm2-macrobar__seg--carb" style={{ width: `${geometry.carbPct}%` }} />
      </div>
      {compact ? (
        <span className="rsm2-row__macro-text rsm2-est-num">
          {hasAccess ? `Б ≈${formatNumeric(dish.protein)} · Ж ≈${formatNumeric(dish.fat)} · У ≈${formatNumeric(dish.carbs)}` : 'Б — · Ж — · У —'}
        </span>
      ) : (
        <div className="rsm2-legend rsm2-est-num">
          <span className="rsm2-legend__item"><span className="rsm2-legend__dot rsm2-legend__dot--protein" />Б {hasAccess ? `≈${formatNumeric(dish.protein)}г` : '—'}</span>
          <span className="rsm2-legend__item"><span className="rsm2-legend__dot rsm2-legend__dot--fat" />Ж {hasAccess ? `≈${formatNumeric(dish.fat)}г` : '—'}</span>
          <span className="rsm2-legend__item"><span className="rsm2-legend__dot rsm2-legend__dot--carb" />У {hasAccess ? `≈${formatNumeric(dish.carbs)}г` : '—'}</span>
        </div>
      )}
    </>
  );

  if (compact) {
    return (
      <div className="rsm2-row rsm2-row--est" onClick={toggle} role="button" tabIndex={0}>
        <div className="rsm2-row__cover rsm2-row__cover--est"><span aria-hidden="true">≈</span></div>
        <div className="rsm2-row__body">
          <div className="rsm2-row__title-row">
            <span className="rsm2-row__name">{dish.name}</span>
            {(dish.weightText || price) && (
              <span className="rsm2-row__meta">
                {dish.weightText && <span className="rsm2-row__portion">{dish.weightText}</span>}
                {price && <span className="rsm2-row__price">{price}</span>}
              </span>
            )}
          </div>
          <EstimateBadge className="rsm2-est-badge--row" />
          <div className={`rsm2-row__lower ${hasAccess ? '' : 'rsm2-row__lower--teaser'}`}>
            <EstimateRing dish={dish} geometry={geometry} concealed={!hasAccess} compact />
            <div className="rsm2-row__macro-col">{macros}</div>
            <div className="rsm2-row__footer">
              {hasAccess ? (
                <>
                  <button type="button" className="rsm2-composition-pill" onClick={(e) => { e.stopPropagation(); toggle(); }}>
                    Как посчитали<span style={{ fontSize: 9 }}>{isOpen ? '▴' : '▾'}</span>
                  </button>
                  {!readOnly && (
                    <div className="rsm2-row__actions">
                      <button type="button" className="rsm2-dbtn rsm2-dbtn--icon" onClick={handleDiaryAdd} aria-label="В дневник" title="В дневник">
                        <DiaryIcon size={17} />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button type="button" className="rsm2-row__open-btn" onClick={handleSubscribe}>
                  {hasSubscriptionHistory ? 'Возобновить подписку' : 'Попробовать бесплатно'}
                </button>
              )}
            </div>
          </div>
          {hasAccess && <p className="rsm2-est-basis">{dish.estimate?.basisText}</p>}
          {isOpen && hasAccess && <HowCalculated dish={dish} />}
        </div>
      </div>
    );
  }

  return (
    <div className="rsm2-tile rsm2-tile--est" onClick={toggle} role="button" tabIndex={0}>
      <div className={hasAccess ? '' : 'rsm2-tile__cover--paywalled'} style={{ position: 'relative' }}>
        <div className="rsm2-tile__cover">
          <div className="rsm2-tile__cover-ring" aria-hidden="true" />
          <div className="rsm2-tile__cover-ring rsm2-tile__cover-ring--inner" aria-hidden="true" />
          <EstimateBadge className="rsm2-est-badge--cover" />
          {hasAccess && <span className="rsm2-tile__cover-name">{dish.name}</span>}
        </div>
        {!hasAccess && (
          <div className="rsm2-paywall">
            <span className="rsm2-paywall__name">{dish.name}</span>
            <span className="rsm2-paywall__text">КБЖУ и состав — по подписке</span>
            <button type="button" className="rsm2-paywall__cta" onClick={handleSubscribe}>
              {hasSubscriptionHistory ? 'Возобновить подписку' : 'Попробовать бесплатно'}
            </button>
          </div>
        )}
      </div>
      <div className="rsm2-tile__body">
        <div className="rsm2-tile__composition-row">
          {hasAccess ? (
            <button type="button" className="rsm2-composition-btn" onClick={(e) => { e.stopPropagation(); toggle(); }}>
              {isOpen ? 'Скрыть расчёт' : 'Как посчитали'}
            </button>
          ) : (
            <span className="rsm2-composition-btn rsm2-composition-btn--locked">Состав</span>
          )}
          {(price || dish.weightText) && (
            <span className="rsm2-tile__price">
              {price}
              {dish.weightText && <small className="rsm2-est-weight">{price ? ' · ' : ''}{dish.weightText}</small>}
            </span>
          )}
        </div>
        <div className={`rsm2-nutrition ${hasAccess ? '' : 'rsm2-nutrition--teaser'}`}>
          <EstimateRing dish={dish} geometry={geometry} concealed={!hasAccess} />
          <div>{macros}</div>
        </div>
        {hasAccess && <p className="rsm2-est-basis">{dish.estimate?.basisText}</p>}
        {isOpen && hasAccess && <HowCalculated dish={dish} />}
        {!readOnly && (
          <div className="rsm2-tile__footer rsm2-tile__footer--est">
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

export function PlainNoDataTile({ dish, compact = false }) {
  const price = priceText(dish);
  if (compact) {
    return (
      <div className="rsm2-row rsm2-row--nodata">
        <div className="rsm2-row__cover"><span className="rsm2-row__cover-mark" aria-hidden="true" /></div>
        <div className="rsm2-row__body">
          <div className="rsm2-row__title-row">
            <span className="rsm2-row__name">{dish.name}</span>
            {(dish.weightText || price) && (
              <span className="rsm2-row__meta">
                {dish.weightText && <span className="rsm2-row__portion">{dish.weightText}</span>}
                {price && <span className="rsm2-row__price">{price}</span>}
              </span>
            )}
          </div>
          <p className="rsm2-nodata-text">{dish.reasonText}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="rsm2-tile rsm2-tile--nodata">
      <div className="rsm2-tile__cover">
        <div className="rsm2-tile__cover-ring" aria-hidden="true" />
        <div className="rsm2-tile__cover-ring rsm2-tile__cover-ring--inner" aria-hidden="true" />
        <span className="rsm2-nodata-badge">нет КБЖУ</span>
        <span className="rsm2-tile__cover-name">{dish.name}</span>
      </div>
      <div className="rsm2-tile__body">
        <div className="rsm2-tile__composition-row">
          <span className="rsm2-nodata-text">{dish.reasonText}</span>
          {(price || dish.weightText) && (
            <span className="rsm2-tile__price">
              {price}
              {dish.weightText && <small className="rsm2-est-weight">{price ? ' · ' : ''}{dish.weightText}</small>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlainNoDataSection({ dishes }) {
  if (!Array.isArray(dishes) || !dishes.length) return null;
  return (
    <div className="rsm2-nodata-section">
      <div className="rsm2-section__head">
        <div className="rsm2-section__heading">
          <h2 className="rsm2-section__title rsm2-section__title--muted">Без КБЖУ</h2>
          <span className="rsm2-section__count">{dishes.length} {pluralPositions(dishes.length)}</span>
        </div>
        <div className="rsm2-section__rule" />
      </div>
      <div className="rsm2-grid rsm2-desktop-only">
        {dishes.map((dish) => <PlainNoDataTile key={dish.id || dish.name} dish={dish} />)}
      </div>
      <div className="rsm2-grid rsm2-mobile-only">
        {dishes.map((dish) => <PlainNoDataTile key={dish.id || dish.name} dish={dish} compact />)}
      </div>
    </div>
  );
}
