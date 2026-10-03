import { useEffect, useState } from "react";
import { subscribeToToasts, type ToastIcon, type ToastMessage } from "@/lib/toast";

function ToastIconMark({ icon }: { icon: ToastIcon }) {
  if (icon === "party") {
    return (
      <span className="toast__icon toast__icon--party" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="m13 34 13-13 5 5-13 13-7 2 2-7Z" fill="currentColor" opacity=".88" />
          <path d="m27 20 5-5 6 6-5 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m31 10 1-4M38 15l4-2M24 10l-2-4M14 16l-4-2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="m13 34 5 5" stroke="#fffdfb" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (icon === "spinner") {
    return (
      <span className="toast__icon toast__icon--spinner" aria-hidden="true">
        <span />
      </span>
    );
  }

  return (
    <span className="toast__icon toast__icon--error" aria-hidden="true">
      <span>!</span>
    </span>
  );
}

export default function ToastViewport() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const timers = new Map<number, number>();
    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((prev) => toast.title
        ? [...prev.filter((item) => !item.title), toast]
        : [...prev, toast]);
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
        timers.delete(toast.id);
      }, toast.duration);
      timers.set(toast.id, timer);
    });

    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  if (!toasts.length) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.variant}${toast.title ? " toast--subscription" : ""}`}
          role={toast.variant === "error" ? "alert" : "status"}
        >
          {toast.title ? (
            <>
              <div className="toast__header">
                {toast.icon ? <ToastIconMark icon={toast.icon} /> : null}
                <button
                  type="button"
                  className="toast__close"
                  aria-label="Закрыть"
                  onClick={() => dismissToast(toast.id)}
                >
                  ×
                </button>
              </div>
              <div className="toast__content">
                <strong className="toast__title">{toast.title}</strong>
                <span className="toast__message">{toast.message}</span>
              </div>
              {(toast.actions?.length || toast.action) ? (
                <div className="toast__actions">
                  {(toast.actions?.length ? toast.actions : toast.action ? [toast.action] : []).map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="toast__action"
                      onClick={() => {
                        try {
                          action.onClick();
                        } finally {
                          dismissToast(toast.id);
                        }
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <span className="toast__message">{toast.message}</span>
              {toast.action ? (
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    try {
                      toast.action?.onClick();
                    } finally {
                      dismissToast(toast.id);
                    }
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
