import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiDelete, isUnauthorizedError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import ServiceUnavailable from "@/components/ServiceUnavailable.jsx";
import { isServiceUnavailableError } from "@/lib/serviceUnavailable.js";

type PaymentMethod = {
    id: number;
    yk_id: string;
    status: string;
    title: string | null;
    card_last4: string | null;
    expiry_month: string | null;
    expiry_year: string | null;
    card_type: string | null;
    issuer_name: string | null;
    is_default: boolean;
};

export default function PaymentMethods() {
    const { accessToken, logout } = useAuth((state) => ({
        accessToken: state.accessToken,
        logout: state.logout,
    }));

    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [serviceError, setServiceError] = useState<unknown>(null);
    const [attaching, setAttaching] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);

    // Polling state
    const [pollCount, setPollCount] = useState(0);
    const serviceRetryRef = useRef<(() => void) | null>(null);

    const fetchMethods = useCallback(async (isPolling = false) => {
        if (!accessToken) return;
        try {
            // Use cache-busting during polling or if we just returned from redirect
            const timestamp = Date.now();
            const url = `/api/payment-methods?t=${timestamp}`;
            const res = await apiGet<{ items: PaymentMethod[] }>(url, accessToken);
            if (res && Array.isArray(res.items)) {
                setMethods(res.items);

                // If we were polling and now have an 'active' card or no more 'pending' cards, we can stop
                const hasPending = res.items.some(m => m.status === 'pending');
                if (!hasPending && isPolling) {
                    setPollCount(0);
                }
            }
        } catch (err) {
            if (isUnauthorizedError(err)) {
                // apiGet should handle refresh, if it still throws 401, refresh failed
                logout();
            } else {
                console.error("Failed to fetch payment methods", err);
                if (isServiceUnavailableError(err)) {
                    setServiceError(err);
                    serviceRetryRef.current = () => { void fetchMethods(); };
                }
                setError("Не удалось загрузить карты.");
            }
        } finally {
            setLoading(false);
        }
    }, [accessToken, logout]);

    // Initial load
    useEffect(() => {
        fetchMethods();
    }, [fetchMethods]);

    // Polling effect after adding a card
    useEffect(() => {
        if (pollCount > 0) {
            const timer = setTimeout(() => {
                fetchMethods(true).then(() => {
                    setPollCount(prev => Math.max(0, prev - 1));
                });
            }, 3000); // 3 seconds interval
            return () => clearTimeout(timer);
        }
    }, [pollCount, fetchMethods]);

    // Start polling if we just returned from YooKassa (checking URL)
    useEffect(() => {
        if (window.location.pathname.includes('/return')) {
            setPollCount(5); // Poll up to 5 times (15 seconds)
            // Clean up URL without reload
            window.history.replaceState({}, document.title, window.location.pathname.replace('/return', ''));
        }
    }, []);

    const handleAddCard = async () => {
        if (!accessToken || attaching) return;
        setAttaching(true);
        setError(null);
        setServiceError(null);
        try {
            const returnUrl = window.location.origin + window.location.pathname + "/return";
            const res = await apiPost<{ confirmation_url?: string }>("/api/payment-methods/attach", { return_url: returnUrl }, accessToken);
            if (res?.confirmation_url) {
                window.location.href = res.confirmation_url;
            } else {
                setError("Не удалось начать привязку карты.");
            }
        } catch (err) {
            console.error("Attach error", err);
            if (isServiceUnavailableError(err)) {
                setServiceError(err);
                serviceRetryRef.current = () => { void handleAddCard(); };
            }
            setError("Ошибка при создании привязки.");
        } finally {
            setAttaching(false);
        }
    };

    const confirmDelete = async () => {
        if (!showDeleteModal || !accessToken) return;
        const id = showDeleteModal;
        setDeletingId(id);
        try {
            await apiDelete(`/api/payment-methods/${id}`, accessToken);
            setMethods(prev => prev.filter(m => m.id !== id));
            setShowDeleteModal(null);
        } catch (err) {
            console.error("Delete error", err);
            if (isServiceUnavailableError(err)) {
                setServiceError(err);
                serviceRetryRef.current = () => { void confirmDelete(); };
            }
            alert("Не удалось удалить карту.");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <section className="account-panel-v2 account-payment-panel" aria-labelledby="payment-methods-heading">
            <header className="account-panel-v2__header">
                <h2 id="payment-methods-heading" className="account-panel-v2__title">
                    Способы оплаты
                </h2>
                <button
                    className="account-button account-button--primary account-payment-panel__add-btn"
                    onClick={handleAddCard}
                    disabled={attaching || loading}
                >
                    {attaching ? "..." : "+ Добавить карту"}
                </button>
            </header>

            {serviceError ? (
                <ServiceUnavailable
                    onRetry={() => {
                        const retry = serviceRetryRef.current;
                        setServiceError(null);
                        retry?.();
                    }}
                />
            ) : error && (
                <div className="account-subscription-v2__error-box account-payment-panel__error">
                    <p>{error}</p>
                </div>
            )}

            {loading && methods.length === 0 ? (
                <div className="account-skeleton account-payment-panel__skeleton">
                    <div className="account-skeleton__line" />
                    <div className="account-skeleton__line" />
                </div>
            ) : (
                <div className="payment-methods-list">
                    {methods.length === 0 ? (
                        <p className="payment-methods-empty">Нет привязанных карт.</p>
                    ) : (
                        methods.map(method => (
                            <div key={method.id} className="payment-method-card">
                                <div className="payment-method-card__icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                                        <line x1="1" y1="10" x2="23" y2="10" />
                                    </svg>
                                </div>
                                <div className="payment-method-card__info">
                                    <div className="payment-method-card__title">
                                        {method.title || `Карта •••• ${method.card_last4 || "????"}`}
                                    </div>
                                    <div className="payment-method-card__meta">
                                        {method.expiry_month}/{method.expiry_year} &bull; {method.card_type}
                                        {method.status === 'pending' && <span className="payment-method-card__pending-label">(Проверяется...)</span>}
                                    </div>
                                </div>
                                <button
                                    className="payment-method-card__delete"
                                    onClick={() => setShowDeleteModal(method.id)}
                                    disabled={deletingId === method.id}
                                    title="Удалить карту"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {showDeleteModal && (
                <div className="logout-modal" role="dialog" aria-modal="true">
                    <div className="logout-modal__dialog">
                        <h3 className="logout-modal__title">Удалить карту?</h3>
                        <p className="logout-modal__description">
                            Карта будет удалена из списка. Вы не сможете использовать её для автопродления подписки.
                        </p>
                        <div className="logout-modal__actions">
                            <button
                                type="button"
                                className="account-button account-button--outline"
                                onClick={() => setShowDeleteModal(null)}
                                disabled={Boolean(deletingId)}
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                className="account-button account-button--danger"
                                onClick={confirmDelete}
                                disabled={Boolean(deletingId)}
                            >
                                {deletingId ? "..." : "Да, удалить"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
