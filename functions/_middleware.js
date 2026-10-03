export async function onRequest(context) {
  const response = await context.next()
  if (context.env.PREVIEW_AUTH_ENABLED !== 'true') return response

  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
