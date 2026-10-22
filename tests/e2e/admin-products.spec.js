import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Trimmed snapshot of the staging admin-API responses (RestaurantSecret#727)
const fixture = JSON.parse(readFileSync(new URL('./fixtures/admin-products.json', import.meta.url), 'utf8'))

async function mockAdmin(page, { requests = [], decisions = [] } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('rs_consent_v1', JSON.stringify({
      analytics: 'denied',
      updatedAt: new Date().toISOString(),
      policyVersion: 'cookies_v1_2026-01-16',
    }))
  })
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    requests.push(`${request.method()} ${path}${url.search}`)
    if (path === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (path === '/api/admin/product-sources') return route.fulfill({ json: fixture.productSources })
    if (path === '/api/admin/barcode-sources') return route.fulfill({ json: fixture.barcodeSources })
    if (path === '/api/admin/barcode-candidates') {
      if (url.searchParams.get('kind') === 'off') return route.fulfill({ json: fixture.barcodeCandidatesOff })
      if (url.searchParams.get('offset') === '300') {
        return route.fulfill({ json: { ...fixture.barcodeCandidatesLink, offset: 300, next_offset: null, pairs: [] } })
      }
      return route.fulfill({ json: fixture.barcodeCandidatesLink })
    }
    const decision = path.match(/^\/api\/admin\/barcode-candidates\/(off|link)\/(\d+)\/decision$/)
    if (decision && request.method() === 'POST') {
      decisions.push({ kind: decision[1], id: Number(decision[2]), body: request.postDataJSON() })
      return route.fulfill({ json: { ok: true } })
    }
    if (path === '/api/admin/product-completeness') {
      const issue = url.searchParams.get('issue')
      const query = url.searchParams.get('query') || ''
      const items = fixture.completeness.items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
      return route.fulfill({ json: { ...fixture.completeness, issue, query, items, matched: query ? items.length : fixture.completeness.issues[issue] } })
    }
    return route.fulfill({ json: { ok: true } })
  })
}

test('«Продукты» opens on retailer catalogs with statuses, cards and last errors', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin/products')
  await expect(page).toHaveURL(/\/admin\/products\/collection\/retailers$/)
  await expect(page.getByRole('link', { name: 'Сбор' })).toHaveClass(/active/)
  await expect(page.getByRole('link', { name: 'Базы ритейлеров' })).toHaveClass(/active/)

  const rows = page.locator('.admin-product-sources__table tbody tr')
  await expect(rows).toHaveCount(fixture.productSources.sources.length)
  // Problems first
  await expect(rows.nth(0)).toContainText('Ямигом')
  await expect(rows.nth(0)).toContainText('Ошибка')
  await rows.nth(0).locator('details summary').click()
  await expect(rows.nth(0)).toContainText('Connection refused')

  const metro = rows.filter({ hasText: 'METRO' })
  await expect(metro).toContainText('Актуально')
  await expect(metro).toContainText('54')

  await page.getByLabel('Статус источника').selectOption('current')
  await expect(rows.filter({ hasText: 'Ждёт' })).toHaveCount(0)
  await page.getByLabel('Статус источника').selectOption('')
  await page.getByPlaceholder('Ритейлер или сайт').fill('vkusvill')
  await expect(rows).toHaveCount(1)
  await expect(rows.nth(0)).toContainText('ВкусВилл')
})

test('«Штрихкоды» shows coverage and every barcode source', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin/products/collection/barcodes')

  const coverage = page.getByLabel('Покрытие штрихкодами')
  await expect(coverage).toContainText('Штрихкод в карточке')
  await expect(coverage).toContainText('58%')
  await expect(coverage).toContainText('Без штрихкода')

  const rows = page.locator('.admin-product-sources__table tbody tr')
  await expect(rows).toHaveCount(fixture.barcodeSources.sources.length)
  await expect(rows.filter({ hasText: 'Фото упаковок' })).toContainText(/1\s696 ждут проверки/)
  await expect(rows.filter({ hasText: 'Open Food Facts' })).toContainText('ждут проверки')
  await expect(rows.filter({ hasText: 'semeiniy (KZ)' })).toContainText('Пары с нашими товарами ещё не строятся')

  await coverage.getByRole('link').click()
  await expect(page).toHaveURL(/\/admin\/products\/quality\/completeness\?issue=no_barcode$/)
  await expect(page.getByRole('button', { name: /Нет штрихкода/ })).toHaveClass(/active/)
})

test('barcode candidate review shows doubtful pairs with reasons and saves decisions', async ({ page }) => {
  const requests = []
  const decisions = []
  await mockAdmin(page, { requests, decisions })
  await page.goto('/admin/products/freshness/barcodes')
  await expect(page.getByRole('link', { name: 'Сведение со штрихкодом' })).toHaveClass(/active/)

  const pairs = page.locator('.admin-product-match__pair')
  const doubtful = fixture.barcodeCandidatesLink.pairs.filter((pair) => pair.verdict === 'review')
  await expect(pairs).toHaveCount(doubtful.length)
  await expect(pairs.nth(0)).toContainText(doubtful[0].product.name)
  await expect(pairs.nth(0).getByLabel('Причины')).toContainText(doubtful[0].reasons[0].label)

  await page.getByRole('button', { name: /Явное различие/ }).click()
  await expect(pairs).toHaveCount(1)
  await expect(pairs.nth(0)).toContainText('Жирность различается: 4 / 7')
  await pairs.nth(0).getByRole('button', { name: 'Это разные товары' }).click()
  await expect(pairs).toHaveCount(0)
  expect(decisions).toEqual([{ kind: 'link', id: 1, body: { decision: 'reject' } }])

  await page.getByRole('button', { name: /Совпадают полностью/ }).click()
  await expect(pairs).toHaveCount(2)
  await pairs.nth(0).getByRole('button', { name: 'Штрихкод подходит' }).click()
  await expect(pairs).toHaveCount(1)
  expect(decisions[1]).toEqual({ kind: 'link', id: 14, body: { decision: 'approve' } })

  // One pair decided: the next page starts one pair earlier
  await page.getByRole('button', { name: /Проверить следующие/ }).click()
  await expect.poll(() => requests.some((entry) => entry.includes('offset=298'))).toBe(true)

  await page.getByRole('button', { name: /Open Food Facts/ }).click()
  await page.getByRole('button', { name: /Сомнительные/ }).click()
  await expect(pairs).toHaveCount(fixture.barcodeCandidatesOff.pairs.length)
  await expect(pairs.nth(0)).toContainText('Open Food Facts')
})

test('product completeness counts every issue and filters the list', async ({ page }) => {
  const requests = []
  await mockAdmin(page, { requests })
  await page.goto('/admin/products/quality/completeness')
  await expect(page.getByRole('link', { name: 'Полнота' })).toHaveClass(/active/)

  for (const label of ['Нет КБЖУ', 'Нет штрихкода', 'Нет веса', 'Нет производителя']) {
    await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible()
  }
  const rows = page.locator('.admin-product-completeness__table tbody tr')
  await expect(rows).toHaveCount(fixture.completeness.items.length)
  await expect(rows.filter({ hasText: 'Соль морская' })).toContainText('Генерик — можно взять общеизвестное КБЖУ')
  await expect(rows.filter({ hasText: 'Лед пищевой' })).not.toContainText('Генерик')
  await expect(page.getByText(/из 1\s?235/)).toBeVisible()

  await page.getByPlaceholder('Название, бренд или штрихкод').fill('Соль')
  await expect(rows).toHaveCount(1)
  expect(requests.some((entry) => entry.includes('query=%D0%A1%D0%BE%D0%BB%D1%8C'))).toBe(true)

  await page.getByRole('button', { name: /Нет производителя/ }).click()
  await expect(page).toHaveURL(/issue=no_manufacturer/)
})
