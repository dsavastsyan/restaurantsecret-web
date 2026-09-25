// REPO: restaurantsecret-web
// file: src/lib/requests.js
import { API_BASE } from '@/config/api';

// Normalize API paths so callers can pass either relative or absolute URLs.
function buildUrl(path) {
  if (!path) return API_BASE;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Basic GET helper that throws rich errors when the response is not OK.
export async function apiGet(path, opts = {}) {
  const url = buildUrl(path);
  console.log('[apiGet]', url); // оставить на время отладки
  const res = await fetch(url, { ...opts });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0,200)}`);
    error.status = res.status;
    // Callers that need to react to the error shape (not just log it) can
    // read `error.body` — e.g. the chain-base redirect hint on a retired
    // restaurant URL (`{ isChainBase, hubPath }`).
    try { error.body = JSON.parse(text); } catch (_) { error.body = null; }
    throw error;
  }
  // пытаемся json
  return res.json();
}

// Basic POST helper used by internal tools and mock payment confirmations.
export async function apiPost(path, body, opts = {}) {
  const url = buildUrl(path);
  console.log('[apiPost]', url);
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body ?? {}), headers, ...opts });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0,200)}`);
  }
  return res.json();
}
