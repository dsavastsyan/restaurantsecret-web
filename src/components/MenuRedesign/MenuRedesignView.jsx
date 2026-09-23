// Restaurant menu page (desktop hero/grid + mobile feed).
// All data-fetching, filtering and mutation logic lives in Menu.jsx; this
// component is presentation only. Also reused by the partner portal's draft
// preview via the `readOnly` prop, which suppresses every mutating action.
import { useEffect, useMemo, useState } from 'react';
import { MenuOutdatedModal } from '@/components/MenuOutdatedModal';
import AutoUpdatedBadge from '@/components/AutoUpdatedBadge.jsx';
import DishTileV2 from './DishTileV2';
import DishRowV2 from './DishRowV2';
import { HeartIcon, MapPinIcon, ShareIcon, SearchIcon } from './icons';
import '@/pages/menu-redesign.css';

const CATS_VISIBLE = 3;

// AppShell wraps every page in `.container--menu`, which adds a max-width and
// side/top padding. This page is edge-to-edge by design, so we flag the body
// while it is mounted and let the CSS strip that padding — scoped to this page
// only, and reverted on unmount so no other route is affected.
function useFullBleedLayout() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.setAttribute('data-rs-menu-v2', '');
    return () => {
      document.body.removeAttribute('data-rs-menu-v2');
    };
  }, []);
}

function buildDishAccessKey(dish) {
  if (dish?.id != null && dish?.id !== '') return `id:${dish.id}`;
  return `name:${String(dish?.name || '').trim().toLowerCase()}`;
}

export default function MenuRedesignView({
  seoRestaurantName,
  heroDishCount,
  dishes,
  filtered,
  groupedDishes,
  capturedAt,
  freeDishKeys,
  slug,
  loading,
  error,
  menu,

  query,
  setQuery,
  selectedCategory,
  setSelectedCategory,
  categoryOptions,
  allCategoriesExpanded,
  setAllCategoriesExpanded,

  presets,
  togglePreset,

  isAdvancedFiltersOpen,
  setIsAdvancedFiltersOpen,
  range,
  updateRange,
  resetFilters,

  isIngredientFilterOpen,
  setIsIngredientFilterOpen,
  hasCompositions,
  ingredientOptions,
  ingredientFilter,
  toggleIngredient,
  setIngredientMode,
  clearIngredients,

  isFavoriteRestaurant,
  handleToggleRestaurantFavorite,
  handleShare,
  openMapInBrowser,
  openMobileMapInBrowser,

  isOutdatedOpen,
  setIsOutdatedOpen,

  openDishCard,
  openPreviewDishCard,
  readOnly = false,
}) {
  useFullBleedLayout();

  const selectedIngredientCount = ingredientFilter?.selected?.length ?? 0;
  const visibleCats = allCategoriesExpanded ? categoryOptions : categoryOptions.slice(0, CATS_VISIBLE);
  const hasMoreCats = !allCategoriesExpanded && categoryOptions.length > CATS_VISIBLE;

  const renderCatPills = () => (
    <>
      <button type="button" className={`rsm2-cat ${selectedCategory === 'all' ? 'is-on' : ''}`} onClick={() => setSelectedCategory('all')}>
        Все
      </button>
      {visibleCats.map((name) => (
        <button
          key={name}
          type="button"
          className={`rsm2-cat ${selectedCategory === name ? 'is-on' : ''}`}
          onClick={() => setSelectedCategory(name)}
        >
          {name}
        </button>
      ))}
      {hasMoreCats && (
        <button type="button" className="rsm2-cat rsm2-cat--more" onClick={() => setAllCategoriesExpanded(true)}>
          Ещё {categoryOptions.length - CATS_VISIBLE} ▾
        </button>
      )}
    </>
  );

  const renderChips = () => (
    <>
      <button type="button" className={`rsm2-chip ${presets.lowKcal ? 'is-on' : ''}`} onClick={() => togglePreset('lowKcal')}>
        <span className="rsm2-chip__t">Мало калорий</span>
        <span className="rsm2-chip__d">≤ 400 ккал</span>
      </button>
      <button type="button" className={`rsm2-chip ${presets.highProtein ? 'is-on' : ''}`} onClick={() => togglePreset('highProtein')}>
        <span className="rsm2-chip__t">Много белка</span>
        <span className="rsm2-chip__d">≥ 25 г</span>
      </button>
      <button type="button" className={`rsm2-chip ${presets.lowFat ? 'is-on' : ''}`} onClick={() => togglePreset('lowFat')}>
        <span className="rsm2-chip__t">Мало жиров</span>
        <span className="rsm2-chip__d">≤ 10 г</span>
      </button>
    </>
  );

  const openDish = (dish) => {
    const isFreeAccess = freeDishKeys.has(buildDishAccessKey(dish));
    const draft = {
      id: dish.id,
      dishName: dish.name,
      restaurantSlug: slug,
      restaurantName: menu?.name || seoRestaurantName,
      isFreeAccess,
    };
    if (readOnly) {
      openPreviewDishCard(dish, draft, menu?.menuCapturedAt);
      return;
    }
    openDishCard(draft);
  };

  return (
    <div className="rsm2-root">
      <div className="rsm2-hero">
        {/* Reporting a stale menu makes no sense inside the partner's own
            draft preview, so the trigger is omitted there rather than shown
            as a dead button. */}
        {!readOnly && (
          <button
            type="button"
            className="rsm2-hero__report"
            onClick={() => setIsOutdatedOpen(true)}
          >
            Меню устарело?
          </button>
        )}
        <div className="rsm2-hero__grid">
          <div className="rsm2-hero__lead">
            <h1 className="rsm2-hero__title" aria-label={`Меню ${seoRestaurantName} с КБЖУ`}>
              {seoRestaurantName}
              {menu?.autoUpdated && <AutoUpdatedBadge className="rsm2-hero__auto-updated" />}
            </h1>
            {/* heroDishCount falls back to the prerender's real embedded count
                while still loading, so this never flashes a wrong "0 блюд" —
                only hidden outright if we truly have no number at all. */}
            {Number.isFinite(heroDishCount) && (
              <div className="rsm2-hero__stats">
                <div className="rsm2-hero__stat">
                  <span className="rsm2-hero__stat-value">{heroDishCount}</span>
                  <span className="rsm2-hero__stat-label">блюд с КБЖУ</span>
                </div>
                {!!capturedAt && (
                  <>
                    <div className="rsm2-hero__rule" />
                    <div className="rsm2-hero__stat">
                      <span className="rsm2-hero__stat-value">{capturedAt}</span>
                      <span className="rsm2-hero__stat-label">меню обновлено</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="rsm2-hero__actions">
            {!readOnly && (
              <button
                type="button"
                className="rsm2-icon-btn"
                onClick={handleToggleRestaurantFavorite}
                aria-label={isFavoriteRestaurant ? 'Удалить ресторан из избранного' : 'Добавить ресторан в избранное'}
                style={isFavoriteRestaurant ? { color: '#f0855a' } : undefined}
              >
                <HeartIcon filled={isFavoriteRestaurant} size={22} />
              </button>
            )}
            <button type="button" className="rsm2-icon-btn" onClick={openMapInBrowser} aria-label="Показать на карте">
              <MapPinIcon size={20} />
            </button>
            <button type="button" className="rsm2-icon-btn" onClick={handleShare} aria-label="Поделиться">
              <ShareIcon size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="rsm2-filters">
        <div className="rsm2-search">
          <SearchIcon size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по блюду"
            aria-label="Поиск блюда"
          />
        </div>

        <div className="rsm2-cats rsm2-desktop-only" style={{ display: 'flex' }}>
          {renderCatPills()}
        </div>

        <div className="rsm2-chips">{renderChips()}</div>

        {/* Grouped so the two disclosures always share a single row */}
        <div className="rsm2-disclosures">
          <button
            type="button"
            className={`rsm2-disclosure ${isAdvancedFiltersOpen ? 'is-on' : ''}`}
            onClick={() => setIsAdvancedFiltersOpen((prev) => !prev)}
          >
            Свои КБЖУ<span className="rsm2-disclosure__caret">{isAdvancedFiltersOpen ? '▴' : '▾'}</span>
          </button>
          {/* Hidden entirely when the restaurant filled in no compositions —
              there would be nothing to pick from. */}
          {hasCompositions && (
            <button
              type="button"
              className={`rsm2-disclosure ${isIngredientFilterOpen || selectedIngredientCount ? 'is-on' : ''}`}
              onClick={() => setIsIngredientFilterOpen((prev) => !prev)}
            >
              Фильтр по ингредиентам
              {selectedIngredientCount > 0 && (
                <span className="rsm2-disclosure__badge">{selectedIngredientCount}</span>
              )}
              <span className="rsm2-disclosure__caret">{isIngredientFilterOpen ? '▴' : '▾'}</span>
            </button>
          )}
        </div>

        <div className={`rsm2-advanced ${isAdvancedFiltersOpen ? 'is-open' : ''}`}>
          <div className="rsm2-advanced__panel">
            <RangeField label="Калории" value={range.kcal} onChange={(edge, val) => updateRange('kcal', edge, val)} />
            <RangeField label="Белки, г" value={range.protein} onChange={(edge, val) => updateRange('protein', edge, val)} />
            <RangeField label="Жиры, г" value={range.fat} onChange={(edge, val) => updateRange('fat', edge, val)} />
            <RangeField label="Углеводы, г" value={range.carbs} onChange={(edge, val) => updateRange('carbs', edge, val)} />
            <button type="button" className="rsm2-advanced__reset" onClick={resetFilters}>
              Сбросить всё
            </button>
          </div>
        </div>

        {hasCompositions && isIngredientFilterOpen && (
          <div className="rsm2-advanced is-open" style={{ order: 11 }}>
            <IngredientPanel
              options={ingredientOptions}
              filter={ingredientFilter}
              onToggle={toggleIngredient}
              onModeChange={setIngredientMode}
              onClear={clearIngredients}
            />
          </div>
        )}
      </div>

      {/* Mobile-only category rail, kept in sync with the desktop pills above */}
      <div className="rsm2-filters rsm2-mobile-only" style={{ position: 'static', backdropFilter: 'none' }}>
        <div className="rsm2-cats" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2 }}>
          {renderCatPills()}
        </div>
      </div>

      <div className="rsm2-content">
        {loading && <p className="rsm2-loading">Загружаем меню…</p>}
        {!!error && !loading && <p className="rsm2-loading">{error}</p>}

        {!loading && !error && (
          groupedDishes.length ? (
            groupedDishes.map((section) => (
              <div key={section.name}>
                <div className="rsm2-section__head">
                  <h2 className="rsm2-section__title">{section.name}</h2>
                  <span className="rsm2-section__count">{formatPositionCount(section.dishes.length)}</span>
                  <div className="rsm2-section__rule" />
                </div>

                <div className="rsm2-grid rsm2-desktop-only">
                  {section.dishes.map((dish) => {
                    const isFreeAccess = freeDishKeys.has(buildDishAccessKey(dish));
                    return (
                      <DishTileV2
                        key={`${section.name}-${dish.name}`}
                        dish={dish}
                        restaurantSlug={slug}
                        restaurantName={menu?.name || seoRestaurantName}
                        isFreeAccess={isFreeAccess}
                        interactive
                        readOnly={readOnly}
                        onClick={() => openDish(dish)}
                      />
                    );
                  })}
                </div>

                <div className="rsm2-grid rsm2-mobile-only">
                  {section.dishes.map((dish) => {
                    const isFreeAccess = freeDishKeys.has(buildDishAccessKey(dish));
                    return (
                      <DishRowV2
                        key={`${section.name}-${dish.name}`}
                        dish={dish}
                        restaurantSlug={slug}
                        restaurantName={menu?.name || seoRestaurantName}
                        isFreeAccess={isFreeAccess}
                        interactive
                        readOnly={readOnly}
                        onClick={() => openDish(dish)}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="rsm2-empty">
              <p className="rsm2-empty__title">
                {menu?.categories?.length ? 'Под эти параметры блюд нет' : 'Меню этого ресторана пока не добавлено. Мы работаем над этим.'}
              </p>
              {!!menu?.categories?.length && (
                <button type="button" className="rsm2-empty__reset" onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              )}
            </div>
          )
        )}
      </div>

      {!readOnly && (
        <MenuOutdatedModal
          restaurantName={menu?.name || seoRestaurantName}
          isOpen={isOutdatedOpen}
          onClose={() => setIsOutdatedOpen(false)}
        />
      )}
    </div>
  );
}

// Ingredient picker. Two modes, exclude by default: people reach for this
// far more often to rule something out ("без грибов") than to hunt for it.
// Menus can carry 150+ distinct ingredients, so the list is searchable and
// ordered by how many dishes use each one.
const INGREDIENT_VISIBLE_LIMIT = 40;

function IngredientPanel({ options, filter, onToggle, onModeChange, onClear }) {
  const [search, setSearch] = useState('');
  const selected = filter?.selected ?? [];
  const mode = filter?.mode ?? 'exclude';

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/ё/g, 'е');
    if (!q) return options;
    return options.filter((option) => option.value.includes(q));
  }, [options, search]);

  // Selected chips always stay visible even when the search or the cap would
  // scroll them out, so it's never unclear what is currently applied.
  const visible = useMemo(() => {
    const capped = matching.slice(0, INGREDIENT_VISIBLE_LIMIT);
    const shown = new Set(capped.map((option) => option.value));
    const pinned = options.filter(
      (option) => selected.includes(option.value) && !shown.has(option.value)
    );
    return [...pinned, ...capped];
  }, [matching, options, selected]);

  const hiddenCount = Math.max(0, matching.length - INGREDIENT_VISIBLE_LIMIT);

  return (
    <div className="rsm2-ingredients">
      <div className="rsm2-ingredients__head">
        <div className="rsm2-modes" role="group" aria-label="Режим фильтра по ингредиентам">
          <button
            type="button"
            className={`rsm2-mode ${mode === 'exclude' ? 'is-on' : ''}`}
            onClick={() => onModeChange('exclude')}
            aria-pressed={mode === 'exclude'}
          >
            Без этих
          </button>
          <button
            type="button"
            className={`rsm2-mode ${mode === 'include' ? 'is-on' : ''}`}
            onClick={() => onModeChange('include')}
            aria-pressed={mode === 'include'}
          >
            Только с этими
          </button>
        </div>

        {selected.length > 0 && (
          <button type="button" className="rsm2-advanced__reset" onClick={onClear}>
            Сбросить ингредиенты
          </button>
        )}
      </div>

      <p className="rsm2-ingredients__hint">
        {mode === 'exclude'
          ? 'Скроем блюда, где есть хотя бы один из выбранных ингредиентов.'
          : 'Покажем блюда, где есть хотя бы один из выбранных ингредиентов.'}
      </p>

      <input
        className="rsm2-ingredients__search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Найти ингредиент"
        aria-label="Поиск ингредиента"
      />

      {visible.length === 0 ? (
        <p className="rsm2-ingredients__hint">Ничего не нашлось</p>
      ) : (
        <div className="rsm2-ingredients__list">
          {visible.map((option) => {
            const isOn = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`rsm2-ing ${isOn ? `is-on is-${mode}` : ''}`}
                onClick={() => onToggle(option.value)}
                aria-pressed={isOn}
              >
                {option.label}
                <span className="rsm2-ing__count">{option.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {hiddenCount > 0 && (
        <p className="rsm2-ingredients__hint">
          И ещё {hiddenCount} — уточните поиск.
        </p>
      )}
    </div>
  );
}

function RangeField({ label, value, onChange }) {
  return (
    <div className="rsm2-range">
      <span className="rsm2-range__label">{label}</span>
      <div className="rsm2-range__row">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="мин"
          value={value.min}
          onChange={(event) => onChange('min', event.target.value)}
        />
        <span className="rsm2-range__dash">—</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="макс"
          value={value.max}
          onChange={(event) => onChange('max', event.target.value)}
        />
      </div>
    </div>
  );
}

function formatPositionCount(count) {
  const absCount = Math.abs(count);
  const mod10 = absCount % 10;
  const mod100 = absCount % 100;
  let suffix = 'позиций';
  if (mod10 === 1 && mod100 !== 11) {
    suffix = 'позиция';
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    suffix = 'позиции';
  }
  return `${count} ${suffix}`.toUpperCase();
}
