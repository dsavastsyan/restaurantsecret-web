import { expect, test } from '@playwright/test'

// Страница /auth/handoff: передача входа из приложения. Сервер замокан, проверяем поведение сайта:
// код стирается из адреса, обмен ровно один, адрес возврата только из белого списка.
const CODE = 'A'.repeat(43)
const ORIGIN = 'http://127.0.0.1:5173'
const CORS = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'Content-Type, Authorization',
}

async function mockApi(page, redeemHandler) {
  const redeemCalls = []
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === ORIGIN) return route.continue()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname === '/auth/handoff/redeem') {
      redeemCalls.push(route.request().postDataJSON())
      return redeemHandler(route, redeemCalls.length)
    }
    if (url.pathname.endsWith('/users/me')) {
      return route.fulfill({
        headers: CORS,
        json: { ok: true, user: { id: '1', email: 'someone@example.com', created_at: '2026-01-01', onboarding_completed: true, subscription: null } },
      })
    }
    return route.fulfill({ headers: CORS, json: { ok: true, status: 'none' } })
  })
  return redeemCalls
}

const success = (extra = {}) => (route) =>
  route.fulfill({ headers: CORS, json: { ok: true, access_token: 'header.payload.sig', next: '/account/subscription', ...extra } })

test('handoff: erases the code from the address, redeems once, lands on subscription', async ({ page }) => {
  const calls = await mockApi(page, success())
  await page.goto(`/auth/handoff#code=${CODE}`)
  await page.waitForURL(/\/account\/subscription/)
  expect(calls).toEqual([{ code: CODE }])
  expect(page.url()).not.toContain(CODE)
  expect(await page.evaluate(() => location.hash)).toBe('')
  expect(await page.evaluate(() => localStorage.getItem('rs_access'))).toBe('header.payload.sig')
})

test('handoff: a server-supplied return address outside the whitelist is ignored', async ({ page }) => {
  for (const next of ['https://evil.example/x', '//evil.example', '/admin', 'javascript:alert(1)']) {
    const calls = await mockApi(page, success({ next }))
    await page.goto(`/auth/handoff#code=${CODE}`)
    await page.waitForURL(/\/account\/subscription/)
    expect(new URL(page.url()).origin).toBe(ORIGIN)
    expect(calls).toHaveLength(1)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.evaluate(() => localStorage.clear())
  }
})

test('handoff: rejected code shows the fallback to login by email code', async ({ page }) => {
  const calls = await mockApi(page, (route) => route.fulfill({ status: 400, headers: CORS, json: { ok: false, error: 'invalid_handoff' } }))
  await page.goto(`/auth/handoff#code=${CODE}`)
  await expect(page.getByRole('heading', { name: 'Автоматический вход не сработал' })).toBeVisible()
  expect(calls).toHaveLength(1)
  expect(await page.evaluate(() => localStorage.getItem('rs_access'))).toBeNull()
  await page.getByRole('button', { name: 'Войти по коду' }).click()
  await page.waitForURL(/\/login/)
})

test('handoff: missing or malformed code makes no request', async ({ page }) => {
  const calls = await mockApi(page, success())
  for (const hash of ['', '#code=short', '#next=https://evil.example']) {
    await page.goto(`/auth/handoff${hash}`)
    await expect(page.getByRole('heading', { name: 'Автоматический вход не сработал' })).toBeVisible()
  }
  expect(calls).toHaveLength(0)
})

test('handoff: network failure can be retried with the same code', async ({ page }) => {
  const calls = await mockApi(page, (route, n) => (n === 1 ? route.abort('failed') : success()(route)))
  await page.goto(`/auth/handoff#code=${CODE}`)
  await expect(page.getByRole('heading', { name: 'Не удалось подключиться' })).toBeVisible()
  await page.getByRole('button', { name: 'Повторить' }).click()
  await page.waitForURL(/\/account\/subscription/)
  expect(calls).toEqual([{ code: CODE }, { code: CODE }])
})

test('handoff: an existing session of another account asks before switching', async ({ page }) => {
  const calls = await mockApi(page, success({ access_token: 'new.app.token' }))
  await page.addInitScript(() => localStorage.setItem('rs_access', 'old.web.token'))
  await page.goto(`/auth/handoff#code=${CODE}`)
  await expect(page.getByRole('heading', { name: 'На сайте уже выполнен вход' })).toBeVisible()
  await expect(page.getByText('s***@example.com')).toBeVisible()
  expect(calls).toHaveLength(0)
  await page.getByRole('button', { name: 'Войти в аккаунт из приложения' }).click()
  await page.waitForURL(/\/account\/subscription/)
  expect(calls).toEqual([{ code: CODE }])
  expect(await page.evaluate(() => localStorage.getItem('rs_access'))).toBe('new.app.token')
})
