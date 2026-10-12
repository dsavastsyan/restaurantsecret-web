import assert from 'node:assert/strict'
import test from 'node:test'

import { CITY_GENITIVE, CITY_SLUGS, citySlug, isMappedCity } from '../src/lib/cityCatalog.js'

const normalizeCityName = (name) => name.trim().toLowerCase()

test('CITY_SLUGS and CITY_GENITIVE contain the same normalized city keys', () => {
  const slugs = new Set(Object.keys(CITY_SLUGS).map(normalizeCityName))
  const genitives = new Set(Object.keys(CITY_GENITIVE).map(normalizeCityName))

  assert.deepEqual(slugs, genitives)
})

test('city slugs are unique and URL-safe', () => {
  const slugs = Object.values(CITY_SLUGS)

  assert.equal(new Set(slugs).size, slugs.length)
  for (const slug of slugs) assert.match(slug, /^[a-z0-9-]+$/)
})

test('citySlug resolves mapped cities case-insensitively', () => {
  assert.equal(citySlug('омск'), 'omsk')
  assert.equal(citySlug('Омск'), 'omsk')
  assert.equal(citySlug('Москва'), 'moskva')
})

test('isMappedCity distinguishes mapped and unmapped cities', () => {
  assert.equal(isMappedCity('Омск'), true)
  assert.equal(isMappedCity('Несуществующий'), false)
})
