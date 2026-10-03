import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client.js";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { analytics } from "@/services/analytics";

type FriendInfo = {
  id: number;
  first_name?: string | null;
  email: string;
};

type FriendFavoriteRestaurant = {
  restaurant_slug: string;
  friend_added_at: string;
  my_added_at?: string | null;
  is_common: boolean;
};

type FriendFavoritesResponse = {
  ok: boolean;
  friend: FriendInfo;
  only_common: boolean;
  summary: {
    friend_total: number;
    common_total: number;
  };
  restaurants: FriendFavoriteRestaurant[];
};

type RestaurantCardData = {
  slug: string;
  name: string;
  cuisine?: string | null;
};

type HydratedRestaurant = FriendFavoriteRestaurant & {
  restaurant: RestaurantCardData | null;
};

function formatName(friend?: FriendInfo | null) {
  if (!friend) return "Профиль";
  const trimmed = friend.first_name?.trim();
  return trimmed || friend.email;
}

export default function FriendFavoritesPage() {
  const { friendId } = useParams<{ friendId: string }>();
  const navigate = useNavigate();
  const token = useAuth((state) => state.accessToken);

  const parsedFriendId = useMemo(() => {
    const value = Number(friendId);
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [friendId]);

  const [showOnlyCommon, setShowOnlyCommon] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FriendFavoritesResponse | null>(null);
  const [hydratedRestaurants, setHydratedRestaurants] = useState<HydratedRestaurant[]>([]);

  const loadFavorites = useCallback(async () => {
    if (!token || !parsedFriendId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiGet<FriendFavoritesResponse>(
        `/api/friends/${parsedFriendId}/favorite-restaurants?only_common=${showOnlyCommon ? "1" : "0"}`,
        token,
      );

      if (!response?.ok) {
        throw new Error("FRIEND_FAVORITES_LOAD_FAILED");
      }

      setData(response);
      analytics.track("friend_favorites_loaded", {
        only_common: showOnlyCommon,
        restaurants_count: Array.isArray(response.restaurants) ? response.restaurants.length : 0,
      });
    } catch (err: any) {
      console.error("Failed to load friend favorites", err);
      analytics.track("friend_favorites_load_failed", {
        only_common: showOnlyCommon,
        error_status: err?.status || "request_failed",
      });
      const status = err?.status;
      if (status === 403) {
        setError("Этот пользователь пока не у вас в друзьях.");
      } else if (status === 404) {
        setError("Пользователь не найден.");
      } else {
        setError("Не удалось загрузить избранные рестораны друга.");
      }
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [token, parsedFriendId, showOnlyCommon]);

  useEffect(() => {
    if (!token || !parsedFriendId) return;
    loadFavorites();
  }, [token, parsedFriendId, loadFavorites]);

  useEffect(() => {
    const rows = data?.restaurants || [];
    if (!rows.length) {
      setHydratedRestaurants([]);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      setIsHydrating(true);
      try {
        const response = await api.restaurants({ limit: 1000 });
        const allRestaurants = Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response)
            ? response
            : [];

        const mapBySlug = new Map<string, RestaurantCardData>();
        for (const restaurant of allRestaurants) {
          if (!restaurant?.slug) continue;
          mapBySlug.set(restaurant.slug, {
            slug: restaurant.slug,
            name: restaurant.name || restaurant.slug,
            cuisine: restaurant.cuisine || null,
          });
        }

        if (cancelled) return;

        const hydrated = rows.map((item) => ({
          ...item,
          restaurant: mapBySlug.get(item.restaurant_slug) || null,
        }));

        setHydratedRestaurants(hydrated);
      } catch (err) {
        console.error("Failed to hydrate friend restaurants", err);
        if (!cancelled) {
          setHydratedRestaurants(
            rows.map((item) => ({
              ...item,
              restaurant: null,
            })),
          );
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!token) {
    return (
      <div className="account-empty">
        <p>Пожалуйста, войдите в аккаунт.</p>
      </div>
    );
  }

  if (!parsedFriendId) {
    return (
      <div className="account-empty">
        <p>Некорректный идентификатор пользователя.</p>
      </div>
    );
  }

  const friendName = formatName(data?.friend);
  const commonCount = Number(data?.summary?.common_total || 0);
  const friendTotal = Number(data?.summary?.friend_total || 0);
  const sourceRows = data?.restaurants || [];
  const displayRows = hydratedRestaurants.length
    ? hydratedRestaurants
    : sourceRows.map((item) => ({ ...item, restaurant: null }));
  const visibleCommonCount = showOnlyCommon
    ? Number(sourceRows.length || 0)
    : commonCount;

  return (
    <section className="friend-favorites-page account-panel" aria-labelledby="friend-favorites-title">
      <div className="friend-favorites-header">
        <button type="button" className="btn btn--ghost" onClick={() => navigate("/account/friends")}>Назад к друзьям</button>
        <h2 id="friend-favorites-title" className="account-section-title">{friendName}: Избранные рестораны</h2>
        <p className="friend-favorites-header__meta">
          {friendTotal} всего · {commonCount} общих мест
        </p>
      </div>

      <div className="friend-favorites-controls">
        <label className="friend-favorites-toggle" htmlFor="only-common-toggle">
          <input
            id="only-common-toggle"
            type="checkbox"
            checked={showOnlyCommon}
            onChange={(event) => {
              const onlyCommon = event.target.checked;
              setShowOnlyCommon(onlyCommon);
              analytics.track("friend_favorites_filter_changed", { only_common: onlyCommon });
            }}
          />
          <span>Показать только общее</span>
        </label>

        <span className="friend-favorites-count">
          {`${visibleCommonCount} общих мест`}
        </span>
      </div>

      {isLoading && (
        <div className="favorites-loading">
          <p>Загружаем избранные рестораны...</p>
        </div>
      )}

      {error && (
        <div className="friends-block friends-block--error">
          <p>{error}</p>
          <div className="friends-list__actions">
            <button type="button" className="btn btn--ghost" onClick={loadFavorites}>Повторить</button>
            <Link to="/account/friends" className="btn btn--primary">К списку друзей</Link>
          </div>
        </div>
      )}

      {!isLoading && !error && sourceRows.length === 0 && (
        <div className="favorites-empty">
          <p>{showOnlyCommon ? "Общих мест пока нет." : "У этого пользователя пока нет избранных ресторанов."}</p>
        </div>
      )}

      {!isLoading && !error && sourceRows.length > 0 && (
        <>
          {isHydrating && (
            <p className="muted">Обновляем карточки ресторанов...</p>
          )}

          <ul className="catalog-grid">
            {displayRows.map((item) => {
              const restaurantName = item.restaurant?.name || item.restaurant_slug;
              const cuisine = item.restaurant?.cuisine || "";
              const slug = item.restaurant?.slug || item.restaurant_slug;

              return (
                <li key={`${item.restaurant_slug}-${item.friend_added_at}`} className="catalog-card friend-favorites-card">
                  <div className="catalog-card__header">
                    <div className="catalog-card__badge">{restaurantName.slice(0, 2).toUpperCase()}</div>
                    <div className="catalog-card__title-block">
                      <h3 className="catalog-card__title">{restaurantName}</h3>
                      {cuisine && <div className="catalog-card__cuisine">{cuisine}</div>}
                    </div>
                  </div>

                  <div className="friend-favorites-card__meta">
                    {item.is_common ? (
                      <span className="friends-pill friends-pill--common">Общее место</span>
                    ) : (
                      <span className="friends-pill">Только у друга</span>
                    )}
                  </div>

                  <div className="catalog-card__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => {
                        analytics.track("friend_favorite_restaurant_open", {
                          restaurant_slug: slug,
                          is_common: item.is_common,
                        });
                        navigate(`/r/${slug}/menu`);
                      }}
                    >
                      Открыть меню
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
