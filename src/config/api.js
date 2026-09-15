// Base URL for the RestaurantSecret API. Centralized here so the same value is
// reused by fetch helpers and hooks. Prefer the Vite-powered environment
// variables so CI workflows can point the frontend at staging or review
// backends without touching the source.
const FALLBACK_PD_API_BASE = 'https://pd.restaurantsecret.ru'
// The production browser catalog is same-origin so the gateway's Anubis
// clearance cookie covers both the page and its JSON requests. Mobile and
// authenticated PD endpoints intentionally keep their existing host.
const PRODUCTION_PUBLIC_API_BASE = '/api/catalog'
const STAGING_PUBLIC_API_BASE = 'https://restaurantsecret-api-staging.dsavastyan.workers.dev'

const env = typeof import.meta !== 'undefined' ? (import.meta.env ?? {}) : {}
const FALLBACK_PUBLIC_API_BASE = env.DEV ? STAGING_PUBLIC_API_BASE : PRODUCTION_PUBLIC_API_BASE
const configuredPublic =
    env.VITE_API_BASE_URL || env.VITE_API_BASE || env.VITE_API_URL || ''
const configuredPd = env.VITE_PD_API_BASE || ''

// Ensure the base URL never ends with a trailing slash so helpers can safely
// append paths.
const normalizedPublic = (configuredPublic || FALLBACK_PUBLIC_API_BASE).replace(/\/+$/, '')
const normalizedPd = (configuredPd || FALLBACK_PD_API_BASE).replace(/\/+$/, '')

export const API_BASE = normalizedPublic
export const PUBLIC_API_BASE = normalizedPublic
export const PD_API_BASE = normalizedPd
export const IS_PREVIEW = env.VITE_DEPLOY_ENV === 'preview'
