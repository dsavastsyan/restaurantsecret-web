import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchAllRestaurants } from '../scripts/generate-sitemap.js'

const overloaded = () => Object.assign(new Error('500 Internal Server Error'), { status: 500 })
const forbidden = () => Object.assign(new Error('403 Forbidden'), { status: 403 })

function quiet(fn) {
  const { warn } = console
  console.warn = () => {}
  return fn().finally(() => {
    console.warn = warn
  })
}

test('restaurant list retries a D1 overload with growing pauses', () =>
  quiet(async () => {
    let calls = 0
    const pauses = []
    const fetchList = async () => {
      calls += 1
      if (calls < 3) throw overloaded()
      return { items: [{ slug: 'a' }, { slug: 'b' }] }
    }
    const restaurants = await fetchAllRestaurants({
      fetchList,
      apiUrls: ['https://api.test'],
      sleep: async (ms) => pauses.push(ms),
      retries: 3,
      baseDelayMs: 100,
    })
    assert.deepEqual(restaurants.map((r) => r.slug), ['a', 'b'])
    assert.equal(calls, 3)
    assert.deepEqual(pauses, [100, 200])
  }))

test('restaurant list tries the fallback host before pausing', () =>
  quiet(async () => {
    const urls = []
    const pauses = []
    const fetchList = async (url) => {
      urls.push(url)
      if (url.startsWith('https://primary.test')) throw overloaded()
      return { items: [{ slug: 'a' }] }
    }
    const restaurants = await fetchAllRestaurants({
      fetchList,
      apiUrls: ['https://primary.test', 'https://fallback.test'],
      sleep: async (ms) => pauses.push(ms),
      retries: 3,
    })
    assert.equal(restaurants.length, 1)
    assert.equal(urls.length, 2)
    assert.deepEqual(pauses, [])
  }))

test('restaurant list does not retry a 403 and gives up after the retry budget', () =>
  quiet(async () => {
    let forbiddenCalls = 0
    await assert.rejects(
      fetchAllRestaurants({
        fetchList: async () => {
          forbiddenCalls += 1
          throw forbidden()
        },
        apiUrls: ['https://api.test'],
        sleep: async () => {},
        retries: 3,
      }),
      /All restaurant API endpoints failed/,
    )
    assert.equal(forbiddenCalls, 1)

    let overloadCalls = 0
    await assert.rejects(
      fetchAllRestaurants({
        fetchList: async () => {
          overloadCalls += 1
          throw overloaded()
        },
        apiUrls: ['https://api.test'],
        sleep: async () => {},
        retries: 2,
      }),
      /All restaurant API endpoints failed/,
    )
    assert.equal(overloadCalls, 3)
  }))
