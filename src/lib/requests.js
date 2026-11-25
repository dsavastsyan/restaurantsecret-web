// REPO: restaurantsecret-web
// file: src/lib/requests.js
import { API_BASE } from '@/config/api';
import { solveCaptcha } from '@/lib/captchaChallenge';

// Normalize API paths so callers can pass either relative or absolute URLs.
function buildUrl(path) {
  if (!path) return API_BASE;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Basic GET helper that throws rich errors when the response is not OK.
export async function apiGet(path, opts = {}) {
  // `__captchaRetried` is our own bookkeeping, not a fetch option — strip it
  // before it reaches fetch().
  const { __captchaRetried, ...fetchOpts } = opts;
  const url = buildUrl(path);
  console.log('[apiGet]', url); // оставить на время отладки
  const res = await fetch(url, { ...fetchOpts });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let body = null;
    try { body = JSON.parse(text); } catch (_) { body = null; }

    // Anti-scraping gate (RestaurantSecret functions/index.js): once a
    // visitor's abuse score crosses the threshold, protected routes
    // (menu/card/search) ask for a Turnstile token instead of the data.
    // Solve it transparently and retry once so callers never see this —
    // before this, the request just died with a raw 403 (incident 2026-09-29).
    if (
      res.status === 403 &&
      body?.error === 'captcha_required' &&
      body?.sitekey &&
      !__captchaRetried
    ) {
      const token = await solveCaptcha(body.sitekey); // throws captcha_cancelled/captcha_error if unsolved
      return apiGet(path, {
        ...opts,
        __captchaRetried: true,
        headers: { ...(fetchOpts.headers || {}), 'X-Captcha-Token': token },
      });
    }

    const error = new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0,200)}`);
    error.status = res.status;
    // Callers that need to react to the error shape (not just log it) can
    // read `error.body` — e.g. the chain-base redirect hint on a retired
    // restaurant URL (`{ isChainBase, hubPath }`).
    error.body = body;
    // Normalized code for the known anti-abuse error shapes, so callers can
    // show "you've been rate-limited, try again in N seconds" instead of a
    // generic "failed to load" message.
    if (res.status === 429 && body?.error === 'temporarily_blocked') error.code = 'temporarily_blocked';
    else if (res.status === 429 && body?.error === 'rate_limited') error.code = 'rate_limited';
    else if (res.status === 403 && body?.error === 'captcha_required') error.code = 'captcha_required';
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
