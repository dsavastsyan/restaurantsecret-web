import { PD_API_BASE } from '../config/api.js'

const GOAL_CALC_V2 = 'goal_calc_v2'
const REQUEST_TIMEOUT_MS = 1500

let featureFlagsPromise

export function parseFeatureFlags(data) {
  const flags = data?.feature_flags
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {}
  return flags
}

export function isGoalCalcV2EnabledForFlags(flags) {
  return flags?.[GOAL_CALC_V2] === true
}

export async function loadFeatureFlags(fetchImplementation = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImplementation(`${PD_API_BASE}/api/v1/mobile-config?platform=web`, {
      signal: controller.signal,
    })
    if (!response.ok) return {}
    return parseFeatureFlags(await response.json())
  } catch {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}

export function fetchFeatureFlags() {
  if (!featureFlagsPromise) featureFlagsPromise = loadFeatureFlags()
  return featureFlagsPromise
}

export async function isGoalCalcV2Enabled() {
  return isGoalCalcV2EnabledForFlags(await fetchFeatureFlags())
}
