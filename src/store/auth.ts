import { useSyncExternalStore } from "react";
import { analytics } from "@/services/analytics";

type AuthState = {
  accessToken: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
};

export const selectAccessToken = (state: AuthState) => state.accessToken;
export const selectSetToken = (state: AuthState) => state.setToken;
export const selectLogout = (state: AuthState) => state.logout;

const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const readStoredToken = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("rs_access");
  } catch (error) {
    console.warn("Failed to read access token from localStorage", error);
    return null;
  }
};

const RETURNING_KEY = "rs_returning";

// Признак «уже заходил в сервис»: переживает выход из аккаунта, чтобы гостю
// вместо «Попробовать бесплатно» показывать «Войти».
const markReturning = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETURNING_KEY, "1");
  } catch {
    /* localStorage может быть недоступен */
  }
};

export const readIsReturningUser = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RETURNING_KEY) === "1";
  } catch {
    return false;
  }
};

let state: AuthState;

const persistToken = (token: string | null) => {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem("rs_access", token);
    } else {
      window.localStorage.removeItem("rs_access");
    }
  } catch (error) {
    console.warn("Failed to persist access token", error);
  }
};

export const setToken = (token: string | null) => {
  const wasLoggedOut = !state.accessToken;
  persistToken(token);
  if (token) markReturning();
  state = { ...state, accessToken: token };
  notify();
  // После логина — линкуем анонимные события с пользователем
  if (token && wasLoggedOut) {
    analytics.identify().catch(() => {});
  }
};

const logout = () => {
  setToken(null);
};

const initialToken = readStoredToken();
if (initialToken) markReturning();

state = {
  accessToken: initialToken,
  setToken,
  logout,
};

export const getAuthState = () => state;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;

export function useAuth(): AuthState;
export function useAuth<T>(selector: (state: AuthState) => T): T;
export function useAuth<T>(selector?: (state: AuthState) => T) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (selector) {
    return selector(snapshot);
  }
  return snapshot;
}
