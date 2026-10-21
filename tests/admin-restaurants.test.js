import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRestaurantRecords,
  completenessIssues,
  manualFreshness,
  menuChangedSinceCheck,
  orderWithLeadGroups,
  parserFreshness,
  pluralDishes,
  restaurantPath,
} from '../src/pages/admin/adminRestaurants.js'

const manual = (overrides = {}) => ({
  slug: 'loulou',
  name: 'Loulou',
  cities: ['Москва'],
  source_type: 'website_cards',
  source_url: 'https://loulou.test/menu',
  last_checked_at: '2026-10-10 10:00:00',
  status: 'current',
  lead_id: null,
  dm_state: 'none',
  kbju_stale: false,
  notes: null,
  ...overrides,
})

test('manual freshness: KBJU lag wins over a changed menu, a changed menu over the 90-day status', () => {
  const changedLater = { last_changed_at: '2026-10-15 08:00:00' }
  const changedEarlier = { last_changed_at: '2026-10-01T08:00:00Z' }
  assert.equal(manualFreshness(manual({ kbju_stale: true }), changedLater), 'kbju_stale')
  assert.equal(manualFreshness(manual(), changedLater), 'menu_changed')
  assert.equal(manualFreshness(manual(), changedEarlier), 'current')
  assert.equal(manualFreshness(manual({ status: 'needs_check' }), null), 'needs_check')
  assert.equal(manualFreshness(manual({ status: 'source_missing' }), null), 'source_missing')
  assert.equal(manualFreshness(null, null), 'unknown')
  assert.equal(menuChangedSinceCheck(manual({ last_checked_at: null }), changedEarlier), true)
  assert.equal(menuChangedSinceCheck(manual(), { last_changed_at: null }), false)
})

test('parser freshness takes the most urgent parser of the menu', () => {
  assert.equal(parserFreshness([{ freshness: { status: 'current' } }, { freshness: { status: 'error' } }]), 'parser_error')
  assert.equal(parserFreshness([{ freshness: { status: 'disabled' } }]), 'parser_disabled')
  assert.equal(parserFreshness([]), 'unknown')
})

test('completeness lists missing sources, dishes without KBJU and health gaps only from available data', () => {
  const issues = completenessIssues({
    manual: manual({ source_type: null, source_url: null, notes: 'Хайлайтов нет, сайт без КБЖУ' }),
    menuSource: null,
    health: { reasons: ['few_dishes', 'wait_location'], warnings: ['no_cuisine', 'no_instagram'] },
    isParser: false,
  })
  assert.deepEqual(issues.map(({ code }) => code), ['kbju_source_missing', 'menu_source_missing', 'few_dishes', 'no_location', 'no_cuisine', 'no_instagram'])
  assert.equal(issues[0].note, 'Хайлайтов нет, сайт без КБЖУ')

  const withSource = completenessIssues({ manual: manual(), menuSource: { catalog_missing_count: 3 }, health: null, isParser: false })
  assert.deepEqual(withSource, [{ code: 'catalog_missing', label: 'На сайте 3 блюда без КБЖУ', count: 3 }])
  assert.deepEqual(completenessIssues({ manual: null, menuSource: null, health: {}, isParser: true }), [])
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(pluralDishes), ['блюдо', 'блюда', 'блюд', 'блюд', 'блюдо', 'блюда', 'блюд'])
})

test('records join every admin source by slug', () => {
  const records = buildRestaurantRecords({
    restaurants: [
      { slug: 'loulou', name: 'Loulou', cities: ['Москва'], parsers: [], public_menu_url: '/restaurants/loulou/menu' },
      { slug: 'sage', name: 'Sage', cities: ['Казань'], parsers: ['sage'], public_menu_url: '/restaurants/sage/menu' },
    ],
    manualMenus: [manual({ lead_id: 7, kbju_stale: true })],
    menuSources: [{ slug: 'loulou', source_type: 'website_cards', source_url: 'https://loulou.test', catalog_missing_count: 2 }],
    parsers: [{ parser_id: 'sage', restaurant_slug: 'sage', freshness: { status: 'error' } }],
    healthRecords: [{ publicId: 'rest-sage', restaurant_name: 'Sage', city: 'Казань', status: 'needs_decision', reasons: ['few_dishes'] }],
    leads: [{ id: 7, name: 'Loulou Group' }],
    kbjuFlags: [{ restaurant_name: 'Loulou' }, { restaurant_name: 'loulou' }],
    attributeReviews: [{ restaurant_slug: 'sage' }],
  })
  const bySlug = Object.fromEntries(records.map((record) => [record.slug, record]))

  assert.equal(bySlug.loulou.kind, 'manual')
  assert.equal(bySlug.loulou.freshness, 'kbju_stale')
  assert.equal(bySlug.loulou.lead.name, 'Loulou Group')
  assert.deepEqual(bySlug.loulou.completeness.map(({ code }) => code), ['catalog_missing'])
  assert.deepEqual(bySlug.loulou.accuracy.map(({ label }) => label), ['Странные КБЖУ: 2'])

  assert.equal(bySlug.sage.kind, 'parser')
  assert.equal(bySlug.sage.freshness, 'parser_error')
  assert.equal(bySlug.sage.health.publicId, 'rest-sage')
  assert.deepEqual(bySlug.sage.completeness.map(({ code }) => code), ['few_dishes'])
  assert.deepEqual(bySlug.sage.accuracy.map(({ code }) => code), ['attribute_reviews', 'health_decision'])
})

test('branch menus of one lead stay next to each other at the position of the most urgent one', () => {
  const items = [
    { slug: 'a', name: 'A', lead_id: null, rank: 2 },
    { slug: 'b-arbat', name: 'B Арбат', lead_id: 5, rank: 3 },
    { slug: 'c', name: 'C', lead_id: null, rank: 1 },
    { slug: 'b-kazan', name: 'B Казань', lead_id: 5, rank: 0 },
  ]
  const groups = orderWithLeadGroups(items, (left, right) => left.rank - right.rank)
  assert.deepEqual(groups.map((group) => group.items.map(({ slug }) => slug)), [['b-kazan', 'b-arbat'], ['c'], ['a']])
  assert.equal(groups[0].lead_id, 5)
})

test('restaurant page path is under the «Все рестораны» tab', () => {
  assert.equal(restaurantPath('кафе пушкин'), '/admin/restaurants/all/%D0%BA%D0%B0%D1%84%D0%B5%20%D0%BF%D1%83%D1%88%D0%BA%D0%B8%D0%BD')
})
