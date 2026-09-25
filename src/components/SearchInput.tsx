import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  searchSuggest,
  type SearchSuggestionDish,
  type SearchSuggestionRestaurant,
  type SearchSuggestions,
} from "@/lib/api";
import { getSearchQueryScore } from "@/lib/text";
import { useDishCardStore } from "@/store/dishCard";
import { analytics } from "@/services/analytics";

export type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
};

export function SearchInput({ value, onChange, onSubmit }: SearchInputProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const openDishCard = useDishCardStore((state) => state.open);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions(null);
      setIsLoadingSuggestions(false);
      setIsOpen(false);
      setHighlightedIndex(null);
      return;
    }

    let cancelled = false;
    setIsOpen(true);
    setIsLoadingSuggestions(true);
    const handle = setTimeout(async () => {
      try {
        const resp = await searchSuggest(q);
        if (cancelled) return;
        setSuggestions({
          restaurants: [...(resp.restaurants || [])].sort((left, right) =>
            getSearchQueryScore(right.name, q) - getSearchQueryScore(left.name, q)
          ),
          dishes: [...(resp.dishes || [])].sort((left, right) =>
            getSearchQueryScore(right.dishName, q) - getSearchQueryScore(left.dishName, q)
          ),
        });
        setIsOpen(true);
        setIsLoadingSuggestions(false);
        setHighlightedIndex(null);
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error("Не удалось получить подсказки", error);
        }
        if (!cancelled) {
          setSuggestions(null);
          setIsLoadingSuggestions(false);
          setIsOpen(false);
          setHighlightedIndex(null);
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
      setHighlightedIndex(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  type FlatItem =
    | (SearchSuggestionRestaurant & { kind: "restaurant" })
    | (SearchSuggestionDish & { kind: "dish" });

  const flatItems = useMemo<FlatItem[]>(() => {
    if (!suggestions) return [];
    return [
      ...suggestions.restaurants.map((item) => ({
        ...item,
        kind: "restaurant" as const,
      })),
      ...suggestions.dishes.map((item) => ({
        ...item,
        kind: "dish" as const,
      })),
    ];
  }, [suggestions]);

  const handleDishOpen = useMemo(
    () =>
      (dish: SearchSuggestionDish) => {
        setIsOpen(false);
        setSuggestions(null);
        setHighlightedIndex(null);
        onChange("");
        openDishCard({
          id: dish.id,
          dishName: dish.dishName,
          restaurantSlug: dish.restaurantSlug,
          restaurantName: dish.restaurantName,
        });
      },
    [onChange, openDishCard]
  );

  const restaurantCount = suggestions?.restaurants.length ?? 0;

  const handleSelect = (item: FlatItem) => {
    if (item.kind === "restaurant") {
      setIsOpen(false);
      setSuggestions(null);
      setHighlightedIndex(null);
      onChange("");
      analytics.track("search_submit", { type: "restaurant", slug: item.slug, name: item.name });
      navigate(`/restaurants/${item.slug}/menu/`);
    } else {
      handleDishOpen(item);
    }
  };

  const hasHighlightedSuggestion = isOpen && highlightedIndex !== null;
  const activeItem = hasHighlightedSuggestion
    ? flatItems[highlightedIndex!]
    : null;
  const activeDescendant = activeItem
    ? `search-suggestion-${activeItem.kind}-${activeItem.id}`
    : undefined;

  const buildSearchUrl = (q: string) =>
    `/search?q=${encodeURIComponent(q)}&type=dish`;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !hasHighlightedSuggestion) {
      const q = value.trim();
      if (!q) return;
      e.preventDefault();
      if (onSubmit) {
        onSubmit(q);
        return;
      }
      analytics.track("search_submit", { type: "query", query: q });
      navigate(buildSearchUrl(q));
      return;
    }

    if (!flatItems.length) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((current) =>
        current === null ? 0 : Math.min(current + 1, flatItems.length - 1)
      );
      setIsOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((current) =>
        current === null ? flatItems.length - 1 : Math.max(current - 1, 0)
      );
      setIsOpen(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = highlightedIndex === null ? null : flatItems[highlightedIndex];
      if (selected) {
        handleSelect(selected);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(null);
    }
  };

  useEffect(() => {
    if (!suggestions) return;

    const onlyDish = suggestions.dishes.length === 1 ? suggestions.dishes[0] : null;
    const normalizedQuery = value.trim().toLowerCase();

    if (
      onlyDish &&
      normalizedQuery &&
      normalizedQuery === onlyDish.dishName.trim().toLowerCase()
    ) {
      handleDishOpen(onlyDish);
    }
  }, [handleDishOpen, suggestions, value]);

  return (
    <div className="search-input" ref={containerRef}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          analytics.track("search_open");
          if (value.trim().length >= 2 || (suggestions && (suggestions.restaurants.length || suggestions.dishes.length))) {
            setIsOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        className="search-input__control"
        placeholder="Найти ресторан или блюдо"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-activedescendant={activeDescendant}
      />

      {isOpen && (suggestions || isLoadingSuggestions) && (
        <div className="search-input__dropdown" role="listbox">
          {isLoadingSuggestions && !suggestions && (
            <div className="search-input__empty">Ищем...</div>
          )}

          {suggestions && suggestions.restaurants.length > 0 && (
            <div className="search-input__group">
              <div className="search-input__heading">Рестораны</div>
              <ul className="search-input__list">
                {suggestions.restaurants.map((restaurant, idx) => {
                  const flatIndex = idx;
                  const isActive = highlightedIndex === flatIndex;
                  const item = flatItems[flatIndex];
                  return (
                    <li key={`restaurant-${restaurant.id}`}>
                      <button
                        id={`search-suggestion-restaurant-${restaurant.id}`}
                        type="button"
                        className={`search-input__item${isActive ? " is-active" : ""}`}
                        onMouseEnter={() => setHighlightedIndex(flatIndex)}
                        onMouseLeave={() => setHighlightedIndex(null)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => item && handleSelect(item)}
                      >
                        <span className="search-input__item-title">{restaurant.name}</span>
                        {restaurant.city && (
                          <span className="search-input__item-subtitle">{restaurant.city}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {suggestions && suggestions.dishes.length > 0 && (
            <div className="search-input__group">
              <div className="search-input__heading">Блюда</div>
              <ul className="search-input__list">
                {suggestions.dishes.map((dish, idx) => {
                  const flatIndex = restaurantCount + idx;
                  const isActive = highlightedIndex === flatIndex;
                  const item = flatItems[flatIndex];
                  return (
                    <li key={`dish-${dish.id}`}>
                      <button
                        id={`search-suggestion-dish-${dish.id}`}
                        type="button"
                        className={`search-input__item${isActive ? " is-active" : ""}`}
                        onMouseEnter={() => setHighlightedIndex(flatIndex)}
                        onMouseLeave={() => setHighlightedIndex(null)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => item && handleSelect(item)}
                      >
                        <span className="search-input__item-title">{dish.dishName}</span>
                        <span className="search-input__item-subtitle">
                          {dish.restaurantName}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {suggestions && !isLoadingSuggestions && suggestions.restaurants.length === 0 && suggestions.dishes.length === 0 && (
            <div className="search-input__empty">Ничего не нашли, попробуйте другой запрос</div>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchInput;
