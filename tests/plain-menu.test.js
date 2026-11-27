import assert from 'node:assert/strict'
import test from 'node:test'

import { isPlainMenusEnabledForFlags } from '../src/lib/featureFlags.js'
import {
  estimateBasisText,
  howCalculatedIngredients,
  plainMenuCounts,
  plainMenuToCategories,
  plainNoDataDishes,
  plainOfferToDish,
  plainWeightText,
  resolvePlainView,
} from '../src/lib/plainMenu.js'

const hachapuri = {
  id: 'pofr_11',
  section: 'Хачапури',
  name: 'Аджарский хачапури',
  composition: 'Лодочка с сыром сулугуни',
  price_rub: 420,
  price_from: false,
  portion: { raw: 'M 265 г', g: 265, ml: null },
  kbju: {
    source: 'estimate',
    status: 'estimated',
    basis: 'per_portion',
    amount: 265,
    unit: 'g',
    kcal: 854.9,
    protein_g: 33.9,
    fat_g: 52.5,
    carbs_g: 58.6,
    macros_hidden: false,
    assumptions: 'Сливочное масло около 20 г на порцию',
    sources: ['справочник'],
    ingredients: [{ name: 'Тесто', grams_per_100: 45 }, { name: 'Сыр сулугуни', grams_per_100: 40 }],
  },
}
const kare = { ...hachapuri, id: 'pofr_12', name: 'Каре ягненка', portion: { raw: null, g: null, ml: null }, kbju: { ...hachapuri.kbju, basis: 'per_100g', amount: 100, kcal: 314.4 } }
const whisky = {
  ...hachapuri,
  id: 'pofr_13',
  name: 'Джеймесон',
  portion: { raw: '40 мл', g: null, ml: 40 },
  kbju: { ...hachapuri.kbju, unit: 'ml', amount: 40, kcal: 92.4, protein_g: null, fat_g: null, carbs_g: null, macros_hidden: true, ingredients: [] },
}
const mangal = { ...hachapuri, id: 'pofr_14', name: 'Мангал сет', composition: null, kbju: { source: 'estimate', status: 'no_data', reason: 'no_composition' } }
const plainMenu = {
  sections: [{ title: 'Хачапури', items: [hachapuri, kare] }, { title: 'Виски', items: [whisky] }],
  no_data: [mangal],
  counts: { total: 4, estimated: 3, no_data: 1 },
}

test('флаг plain_menus включается только явным true', () => {
  assert.equal(isPlainMenusEnabledForFlags({ plain_menus: true }), true)
  assert.equal(isPlainMenusEnabledForFlags({ plain_menus: 'true' }), false)
  assert.equal(isPlainMenusEnabledForFlags({}), false)
})

test('позиция с оценкой становится блюдом страницы с пометкой оценки', () => {
  const dish = plainOfferToDish(hachapuri, 'Хачапури')
  assert.equal(dish.isEstimate, true)
  assert.equal(dish.kcal, 854.9)
  assert.equal(dish.protein, 33.9)
  assert.equal(dish.price, 420)
  assert.equal(dish.ingredients, 'Лодочка с сыром сулугуни')
  assert.equal(dish.weightText, 'M 265 г')
  assert.equal(dish.estimate.basisText, 'Посчитали по составу, на порцию 265 г')
  assert.deepEqual(dish.estimate.ingredients, ['Тесто ≈119 г', 'Сыр сулугуни ≈106 г'])
})

test('без веса в меню подпись говорит «на 100 г, вес не указан»', () => {
  assert.equal(estimateBasisText(kare.kbju), 'Посчитали по составу, на 100 г, вес не указан')
  assert.deepEqual(howCalculatedIngredients(kare.kbju), ['Тесто ≈45 г', 'Сыр сулугуни ≈40 г'])
  assert.equal(plainWeightText(kare), null)
})

test('у напитков только калории', () => {
  const dish = plainOfferToDish(whisky, 'Виски')
  assert.equal(dish.kcal, 92.4)
  assert.equal(dish.protein, null)
  assert.equal(dish.estimate.macrosHidden, true)
  assert.equal(dish.estimate.basisText, 'Посчитали по составу, на порцию 40 мл')
})

test('категории и блок без КБЖУ', () => {
  const categories = plainMenuToCategories(plainMenu)
  assert.deepEqual(categories.map((c) => [c.name, c.dishes.length]), [['Хачапури', 2], ['Виски', 1]])
  const noData = plainNoDataDishes(plainMenu)
  assert.equal(noData[0].isEstimate, false)
  assert.equal(noData[0].kcal, null)
  assert.equal(noData[0].reasonText, 'КБЖУ не посчитали: в меню нет состава')
  assert.deepEqual(plainMenuCounts(plainMenu), { total: 4, estimated: 3, noData: 1 })
})

test('какое меню показывать', () => {
  assert.equal(resolvePlainView({ categories: [] }, 'restaurant').mode, 'restaurant')
  assert.equal(resolvePlainView({ kbjuKind: 'estimated', plainMenu }, 'restaurant').mode, 'estimated')
  assert.equal(resolvePlainView({ kbjuKind: 'estimated', plainMenu }, 'restaurant').tabs, null)
  const withTab = resolvePlainView({ kbjuKind: 'restaurant', estimatedTab: plainMenu }, 'restaurant')
  assert.equal(withTab.mode, 'restaurant')
  assert.equal(withTab.tabs.estimatedCount, 4)
  assert.equal(resolvePlainView({ kbjuKind: 'restaurant', estimatedTab: plainMenu }, 'estimated').mode, 'estimated')
})

test('compact map keeps the KBJU kind for plain-menu restaurants', async () => {
  const { expandRestaurantMapPayload } = await import('../src/lib/restaurantMapPayload.js')
  const map = expandRestaurantMapPayload({
    format: 'compact',
    pointFields: ['locationId', 'restaurant', 'lat', 'lon'],
    restaurants: [
      { id: 1, slug: 'mouflon', name: 'Mouflon', kbjuKind: 'estimated' },
      { id: 2, slug: 'bruno', name: 'Bruno' },
    ],
    points: [[10, 0, 55.75, 37.6], [20, 1, 55.76, 37.61]],
  })
  assert.equal(map.items[0].kbjuKind, 'estimated')
  assert.equal('kbjuKind' in map.items[1], false)
})
