import { expect, test } from '@playwright/test'

test('administrator manages outreach without seeing the Restaurant Guru source', async ({ page }) => {
  const requests = []
  const candidates = [{
    id: 1, name: 'BEmine Grill Bar', city: 'Москва',
    instagram_url: 'https://www.instagram.com/bemine_simf/', website_url: 'https://beminegrillbar.ru/',
    status: 'new', effective_status: 'new', workflow_kind: null,
  }, {
    id: 2, name: 'На потом', city: 'Москва', instagram_url: null, website_url: null,
    status: 'deferred', effective_status: 'deferred', workflow_kind: null,
  }]

  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const body = request.postDataJSON?.()
    requests.push({ path: url.pathname, method: request.method(), body })
    if (url.pathname === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (url.pathname === '/api/admin/outreach' && request.method() === 'GET') {
      return route.fulfill({ json: { ok: true, cities: ['Москва', 'Казань'], candidates } })
    }
    if (url.pathname === '/api/admin/outreach/import') {
      return route.fulfill({ json: { ok: true, added: 3, skipped_existing: 4, skipped_no_contact: 2, failed: 0 } })
    }
    if (url.pathname === '/api/admin/outreach/1') return route.fulfill({ json: { ok: true } })
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/admin/outreach')
  await expect(page.getByRole('heading', { name: 'Аутрич' })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'BEmine Grill Bar' })
  await expect(row.getByRole('link', { name: 'Открыть Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/bemine_simf/')
  await expect(row.getByRole('link', { name: 'Открыть сайт' })).toHaveAttribute('href', 'https://beminegrillbar.ru/')
  await expect(page.getByText('Restaurant Guru')).toHaveCount(0)

  const deferredRow = page.getByRole('row').filter({ hasText: 'На потом' })
  await expect(deferredRow).toContainText('Отложено')
  await deferredRow.getByText('Добавить меню').click()
  await expect(deferredRow.getByRole('button', { name: 'Парсинг' })).toBeVisible()
  await expect(deferredRow.getByRole('button', { name: 'Вручную с сайта' })).toBeVisible()
  await expect(deferredRow.getByRole('button', { name: 'Instagram Highlights' })).toBeVisible()
  await expect(deferredRow.getByRole('button', { name: 'Написала в Direct' })).toBeVisible()
  await deferredRow.getByText('Добавить меню').click()

  await row.getByText('Добавить меню').click()
  await row.getByRole('button', { name: 'Отложить' }).click()
  await expect.poll(() => requests.some(({ path, body }) => path === '/api/admin/outreach/1'
    && body?.status === 'deferred' && body?.workflow_kind === null)).toBeTruthy()

  await row.getByText('Добавить меню').click()
  await row.getByRole('button', { name: 'Парсинг' }).click()
  await row.getByPlaceholder('Ссылка на меню').fill('https://beminegrillbar.ru/menu')
  await row.getByRole('button', { name: 'В очередь' }).click()
  await expect.poll(() => requests.some(({ path, body }) => path === '/api/admin/outreach/1'
    && body?.status === 'awaiting_parser' && body?.workflow_kind === 'parser'
    && body?.menu_url === 'https://beminegrillbar.ru/menu')).toBeTruthy()

  await page.getByRole('button', { name: 'Обновить базу' }).click()
  await expect(page.getByText(/добавлено 3, уже в базе 4, без контактов 2/)).toBeVisible()
})

test('outreach is usable without page-level horizontal scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (url.pathname === '/api/admin/outreach') return route.fulfill({ json: { ok: true, cities: ['Москва'], candidates: [{
      id: 1, name: 'Малиновка', city: 'Москва', instagram_url: 'https://instagram.com/malinovka',
      website_url: 'https://malinovka.example', status: 'new', effective_status: 'new', workflow_kind: null,
    }] } })
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/admin/outreach')
  await expect(page.getByRole('heading', { name: 'Аутрич' })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'Малиновка' })
  await expect(row).toBeVisible()
  await expect(row.locator('td[data-label="Instagram"]')).toBeVisible()
  await expect(row.locator('td[data-label="Действия"]')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
