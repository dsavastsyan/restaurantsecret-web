export const SUBSCRIPTION_CHECKOUT_PATH = "/account/subscription";
export const SUBSCRIPTION_RETURN_TO_KEY = "rs_subscription_return_to";

const normalizeSourcePath = (sourcePath?: string) => {
  if (!sourcePath || !sourcePath.startsWith("/") || sourcePath.startsWith("//")) return undefined;
  return sourcePath;
};

export function rememberSubscriptionReturnTo(sourcePath?: string) {
  const returnTo = normalizeSourcePath(sourcePath);
  if (!returnTo || typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(SUBSCRIPTION_RETURN_TO_KEY, returnTo);
  } catch {
    // Ignore restricted storage contexts; the checkout flow still works.
  }
}

export function readSubscriptionReturnTo() {
  if (typeof window === "undefined") return undefined;

  try {
    return normalizeSourcePath(window.sessionStorage.getItem(SUBSCRIPTION_RETURN_TO_KEY) || undefined);
  } catch {
    return undefined;
  }
}

export function forgetSubscriptionReturnTo() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(SUBSCRIPTION_RETURN_TO_KEY);
  } catch {
    // Ignore restricted storage contexts.
  }
}

export function getSubscriptionCheckoutLink(accessToken?: string | null, sourcePath?: string) {
  const returnTo = normalizeSourcePath(sourcePath);

  if (accessToken) {
    return {
      to: SUBSCRIPTION_CHECKOUT_PATH,
      state: returnTo ? { from: returnTo } : undefined,
    };
  }

  return {
    to: "/login",
    state: returnTo
      ? { from: SUBSCRIPTION_CHECKOUT_PATH, returnTo }
      : { from: SUBSCRIPTION_CHECKOUT_PATH },
  };
}
