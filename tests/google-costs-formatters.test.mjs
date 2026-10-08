import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatGoogleDays,
  formatGoogleMoney,
  formatGooglePercent,
} from '../src/pages/admin/googleCostsFormatters.js'

test('Google costs formatters use Russian number formatting and pound prefix', () => {
  assert.equal(formatGoogleMoney(226.17), '£226,17')
  assert.equal(formatGooglePercent(0.75), '75,00%')
  assert.equal(formatGoogleDays(14), '14 дн.')
})
