import assert from 'node:assert/strict'
import test from 'node:test'
import { ADMIN_NAV, ADMIN_TOP_LEVEL } from '../src/pages/admin/adminNav.js'

test('admin navigation contains only populated sections', () => {
  assert.deepEqual(ADMIN_TOP_LEVEL.map(({ label, to }) => ({ label, to })), [
    { label: 'Рестораны', to: '/admin/restaurants' },
    { label: 'Продукты', to: '/admin/products' },
    { label: 'Расходы', to: '/admin/costs' },
  ])

  assert.deepEqual(ADMIN_NAV.restaurants.sections.map(({ label, to }) => ({ label, to })), [
    { label: 'Все рестораны', to: '/admin/restaurants/all' },
    { label: 'Сбор', to: '/admin/restaurants/collection' },
    { label: 'Актуальность', to: '/admin/restaurants/freshness/manual' },
    { label: 'Качество данных', to: '/admin/restaurants/quality/completeness' },
    { label: 'Публикация', to: '/admin/restaurants/publication' },
  ])
  const quality = ADMIN_NAV.restaurants.sections.find(({ key }) => key === 'quality')
  assert.deepEqual(quality.children.map(({ label }) => label), ['Полнота', 'Точность'])
  assert.deepEqual(ADMIN_NAV.products.sections.map(({ label, to }) => ({ label, to })), [
    { label: 'Сбор', to: '/admin/products/collection/retailers' },
    { label: 'Актуальность', to: '/admin/products/freshness/duplicates' },
    { label: 'Качество данных', to: '/admin/products/quality/completeness' },
  ])
  const productChildren = Object.fromEntries(ADMIN_NAV.products.sections.map(({ key, children }) => [key, children.map(({ label }) => label)]))
  assert.deepEqual(productChildren, {
    collection: ['Базы ритейлеров', 'Штрихкоды'],
    freshness: ['Сведение дубликатов', 'Сведение со штрихкодом'],
    quality: ['Полнота', 'Точность'],
  })
  assert.deepEqual(ADMIN_NAV.costs.sections.map(({ label, to }) => ({ label, to })), [
    { label: 'Расходы Google', to: '/admin/costs/google' },
  ])
})
