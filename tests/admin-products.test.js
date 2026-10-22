import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPLETENESS_ISSUES,
  VERDICTS,
  countVerdicts,
  matchesSourceQuery,
  percent,
  sortSources,
  toTime,
} from '../src/pages/admin/adminProducts.js'

test('product sources sort problems first', () => {
  const sorted = sortSources([
    { key: 'a', status: 'current' },
    { key: 'b', status: 'disabled' },
    { key: 'c', status: 'error' },
    { key: 'd', status: 'waiting' },
  ])
  assert.deepEqual(sorted.map(({ key }) => key), ['c', 'd', 'a', 'b'])
})

test('source search matches label, site, group and country', () => {
  const source = { label: 'ВкусВилл', url: 'https://vkusvill.ru', group: 'Ритейлеры', country: 'RU' }
  assert.equal(matchesSourceQuery(source, 'вкус'), true)
  assert.equal(matchesSourceQuery(source, 'vkusvill'), true)
  assert.equal(matchesSourceQuery(source, 'ru'), true)
  assert.equal(matchesSourceQuery(source, 'метро'), false)
  assert.equal(matchesSourceQuery(source, '  '), true)
})

test('pair verdicts are counted per tab', () => {
  assert.deepEqual(countVerdicts([{ verdict: 'review' }, { verdict: 'review' }, { verdict: 'accept' }]), { review: 2, reject: 0, accept: 1 })
  assert.deepEqual(Object.keys(VERDICTS), ['review', 'reject', 'accept'])
})

test('coverage percent and D1 timestamps', () => {
  assert.equal(percent(63802, 110906), '58%')
  assert.equal(percent(5491, 110906), '5,0%')
  assert.equal(percent(1, 0), '0%')
  assert.equal(toTime('2026-10-19 08:39:19'), Date.parse('2026-10-19T08:39:19Z'))
  assert.ok(Number.isNaN(toTime(null)))
})

test('UI copy has no trailing period', () => {
  const copy = [
    ...Object.values(VERDICTS).flatMap(({ label, hint }) => [label, hint]),
    ...Object.values(COMPLETENESS_ISSUES).flatMap(({ label, hint }) => [label, hint]),
  ]
  for (const text of copy) assert.doesNotMatch(text, /\.$/, text)
})
