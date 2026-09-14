import { expect, test } from '@playwright/test'

const waitForSuccessfulResponse = (page, predicate) =>
  page.waitForResponse((response) => {
    if (!predicate(response)) return false
    return response.ok()
  })

test('@smoke landing to restaurant flow is gated by paywall', async ({ page }) => {
  await page.goto('/')

  // Dismiss the cookie consent banner if it's shown — it overlays the page
  // and blocks interaction with everything behind it. It can render a beat
  // after load, so wait for it rather than checking visibility instantly.
  await page.getByRole('button', { name: 'Отклонить' }).click({ timeout: 3000 }).catch(() => {})

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

  // The cookie banner can reappear on this route too.
  await page.getByRole('button', { name: 'Отклонить' }).click({ timeout: 3000 }).catch(() => {})

  // Without a subscription, dishes beyond the free preview are marked with a
  // locked cover instead of KBJU data. Assert on DOM presence rather than
  // CSS visibility — the cover's reveal transition is tied to its dish
  // image finishing loading, which is unrelated to the access-gating logic
  // this test cares about and would make the check flaky.
  const lockedDishes = page.locator('.rsm2-row__cover--paywalled')
  await expect(lockedDishes.first()).toBeAttached()
  expect(await lockedDishes.count()).toBeGreaterThan(0)

  // NOTE: this used to also simulate an activated subscription (via a
  // `rs_access_state` localStorage flag + `rs-access-update` event) and
  // assert the locked covers disappeared. That trick no longer proves
  // anything: KBJU/composition for dishes past the free preview is now
  // trimmed server-side (see the 2026-09-12 paywall security fix), so no
  // client-side flag can unlock data the API never sent. Verifying the
  // "subscribed user sees the full menu" side needs a real authenticated
  // session with an active subscription, which is tracked separately.
})
