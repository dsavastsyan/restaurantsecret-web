const env = typeof import.meta !== 'undefined' ? (import.meta.env ?? {}) : {}
const API_BASE = (env.VITE_RESTAURANT_API_BASE || (env.DEV ? 'https://tg.restaurantsecret.ru' : '')).replace(/\/+$/, '')
const CSRF_HEADER = 'X-CSRF-Token'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let csrfToken = null

function updateCsrfToken(data) {
  if (data?.csrf_token) csrfToken = data.csrf_token
}

async function request(path, {
  method = 'GET',
  body,
  form = false,
  responseType = 'json',
} = {}) {
  const normalizedMethod = method.toUpperCase()
  const csrfHeaders = csrfToken && UNSAFE_METHODS.has(normalizedMethod)
    ? { [CSRF_HEADER]: csrfToken }
    : {}
  const response = await fetch(`${API_BASE}${path}`, {
    method: normalizedMethod,
    credentials: 'include',
    headers: {
      Accept: responseType === 'json' ? 'application/json' : '*/*',
      ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
      ...csrfHeaders,
    },
    body: form ? body : body ? JSON.stringify(body) : undefined,
  })
  if (responseType === 'blob' && response.ok) return response.blob()
  const data = await response.json().catch(() => null)
  updateCsrfToken(data)
  if (!response.ok) {
    if (data?.error?.code === 'csrf_token_invalid') csrfToken = null
    const error = new Error(data?.error?.message || data?.error?.code || response.statusText)
    error.status = response.status
    error.code = data?.error?.code
    error.details = data
    throw error
  }
  return data
}

export const adminMenuRevisionsApi = {
  login: (key) => request('/api/admin/auth/login', { method: 'POST', body: { key } }),
  me: () => request('/api/admin/auth/me'),
  logout: () => request('/api/admin/auth/logout', { method: 'POST' }),
  list: ({ status = '', query = '' } = {}) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (query) params.set('query', query)
    return request(`/api/admin/menu-revisions${params.size ? `?${params}` : ''}`)
  },
  get: (revisionId) => request(`/api/admin/menu-revisions/${encodeURIComponent(revisionId)}`),
  updateComment: (revisionId, internalComment, lockVersion) =>
    request(`/api/admin/menu-revisions/${encodeURIComponent(revisionId)}`, {
      method: 'PATCH',
      body: { internal_comment: internalComment, lock_version: lockVersion },
    }),
  requestClarification: (revisionId, message) =>
    request(`/api/admin/menu-revisions/${encodeURIComponent(revisionId)}/clarification`, {
      method: 'POST',
      body: { message },
    }),
  uploadNormalized: (revisionId, file) => {
    const form = new FormData()
    form.append('file', file)
    return request(`/api/admin/menu-revisions/${encodeURIComponent(revisionId)}/normalized`, {
      method: 'POST',
      body: form,
      form: true,
    })
  },
  fileBlob: (fileId, download = false) =>
    request(
      `/api/admin/menu-revision-files/${encodeURIComponent(fileId)}${download ? '?download=1' : ''}`,
      { responseType: 'blob' },
    ),
  excelPreview: (fileId) =>
    request(`/api/admin/menu-revision-files/${encodeURIComponent(fileId)}/preview`),
  restaurants: ({ city = '', menuStatus = '', partnership = '', requiresAction = false, query = '' } = {}) => {
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    if (menuStatus) params.set('menu_status', menuStatus)
    if (partnership) params.set('partnership', partnership)
    if (requiresAction) params.set('requires_action', '1')
    if (query) params.set('query', query)
    return request(`/api/admin/restaurants${params.size ? `?${params}` : ''}`)
  },
  parserRuns: () => request('/api/admin/parser-runs'),
  manualMenus: () => request('/api/admin/manual-menu-freshness'),
  updateManualMenuSource: (slug, body) =>
    request(`/api/admin/manual-menu-freshness/${encodeURIComponent(slug)}/source`, {
      method: 'PATCH',
      body,
    }),
  confirmManualMenu: (slug) =>
    request(`/api/admin/manual-menu-freshness/${encodeURIComponent(slug)}/confirm`, {
      method: 'POST',
    }),
  createRestaurant: (body) => request('/api/admin/restaurants', { method: 'POST', body }),
  updateRestaurant: (slug, body) =>
    request(`/api/admin/restaurants/${encodeURIComponent(slug)}`, { method: 'PATCH', body }),
  addRestaurantContact: (slug, email, sendInvite = false) =>
    request(`/api/admin/restaurants/${encodeURIComponent(slug)}/contacts`, {
      method: 'POST',
      body: { email, send_invite: sendInvite },
    }),
  deleteRestaurantContact: (slug, userId) =>
    request(`/api/admin/restaurants/${encodeURIComponent(slug)}/contacts/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
  inviteRestaurantContact: (slug, userId, sendEmail = true) =>
    request(`/api/admin/restaurants/${encodeURIComponent(slug)}/contacts/${encodeURIComponent(userId)}/invite`, {
      method: 'POST',
      body: { send_email: sendEmail },
    }),
  setRestaurantAccess: (slug, blocked) =>
    request(`/api/admin/restaurants/${encodeURIComponent(slug)}/access`, {
      method: 'PATCH',
      body: { blocked },
    }),
  productMatches: (status = 'pending') => {
    const params = new URLSearchParams({ status })
    return request(`/api/admin/product-matches?${params}`)
  },
  decideProductMatch: (matchId, decision) =>
    request(`/api/admin/product-matches/${encodeURIComponent(matchId)}/decision`, {
      method: 'POST',
      body: { decision },
    }),
  kbjuFlaggedProducts: () => request('/api/admin/kbju-flagged-products'),
  kbjuFlaggedRestaurantItems: () => request('/api/admin/kbju-flagged-restaurant-items'),
  approveKbjuFlag: (kind, itemId) =>
    request(`/api/admin/kbju-flags/${encodeURIComponent(kind)}/${encodeURIComponent(itemId)}/approve`, {
      method: 'POST',
    }),
  restaurantAttributeReviews: (status = 'pending', { field = '', city = '' } = {}) => {
    const params = new URLSearchParams({ status })
    if (field) params.set('field', field)
    if (city) params.set('city', city)
    return request(`/api/admin/restaurant-attribute-reviews?${params}`)
  },
  decideRestaurantAttributeReview: (reviewId, decision, value) =>
    request(`/api/admin/restaurant-attribute-reviews/${encodeURIComponent(reviewId)}/decision`, {
      method: 'POST',
      body: value === undefined ? { decision } : { decision, value },
    }),
  searchRestaurants: (query) => {
    const params = new URLSearchParams({ query })
    return request(`/api/admin/restaurants/search?${params}`)
  },
  patchRestaurantById: (restaurantId, body) =>
    request(`/api/admin/restaurants/by-id/${encodeURIComponent(restaurantId)}`, {
      method: 'PATCH',
      body,
    }),
  outreach: ({ city = '' } = {}) => {
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    return request(`/api/admin/outreach${params.size ? `?${params}` : ''}`)
  },
  importOutreach: (city) => request('/api/admin/outreach/import', { method: 'POST', body: { city } }),
  updateOutreach: (candidateId, body) =>
    request(`/api/admin/outreach/${encodeURIComponent(candidateId)}`, { method: 'PATCH', body }),
}
