import assert from 'node:assert/strict'
import test from 'node:test'
import { ADMIN_NAV, ADMIN_TOP_LEVEL } from '../src/pages/admin/adminNav.js'

test('admin navigation contains only populated wave 1 sections', () => {
  assert.deepEqual(ADMIN_TOP_LEVEL.map(({ label, to }) => ({ label, to })), [
    { label: 'Рестораны', to: '/admin/restaurants' },
    { label: 'Продукты', to: '/admin/products' },
    { label: 'Расходы', to: '/admin/costs' },
  ])

  assert.deepEqual(ADMIN_NAV.restaurants.sections.map(({ label, to }) => ({ label, to })), [
    { label: 'Сбор', to: '/admin/restaurants/collection' },
    { label: 'Актуальность', to: '/admin/restaurants/freshness/manual' },
    { label: 'Качество данных', to: '/admin/restaurants/quality/accuracy/kbju' },
    { label: 'Публикация', to: '/admin/restaurants/publication' },
  ])
  assert.deepEqual(ADMIN_NAV.products.sections.map(({ label, to }) => ({ label, to })), [
    { label: 'Актуальность', to: '/admin/products/freshness/duplicates' },
    { label: 'Качество данных', to: '/admin/products/quality/accuracy/kbju' },
  ])
  assert.deepEqual(ADMIN_NAV.costs.sections.map(({ label, to }) => ({ label, to })), [
    { label: 'Расходы Google', to: '/admin/costs/google' },
  ])
})
