import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { calculateTargets } from '../src/lib/calculatorCore.js'
import { activityLevelFor, calculateGoal } from '../src/lib/goalCalc.js'

const fixtureUrl = new URL('./fixtures/goal-calc-v2-cases.json', import.meta.url)
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'))

function assertResult(actual, expected, path = 'result') {
  if (typeof expected === 'number' && !Number.isInteger(expected)) {
    assert.ok(Math.abs(actual - expected) <= 1e-9, `${path}: ожидалось ${expected}, получено ${actual}`)
    return
  }
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${path}.length`)
    expected.forEach((value, index) => assertResult(actual[index], value, `${path}[${index}]`))
    return
  }
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), `${path}: набор полей`)
    for (const [key, value] of Object.entries(expected)) {
      assertResult(actual[key], value, `${path}.${key}`)
    }
    return
  }
  assert.equal(actual, expected, path)
}

test('считает все общие примеры goal_calc_v2', () => {
  for (const example of fixture.cases) {
    assertResult(calculateGoal(example.input), example.expected, example.name)
  }
})

test('определяет активность по типу работы и тренировкам', () => {
  for (const example of fixture.activityTable) {
    assert.equal(activityLevelFor(example.work, example.workouts), example.level)
  }
})

test('считает план похудения для женщины 35 лет', () => {
  const result = calculateGoal({
    gender: 'female', age: 35, weight: 80, height: 165, activityLevel: 'low', goal: 'lose_weight',
  })
  assert.deepEqual(
    { bmr: result.bmr, expenditure: result.expenditure, calories: result.calories, deficit: result.deficit,
      rangeLow: result.rangeLow, rangeHigh: result.rangeHigh, protein: result.protein },
    { bmr: 1495, expenditure: 2093, calories: 1600, deficit: 500, rangeLow: 1350, rangeHigh: 1850, protein: 128 },
  )
})

test('считает расход и норму для мужчины 35 лет', () => {
  const result = calculateGoal({
    gender: 'male', age: 35, weight: 90, height: 180, activityLevel: 'low', goal: 'lose_weight',
  })
  assert.deepEqual({ expenditure: result.expenditure, calories: result.calories }, { expenditure: 2597, calories: 2100 })
})

test('ограничивает норму нижней границей', () => {
  const result = calculateGoal({
    gender: 'female', age: 50, weight: 55, height: 155, activityLevel: 'low', goal: 'lose_weight',
  })
  assert.deepEqual({ calories: result.calories, deficit: result.deficit }, { calories: 1200, deficit: 351 })
})

test('ограничивает расчётный вес белка при ИМТ от 30', () => {
  const result = calculateGoal({
    gender: 'female', age: 40, weight: 130, height: 165, activityLevel: 'low', goal: 'lose_weight',
  })
  assert.equal(result.protein, 109)
  assert.ok(result.carbs > 0)
})

test('считает maintain и maintain_weight одинаково', () => {
  const input = { gender: 'female', age: 28, weight: 62, height: 168, activityLevel: 'medium' }
  const maintain = calculateGoal({ ...input, goal: 'maintain' })
  const maintainWeight = calculateGoal({ ...input, goal: 'maintain_weight' })

  assert.deepEqual(maintain, maintainWeight)
  assert.equal(maintain.effectiveGoal, 'maintain_weight')
})

test('без флага сохраняет старый расчёт', () => {
  const result = calculateTargets({
    gender: 'female', age: 35, weight: 80, height: 165, activity: 'low', goal: 'lose_weight',
  })

  assert.deepEqual(result, {
    bmr: 1495,
    tdee: 1794,
    calories: 1435,
    protein: 160,
    fat: 72,
    carbs: 37,
  })
})

test('с включённым флагом адаптирует новый расчёт к прежней форме', () => {
  const result = calculateTargets({
    gender: 'female', age: 35, weight: 80, height: 165, activity: 'low', goal: 'lose_weight',
  }, { v2: true })

  assert.deepEqual(result, {
    bmr: 1495,
    tdee: 2093,
    calories: 1600,
    protein: 128,
    fat: 44,
    carbs: 173,
  })
})
