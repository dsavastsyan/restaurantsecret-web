const STAGING_API_ORIGIN = 'https://restaurantsecret-api-staging.dsavastyan.workers.dev'
const PREVIEW_API_PREFIX = '/api'
const ADMIN_API_PREFIX = '/api/admin'
const PAGES_PRODUCTION_HOSTNAME = 'restaurantsecret-web.pages.dev'
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'if-none-match',
  'x-actor-ref',
  'x-catalog-token',
  'x-request-id',
]

export function buildStagingApiUrl(requestUrl) {
  const incomingUrl = new URL(requestUrl)
  // Public catalog endpoints are exposed without `/api` by the staging Worker,
  // while the internal admin API intentionally keeps `/api/admin`. Preserve
  // that prefix so the preview does not accidentally request `/admin/*`.
  const upstreamPath = incomingUrl.pathname.startsWith(`${ADMIN_API_PREFIX}/`)
    ? incomingUrl.pathname
    : incomingUrl.pathname.slice(PREVIEW_API_PREFIX.length) || '/'
  const upstreamUrl = new URL(STAGING_API_ORIGIN)
  upstreamUrl.pathname = upstreamPath
  upstreamUrl.search = incomingUrl.search

  return upstreamUrl
}

export function isPreviewHostname(hostname) {
  return hostname.endsWith('.restaurantsecret-web.pages.dev') && hostname !== PAGES_PRODUCTION_HOSTNAME
}

function buildUpstreamHeaders(requestHeaders, { adminRequest = false } = {}) {
  const upstreamHeaders = new Headers()

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = requestHeaders.get(headerName)
    if (value) upstreamHeaders.set(headerName, value)
  }

  // The admin login response sets an HttpOnly cookie on the Pages hostname.
  // Forward only admin-session credentials back to the trusted staging Worker;
  // public catalog requests continue to drop browser cookies.
  if (adminRequest) {
    const cookie = (requestHeaders.get('cookie') || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('rs_admin_session='))
    const csrfToken = requestHeaders.get('x-csrf-token')
    if (cookie) upstreamHeaders.set('cookie', cookie)
    if (csrfToken) upstreamHeaders.set('x-csrf-token', csrfToken)
  }

  return upstreamHeaders
}

export async function onRequest(context) {
  const { request } = context
  if (!isPreviewHostname(new URL(request.url).hostname)) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  const method = request.method.toUpperCase()
  const adminRequest = new URL(request.url).pathname.startsWith(`${ADMIN_API_PREFIX}/`)

  try {
    const upstreamRequest = new Request(buildStagingApiUrl(request.url), {
      method,
      headers: buildUpstreamHeaders(request.headers, { adminRequest }),
      body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
    })
    const upstreamResponse = await fetch(upstreamRequest)
    const response = new Response(upstreamResponse.body, upstreamResponse)
    response.headers.set('X-Preview-API-Proxy', 'staging')
    return response
  } catch {
    return Response.json(
      { error: 'STAGING_API_UNAVAILABLE' },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
          'X-Preview-API-Proxy': 'staging',
        },
      },
    )
  }
}
