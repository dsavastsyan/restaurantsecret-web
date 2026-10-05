import { expect, test } from '@playwright/test'

const STAGING_API_HOSTNAME = 'restaurantsecret-api-staging.dsavastyan.workers.dev'

const waitForSuccessfulResponse = (page, predicate) =>
  page.waitForResponse((response) => {
    if (!predicate(response)) return false
    return response.ok()
  })

test('@smoke landing to restaurant flow is gated by paywall', async ({ page }) => {
  // This is a deployed-preview integration check against the full staging
  // catalog, not a mocked UI test. The real catalog response can take longer
  // than Playwright's 30s default while D1 is under load.
  test.setTimeout(60_000)
  const mapRuntimeErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /Worker failed to load|Map has no maxZoom/i.test(message.text())) {
      mapRuntimeErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    if (/Worker failed to load|Map has no maxZoom/i.test(error.message)) mapRuntimeErrors.push(error.message)
  })

  const landingStatsResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const path = new URL(response.url()).pathname
    return path.endsWith('/landing/stats') && response.request().method() === 'GET'
  })

  await page.goto('/')

  const landingStatsResponse = await landingStatsResponsePromise
  const landingStats = await landingStatsResponse.json()
  expect(landingStats?.restaurants).toBeGreaterThan(0)
  expect(landingStats?.dishes).toBeGreaterThan(0)

  const heroStatValues = page.locator('.landing-warm__stat > p')
  await expect(heroStatValues.nth(0)).toHaveText(Number(landingStats.restaurants).toLocaleString('ru-RU'))
  await expect(heroStatValues.nth(1)).toHaveText(Number(landingStats.dishes).toLocaleString('ru-RU'))

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
    const url = new URL(response.url())
    const limit = Number(url.searchParams.get('limit'))
    return url.pathname.endsWith('/restaurants')
      && Number.isInteger(limit)
      && limit > 0
      && limit <= 48
      && response.request().method() === 'GET'
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

  await expect(page.locator('.catalog-map-panel')).toBeVisible()
  await expect(page.locator('.catalog-results')).toBeVisible()
  await expect(page.locator('.catalog-map-panel .maplibregl-canvas')).toBeVisible()
  await expect(page.locator('.catalog-map-panel .leaflet-control-attribution')).toContainText('OpenFreeMap')
  await expect(page.locator('.catalog-map-panel .leaflet-tile-pane img')).toHaveCount(0)
  await page.waitForTimeout(1000)
  expect(mapRuntimeErrors).toEqual([])
  const previewPersonaToggle = page.locator('.preview-persona-panel__toggle')
  if (await previewPersonaToggle.isVisible() && await previewPersonaToggle.getAttribute('aria-expanded') === 'true') {
    await previewPersonaToggle.click()
  }
  const firstCardButton = page
    .locator('.catalog-card:not(.catalog-card--chain)')
    .first()
    .getByRole('button', { name: 'Открыть меню' })
  await expect(firstCardButton).toBeVisible()

  // Opening a restaurant navigates straight into its menu (no blocking modal
  // — the site now gates per dish, showing the first few free and hiding the
  // rest behind a subscribe prompt on each card).
  const restaurantResponsePromise = waitForSuccessfulResponse(page, (response) => {
    const url = new URL(response.url())
    const isDirectStagingRequest = url.hostname === STAGING_API_HOSTNAME
      && /^\/restaurants\/[^/]+\/menu\/?$/.test(url.pathname)
    const isSameOriginProxyRequest = /^\/api(?:\/catalog)?\/restaurants\/[^/]+\/menu\/?$/.test(url.pathname)

    return (isDirectStagingRequest || isSameOriginProxyRequest)
      && response.request().method() === 'GET'
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

test('@smoke subscribed user sees the full menu past the free preview', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL
  const otp = process.env.E2E_TEST_OTP
  test.skip(!email || !otp, 'E2E_TEST_EMAIL / E2E_TEST_OTP not configured — see pd-api routes/auth.js')

  const pdApiBase = process.env.VITE_PD_API_BASE || 'https://pd.restaurantsecret.ru'
  const publicApiBase = process.env.VITE_API_BASE_URL || `${pdApiBase}/cf`

  // Log in as the dedicated e2e-test account directly against the API. This
  // test is about the server-side paywall trimming, not the login UI — the
  // UI's own OTP flow isn't exercised here, only pd-api's bypass code path.
  const requestOtpRes = await page.request.post(`${pdApiBase}/auth/request-otp`, { data: { email } })
  expect(requestOtpRes.ok()).toBeTruthy()

  const verifyRes = await page.request.post(`${pdApiBase}/auth/verify-otp`, { data: { email, code: otp } })
  expect(verifyRes.ok()).toBeTruthy()
  const verifyPayload = await verifyRes.json()
  const accessToken = verifyPayload?.access_token
  expect(accessToken).toBeTruthy()
  const authHeaders = { Authorization: `Bearer ${accessToken}` }

  // Find a restaurant with more dishes than the free-preview count (3) —
  // otherwise there'd be no dish for an anonymous caller to have trimmed.
  const catalogRes = await page.request.get(`${publicApiBase}/restaurants?limit=1000`)
  expect(catalogRes.ok()).toBeTruthy()
  const catalogPayload = await catalogRes.json()
  const candidates = catalogPayload?.items || []
  expect(candidates.length).toBeGreaterThan(0)

  const menuUrl = (slug) => `${publicApiBase}/restaurants/${slug}/menu?city=${encodeURIComponent('Москва')}`
  const flattenDishes = (menu) => (menu?.categories || []).flatMap((c) => c.dishes || [])

  let targetSlug = null
  let anonDishes = null
  for (const candidate of candidates) {
    const anonRes = await page.request.get(menuUrl(candidate.slug))
    if (!anonRes.ok()) continue
    const dishes = flattenDishes(await anonRes.json())
    if (dishes.length > 3) {
      targetSlug = candidate.slug
      anonDishes = dishes
      break
    }
  }
  expect(targetSlug, 'expected at least one catalog restaurant with more than 3 dishes').toBeTruthy()

  // Sanity-check the premise: an anonymous caller must NOT get the 4th
  // dish's KBJU — otherwise this test would prove nothing either way.
  expect(anonDishes[3].kcal).toBeNull()

  // The whole point: this app UI hits this exact endpoint (src/pages/Menu.jsx)
  // with the session token as an Authorization header — reproduce that call
  // directly rather than through the rendered page, since what the page's
  // own fetch resolves to (prod vs. the dev-mode staging default in
  // src/config/api.js) is a frontend build concern unrelated to the
  // server-side entitlement check this test cares about.
  const authRes = await page.request.get(menuUrl(targetSlug), { headers: authHeaders })
  expect(authRes.ok()).toBeTruthy()
  const authDishes = flattenDishes(await authRes.json())
  expect(authDishes.length).toBe(anonDishes.length)

  // A real active subscription must unlock every dish, not just the free
  // preview — this is exactly what a client-side flag could never prove
  // after the 2026-09-12 server-side trimming fix.
  for (const dish of authDishes) {
    expect(dish.kcal).not.toBeNull()
  }
})
