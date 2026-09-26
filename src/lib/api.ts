// src/lib/api.ts
import { PD_API_BASE, PUBLIC_API_BASE } from "@/config/api";
import { markOnboardingCompletedForToken } from "@/lib/onboarding";
import { requestTurnstileToken } from "@/lib/turnstile";
import { setToken } from "@/store/auth";

export type SearchSuggestionRestaurant = {
  id: number;
  slug: string;
  name: string;
  city?: string | null;
};

export type SearchSuggestionDish = {
  id: number;
  dishName: string;
  restaurantName: string;
  restaurantSlug: string;
};

export type SearchSuggestions = {
  restaurants: SearchSuggestionRestaurant[];
  dishes: SearchSuggestionDish[];
};

export type Restaurant = {
  id: number;
  slug: string;
  name: string;
  cuisine: string;
  dishesCount: number;
};

export type RestaurantListResponse = {
  items: Restaurant[];
};

export type SearchRestaurant = {
  id: number;
  slug: string;
  name: string;
  city?: string | null;
  cuisine?: string | null;
  branchesCount?: number;
};

export type SearchDish = {
  id: number;
  dishName: string;
  restaurantName: string;
  restaurantSlug: string;
  city?: string | null;
};

export type SearchOtherCity = {
  city: string;
  restaurants: SearchRestaurant[];
  dishes: SearchDish[];
};

export type SearchResult = {
  restaurants: SearchRestaurant[];
  dishes: SearchDish[];
  otherCities?: SearchOtherCity[];
};

export type LandingStats = {
  restaurants: number;
  dishes: number;
  weeklyAdded: number;
  asOf?: string;
};

export type SuggestRequest = {
  name: string;
  dish_name?: string | null;
  city?: string | null;
  email?: string | null;
};

export type FeedbackRequest = {
  name?: string | null;
  email?: string | null;
  feedback_type: string;
  message: string;
};

export type StoreProduct = {
  id: number;
  source: string;
  sourceProductCode: string;
  sourceUrl?: string | null;
  barcode?: string | null;
  productName: string;
  brand?: string | null;
  quantityText?: string | null;
  productQuantity?: number | null;
  productQuantityUnit?: string | null;
  servingSize?: string | null;
  servingQuantity?: number | null;
  servingQuantityUnit?: string | null;
  nutritionBasis?: string | null;
  kcalPer100?: number | null;
  proteinsGPer100?: number | null;
  fatsGPer100?: number | null;
  carbsGPer100?: number | null;
  kcalPerServing?: number | null;
  proteinsGPerServing?: number | null;
  fatsGPerServing?: number | null;
  carbsGPerServing?: number | null;
  imageFrontUrl?: string | null;
  updatedAt?: string | null;
};

export type StoreProductSearchResponse = {
  ok: boolean;
  query: string;
  products: StoreProduct[];
};

export class ApiError extends Error {
  status?: number;
  payload?: unknown;

  constructor(message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const parseBody = async (response: Response) => {
  try {
    return await response.clone().json();
  } catch {
    try {
      const text = await response.text();
      return text.length ? text : null;
    } catch {
      return null;
    }
  }
};

const toApiError = async (response: Response) => {
  const payload = await parseBody(response);
  const message =
    typeof payload === "string" && payload
      ? payload
      : `Request failed with status ${response.status}`;
  throw new ApiError(message, response.status, payload);
};

async function doFetch(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(`${PD_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include", // важно для refresh
  });
  return res;
}

async function publicGet<T>(path: string): Promise<T> {
  const fetchPublic = (captchaToken?: string) => fetch(`${PUBLIC_API_BASE}${path}`, {
    method: "GET",
    // Same-origin production requests must carry the Anubis clearance cookie.
    // Browsers still omit credentials automatically for the absolute staging
    // origin because `same-origin` never sends them cross-origin.
    credentials: "same-origin",
    headers: captchaToken ? { "X-Captcha-Token": captchaToken } : undefined,
  });

  let res = await fetchPublic();
  if (res.status === 403) {
    const payload = await parseBody(res);
    const captchaRequired =
      payload && typeof payload === "object" && "error" in payload && payload.error === "captcha_required";
    const sitekey =
      payload && typeof payload === "object" && "sitekey" in payload && typeof payload.sitekey === "string"
        ? payload.sitekey
        : "";

    if (captchaRequired && sitekey) {
      const token = await requestTurnstileToken(sitekey);
      res = await fetchPublic(token);
    }
  }

  if (!res.ok) {
    await toApiError(res);
  }
  return res.json();
}

export const isUnauthorizedError = (error: unknown): error is ApiError => {
  return error instanceof ApiError && error.status === 401;
};

export function apiPostAuth(path: string, body?: unknown, token?: string) {
  return fetch(`${PD_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function tryRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${PD_API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    if (data?.ok && data.access_token) {
      // сохранить новый токен
      try {
        setToken(data.access_token);
      } catch { }
      return data.access_token as string;
    }
    return null;
  } catch {
    return null;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await toApiError(response);
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null as T;
  }
}

export async function apiGet<T = unknown>(path: string, token?: string): Promise<T> {
  // 1-й заход
  let res = await doFetch(path, { method: "GET" }, token);
  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(path, { method: "GET" }, newToken); // ретрай 1 раз
    }
  }

  return handleResponse<T>(res);
}

export async function apiPost<T = unknown>(path: string, body?: unknown, token?: string): Promise<T> {
  // 1-й заход
  let res = await doFetch(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
    token
  );
  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(
        path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        },
        newToken
      ); // ретрай 1 раз
    }
  }

  return handleResponse<T>(res);
}

export async function apiDelete<T = unknown>(path: string, token?: string): Promise<T> {
  // 1-й заход
  let res = await doFetch(path, { method: "DELETE" }, token);
  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(path, { method: "DELETE" }, newToken); // ретрай 1 раз
    }
  }

  return handleResponse<T>(res);
}

export type PromoQuote = {
  valid: boolean;
  code?: string;
  type: 'free_days' | 'discount_rub' | 'discount_pct';
  amount: number;
  plan: 'monthly' | 'annual' | 'any';
  description: string;
  requires_subscribing: boolean;
  error?: string;
};

export type PromoRedeemResponse = {
  success: boolean;
  next_step?: 'link_card' | 'payment' | 'done';
  promo_code?: string;
  days?: number;
  error?: string;
};

export type CurrentUserResponse = {
  ok: boolean;
  user?: {
    id: string;
    email: string;
    first_name?: string | null;
    profile_about?: string | null;
    created_at: string;
    onboarding_completed?: boolean;
    onboarding_completed_at?: string | null;
    subscription: {
      plan: string;
      status: string;
      expires_at: string;
      expired: boolean;
      payment_provider?: string | null;
      payment_method?: string | null;
      provider?: string | null;
      gateway?: string | null;
    } | null;
  };
};

export function fetchCurrentUser(token: string) {
  return apiGet<CurrentUserResponse>("/users/me", token);
}

export async function completeOnboarding(token: string) {
  const fallbackResponse = {
    ok: true,
    onboarding_completed: true,
    onboarding_completed_at: new Date().toISOString(),
  };

  const candidatePaths = ["/api/onboarding/complete", "/onboarding/complete"];
  let lastNotFoundError: ApiError | null = null;

  for (const path of candidatePaths) {
    try {
      const response = await apiPost<{ ok: boolean; onboarding_completed: boolean; onboarding_completed_at: string }>(
        path,
        undefined,
        token
      );
      markOnboardingCompletedForToken(token);
      return response;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        lastNotFoundError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastNotFoundError) {
    markOnboardingCompletedForToken(token);
    return fallbackResponse;
  }

  return fallbackResponse;
}

export function saveOnboardingProfileName(token: string, name: string) {
  return apiPost<{ ok: boolean; first_name: string }>("/api/onboarding/profile-name", { name }, token);
}

export async function quotePromo(code: string, token: string) {
  return apiPost<PromoQuote>("/api/promo/quote", { code }, token);
}

export async function redeemPromo(code: string, token: string, plan?: string) {
  return apiPost<PromoRedeemResponse>("/api/promo/redeem", { code, plan }, token);
}

export async function attachPaymentMethod(token: string, data: { promo_code?: string; plan?: string; return_url?: string }) {
  return apiPost<{ confirmation_url: string; payment_id?: string }>("/api/payment-methods/attach", data, token);
}

export async function syncTrialPayment(token: string, data: { payment_id?: string }) {
  return apiPost<{
    ok: boolean;
    synced?: boolean;
    active?: boolean;
    payment_status?: string;
    provider_status?: string;
    error?: string;
  }>("/api/payments/sync-trial", data, token);
}

export function postSuggest(body: SuggestRequest, token?: string) {
  return apiPost("/api/suggest", body, token);
}

export function postFeedback(body: FeedbackRequest, token?: string) {
  return apiPost("/api/feedback", body, token);
}

export async function searchSuggest(query: string): Promise<SearchSuggestions> {
  return publicGet<SearchSuggestions>(
    `/search/suggest?query=${encodeURIComponent(query)}`
  );
}

export async function searchFull(query: string, city = "Москва"): Promise<SearchResult> {
  return publicGet<SearchResult>(
    `/search?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}`
  );
}

export async function searchStoreProducts(query: string, limit = 12): Promise<StoreProductSearchResponse> {
  return publicGet<StoreProductSearchResponse>(
    `/products/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
}

export async function getLandingStats(city = "Москва"): Promise<LandingStats> {
  return publicGet<LandingStats>(`/landing/stats?city=${encodeURIComponent(city)}`);
}

export async function getRestaurants(limit = 2000, city = "Москва"): Promise<RestaurantListResponse> {
  return publicGet<RestaurantListResponse>(`/restaurants?limit=${limit}&city=${encodeURIComponent(city)}`);
}
// Goals
const USER_GOALS_PATH = "/api/v1/goals";

export type UserGoalData = {
  user_id?: string;
  gender: 'male' | 'female' | null;
  age: number | null;
  weight: number | null;
  height: number | null;
  activity_level: 'low' | 'medium' | 'high' | 'very_high' | null;
  goal_type: 'lose_weight' | 'maintain_weight' | 'gain_weight' | null;
  target_calories: number | null;
  target_protein: number | null;
  target_fat: number | null;
  target_carbs: number | null;
  is_auto_calculated: boolean;
  updated_at?: string;
};

export async function fetchUserGoals(token: string) {
  return apiGet<{ ok: boolean; goals: UserGoalData | null }>(USER_GOALS_PATH, token);
}

export async function updateUserGoals(data: Partial<UserGoalData>, token: string) {
  return apiPut(USER_GOALS_PATH, data, token);
}

export async function apiPut<T = unknown>(path: string, body?: unknown, token?: string): Promise<T> {
  let res = await doFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }, token);

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      }, newToken);
    }
  }
  return handleResponse<T>(res);
}
