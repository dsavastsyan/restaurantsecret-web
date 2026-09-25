import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('catalog_city')
    // City-selection scenarios must exercise the application while the
    // production rollout maintenance screen is intentionally enabled.
    window.localStorage.setItem('rs_maint_bypass', 'RS-DEV-BYPASS-KEY-TOKEN-2026')
  })

  await page.route('**/cities', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [
        { id: 'Москва', name: 'Москва' },
        { id: 'Санкт-Петербург', name: 'Санкт-Петербург' },
      ],
    }),
  }))
  // The trailing `**` matters: it also covers the GET call's `?visitor_id=...`
  // query string, which a bare `**/api/city-preference` pattern would not match.
  await page.route('**/api/city-preference**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true }),
  }))
})

test('offers the detected catalog city on the first visit', async ({ page }) => {
  const persistedPreferences = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/city-preference')) persistedPreferences.push(request.postDataJSON())
  })
  await page.route('**/location', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ city: 'Санкт-Петербург' }),
  }))

  await page.goto('/')

  const suggestion = page.locator('.landing-warm__city-suggestion--desktop')
  await expect(suggestion).toContainText('Санкт-Петербург')
  await expect(suggestion.getByRole('button', { name: 'Да, это мой город', exact: true })).toBeVisible()
  await expect(suggestion.getByRole('button', { name: 'Сменить', exact: true })).toBeVisible()
  await expect.poll(() => persistedPreferences.some((item) => item.city === 'Санкт-Петербург' && item.source === 'ip')).toBe(true)

  await suggestion.getByRole('button', { name: 'Да, это мой город', exact: true }).evaluate((button) => button.click())
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('catalog_city'))).toBe('Санкт-Петербург')
  await expect.poll(() => persistedPreferences.some((item) => item.city === 'Санкт-Петербург' && item.source === 'confirmed')).toBe(true)
})

test('allows previewing the first-visit prompt in local development', async ({ page }) => {
  await page.goto('/?detected_city=Минск')

  const suggestion = page.locator('.landing-warm__city-suggestion--desktop')
  await expect(suggestion).toContainText('Минск')
  await expect(suggestion.getByRole('button', { name: 'Да, это мой город', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('catalog_city')))
    .toBe(null)
})

test('offers Moscow when the city cannot be detected', async ({ page }) => {
  await page.route('**/location', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ city: null }),
  }))

  await page.goto('/')

  const suggestion = page.locator('.landing-warm__city-suggestion--desktop')
  await expect(suggestion).toContainText('Москва')
  await expect(suggestion.getByRole('button', { name: 'Да, это мой город', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('catalog_city')))
    .toBe(null)
})

test('offers Moscow when city detection fails', async ({ page }) => {
  await page.route('**/location', (route) => route.abort())

  await page.goto('/')

  await expect(page.locator('.landing-warm__city-suggestion--desktop')).toContainText('Москва')
})

test('places the confirmation below the city picker on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/location', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ city: null }),
  }))

  await page.goto('/')

  const picker = page.locator('.landing-warm__city-picker--mobile')
  const suggestion = page.locator('.landing-warm__city-suggestion--mobile')
  await expect(picker).toBeVisible()
  await expect(suggestion).toBeVisible()
  const pickerBox = await picker.boundingBox()
  const suggestionBox = await suggestion.boundingBox()
  expect(suggestionBox.y).toBeGreaterThan(pickerBox.y)
})

test('restores a previously saved city before showing the detection prompt', async ({ page }) => {
  await page.route('**/api/city-preference**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ detected_city: 'Москва', selected_city: 'Казань', selection_source: 'confirmed' }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/location', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ city: 'Санкт-Петербург' }),
  }))

  await page.goto('/')

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('catalog_city'))).toBe('Казань')
  await expect(page.locator('.landing-warm__city-suggestion--desktop')).toHaveCount(0)
})

test('does not replace a manual choice with a late location response', async ({ page }) => {
  let releaseLocation
  const locationReady = new Promise((resolve) => {
    releaseLocation = resolve
  })

  await page.route('**/location', async (route) => {
    await locationReady
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ city: 'Санкт-Петербург' }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Принять', exact: true }).click()
  await page.getByRole('button', { name: /Москва/ }).first().click()
  const cityDialog = page.getByRole('dialog', { name: 'Выберите город' })
  await cityDialog.getByRole('button', { name: /Москва/ }).click()
  releaseLocation()

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('catalog_city')))
    .toBe('Москва')
  await expect(page.getByText('Ваш город —', { exact: false })).toHaveCount(0)
})
