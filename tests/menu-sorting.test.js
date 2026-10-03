import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDefaultMenuSort,
  sortMenuDishes,
  toggleMenuSortDirection,
} from '../src/lib/menuSorting.js'

const dish = (name, values) => ({ name, ...values })

test('defaults to calories ascending and keeps missing values last', () => {
  const result = sortMenuDishes([
    dish('Без КБЖУ', { kcal: Number.NaN }),
    dish('Среднее', { kcal: 450 }),
    dish('Лёгкое', { kcal: 180 }),
  ], createDefaultMenuSort())

  assert.deepEqual(result.map(({ name }) => name), ['Лёгкое', 'Среднее', 'Без КБЖУ'])
})

test('uses descending as the default direction for protein', () => {
  const result = sortMenuDishes([
    dish('Мало белка', { protein: 8 }),
    dish('Много белка', { protein: 32 }),
    dish('Средне белка', { protein: 18 }),
  ], { field: 'protein', direction: 'desc' })

  assert.deepEqual(result.map(({ name }) => name), ['Много белка', 'Средне белка', 'Мало белка'])

  const ascending = sortMenuDishes([
    dish('Мало белка', { protein: 8 }),
    dish('Много белка', { protein: 32 }),
  ], { field: 'protein', direction: 'asc' })
  assert.deepEqual(ascending.map(({ name }) => name), ['Мало белка', 'Много белка'])
})

test('toggles the selected direction without changing the metric', () => {
  assert.equal(toggleMenuSortDirection('asc'), 'desc')
  assert.equal(toggleMenuSortDirection('desc'), 'asc')
})
