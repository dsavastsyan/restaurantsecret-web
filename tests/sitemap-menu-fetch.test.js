import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchRestaurantMenus } from '../scripts/generate-sitemap.js'

const noSleep = async () => {}
const overloaded = () => Object.assign(new Error('500 Internal Server Error'), { retryable: true })
const notFound = () => Object.assign(new Error('404 Not Found'), { retryable: false })
const restaurants = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: '' }]

function quiet(fn) {
  const { log, warn } = console
  console.log = () => {}
  console.warn = () => {}
  return fn().finally(() => {
    console.log = log
    console.warn = warn
  })
}

test('menu fetch retries a retryable 5xx and keeps the menu', () =>
  quiet(async () => {
    const calls = new Map()
    const fetchMenu = async (slug) => {
      const n = (calls.get(slug) ?? 0) + 1
      calls.set(slug, n)
      if (slug === 'b' && n < 3) throw overloaded()
      return { slug }
    }
    const menus = await fetchRestaurantMenus(restaurants, { fetchMenu, sleep: noSleep, retries: 3 })
    assert.deepEqual([...menus.keys()].sort(), ['a', 'b', 'c'])
    assert.equal(calls.get('b'), 3)
  }))

test('menu fetch does not retry a 404', () =>
  quiet(async () => {
    let calls = 0
    const fetchMenu = async (slug) => {
      if (slug === 'b') {
        calls += 1
        throw notFound()
      }
      return { slug }
    }
    const menus = await fetchRestaurantMenus(restaurants, { fetchMenu, sleep: noSleep, retries: 3 })
    assert.equal(calls, 1)
    assert.equal(menus.has('b'), false)
    assert.equal(menus.size, 2)
  }))

test('a burst that outlasts the per-request retries is recovered by the final pass', () =>
  quiet(async () => {
    let overloadActive = true
    const sleeps = []
    const sleep = async (ms) => {
      sleeps.push(ms)
      if (ms >= 10000) overloadActive = false // the long pause before the final pass
    }
    const fetchMenu = async (slug) => {
      if (slug === 'c' && overloadActive) throw overloaded()
      return { slug }
    }
    const menus = await fetchRestaurantMenus(restaurants, { fetchMenu, sleep, retries: 2, finalPassPauseMs: 10000 })
    assert.equal(menus.size, 3)
    assert.ok(sleeps.includes(10000))
  }))

test('a menu that keeps failing is reported, not thrown', () =>
  quiet(async () => {
    const fetchMenu = async (slug) => {
      if (slug === 'a') throw overloaded()
      return { slug }
    }
    const menus = await fetchRestaurantMenus(restaurants, { fetchMenu, sleep: noSleep, retries: 1 })
    assert.deepEqual([...menus.keys()].sort(), ['b', 'c'])
  }))
