import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

const setupCatalogApi = async (page, restaurantsStatus = 503) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('catalog_city', 'Москва')
    window.localStorage.setItem('rs_consent_v1', JSON.stringify({
      analytics: 'denied',
      policyVersion: 'cookies_v1_2026-01-16',
    }))
  })
  await page.route('**/maintenance.json?*', (route) => route.fulfill({ json: { enabled: false } }))
  await page.route((url) => {
    const path = new URL(url.toString()).pathname
    return path.endsWith('/cities')
      || path.endsWith('/filters')
      || path.endsWith('/metro')
      || path.endsWith('/restaurants')
      || path.endsWith('/restaurants/map')
  }, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/cities')) {
      return route.fulfill({ json: { items: [{ id: 'Москва', name: 'Москва' }] } })
    }
    if (path.endsWith('/filters')) {
      return route.fulfill({ json: { cuisines: [], venue_types: [] } })
    }
    if (path.endsWith('/metro')) {
      return route.fulfill({ json: { lines: [], stations: [] } })
    }
    if (path.endsWith('/restaurants/map')) {
      return route.fulfill({ json: { items: [] } })
    }
    return route.fulfill({
      status: restaurantsStatus,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Request timed out' }),
    })
  })
}

test('@smoke shows a clear service state for a 503 and retries the request', async ({ page }) => {
  let catalogRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/restaurants')) catalogRequests += 1
  })
  await setupCatalogApi(page, 503)

  await page.goto('/catalog?city=Москва')

  await expect(page.getByRole('heading', { name: 'Сервис временно недоступен' })).toBeVisible()
  await expect(page.getByText('Request timed out')).toHaveCount(0)
  await expect(page.locator('.catalog-results__summary')).toHaveCount(0)
  await expect(page.locator('.catalog-map-panel__count')).not.toContainText('0 на карте')

  await page.locator('.catalog-results').getByRole('button', { name: 'Обновить' }).click()
  await expect.poll(() => catalogRequests).toBeGreaterThan(1)
})

test('@smoke keeps the existing raw error path for a 404', async ({ page }) => {
  await setupCatalogApi(page, 404)

  await page.goto('/catalog?city=Москва')

  await expect(page.locator('.catalog-results .err')).toContainText('Ошибка:')
  await expect(page.getByRole('heading', { name: 'Сервис временно недоступен' })).toHaveCount(0)
})

test('@smoke keeps the existing raw error path for a 401', async ({ page }) => {
  await setupCatalogApi(page, 401)

  await page.goto('/catalog?city=Москва')

  await expect(page.locator('.catalog-results .err')).toContainText('Ошибка:')
  await expect(page.getByRole('heading', { name: 'Сервис временно недоступен' })).toHaveCount(0)
})
