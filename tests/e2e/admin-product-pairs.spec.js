import { expect, test } from '@playwright/test'

function product(id, name, extra = {}) {
  return {
    id, name, brand: 'Увелка', manufacturer: 'АО Увелка', source_category: 'Крупы', ingredients: 'Рис шлифованный',
    calories: 330, protein_g: 7, fat_g: 1, carbohydrates_g: 70, nutrition_basis: '100_g', package_size: '800 г',
    gtin: null, source_url: `https://shop${id}.example/rice`, parsed_at: '2026-11-01T10:00:00Z', ...extra,
  }
}

const PAIRS = [
  {
    id: 1, status: 'pending', grade: 'medium', why: 'top_one', line_relation: 'contained_n', ingredients_state: 'unk',
    nutrition_state: 'eq', weight_state: 'eq', score: 4.2, main_side: null,
    a: { group_id: null, member_count: 1, product: product(10, 'Рис Увелка длиннозерный 800 г'), others: [] },
    b: {
      group_id: 5, member_count: 3, product: product(20, 'Крупа рис Увелка длиннозерный шлифованный, 800г', { gtin: '4600000000011' }),
      others: [{ id: 21, name: 'Рис Увелка длиннозерный', gtin: null, source_url: 'https://shop21.example/rice' }, { id: 22, name: 'Увелка рис 800', gtin: null, source_url: 'https://shop22.example/rice' }],
    },
  },
  {
    id: 2, status: 'pending', grade: 'low', why: 'nutrition_conflict', line_relation: 'equal', ingredients_state: 'diff',
    nutrition_state: 'conf', weight_state: 'eq', score: 3.1, main_side: null,
    a: { group_id: null, member_count: 1, product: product(30, 'Пряники Хлебный дом мятные 300 г'), others: [] },
    b: { group_id: null, member_count: 1, product: product(40, 'Пряники Хлебный дом мятные 300 г'), others: [] },
  },
]
const COUNTS = [
  { grade: 'medium', why: 'top_one', n: 4044 }, { grade: 'low', why: 'nutrition_conflict', n: 4991 }, { grade: 'low', why: 'brand_differs', n: 159 },
]

async function mockAdmin(page, { requests, decisions }) {
  await page.addInitScript(() => {
    localStorage.setItem('rs_consent_v1', JSON.stringify({ analytics: 'denied', updatedAt: new Date().toISOString(), policyVersion: 'cookies_v1_2026-01-16' }))
  })
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}${url.search}`)
    if (url.pathname === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (url.pathname === '/api/admin/product-pairs') {
      const grade = url.searchParams.get('grade')
      const pairs = PAIRS.filter((pair) => !grade || pair.grade === grade)
      return route.fulfill({ json: { ok: true, status: 'pending', total: pairs.length, counts: COUNTS, pairs } })
    }
    const decision = url.pathname.match(/^\/api\/admin\/product-pairs\/(\d+)\/decision$/)
    if (decision && request.method() === 'POST') {
      decisions.push({ id: Number(decision[1]), body: request.postDataJSON() })
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: { ok: true, matches: [] } })
  })
}

test('duplicate queue filters by confidence grade and records the chosen main card', async ({ page }) => {
  const requests = []
  const decisions = []
  await mockAdmin(page, { requests, decisions })
  await page.goto('/admin/products/freshness/duplicates')

  await expect(page.getByRole('heading', { name: 'Дубликаты карточек' })).toBeVisible()
  await expect(page.getByText('Единственный кандидат')).toBeVisible()
  await expect(page.getByRole('button', { name: /Средняя · 4/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Низкая · 5/ })).toBeVisible()
  await expect(page.getByText('Уже склеено ещё 2 карточки')).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-product-pairs.png', fullPage: true })

  // the group side is the default main card
  await expect(page.getByRole('button', { name: 'Один товар, главная: справа' })).toBeVisible()

  await page.getByRole('button', { name: /Низкая · 5/ }).click()
  await expect.poll(() => requests.some((entry) => entry.includes('grade=low'))).toBe(true)
  await expect(page.getByText('КБЖУ расходится').first()).toBeVisible()
  await expect(page.getByText('Единственный кандидат')).toHaveCount(0)

  // pick the left card as main, then confirm «one product»
  await page.getByRole('button', { name: 'Сделать главной' }).first().click()
  await expect(page.getByRole('button', { name: 'Один товар, главная: слева' })).toBeVisible()
  await page.getByRole('button', { name: 'Один товар, главная: слева' }).click()
  await expect.poll(() => decisions.length).toBe(1)
  expect(decisions[0]).toEqual({ id: 2, body: { decision: 'same', main: 'a' } })
})

test('«different» is recorded without a main card choice and the previous tab stays reachable', async ({ page }) => {
  const requests = []
  const decisions = []
  await mockAdmin(page, { requests, decisions })
  await page.goto('/admin/products/freshness/duplicates')
  await page.getByRole('button', { name: 'Это разные товары' }).first().click()
  await expect.poll(() => decisions.length).toBe(1)
  expect(decisions[0].body.decision).toBe('different')

  await page.getByRole('tab', { name: 'Прежние совпадения' }).click()
  await expect(page.getByRole('heading', { name: 'Проверка совпадений' })).toBeVisible()
})
