import assert from 'node:assert/strict'
import test from 'node:test'

import { applySeoTags, dishNamesByCategory } from '../scripts/generate-sitemap.js'

const dishes = [
  { name: 'Борщ', category: 'Супы', kcal: 210, protein: 9, fat: 8, carbs: 22 },
  { name: 'Салат </script><b>', category: 'Закуски', kcal: 150 },
  { name: 'Окрошка', category: 'Супы', kcal: 180 },
]

test('seo hint carries dish names grouped by category, never nutrition', () => {
  const groups = dishNamesByCategory(dishes)
  const html = applySeoTags('<html><head></head><body><div id="root"></div></body></html>', {
    title: 't',
    description: 'd',
    canonical: 'https://restaurantsecret.ru/restaurants/x/menu/',
    seoHint: { name: 'X', dishCount: 3, dishGroups: groups },
  })
  const raw = html.match(/id="rs-seo-hint" type="application\/json">(.*?)<\/script>/s)[1]
  assert.ok(!raw.includes('<'), 'dish names must not be able to close the script tag')
  const hint = JSON.parse(raw)
  assert.deepEqual(hint.dishGroups, [
    { category: 'Супы', names: ['Борщ', 'Окрошка'] },
    { category: 'Закуски', names: ['Салат </script><b>'] },
  ])
  assert.ok(!/kcal|protein|fat|carbs|210/.test(raw), 'КБЖУ must stay out of the static page')
})
