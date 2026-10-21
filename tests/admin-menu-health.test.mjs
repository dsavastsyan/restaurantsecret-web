import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HEALTH_STATUS,
  buildHealthIndex,
  findHealthRecord,
  formatHealthDate,
  healthReasonLabel,
  truncateHealthSummary,
} from '../src/pages/admin/adminMenuHealth.js'

test('health status dictionary covers all API statuses', () => {
  assert.deepEqual(Object.keys(HEALTH_STATUS), ['ok', 'warning', 'needs_decision', 'pending'])
  assert.equal(HEALTH_STATUS.ok.label, 'Всё ок')
  assert.equal(HEALTH_STATUS.warning.label, 'Предупреждения')
  assert.equal(HEALTH_STATUS.needs_decision.label, 'Нужно ваше решение')
  assert.equal(HEALTH_STATUS.pending.label, 'Ждёт')
})

test('health reason codes are translated into user-facing Russian', () => {
  assert.equal(healthReasonLabel('dish_drop'), 'Резкое падение числа блюд')
  assert.equal(healthReasonLabel('no_cuisine', 'warning'), 'Не указана кухня')
  assert.equal(healthReasonLabel('kbju_assumption', 'warning'), 'КБЖУ с допущением')
  assert.equal(healthReasonLabel('unknown_reason'), 'Дополнительная проверка данных')
})

test('summary is truncated with an ellipsis and dates have a safe fallback', () => {
  assert.equal(truncateHealthSummary('Короткий текст'), 'Короткий текст')
  assert.equal(truncateHealthSummary('123456789', 6), '12345…')
  assert.equal(formatHealthDate('2026-10-18T10:00:00.000Z'), '18 окт. 2026 г.')
  assert.equal(formatHealthDate('not-a-date'), '—')
})

test('health records match by public id and safely fall back to unique name and city', () => {
  const records = [
    { publicId: 'rest-1', restaurant_name: 'Кафе «Липа»', city: 'Москва', status: 'ok' },
    { publicId: 'rest-2', restaurant_name: 'Соль', city: 'Казань', status: 'warning' },
  ]
  const index = buildHealthIndex(records)
  assert.equal(findHealthRecord({ public_id: 'rest-1', name: 'anything' }, index).status, 'ok')
  assert.equal(findHealthRecord({ name: 'Соль', cities: ['Казань'] }, index).status, 'warning')
  assert.equal(findHealthRecord({ name: 'Нет такого', cities: ['Москва'] }, index), null)
})
