export type ToastVariant = "success" | "info" | "warning" | "error";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastIcon = "party" | "spinner" | "error";

// "premium": оливково-стеклянный вид как у кнопок меню, сообщение можно закрыть
export type ToastTone = "premium";

export type ToastOptions = {
  duration?: number;
  action?: ToastAction;
  actions?: ToastAction[];
  title?: string;
  icon?: ToastIcon;
  tone?: ToastTone;
};

export type ToastMessage = {
  id: number;
  variant: ToastVariant;
  message: string;
  duration: number;
  action?: ToastAction;
  actions?: ToastAction[];
  title?: string;
  icon?: ToastIcon;
  tone?: ToastTone;
};

type ToastListener = (toast: ToastMessage) => void;

const listeners = new Set<ToastListener>();
let counter = 0;
const DEFAULT_DURATION = 4000;

const emit = (variant: ToastVariant, message: string, options?: ToastOptions) => {
  const durationCandidate = options?.duration ?? DEFAULT_DURATION;
  const duration = durationCandidate > 0 ? durationCandidate : DEFAULT_DURATION;
  const toast: ToastMessage = {
    id: ++counter,
    variant,
    message,
    duration,
    action: options?.action,
    actions: options?.actions,
    title: options?.title,
    icon: options?.icon,
    tone: options?.tone,
  };
  listeners.forEach((listener) => listener(toast));
};

export const toast = {
  success(message: string, options?: ToastOptions) {
    emit("success", message, options);
  },
  info(message: string, options?: ToastOptions) {
    emit("info", message, options);
  },
  warning(message: string, options?: ToastOptions) {
    emit("warning", message, options);
  },
  error(message: string, options?: ToastOptions) {
    emit("error", message, options);
  },
};

export const subscribeToToasts = (listener: ToastListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
