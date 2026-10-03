// Restaurant menu page (desktop hero/grid + mobile feed).
// All data-fetching, filtering and mutation logic lives in Menu.jsx; this
// component is presentation only. Also reused by the partner portal's draft
// preview via the `readOnly` prop, which suppresses every mutating action.
import { useEffect, useMemo, useState } from 'react';
import { MenuOutdatedModal } from '@/components/MenuOutdatedModal';
import AutoUpdatedBadge from '@/components/AutoUpdatedBadge.jsx';
import DishTileV2 from './DishTileV2';
import DishRowV2 from './DishRowV2';
import { HeartIcon, MapPinIcon, ShareIcon, SearchIcon, LockIcon } from './icons';
import {
  MENU_SORT_OPTIONS,
  getDefaultMenuSortDirection,
  getMenuSortOption,
  toggleMenuSortDirection,
} from '@/lib/menuSorting';
import '@/pages/menu-redesign.css';

const CATS_VISIBLE = 3;
const MENU_GUIDE_STORAGE_KEY = 'rs_menu_guide_v1';

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

  const markGuideAction = () => {
    if (guideStep === 'filters') {
      setIsFilterPanelOpen(false);
      setGuideStep('dish');
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
    if (guideStep === 'dish') completeGuide();
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
                <HeartIcon filled={isFavoriteRestaurant} size={18} />
              </button>
            )}
            <button type="button" className="rsm2-icon-btn" onClick={openMapInBrowser} aria-label="Показать на карте">
              <MapPinIcon size={17} />
            </button>
            <button type="button" className="rsm2-icon-btn" onClick={handleShare} aria-label="Поделиться">
              <ShareIcon size={17} />
            </button>
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

            <div className="rsm2-cats rsm2-desktop-only" style={{ display: 'flex' }}>
              {renderCatPills()}
            </div>
          </div>
        )}

        {isFilterPanelOpen && !loading && !error && guideStep === 'filters' && (
          <MenuGuide step="filters" onDismiss={dismissGuide} />
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
              {guideStep === 'dish' && <MenuGuide step="dish" onDismiss={dismissGuide} />}
              {groupedDishes.map((section, sectionIndex) => (
              <div key={section.name}>
                <div className="rsm2-section__head">
                  <h2 className="rsm2-section__title">{section.name}</h2>
                  <span className="rsm2-section__count">{formatPositionCount(section.dishes.length)}</span>
                  <div className="rsm2-section__rule" />
                  <SortControl
                    categoryName={section.name}
                    sort={categorySorts?.[section.name] || menuSort}
                    globalSort={menuSort}
                    hasCategoryOverride={Boolean(categorySorts?.[section.name])}
                    onChange={onSortChange}
                    onReset={onSortReset}
                  />
                </div>

                <div className={`rsm2-grid rsm2-desktop-only ${guideStep === 'dish' && sectionIndex === 0 ? 'is-guide-target' : ''}`}>
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
                        onClick={(selectedDish) => openDish(selectedDish, isFreeAccess)}
                      />
                    );
                  })}
                </div>

                <div className={`rsm2-grid rsm2-mobile-only ${guideStep === 'dish' && sectionIndex === 0 ? 'is-guide-target' : ''}`}>
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

function SortControl({ categoryName, sort, globalSort, hasCategoryOverride, onChange, onReset }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState(hasCategoryOverride ? 'category' : 'menu');
  const selectedOption = getMenuSortOption(sort?.field);
  const selectedDirection = sort?.direction || selectedOption.defaultDirection;

  useEffect(() => {
    if (!isOpen) setScope(hasCategoryOverride ? 'category' : 'menu');
  }, [hasCategoryOverride, isOpen]);

  const chooseSort = (field, direction = null) => {
    const scopeSort = scope === 'menu' ? globalSort : sort;
    const nextDirection = direction || (
      field === scopeSort?.field
        ? scopeSort.direction
        : getDefaultMenuSortDirection(field)
    );
    onChange(scope, categoryName, { field, direction: nextDirection });
    setIsOpen(false);
  };

  const toggleDirection = (field) => {
    const scopeSort = scope === 'menu' ? globalSort : sort;
    const currentDirection = field === scopeSort?.field
      ? scopeSort.direction
      : getDefaultMenuSortDirection(field);
    chooseSort(field, toggleMenuSortDirection(currentDirection));
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
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span className="rsm2-sort-control__label">{selectedOption.label}</span>
        <span aria-hidden="true">{selectedDirection === 'asc' ? '↑' : '↓'}</span>
        <span className="rsm2-sort-control__caret" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="rsm2-sort-control__menu" role="menu" aria-label={`Сортировка «${categoryName}»`}>
          <div className="rsm2-sort-control__scope" role="group" aria-label="Область сортировки">
            <button
              type="button"
              className={scope === 'menu' ? 'is-on' : ''}
              aria-pressed={scope === 'menu'}
              onClick={() => setScope('menu')}
            >
              Всё меню
            </button>
            <button
              type="button"
              className={scope === 'category' ? 'is-on' : ''}
              aria-pressed={scope === 'category'}
              onClick={() => setScope('category')}
            >
              Только категория
            </button>
          </div>

          <div className="rsm2-sort-control__options">
            {MENU_SORT_OPTIONS.map((option) => {
              const isSelected = option.field === sort?.field;
              const direction = isSelected ? selectedDirection : option.defaultDirection;
              return (
                <div className={`rsm2-sort-control__option ${isSelected ? 'is-selected' : ''}`} key={option.field}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => chooseSort(option.field)}
                  >
                    {option.label}
                  </button>
                  <button
                    type="button"
                    className="rsm2-sort-control__direction"
                    aria-label={`${option.label}: по ${direction === 'asc' ? 'убыванию' : 'возрастанию'}`}
                    onClick={() => toggleDirection(option.field)}
                  >
                    {direction === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="rsm2-sort-control__reset" onClick={reset}>
            Сбросить сортировку
          </button>
        </div>
      )}
    </div>
  );
}

function MenuGuide({ step, onDismiss }) {
  const isFiltersStep = step === 'filters';

  return (
    <aside className={`rsm2-guide rsm2-guide--${step}`} aria-label="Подсказка по меню" aria-live="polite">
      <span className="rsm2-guide__mark" aria-hidden="true">✦</span>
      <div className="rsm2-guide__copy">
        <div className="rsm2-guide__meta">
          Подсказка · {isFiltersStep ? '1 из 2' : '2 из 2'}
        </div>
        <h2 className="rsm2-guide__title">
          {isFiltersStep ? 'Попробуй быстрые фильтры' : 'Теперь открой блюдо'}
        </h2>
        <p className="rsm2-guide__text">
          {isFiltersStep
            ? 'Настрой меню под себя одним нажатием.'
            : 'В карточке увидишь состав, КБЖУ и сможешь сохранить то, что понравилось.'}
        </p>
      </div>
      <button type="button" className="rsm2-guide__dismiss" onClick={onDismiss}>
        Не сейчас
      </button>
    </aside>
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
