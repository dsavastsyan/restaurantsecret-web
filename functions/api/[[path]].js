const STAGING_API_ORIGIN = 'https://restaurantsecret-api-staging.dsavastyan.workers.dev'
const PREVIEW_API_PREFIX = '/api'
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
  const upstreamPath = incomingUrl.pathname.slice(PREVIEW_API_PREFIX.length) || '/'
  const upstreamUrl = new URL(STAGING_API_ORIGIN)
  upstreamUrl.pathname = upstreamPath
  upstreamUrl.search = incomingUrl.search

  return upstreamUrl
}

function buildUpstreamHeaders(requestHeaders) {
  const upstreamHeaders = new Headers()

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = requestHeaders.get(headerName)
    if (value) upstreamHeaders.set(headerName, value)
  }

  return upstreamHeaders
}

export async function onRequest(context) {
  const { request } = context
  const method = request.method.toUpperCase()

  try {
    const upstreamRequest = new Request(buildStagingApiUrl(request.url), {
      method,
      headers: buildUpstreamHeaders(request.headers),
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
