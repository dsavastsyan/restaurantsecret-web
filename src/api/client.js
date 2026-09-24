// Tiny wrapper around fetch. Handles query parameters, JSON parsing errors,
// and provides typed errors for UI handling.
import { API_BASE } from '@/config/api';

const BASE = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
const URL_BASE = new URL(BASE, globalThis.location?.origin ?? 'http://localhost');
const DEFAULT_TIMEOUT_MS = 15_000;

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

const request = async (path, { method = 'GET', params = {}, body, headers = {}, timeout = DEFAULT_TIMEOUT_MS } = {}) => {
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
    if (!res.ok) throw createApiError(res.status, data?.message ?? res.statusText);
    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err?.name === 'AbortError') {
      throw createApiError(null, 'Request timed out', 'timeout');
    }

    if (err?.status || err?.kind) throw err;
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
  restaurants: (opts) => get('restaurants', opts),
  restaurantMap: (opts) => get('restaurants/map', opts),
  restaurant: (slug, city = 'Москва') => get(`restaurants/${encodeURIComponent(slug)}`, { city }),
  menu: (slug, city = 'Москва') => get(`restaurants/${encodeURIComponent(slug)}/menu`, { city }),
  search: (query, opts) => get('search', { query, ...opts }),
  post
};
