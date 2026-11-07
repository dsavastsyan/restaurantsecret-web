import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isGoalCalcV2EnabledForFlags,
  loadFeatureFlags,
  parseFeatureFlags,
} from '../src/lib/featureFlags.js'

test('разбирает флаги из ответа mobile-config', () => {
  assert.deepEqual(parseFeatureFlags({ feature_flags: { goal_calc_v2: true, another: false } }), {
    goal_calc_v2: true,
    another: false,
  })
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
