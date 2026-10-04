// Restaurant menu page (desktop hero/grid + mobile feed).
// All data-fetching, filtering and mutation logic lives in Menu.jsx; this
// component is presentation only. Also reused by the partner portal's draft
// preview via the `readOnly` prop, which suppresses every mutating action.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MenuOutdatedModal } from '@/components/MenuOutdatedModal';
import AutoUpdatedBadge from '@/components/AutoUpdatedBadge.jsx';
import DishTileV2 from './DishTileV2';
import DishRowV2 from './DishRowV2';
import { HeartIcon, MapPinIcon, ShareIcon, SearchIcon, LockIcon } from './icons';
import {
  MENU_SORT_OPTIONS,
  getMenuSortOption,
} from '@/lib/menuSorting';
import '@/pages/menu-redesign.css';

const CATS_VISIBLE = 3;
const MENU_GUIDE_STORAGE_KEY = 'rs_menu_guide_v2';

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

function getInitialGuideStep(readOnly) {
  if (readOnly || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(MENU_GUIDE_STORAGE_KEY) ? null : 'filters';
  } catch {
    return 'filters';
  }
}

export default function MenuRedesignView({
  seoRestaurantName,
  heroDishCount,
  guideRestaurantCount,
  guideCityCount,
  dishes,
  filtered,
  groupedDishes,
  filteredDishCount,
  isFilteredResultsLocked,
  onViewFilteredDishes,
  capturedAt,
  freeDishKeys,
  slug,
  loading,
  error,
  menu,

  query,
  setQuery,
  selectedSection,
  setSelectedSection,
  sectionOptions,
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

  menuSort,
  categorySorts,
  onSortChange,
  onSortReset,
  onSortAttempt,
  canSort = true,

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

  const [guideStep, setGuideStep] = useState(() => getInitialGuideStep(readOnly));
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(() => Boolean(getInitialGuideStep(readOnly)));

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (guideStep) {
      document.body.setAttribute('data-rs-menu-guide-step', guideStep);
    } else {
      document.body.removeAttribute('data-rs-menu-guide-step');
    }
    return () => document.body.removeAttribute('data-rs-menu-guide-step');
  }, [guideStep]);

  useLayoutEffect(() => {
    if (!guideStep || typeof document === 'undefined') return undefined;

    const root = document.documentElement;
    root.setAttribute('data-rs-menu-guide-lock', '');
    const preventGuideScroll = (event) => event.preventDefault();
    document.addEventListener('wheel', preventGuideScroll, { passive: false });
    document.addEventListener('touchmove', preventGuideScroll, { passive: false });

    return () => {
      root.removeAttribute('data-rs-menu-guide-lock');
      document.removeEventListener('wheel', preventGuideScroll);
      document.removeEventListener('touchmove', preventGuideScroll);
    };
  }, [guideStep]);

  useEffect(() => {
    if (!guideStep || typeof window === 'undefined') return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setGuideStep(null);
        try {
          window.sessionStorage.setItem(MENU_GUIDE_STORAGE_KEY, 'dismissed');
        } catch {
          // Session storage is optional; the in-memory dismissal still applies.
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [guideStep]);

  const dismissGuide = () => {
    setGuideStep(null);
    try {
      window.sessionStorage.setItem(MENU_GUIDE_STORAGE_KEY, 'dismissed');
    } catch {
      // Session storage is optional; the in-memory dismissal still applies.
    }
  };

  const completeGuide = () => {
    setGuideStep(null);
    try {
      window.sessionStorage.setItem(MENU_GUIDE_STORAGE_KEY, 'completed');
    } catch {
      // Session storage is optional; the in-memory completion still applies.
    }
  };

  const advanceGuide = () => {
    if (guideStep === 'filters') {
      setIsFilterPanelOpen(false);
      setGuideStep('dish');
    } else if (guideStep === 'dish') {
      setGuideStep('restaurants');
    } else {
      completeGuide();
    }
  };

  useEffect(() => {
    if (guideStep !== 'filters' || typeof document === 'undefined') return undefined;

    // The first hint is instructional only: clicking a filter must not apply
    // it and hide the dishes before the visitor has seen the second hint.
    // Capture the click before React's button handlers, then move straight to
    // the next hint after collapsing the panel.
    const handleFirstGuideClick = (event) => {
      const dismissButton = document.querySelector('.rsm2-guide--filters .rsm2-guide__dismiss');
      const clickedDismiss = dismissButton?.contains(event.target)
        || event.composedPath?.().some((target) => (
          target?.classList?.contains?.('rsm2-guide__dismiss')
        ));
      if (clickedDismiss) return;
      event.preventDefault();
      event.stopPropagation();
      setIsFilterPanelOpen(false);
      setGuideStep('dish');
    };

    document.addEventListener('click', handleFirstGuideClick, true);
    return () => document.removeEventListener('click', handleFirstGuideClick, true);
  }, [guideStep]);

  useEffect(() => {
    if (guideStep !== 'dish' && guideStep !== 'restaurants') return undefined;

    const handleGuideClick = (event) => {
      if (guideStep === 'dish') {
        const dismissButton = document.querySelector('.rsm2-guide--dish .rsm2-guide__dismiss');
        const clickedDismiss = dismissButton?.contains(event.target)
          || event.composedPath?.().some((target) => (
            target?.classList?.contains?.('rsm2-guide__dismiss')
          ));
        if (clickedDismiss) return;

        // The second hint is a tour step, not a real page action. Stop the
        // click before it reaches the page and show step three from anywhere.
        event.preventDefault();
        event.stopPropagation();
        setGuideStep('restaurants');
        return;
      }

      // Step three is dismissed by any click, including the highlighted
      // Restaurants link. The click belongs to the tour, not the page below.
      event.preventDefault();
      event.stopPropagation();
      completeGuide();
    };

    document.addEventListener('click', handleGuideClick, true);
    return () => document.removeEventListener('click', handleGuideClick, true);
  }, [guideStep]);

  const markGuideAction = advanceGuide;

  // A guest who applies a restrictive filter sees the subscription gate instead
  // of a dish grid. Do not leave the second onboarding scrim over that state:
  // there is no dish for the second hint to point at.
  useEffect(() => {
    if (guideStep === 'dish' && isFilteredResultsLocked) completeGuide();
  }, [guideStep, isFilteredResultsLocked]);

  const selectedIngredientCount = ingredientFilter?.selected?.length ?? 0;
  const hasCustomRange = Object.values(range).some((bounds) => bounds.min !== '' || bounds.max !== '');
  const activeFilterCount = [
    query.trim(),
    selectedCategory !== 'all',
    Object.values(presets).some(Boolean),
    hasCustomRange,
    selectedIngredientCount > 0,
  ].filter(Boolean).length;
  const visibleCats = allCategoriesExpanded ? categoryOptions : categoryOptions.slice(0, CATS_VISIBLE);
  const hasMoreCats = !allCategoriesExpanded && categoryOptions.length > CATS_VISIBLE;

  const renderCatPills = () => (
    <>
      <button type="button" className={`rsm2-cat ${selectedCategory === 'all' ? 'is-on' : ''}`} onClick={() => { setSelectedCategory('all'); markGuideAction(); }}>
        Все
      </button>
      {visibleCats.map((name) => (
        <button
          key={name}
          type="button"
          className={`rsm2-cat ${selectedCategory === name ? 'is-on' : ''}`}
          onClick={() => { setSelectedCategory(name); markGuideAction(); }}
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
      <button type="button" className={`rsm2-chip ${presets.lowKcal ? 'is-on' : ''}`} onClick={() => { togglePreset('lowKcal'); markGuideAction(); }}>
        <span className="rsm2-chip__t">Мало калорий</span>
        <span className="rsm2-chip__d">≤ 400 ккал</span>
      </button>
      <button type="button" className={`rsm2-chip ${presets.highProtein ? 'is-on' : ''}`} onClick={() => { togglePreset('highProtein'); markGuideAction(); }}>
        <span className="rsm2-chip__t">Много белка</span>
        <span className="rsm2-chip__d">≥ 25 г</span>
      </button>
      <button type="button" className={`rsm2-chip ${presets.lowFat ? 'is-on' : ''}`} onClick={() => { togglePreset('lowFat'); markGuideAction(); }}>
        <span className="rsm2-chip__t">Мало жиров</span>
        <span className="rsm2-chip__d">≤ 10 г</span>
      </button>
    </>
  );

  const openDish = (dish, groupIsFree = false) => {
    const isFreeAccess = groupIsFree || freeDishKeys.has(buildDishAccessKey(dish));
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
    if (guideStep === 'dish') advanceGuide();
    openDishCard(draft);
  };

  return (
    <div className={`rsm2-root ${guideStep ? 'rsm2-root--guide-open' : ''}`}>
      {guideStep && (
        <div
          className="rsm2-guide-scrim"
          aria-hidden="true"
          onClick={dismissGuide}
        />
      )}
      {guideStep === 'restaurants' && (
        <MenuGuide
          step="restaurants"
          onDismiss={dismissGuide}
          restaurantCount={guideRestaurantCount}
          cityCount={guideCityCount}
        />
      )}
      {guideStep === 'dish' && <MenuGuide step="dish" onDismiss={dismissGuide} />}
      <div className="rsm2-hero">
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
                className={`rsm2-icon-btn ${guideStep === 'dish' ? 'is-guide-target' : ''}`}
                onClick={async () => {
                  await handleToggleRestaurantFavorite();
                  if (guideStep === 'dish') advanceGuide();
                }}
                aria-label={isFavoriteRestaurant ? 'Удалить ресторан из избранного' : 'Добавить ресторан в избранное'}
                style={isFavoriteRestaurant ? { color: '#f0855a' } : undefined}
              >
                <HeartIcon filled={isFavoriteRestaurant} size={18} />
              </button>
            )}
            <button type="button" className="rsm2-icon-btn" onClick={openMapInBrowser} aria-label="Показать на карте">
              <MapPinIcon size={17} />
            </button>
            <button type="button" className="rsm2-icon-btn" onClick={handleShare} aria-label="Поделиться">
              <ShareIcon size={17} />
            </button>
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
          </div>
        </div>
      </div>

      <div className="rsm2-filters">
        <div className="rsm2-filter-toolbar">
          <div className="rsm2-search">
            <SearchIcon size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по блюду"
              aria-label="Поиск блюда"
            />
          </div>
          <button
            type="button"
            className={`rsm2-filter-toggle ${isFilterPanelOpen ? 'is-on' : ''}`}
            aria-expanded={isFilterPanelOpen}
            onClick={() => setIsFilterPanelOpen((prev) => !prev)}
          >
            Фильтры
            {activeFilterCount > 0 && <span className="rsm2-filter-toggle__count">{activeFilterCount}</span>}
            <span className="rsm2-filter-toggle__caret" aria-hidden="true">{isFilterPanelOpen ? '▴' : '▾'}</span>
          </button>
        </div>

        {isFilterPanelOpen && (
          <div className="rsm2-filter-panel">
            <div className={`rsm2-filter-cluster ${guideStep === 'filters' ? 'is-guide-target' : ''}`}>
              <div className="rsm2-chips">{renderChips()}</div>

              {/* Keep the advanced controls in the same visual group as the quick filters. */}
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
                <div className="rsm2-advanced is-open">
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

            {guideStep === 'filters' && !loading && !error && (
              <MenuGuide step="filters" onDismiss={dismissGuide} />
            )}

            {sectionOptions.length > 1 && (
              <div className="rsm2-section-switch" role="tablist" aria-label="Раздел меню">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedSection === 'food'}
                  className={selectedSection === 'food' ? 'is-on' : ''}
                  onClick={() => setSelectedSection('food')}
                >
                  Еда
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedSection === 'drinks'}
                  className={selectedSection === 'drinks' ? 'is-on' : ''}
                  onClick={() => setSelectedSection('drinks')}
                >
                  Напитки
                </button>
              </div>
            )}

          </div>
        )}

        {/* Categories stay visible while the optional filter panel is closed. */}
        <div className="rsm2-category-bar rsm2-desktop-only">
          <div className="rsm2-cats">
            {renderCatPills()}
          </div>
        </div>
      </div>

      {/* Mobile-only category rail, kept in sync with the desktop pills above */}
      <div className="rsm2-filters rsm2-mobile-only" style={{ position: 'static', backdropFilter: 'none' }}>
        <div className="rsm2-cats" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2 }}>
          {renderCatPills()}
        </div>
      </div>

      <div className="rsm2-content">
        {loading && <p className="rsm2-loading">Загружаем меню…</p>}
        {!!error && !loading && (
          error.kind === 'blocked' ? (
            <div className="rsm2-status-block">
              <LockIcon size={22} />
              <p>{error.message}</p>
              <button type="button" onClick={() => window.location.reload()}>Обновить страницу</button>
            </div>
          ) : (
            <p className="rsm2-loading">{error.message}</p>
          )
        )}

        {!loading && !error && (
          isFilteredResultsLocked ? (
            <div className="rsm2-filtered-access" role="status" aria-live="polite">
              <span className="rsm2-filtered-access__count">{formatPositionCount(filteredDishCount)}</span>
              <h2 className="rsm2-filtered-access__title">
                {filteredDishCount > 0
                  ? 'Подходящие блюда найдены'
                  : 'Подходящие блюда не найдены. Попробуйте изменить фильтры.'}
              </h2>
              {filteredDishCount > 0 && (
                <button type="button" className="rsm2-filtered-access__cta" onClick={onViewFilteredDishes}>
                  Посмотреть бесплатно
                </button>
              )}
            </div>
          ) : groupedDishes.length ? (
            <>
              {groupedDishes.map((section, sectionIndex) => (
              <div key={section.name}>
                <div className="rsm2-section__head">
                  <div className="rsm2-section__heading">
                    <h2 className="rsm2-section__title">{section.name}</h2>
                    <span className="rsm2-section__count">{formatPositionCount(section.dishes.length)}</span>
                  </div>
                  <div className="rsm2-section__rule" />
                  <SortControl
                    categoryName={section.name}
                    sort={categorySorts?.[section.name] || menuSort}
                    menuSort={menuSort}
                    categorySort={categorySorts?.[section.name] || null}
                    hasCategoryOverride={Boolean(categorySorts?.[section.name])}
                    onChange={onSortChange}
                    onReset={onSortReset}
                    onSortAttempt={onSortAttempt}
                    canSort={canSort || readOnly}
                  />
                </div>

                <div className="rsm2-grid rsm2-desktop-only">
                  {section.dishes.map((dish, dishIndex) => {
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
                        guideFavoriteTarget={guideStep === 'dish' && sectionIndex === 0 && dishIndex === 0}
                        onGuideFavorite={guideStep === 'dish' ? advanceGuide : undefined}
                        onClick={(selectedDish) => openDish(selectedDish, isFreeAccess)}
                      />
                    );
                  })}
                </div>

                <div className="rsm2-grid rsm2-mobile-only">
                  {section.dishes.map((dish, dishIndex) => {
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
                        guideFavoriteTarget={guideStep === 'dish' && sectionIndex === 0 && dishIndex === 0}
                        onGuideFavorite={guideStep === 'dish' ? advanceGuide : undefined}
                        onClick={(selectedDish) => openDish(selectedDish, isFreeAccess)}
                      />
                    );
                  })}
                </div>
              </div>
              ))}
            </>
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

function SortControl({
  categoryName,
  sort,
  menuSort,
  categorySort,
  hasCategoryOverride,
  onChange,
  onReset,
  onSortAttempt,
  canSort,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState(hasCategoryOverride ? 'category' : 'menu');
  const [draftField, setDraftField] = useState(sort?.field || null);
  const [draftDirection, setDraftDirection] = useState(sort?.direction || null);
  const selectedOption = sort?.field ? getMenuSortOption(sort.field) : null;

  useEffect(() => {
    if (!isOpen) {
      setScope(hasCategoryOverride ? 'category' : 'menu');
      setDraftField(sort?.field || null);
      setDraftDirection(sort?.direction || null);
    }
  }, [hasCategoryOverride, isOpen, sort?.direction, sort?.field]);

  const openSortMenu = () => {
    if (!canSort) {
      onSortAttempt?.();
      return;
    }
    const activeSort = scope === 'menu' ? menuSort : categorySort;
    setDraftField(activeSort?.field || null);
    setDraftDirection(activeSort?.direction || null);
    setIsOpen(true);
  };

  const chooseField = (field) => {
    const activeSort = scope === 'menu' ? menuSort : categorySort;
    setDraftField(field);
    setDraftDirection(activeSort?.field === field ? activeSort.direction : null);
  };

  const chooseDirection = (direction) => {
    if (!draftField) return;
    onChange(scope, categoryName, { field: draftField, direction });
    setIsOpen(false);
  };

  const chooseScope = (nextScope) => {
    const activeSort = nextScope === 'menu' ? menuSort : categorySort;
    setScope(nextScope);
    // Keep a metric already picked in this open panel when the visitor changes
    // the scope. This supports the visual order: metric → direction → scope.
    setDraftField(activeSort?.field || draftField || null);
    setDraftDirection(activeSort?.direction || draftDirection || null);
  };

  const reset = () => {
    onReset(scope, categoryName);
    setIsOpen(false);
  };

  return (
    <div className="rsm2-sort-control">
      <button
        type="button"
        className={`rsm2-sort-control__trigger ${isOpen || hasCategoryOverride ? 'is-on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Сортировка категории «${categoryName}»`}
        onClick={() => (isOpen ? setIsOpen(false) : openSortMenu())}
      >
        <span className="rsm2-sort-control__label">{selectedOption?.label || 'Сортировать'}</span>
        {selectedOption && (
          <span className="rsm2-sort-control__direction" aria-hidden="true">
            {sort.direction === 'asc' ? '↑' : '↓'}
          </span>
        )}
        <span className="rsm2-sort-control__caret" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="rsm2-sort-control__menu" role="menu" aria-label={`Сортировка «${categoryName}»`}>
          <div className="rsm2-sort-control__header">
            <span>Сортировка</span>
            <button type="button" className="rsm2-sort-control__reset" onClick={reset}>
              Сбросить
            </button>
          </div>

          <div className="rsm2-sort-control__options">
            {MENU_SORT_OPTIONS.map((option) => {
              const isSelected = option.field === draftField;
              return (
                <div className={`rsm2-sort-control__option ${isSelected ? 'is-selected' : ''}`} key={option.field}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-pressed={isSelected}
                    onClick={() => chooseField(option.field)}
                  >
                    {option.label}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="rsm2-sort-control__directions" role="group" aria-label="Направление сортировки">
            <button
              type="button"
              className={draftDirection === 'asc' ? 'is-on' : ''}
              aria-pressed={draftDirection === 'asc'}
              disabled={!draftField}
              onClick={() => chooseDirection('asc')}
            >
              <span>По возрастанию</span>
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              className={draftDirection === 'desc' ? 'is-on' : ''}
              aria-pressed={draftDirection === 'desc'}
              disabled={!draftField}
              onClick={() => chooseDirection('desc')}
            >
              <span>По убыванию</span>
              <span aria-hidden="true">↓</span>
            </button>
          </div>

          <div className="rsm2-sort-control__scope" role="group" aria-label="Область сортировки">
            <button
              type="button"
              className={scope === 'menu' ? 'is-on' : ''}
              aria-pressed={scope === 'menu'}
              onClick={() => chooseScope('menu')}
            >
              Всё меню
            </button>
            <button
              type="button"
              className={scope === 'category' ? 'is-on' : ''}
              aria-pressed={scope === 'category'}
              onClick={() => chooseScope('category')}
            >
              Только категория
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getRectEdgePoint(rect, target) {
  const dx = target.x - rect.x;
  const dy = target.y - rect.y;
  if (dx === 0 && dy === 0) return { x: rect.x, y: rect.y };

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : (rect.width / 2) / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : (rect.height / 2) / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: rect.x + dx * scale,
    y: rect.y + dy * scale,
  };
}

function MenuGuide({ step, onDismiss, restaurantCount, cityCount }) {
  const isFiltersStep = step === 'filters';
  const isDishStep = step === 'dish';
  const isRestaurantsStep = step === 'restaurants';
  const stepNumber = isFiltersStep ? '1' : isDishStep ? '2' : '3';
  const guideRef = useRef(null);
  const [dishGuideGeometry, setDishGuideGeometry] = useState(null);
  const [restaurantsGuideGeometry, setRestaurantsGuideGeometry] = useState(null);

  useLayoutEffect(() => {
    if (!isDishStep || typeof window === 'undefined' || typeof document === 'undefined') {
      setDishGuideGeometry(null);
      return undefined;
    }

    const findVisibleTarget = (selector) => Array.from(document.querySelectorAll(selector)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    let frameId = 0;
    const updateGeometry = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const guide = guideRef.current;
        const root = guide?.closest('.rsm2-root');
        const restaurantHeart = findVisibleTarget('.rsm2-icon-btn.is-guide-target');
        const dishHeart = findVisibleTarget('.rsm2-fav.is-guide-target');
        if (!guide || !root || !restaurantHeart || !dishHeart) return;

        const rootRect = root.getBoundingClientRect();
        const guideRect = guide.getBoundingClientRect();
        const restaurantRect = restaurantHeart.getBoundingClientRect();
        const dishRect = dishHeart.getBoundingClientRect();
        const restaurantPoint = {
          x: restaurantRect.left + restaurantRect.width / 2 - rootRect.left,
          y: restaurantRect.top + restaurantRect.height / 2 - rootRect.top,
        };
        const dishPoint = {
          x: dishRect.left + dishRect.width / 2 - rootRect.left,
          y: dishRect.top + dishRect.height / 2 - rootRect.top,
        };
        const guideTop = Math.max(
          16,
          (restaurantPoint.y + dishPoint.y) / 2 - guideRect.height / 2,
        );
        const guideLeft = guideRect.left - rootRect.left;
        const guideTopX = Math.min(
          guideRect.width - 12,
          Math.max(12, restaurantPoint.x - guideLeft),
        );
        const guideBottomX = Math.min(
          guideRect.width - 12,
          Math.max(12, dishPoint.x - guideLeft),
        );
        const restaurantEdgePoint = getRectEdgePoint(
          {
            x: restaurantPoint.x,
            y: restaurantPoint.y,
            width: restaurantRect.width,
            height: restaurantRect.height,
          },
          { x: guideLeft + guideTopX, y: guideTop },
        );
        const dishEdgePoint = getRectEdgePoint(
          {
            x: dishPoint.x,
            y: dishPoint.y,
            width: dishRect.width,
            height: dishRect.height,
          },
          { x: guideLeft + guideBottomX, y: guideTop + guideRect.height },
        );
        const rootHeight = Math.max(root.scrollHeight, rootRect.height);

        setDishGuideGeometry({
          top: guideTop,
          rootWidth: rootRect.width,
          rootHeight,
          restaurantPoint,
          dishPoint,
          restaurantEdgePoint,
          dishEdgePoint,
          guideTop,
          guideBottom: guideTop + guideRect.height,
          guideTopX: guideLeft + guideTopX,
          guideBottomX: guideLeft + guideBottomX,
          restaurantTailX: guideTopX,
          dishTailX: guideBottomX,
        });
      });
    };

    updateGeometry();
    const root = guideRef.current?.closest('.rsm2-root');
    const observer = typeof ResizeObserver === 'undefined' || !root
      ? null
      : new ResizeObserver(updateGeometry);
    if (observer) {
      observer.observe(root);
      observer.observe(guideRef.current);
    }
    window.addEventListener('resize', updateGeometry);
    window.addEventListener('load', updateGeometry);
    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', updateGeometry);
      window.removeEventListener('load', updateGeometry);
    };
  }, [isDishStep]);

  useLayoutEffect(() => {
    if (!isRestaurantsStep || typeof window === 'undefined' || typeof document === 'undefined') {
      setRestaurantsGuideGeometry(null);
      return undefined;
    }

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const findVisibleTarget = (selector) => Array.from(document.querySelectorAll(selector)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    let frameId = 0;
    const updateGeometry = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (window.innerWidth <= 760) {
          setRestaurantsGuideGeometry(null);
          return;
        }

        const guide = guideRef.current;
        const root = guide?.closest('.rsm2-root');
        const restaurantsLink = findVisibleTarget('.navbar__center a[data-rs-menu-nav="restaurants"]');
        if (!guide || !root || !restaurantsLink) return;

        const rootRect = root.getBoundingClientRect();
        const guideRect = guide.getBoundingClientRect();
        const linkRect = restaurantsLink.getBoundingClientRect();
        const guideWidth = guideRect.width;
        const horizontalMargin = 36;
        const preferredLeft = linkRect.left - rootRect.left;
        const left = clamp(
          preferredLeft,
          horizontalMargin,
          Math.max(horizontalMargin, rootRect.width - guideWidth - horizontalMargin),
        );
        const targetCenter = linkRect.left + linkRect.width / 2 - rootRect.left;
        const top = linkRect.bottom + 22 - rootRect.top;

        setRestaurantsGuideGeometry({
          top,
          left,
          tailX: clamp(targetCenter - left, 12, guideWidth - 12),
        });
      });
    };

    updateGeometry();
    const root = guideRef.current?.closest('.rsm2-root');
    const observer = typeof ResizeObserver === 'undefined' || !root
      ? null
      : new ResizeObserver(updateGeometry);
    if (observer) {
      observer.observe(root);
      observer.observe(guideRef.current);
    }
    window.addEventListener('resize', updateGeometry);
    window.addEventListener('load', updateGeometry);
    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', updateGeometry);
      window.removeEventListener('load', updateGeometry);
    };
  }, [isRestaurantsStep]);

  const guideStyle = isDishStep && dishGuideGeometry
    ? {
      top: `${dishGuideGeometry.top}px`,
      '--rsm2-guide-top-tail-x': `${dishGuideGeometry.restaurantTailX}px`,
      '--rsm2-guide-bottom-tail-x': `${dishGuideGeometry.dishTailX}px`,
    }
    : isRestaurantsStep && restaurantsGuideGeometry
      ? {
        top: `${restaurantsGuideGeometry.top}px`,
        left: `${restaurantsGuideGeometry.left}px`,
        '--rsm2-guide-tail-x': `${restaurantsGuideGeometry.tailX}px`,
      }
    : undefined;

  const guideRestaurantCount = Number(restaurantCount);
  const guideCityCount = Number(cityCount);
  const restaurantsGuideText = Number.isFinite(guideRestaurantCount)
    && guideRestaurantCount > 0
    && Number.isFinite(guideCityCount)
    && guideCityCount > 0
    ? `Более ${guideRestaurantCount.toLocaleString('ru-RU')} ресторанов в ${guideCityCount.toLocaleString('ru-RU')} городах`
    : 'Рестораны с полным КБЖУ блюд и быстрыми фильтрами';

  return (
    <>
      {isDishStep && dishGuideGeometry && (
        <svg
          className="rsm2-guide-connectors"
          width={dishGuideGeometry.rootWidth}
          height={dishGuideGeometry.rootHeight}
          viewBox={`0 0 ${dishGuideGeometry.rootWidth} ${dishGuideGeometry.rootHeight}`}
          aria-hidden="true"
        >
          <line
            x1={dishGuideGeometry.restaurantEdgePoint.x}
            y1={dishGuideGeometry.restaurantEdgePoint.y}
            x2={dishGuideGeometry.guideTopX}
            y2={dishGuideGeometry.guideTop}
          />
          <line
            x1={dishGuideGeometry.guideBottomX}
            y1={dishGuideGeometry.guideBottom}
            x2={dishGuideGeometry.dishEdgePoint.x}
            y2={dishGuideGeometry.dishEdgePoint.y}
          />
        </svg>
      )}
      <aside
        ref={guideRef}
        className={`rsm2-guide rsm2-guide--${step}`}
        aria-label="Подсказка по меню"
        aria-live="polite"
        style={guideStyle}
      >
        <span className="rsm2-guide__mark" aria-hidden="true">✦</span>
        <div className="rsm2-guide__copy">
          <div className="rsm2-guide__meta">
            Подсказка · {stepNumber} из 3
          </div>
          <h2 className="rsm2-guide__title">
            {isFiltersStep
              ? 'Попробуй быстрые фильтры'
              : isDishStep
                ? 'Добавляйте любимые блюда и рестораны в избранное'
                : 'Выбирайте заранее без стресса'}
          </h2>
          <p className="rsm2-guide__text">
            {isFiltersStep
              ? 'Настрой меню под себя одним нажатием'
              : isDishStep
                ? 'Сравнивайте позиции и быстро возвращайтесь к любимым местам и блюдам'
                : restaurantsGuideText}
          </p>
        </div>
        <button type="button" className="rsm2-guide__dismiss" onClick={onDismiss}>
          Не сейчас
        </button>
      </aside>
    </>
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
