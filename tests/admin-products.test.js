import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPLETENESS_ISSUES,
  crawlStatus,
  formatWeeks,
  rejectedSummary,
  rejectedTotal,
  sortCrawlNetworks,
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

test('crawl networks sort problems first, then by queue priority', () => {
  const sorted = sortCrawlNetworks([
    { name: 'Лента', status: 'queued', priority: 2 },
    { name: 'Перекрёсток', status: 'ok', priority: 1 },
    { name: 'Дикси', status: 'slug_not_found', priority: 4 },
    { name: 'Азбука', status: 'queued', priority: 2 },
    { name: 'Магнит', status: 'captcha', priority: 3 },
  ])
  assert.deepEqual(sorted.map(({ name }) => name), ['Магнит', 'Дикси', 'Азбука', 'Лента', 'Перекрёсток'])
})

test('crawl status labels fall back for unknown codes', () => {
  assert.equal(crawlStatus('cooldown').label, 'Пауза после 429')
  assert.equal(crawlStatus('something_new').label, 'something_new')
  assert.equal(crawlStatus(undefined).label, '—')
})

test('rejected reasons are summarised by size with readable labels', () => {
  const rejected = { missing_complete_kbju: 1400, missing_package_weight_or_volume: 120, odd: 0, other_reason: 3 }
  assert.equal(rejectedSummary(rejected).startsWith('нет КБЖУ 1'), true)
  assert.match(rejectedSummary(rejected), /нет веса 120/)
  assert.doesNotMatch(rejectedSummary(rejected), /odd/)
  assert.equal(rejectedTotal(rejected), 1523)
  assert.equal(rejectedSummary({}), '')
})

test('backlog weeks format', () => {
  assert.equal(formatWeeks(null), '—')
  assert.equal(formatWeeks(0), 'нет очереди')
  assert.equal(formatWeeks(7.5), '7,5 нед.')
})
