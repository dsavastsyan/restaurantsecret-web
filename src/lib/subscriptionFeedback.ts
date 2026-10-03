import { toast, type ToastAction } from "@/lib/toast";

type SubscriptionFeedbackHandlers = {
  onContinue?: () => void;
};

export function showSubscriptionSuccess({ onContinue }: SubscriptionFeedbackHandlers = {}) {
  const action: ToastAction = {
    label: "Продолжить просмотр",
    onClick: () => onContinue?.(),
  };

  toast.success("Доступны все возможности сервиса", {
    title: "Готово — премиум-доступ открыт",
    icon: "party",
    actions: [action],
    duration: 8000,
  });
}

export function showSubscriptionPending(onCheck: () => void) {
  toast.info("Обычно это занимает несколько секунд\nДоступ откроется автоматически", {
    title: "Платёж получен — проверяем доступ",
    icon: "spinner",
    actions: [
      {
        label: "Проверить сейчас",
        onClick: onCheck,
      },
    ],
    duration: 12000,
  });
}

export function showSubscriptionError(onCheck: () => void, onRetry: () => void) {
  toast.error("Проверьте статус или попробуйте ещё раз", {
    title: "Не удалось подтвердить подписку",
    icon: "error",
    actions: [
      {
        label: "Проверить статус",
        onClick: onCheck,
      },
      {
        label: "Попробовать ещё раз",
        onClick: onRetry,
      },
    ],
    duration: 12000,
  });
}
