const ALLOWED_PERSONAS = new Set(['free', 'active', 'expired', 'canceled'])

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  },
})

export async function onRequestPost(context) {
  const { request, env } = context
  if (
    env.PREVIEW_AUTH_ENABLED !== 'true'
    || typeof env.PREVIEW_AUTH_SECRET !== 'string'
    || typeof env.PREVIEW_PD_API_BASE !== 'string'
  ) {
    return json({ ok: false, error: 'not_found' }, 404)
  }

  const requestUrl = new URL(request.url)
  const origin = request.headers.get('Origin')
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if ((origin && origin !== requestUrl.origin) || fetchSite === 'cross-site') {
    return json({ ok: false, error: 'forbidden' }, 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400)
  }

  if (!body || !ALLOWED_PERSONAS.has(body.persona) || Object.keys(body).some((key) => key !== 'persona')) {
    return json({ ok: false, error: 'invalid_persona' }, 400)
  }

  const upstreamBase = env.PREVIEW_PD_API_BASE.replace(/\/+$/, '')
  let upstream
  try {
    upstream = await fetch(`${upstreamBase}/internal/preview-auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'restaurantsecret-web-preview',
        'X-Preview-Auth-Secret': env.PREVIEW_AUTH_SECRET,
      },
      body: JSON.stringify({ persona: body.persona }),
    })
  } catch {
    return json({ ok: false, error: 'preview_auth_unavailable' }, 502)
  }

  const payload = await upstream.json().catch(() => null)
  if (!upstream.ok || !payload?.access_token) {
    return json({ ok: false, error: 'preview_auth_failed' }, upstream.status >= 500 ? 502 : 401)
  }

  return json({
    ok: true,
    persona: body.persona,
    access_token: payload.access_token,
    expires_in: payload.expires_in,
    onboarding_completed: Boolean(payload.onboarding_completed),
  })
}

export function onRequest() {
  return json({ ok: false, error: 'method_not_allowed' }, 405)
}

export { ALLOWED_PERSONAS }
