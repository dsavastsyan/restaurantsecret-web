import { expect, test } from '@playwright/test'

const waitForSuccessfulResponse = (page, predicate) =>
  page.waitForResponse((response) => {
    if (!predicate(response)) return false
    return response.ok()
  })

test('@smoke landing search and restaurant menu use the configured API', async ({ page }) => {
  const landingStatsResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const path = new URL(response.url()).pathname
    return path.endsWith('/landing/stats') && response.request().method() === 'GET'
  })

  await page.goto('/')

  const landingStatsResponse = await landingStatsResponsePromise
  const landingStats = await landingStatsResponse.json()
  expect(landingStats?.restaurants).toBeGreaterThan(0)
  expect(landingStats?.dishes).toBeGreaterThan(0)

  const search = page.getByPlaceholder('Найти ресторан или блюдо')
  await expect(search).toBeVisible()
  await search.fill('суши')

  const searchResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const path = new URL(response.url()).pathname
    return path.endsWith('/search') && response.request().method() === 'GET'
  })

  await Promise.all([
    page.waitForURL(/\/search\?/),
    search.press('Enter')
  ])

  const searchResponse = await searchResponsePromise
  const searchPayload = await searchResponse.json()
  const resultCount = (searchPayload?.restaurants?.length ?? 0) + (searchPayload?.dishes?.length ?? 0)
  expect(resultCount).toBeGreaterThan(0)
  await expect(page.locator('.search-card').first()).toBeVisible()

  // Use a stable staging fixture to verify that a deep SPA route and its API
  // request both work on the deployed preview.
  const restaurantResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const path = new URL(response.url()).pathname
    return path.endsWith('/restaurants/maya/menu') && response.request().method() === 'GET'
  })

  await page.goto('/restaurants/maya/menu/')
  const restaurantResponse = await restaurantResponsePromise
  const restaurantPayload = await restaurantResponse.json()
  expect(restaurantPayload?.slug).toBe('maya')

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toContainText('Maya')
})
