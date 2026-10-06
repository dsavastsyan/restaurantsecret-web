import test from 'node:test'
import assert from 'node:assert/strict'
import { chainHubSeoDescription, restaurantSeoDescription } from '../src/lib/seoDescriptions.js'

test('chain hub description states the dish count when known', () => {
  assert.match(chainHubSeoDescription('Сыроварня', 50, 120), /50 филиалов с полным КБЖУ меню\. Более 120 блюд\./)
})

test('chain hub description drops the count when it is 0 or unknown', () => {
  for (const count of [0, undefined, NaN]) {
    const text = chainHubSeoDescription('Сыроварня', 50, count)
    assert.doesNotMatch(text, /Более|\b0 блюд/)
    assert.match(text, /^50 филиалов с полным КБЖУ меню\. Постоянное обновление\./)
  }
})

test('restaurant description never says "0 блюд"', () => {
  assert.match(restaurantSeoDescription('Кафе', 21), /^21 блюдо с полным КБЖУ\./)
  assert.doesNotMatch(restaurantSeoDescription('Кафе', 0), /\b0 блюд/)
  assert.match(restaurantSeoDescription('Кафе', 0), /^Меню с полным КБЖУ\./)
})

test('"Более N" takes the genitive plural for any count', () => {
  for (const [count, tail] of [[1, 'Более 1 блюд.'], [2, 'Более 2 блюд.'], [233, 'Более 233 блюд.'], [21, 'Более 21 блюд.']]) {
    assert.ok(chainHubSeoDescription('Сеть', 3, count).includes(tail), String(count))
  }
})
