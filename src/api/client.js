// Tiny wrapper around fetch. Handles query parameters, JSON parsing errors,
// and provides typed errors for UI handling.
import { API_BASE, IS_PREVIEW } from '@/config/api';
import { solveCaptcha } from '@/lib/captchaChallenge';

const BASE = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
const URL_BASE = new URL(BASE, globalThis.location?.origin ?? 'http://localhost');
// Staging D1 is intentionally smaller and less provisioned than production;
// its full catalog query can exceed 15 seconds while a preview or local smoke
// test is under CI load. Local Vite uses the staging URL without setting the
// preview flag, so identify that backend explicitly as well.
const IS_STAGING_API = URL_BASE.hostname === 'restaurantsecret-api-staging.dsavastyan.workers.dev';
const DEFAULT_TIMEOUT_MS = IS_PREVIEW || IS_STAGING_API ? 30_000 : 15_000;

const createApiError = (status, message, kind) => ({
  status,
  message,
  kind: kind ?? (status >= 500 ? 'server' : status >= 400 ? 'client' : 'unknown')
});

const parseJsonResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';

  if (res.status === 204) return null;
  if (!contentType.includes('application/json')) {
    throw createApiError(res.status, 'Unexpected response format', 'invalid_json');
  }

  try {
    return await res.json();
  } catch (_) {
    throw createApiError(res.status, 'Failed to parse response', 'invalid_json');
  }
};

const request = async (path, {
  method = 'GET',
  params = {},
  body,
  headers = {},
  timeout = DEFAULT_TIMEOUT_MS,
  captchaRetried = false,
} = {}) => {
  const url = new URL(path, URL_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await parseJsonResponse(res);
    if (!res.ok) {
      const captchaRequired = res.status === 403
        && data?.error === 'captcha_required'
        && typeof data?.sitekey === 'string'
        && data.sitekey;

      if (captchaRequired && !captchaRetried) {
        const token = await solveCaptcha(data.sitekey);
        return request(path, {
          method,
          params,
          body,
          headers: { ...headers, 'X-Captcha-Token': token },
          timeout,
          captchaRetried: true,
        });
      }

      const message = typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
          ? data.error
          : res.statusText;
      const error = createApiError(res.status, message);
      error.code = typeof data?.error === 'string' ? data.error : undefined;
      error.details = data;
      throw error;
    }
    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err?.name === 'AbortError') {
      throw createApiError(null, 'Request timed out', 'timeout');
    }

    if (err?.status || err?.kind || err?.code) throw err;
    throw createApiError(null, err?.message ?? 'Network error', 'network');
  }
};

async function get(path, params = {}) {
  return request(path, { method: 'GET', params });
}

async function post(path, body, options = {}) {
  const { headers, timeout, params } = options;
  return request(path, { method: 'POST', body, headers, timeout, params });
}

// Export a small client surface the rest of the app can use.
export const api = {
  cities: () => get('cities'),
  detectedCity: () => get('location'),
  filters: (city = 'Москва') => get('filters', { city }),
  metro: () => get('metro'),
  geocode: (query, city) => get('geocode', { query, city }),
  restaurants: (opts) => get('restaurants', opts),
  restaurantMap: (opts) => get('restaurants/map', opts),
  restaurant: (slug, city = 'Москва') => get(`restaurants/${encodeURIComponent(slug)}`, { city }),
  menu: (slug, city = 'Москва') => get(`restaurants/${encodeURIComponent(slug)}/menu`, { city }),
  search: (query, opts) => get('search', { query, ...opts }),
  post
};
