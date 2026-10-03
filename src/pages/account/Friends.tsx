import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/lib/toast";
import { analytics } from "@/services/analytics";

type FriendUser = {
  id: number;
  first_name?: string | null;
  email: string;
};

type FriendItem = FriendUser & {
  friends_since: string;
};

type IncomingRequest = {
  id: number;
  status: string;
  created_at: string;
  from_user: FriendUser;
};

type OutgoingRequest = {
  id: number;
  status: string;
  created_at: string;
  to_user: FriendUser;
};

type FriendsResponse = {
  ok: boolean;
  friends: FriendItem[];
  incoming_requests: IncomingRequest[];
  outgoing_requests: OutgoingRequest[];
};

type SearchUser = {
  id: number;
  first_name?: string | null;
  email: string;
  is_friend: boolean;
  relation_status?: string | null;
  relation_direction?: "incoming" | "outgoing" | null;
};

type SearchResponse = {
  ok: boolean;
  users: SearchUser[];
};

function formatPersonName(person: { first_name?: string | null; email: string }) {
  const name = person.first_name?.trim();
  return name || person.email;
}

function formatRequestDate(value?: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

export default function FriendsPage() {
  const token = useAuth((state) => state.accessToken);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiGet<FriendsResponse>("/api/friends", token);
      if (!response?.ok) {
        throw new Error("FRIENDS_LOAD_FAILED");
      }

      setFriends(Array.isArray(response.friends) ? response.friends : []);
      setIncomingRequests(Array.isArray(response.incoming_requests) ? response.incoming_requests : []);
      setOutgoingRequests(Array.isArray(response.outgoing_requests) ? response.outgoing_requests : []);
      analytics.track("friends_loaded", {
        friends_count: Array.isArray(response.friends) ? response.friends.length : 0,
        incoming_requests_count: Array.isArray(response.incoming_requests) ? response.incoming_requests.length : 0,
        outgoing_requests_count: Array.isArray(response.outgoing_requests) ? response.outgoing_requests.length : 0,
      });
    } catch (err) {
      console.error("Failed to load friends", err);
      analytics.track("friends_load_failed", { error_status: err?.status || "request_failed" });
      setError("Не удалось загрузить друзей и заявки.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadFriends();
  }, [token, loadFriends]);

  useEffect(() => {
    if (!token) return;

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsSearchLoading(true);
      try {
        const response = await apiGet<SearchResponse>(
          `/api/friends/search?q=${encodeURIComponent(query)}&limit=20`,
          token,
        );
        if (!cancelled) {
          setSearchResults(Array.isArray(response?.users) ? response.users : []);
          analytics.track("friend_search_completed", {
            query_length: query.length,
            results_count: Array.isArray(response?.users) ? response.users.length : 0,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to search users", err);
          analytics.track("friend_search_failed", { query_length: query.length, error_status: err?.status || "request_failed" });
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, token]);

  const handleSendRequest = useCallback(async (toUserId: number) => {
    if (!token) return;

    const key = `send:${toUserId}`;
    setActionKey(key);
    try {
      await apiPost("/api/friends/requests", { to_user_id: toUserId }, token);
      toast.success("Заявка отправлена");
      analytics.track("friend_request_sent");
      await loadFriends();

      const query = searchQuery.trim();
      if (query.length >= 2) {
        const updated = await apiGet<SearchResponse>(
          `/api/friends/search?q=${encodeURIComponent(query)}&limit=20`,
          token,
        );
        setSearchResults(Array.isArray(updated?.users) ? updated.users : []);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.info("Заявка уже существует");
      } else {
        toast.error("Не удалось отправить заявку");
      }
      analytics.track("friend_request_send_failed", {
        error_status: err?.status || "request_failed",
      });
    } finally {
      setActionKey(null);
    }
  }, [token, loadFriends, searchQuery]);

  const handleRequestAction = useCallback(async (requestId: number, action: "accept" | "decline" | "cancel") => {
    if (!token) return;

    const key = `${action}:${requestId}`;
    setActionKey(key);
    try {
      await apiPost(`/api/friends/requests/${requestId}/${action}`, undefined, token);
      analytics.track("friend_request_action", { action });
      if (action === "accept") {
        toast.success("Пользователь добавлен в друзья");
      }
      await loadFriends();
    } catch (err) {
      console.error(`Failed to ${action} friend request`, err);
      analytics.track("friend_request_action_failed", {
        action,
        error_status: err?.status || "request_failed",
      });
      toast.error("Не удалось обновить заявку");
    } finally {
      setActionKey(null);
    }
  }, [token, loadFriends]);

  const incomingCount = incomingRequests.length;
  const outgoingCount = outgoingRequests.length;
  const friendsCount = friends.length;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("rs:friends-incoming-count", {
        detail: { count: incomingCount },
      }),
    );
  }, [incomingCount]);

  const searchHint = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return "Введите имя или email, чтобы найти пользователя.";
    if (query.length < 2) return "Введите минимум 2 символа.";
    if (isSearchLoading) return "Ищем пользователей...";
    if (!searchResults.length) return "Ничего не найдено.";
    return `${searchResults.length} результат(ов)`;
  }, [searchQuery, isSearchLoading, searchResults.length]);

  if (!token) {
    return (
      <div className="account-empty">
        <p>Пожалуйста, войдите в аккаунт.</p>
      </div>
    );
  }

  return (
    <section className="friends-page account-panel" aria-labelledby="friends-heading">
      <div className="friends-header">
        <h2 id="friends-heading" className="account-section-title">Друзья</h2>
        <p className="friends-header__meta">
          {friendsCount} друзей · {incomingCount} входящих · {outgoingCount} исходящих
        </p>
      </div>

      <div className="friends-search-card">
        <label htmlFor="friend-search" className="friends-search-card__label">Найти пользователя</label>
        <input
          id="friend-search"
          type="text"
          className="friends-search-card__input"
          placeholder="Имя или email"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <p className="friends-search-card__hint">{searchHint}</p>

        {searchResults.length > 0 && (
          <ul className="friends-search-list">
            {searchResults.map((user) => {
              const isPendingOutgoing = user.relation_status === "pending" && user.relation_direction === "outgoing";
              const isPendingIncoming = user.relation_status === "pending" && user.relation_direction === "incoming";
              const canSend = !user.is_friend && !isPendingOutgoing && !isPendingIncoming;
              const key = `send:${user.id}`;

              return (
                <li className="friends-search-list__item" key={user.id}>
                  <div className="friends-search-list__identity">
                    <p className="friends-search-list__name">{formatPersonName(user)}</p>
                    <p className="friends-search-list__email">{user.email}</p>
                  </div>

                  <div className="friends-search-list__actions">
                    {user.is_friend && (
                      <Link className="btn btn--ghost" to={`/account/friends/${user.id}`}>
                        Профиль
                      </Link>
                    )}

                    {isPendingOutgoing && (
                      <span className="friends-pill">Заявка отправлена</span>
                    )}

                    {isPendingIncoming && (
                      <span className="friends-pill friends-pill--incoming">Входящая заявка</span>
                    )}

                    {canSend && (
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => handleSendRequest(user.id)}
                        disabled={actionKey === key}
                      >
                        {actionKey === key ? "..." : "Добавить"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <div className="friends-block friends-block--error">
          <p>{error}</p>
          <button type="button" className="btn btn--ghost" onClick={loadFriends}>Повторить</button>
        </div>
      )}

      <div className="friends-grid">
        <article className="friends-block">
          <h3 className="friends-block__title">Входящие заявки</h3>
          {isLoading && incomingRequests.length === 0 ? (
            <p className="muted">Загрузка...</p>
          ) : incomingRequests.length === 0 ? (
            <p className="muted">Пока нет входящих заявок.</p>
          ) : (
            <ul className="friends-list">
              {incomingRequests.map((request) => (
                <li key={request.id} className="friends-list__item">
                  <div>
                    <p className="friends-list__name">{formatPersonName(request.from_user)}</p>
                    <p className="friends-list__meta">
                      {request.from_user.email}
                      {request.created_at ? ` · ${formatRequestDate(request.created_at)}` : ""}
                    </p>
                  </div>
                  <div className="friends-list__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => handleRequestAction(request.id, "accept")}
                      disabled={actionKey === `accept:${request.id}`}
                    >
                      {actionKey === `accept:${request.id}` ? "..." : "Принять"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => handleRequestAction(request.id, "decline")}
                      disabled={actionKey === `decline:${request.id}`}
                    >
                      Отклонить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="friends-block">
          <h3 className="friends-block__title">Исходящие заявки</h3>
          {isLoading && outgoingRequests.length === 0 ? (
            <p className="muted">Загрузка...</p>
          ) : outgoingRequests.length === 0 ? (
            <p className="muted">Пока нет исходящих заявок.</p>
          ) : (
            <ul className="friends-list">
              {outgoingRequests.map((request) => (
                <li key={request.id} className="friends-list__item">
                  <div>
                    <p className="friends-list__name">{formatPersonName(request.to_user)}</p>
                    <p className="friends-list__meta">
                      {request.to_user.email}
                      {request.created_at ? ` · ${formatRequestDate(request.created_at)}` : ""}
                    </p>
                  </div>
                  <div className="friends-list__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => handleRequestAction(request.id, "cancel")}
                      disabled={actionKey === `cancel:${request.id}`}
                    >
                      Отменить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="friends-block friends-block--full">
        <h3 className="friends-block__title">Мои друзья</h3>
        {isLoading && friends.length === 0 ? (
          <p className="muted">Загрузка...</p>
        ) : friends.length === 0 ? (
          <p className="muted">У вас пока нет друзей в приложении.</p>
        ) : (
          <ul className="friends-list friends-list--friends">
            {friends.map((friend) => (
              <li key={friend.id} className="friends-list__item">
                <div>
                  <p className="friends-list__name">{formatPersonName(friend)}</p>
                  <p className="friends-list__meta">{friend.email}</p>
                </div>
                <div className="friends-list__actions">
                  <Link className="btn btn--primary" to={`/account/friends/${friend.id}`}>
                    Профиль
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
