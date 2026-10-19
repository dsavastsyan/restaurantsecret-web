const env = typeof import.meta !== 'undefined' ? (import.meta.env ?? {}) : {}
const API_BASE = (env.VITE_RESTAURANT_API_BASE || (env.DEV ? 'https://tg.restaurantsecret.ru' : '')).replace(/\/+$/, '')

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error?.code || response.statusText)
    error.status = response.status
    error.code = data?.error?.code
    error.details = data
    throw error
  }
  return data
}

export const adminMenuHealthApi = {
  list: ({ tab, status = '', query = '', limit = 200, offset = 0 } = {}) => {
    const params = new URLSearchParams({ tab, limit: String(limit), offset: String(offset) })
    if (status) params.set('status', status)
    if (query) params.set('q', query)
    return request(`/api/admin/menu-health?${params}`)
  },
  get: (publicId) => request(`/api/admin/menu-health/${encodeURIComponent(publicId)}`),
}
