import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

// Regression: Search.jsx read `restaurants` in a useCallback dependency list before
// the const was declared, so every /search render threw "Cannot access 'o' before
// initialization" and showed the route error boundary.
test('search page renders results for a query without a runtime error', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.addInitScript(() => {
    window.localStorage.setItem('catalog_city', 'Москва')
    window.localStorage.setItem('rs_consent_v1', JSON.stringify({
      analytics: 'denied',
      policyVersion: 'cookies_v1_2026-01-16',
    }))
  })
  await page.route('**/maintenance.json?*', (route) => route.fulfill({ json: { enabled: false } }))
  // Only the API call: the page itself is also served from /search.
  await page.route((url) => new URL(url.toString()).pathname.endsWith('/search'), (route) => {
    if (route.request().isNavigationRequest()) return route.fallback()
    return route.fulfill({
      json: {
        restaurants: [{ slug: 'matreshka', name: 'Матрёшка', city: 'Москва' }],
        dishes: [],
        otherCities: [],
      },
    })
  })

  await page.goto('/search?q=матрешка')

  await expect(page.locator('.search-page')).toBeVisible()
  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
