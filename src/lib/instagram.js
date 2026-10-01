const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com'])

export const normalizeInstagramUrl = (rawUrl) => {
  if (!rawUrl) return null

  let text = String(rawUrl).trim()
  if (!text || text === '-' || text === '—') return null
  if (text.startsWith('@')) text = `instagram.com/${text.slice(1)}`

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`

  try {
    const parsed = new URL(withProtocol)
    if (!/^https?:$/i.test(parsed.protocol) || !INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) return null

    const path = parsed.pathname.replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
    return path ? `https://www.instagram.com/${path}/` : null
  } catch (_) {
    return null
  }
}
