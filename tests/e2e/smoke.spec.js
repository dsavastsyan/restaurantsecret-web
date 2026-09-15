import { expect, test } from '@playwright/test'

const waitForSuccessfulResponse = (page, predicate) =>
  page.waitForResponse((response) => {
    if (!predicate(response)) return false
    return response.ok()
  })

test('@smoke landing to restaurant flow is gated by paywall', async ({ page }) => {
  const landingStatsResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const path = new URL(response.url()).pathname
    return path.endsWith('/landing/stats') && response.request().method() === 'GET'
  })

  await page.goto('/')

  const landingStatsResponse = await landingStatsResponsePromise
  const landingStats = await landingStatsResponse.json()
  expect(landingStats?.restaurants).toBeGreaterThan(0)
  expect(landingStats?.dishes).toBeGreaterThan(0)

  // Dismiss the cookie consent banner if it's shown — it overlays the page
  // and blocks interaction with everything behind it. ConsentBanner.jsx only
  // renders it 5s after mount (see its `showTimer`), so this wait must clear
  // that or the click silently no-ops and the banner reappears mid-test.
  // Getting this one dismissal right means it stays dismissed (persisted to
  // localStorage) for the rest of the test — no need to repeat it per route.
  await page.getByRole('button', { name: 'Отклонить' }).click({ timeout: 6000 }).catch(() => {})

  const search = page.getByPlaceholder('Найти ресторан или блюдо')
  await expect(search).toBeVisible()
  await search.fill('суши')

  // Moving past the landing page should fetch the catalog data.
  const catalogResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const path = new URL(response.url()).pathname
    return path.endsWith('/restaurants') && response.request().method() === 'GET'
  })

  await Promise.all([
    page.waitForURL(/\/catalog(\/|$|\?)/),
    search.press('Enter')
  ])

  const catalogResponse = await catalogResponsePromise
  const catalogPayload = await catalogResponse.json()
  // Note: the frontend re-sorts fetched restaurants by search relevance, so
  // the first rendered card is not necessarily catalogPayload.items[0] —
  // don't assume identity between the two, just that results exist.
  expect(catalogPayload?.items?.length).toBeGreaterThan(0)

  const cards = page.locator('.catalog-card')
  const firstCardButton = cards.first().getByRole('button', { name: 'Открыть меню' })
  await expect(firstCardButton).toBeVisible()

  // Opening a restaurant navigates straight into its menu (no blocking modal
  // — the site now gates per dish, showing the first few free and hiding the
  // rest behind a subscribe prompt on each card).
  const restaurantResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const path = new URL(response.url()).pathname
    return /^\/restaurants\/[^/]+\/menu\/?$/.test(path) && response.request().method() === 'GET'
  })

  await Promise.all([
    page.waitForURL(/\/restaurants\/[^/]+\/menu/),
    firstCardButton.click()
  ])

  await restaurantResponsePromise

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).not.toBeEmpty()

  // Assert the user-facing paywall marker rather than an implementation CSS
  // class so a visual refactor cannot silently invalidate this smoke check.
  const lockedDishes = page.getByRole('button').filter({ hasText: 'КБЖУ и состав — по подписке' })
  expect(await lockedDishes.count()).toBeGreaterThan(0)

  // NOTE: this used to also simulate an activated subscription (via a
  // `rs_access_state` localStorage flag + `rs-access-update` event) and
  // assert the locked covers disappeared. That trick no longer proves
  // anything: KBJU/composition for dishes past the free preview is now
  // trimmed server-side (see the 2026-09-12 paywall security fix), so no
  // client-side flag can unlock data the API never sent. The flip side —
  // a real subscriber sees everything — is covered by the next test below.
})
