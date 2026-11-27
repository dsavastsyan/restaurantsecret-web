import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isGoalCalcV2EnabledForFlags,
  isPlainMenusEnabledForFlags,
  loadFeatureFlags,
  parseFeatureFlags,
} from '../src/lib/featureFlags.js'

test('разбирает флаги из ответа mobile-config', () => {
  assert.deepEqual(parseFeatureFlags({ feature_flags: { goal_calc_v2: true, another: false } }), {
    goal_calc_v2: true,
    another: false,
  })
})

test('читает plain_menus из data в текущем ответе mobile-config', async () => {
  const flags = await loadFeatureFlags((_url, { signal }) => new Promise((resolve, reject) => {
    // Staging mobile-config takes about 1.7 seconds from the Pages preview.
    const timer = setTimeout(() => resolve({
      ok: true,
      json: async () => ({ ok: true, data: { feature_flags: { plain_menus: true } } }),
    }), 1700)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('request aborted'))
    }, { once: true })
  }))

  assert.equal(isPlainMenusEnabledForFlags(flags), true)
})

test('по умолчанию goal_calc_v2 выключен', () => {
  assert.equal(isGoalCalcV2EnabledForFlags({}), false)
  assert.equal(isGoalCalcV2EnabledForFlags({ goal_calc_v2: false }), false)
  assert.equal(isGoalCalcV2EnabledForFlags({ goal_calc_v2: true }), true)
})

test('ошибка загрузки выключает флаги', async () => {
  const flags = await loadFeatureFlags(async () => {
    throw new Error('Сеть недоступна')
  })

  assert.deepEqual(flags, {})
  assert.equal(isGoalCalcV2EnabledForFlags(flags), false)
})
