import assert from 'node:assert/strict'
import test from 'node:test'

import { collapseChainRestaurants, getChainSearchSuggestions } from '../src/lib/catalogChains.js'


test('catalog replaces physical chain branches with one hub card', () => {
  const items = [
    { slug: 'rebellion-home', name: 'Rebellion Home', chainSlug: 'rebellion', chainName: 'Rebellion', cuisine: 'Европейская' },
    { slug: 'rebellion-palace', name: 'Rebellion Palace', chainSlug: 'rebellion', chainName: 'Rebellion', cuisine: 'Европейская' },
    { slug: 'solo', name: 'Solo', chainSlug: null },
  ]

  assert.deepEqual(collapseChainRestaurants(items), [
    { isChainCard: true, slug: 'rebellion', name: 'Rebellion', cuisine: 'Европейская', chainCount: 2 },
    items[2],
  ])
})

test('a filtered chain branch still links to the hub instead of surfacing the branch', () => {
  const result = collapseChainRestaurants([
    { slug: 'syrovarnya-atrium', chainSlug: 'syrovarnya', chainName: 'Сыроварня' },
  ])

  assert.equal(result[0].isChainCard, true)
  assert.equal(result[0].slug, 'syrovarnya')
})

test('search suggestions contain each matching chain once with its location count', () => {
  const items = [
    { chainSlug: 'jonjoli', chainName: 'Джонджоли' },
    { chainSlug: 'jonjoli', chainName: 'Джонджоли' },
    { chainSlug: 'jondory', chainName: 'Джондори' },
    { slug: 'solo', name: 'Джон Донн', chainSlug: null },
  ]

  const suggestions = getChainSearchSuggestions(items, 'джон', {
    matchesQuery: (candidate, query) => candidate.toLowerCase().includes(query.toLowerCase()),
    getQueryScore: (candidate) => candidate === 'Джонджоли' ? 10 : 1,
  })

  assert.deepEqual(suggestions, [
    { slug: 'jonjoli', name: 'Джонджоли', locationsCount: 2 },
    { slug: 'jondory', name: 'Джондори', locationsCount: 1 },
  ])
})
