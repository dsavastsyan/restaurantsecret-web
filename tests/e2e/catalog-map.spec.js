import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })
test.describe.configure({ mode: 'serial' })

const restaurant = {
  id: 'coffee-1',
  slug: 'coffee-test',
  name: 'Кофемания Тестовая',
  cuisine: 'Европейская',
  chainSlug: 'coffeemania',
  chainName: 'Кофемания',
  primary_venue_type: 'coffee_tea',
  metro: 'Тверская',
  metroNames: ['Тверская', 'Лубянка'],
  metroStations: [
    { name: 'Тверская', lineColorHex: '7E57C2', distanceMeters: 500 },
    { name: 'Лубянка', lineColorHex: 'E53935', distanceMeters: 750 },
    { name: 'Кузнецкий Мост', lineColorHex: '43A047', distanceMeters: 900 },
  ],
  lat: 55.7645,
  lon: 37.6055,
  dishesCount: 42,
  autoUpdated: true,
}

const sheRestaurant = {
  ...restaurant,
  id: 'she-1',
  slug: 'she-test',
  name: 'She Тестовая',
  chainSlug: 'she',
  chainName: 'She',
}

const isCatalogApi = (url) => (
  url.hostname === 'restaurantsecret-api-staging.dsavastyan.workers.dev'
  || /^\/api(?:\/catalog)?\//.test(url.pathname)
)

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw4AAAAASUVORK5CYII=',
  'base64',
)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('catalog_city', 'Москва')
    window.localStorage.setItem('rs_consent_v1', JSON.stringify({
      analytics: 'denied',
      updatedAt: new Date().toISOString(),
      policyVersion: 'cookies_v1_2026-01-16',
    }))
  })

  await page.route('**/maintenance.json?*', (route) => route.fulfill({ json: { enabled: false } }))
  await page.route('https://tiles.openfreemap.org/styles/positron*', (route) => route.fulfill({
    json: {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f4f4f1' } }],
    },
  }))

  await page.route((url) => isCatalogApi(url), (route) => {
    const path = new URL(route.request().url()).pathname

    if (path.endsWith('/restaurants/map')) return route.fulfill({ json: { items: [restaurant] } })
    if (path.endsWith('/restaurants')) return route.fulfill({ json: { items: [restaurant], total: 1 } })
    if (path.endsWith('/metro')) {
      return route.fulfill({
        json: {
          lines: [
            { id: 1, name_ru: 'Тестовая линия', color_hex: 'E53935' },
            { id: 2, name_ru: 'Другая линия', color_hex: '2563EB' },
          ],
          stations: [
            { id: 1, city: 'Москва', name_ru: 'Тверская', line_id: 1, lat: 55.7653, lon: 37.6038 },
            { id: 2, city: 'Москва', name_ru: 'Лубянка', line_id: 2, lat: 55.7597, lon: 37.6272 },
            { id: 3, city: 'Москва', name_ru: 'Выхино', line_id: 2, lat: 55.7163, lon: 37.8186 },
          ],
        },
      })
    }
    if (path.endsWith('/cities')) {
      return route.fulfill({
        json: {
          items: [{ id: 'Москва', name: 'Москва', center: { lat: 55.751244, lon: 37.618423 }, recommendedZoom: 11 }],
        },
      })
    }
    if (path.endsWith('/filters')) {
      return route.fulfill({
        json: {
          cuisines: ['Европейская'],
          venue_types: [
            { id: 'restaurant', name: 'Рестораны' },
            { id: 'cafe', name: 'Кафе' },
            { id: 'coffee_tea', name: 'Кофе и чай' },
            { id: 'fast_food', name: 'Быстрая еда' },
          ],
        },
      })
    }
    if (path.endsWith('/search')) return route.fulfill({ json: { restaurants: [], dishes: [], otherCities: [] } })

    return route.fulfill({ json: {} })
  })
})

test('opens on the map, shows a restaurant card and persists list view in the URL', async ({ page }) => {
  const mapRuntimeErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /Worker failed to load|Map has no maxZoom/i.test(message.text())) {
      mapRuntimeErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    if (/Worker failed to load|Map has no maxZoom/i.test(error.message)) mapRuntimeErrors.push(error.message)
  })

  await page.goto('/catalog/moskva/')

  await expect(page.getByRole('button', { name: 'Карта', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.catalog-map-panel')).toBeVisible()
  await expect(page.locator('.catalog-map-panel .maplibregl-canvas')).toBeVisible()
  await expect(page.locator('.catalog-map-panel .leaflet-control-attribution')).toContainText('OpenFreeMap')
  await expect(page.locator('.catalog-map-panel .leaflet-tile-pane img')).toHaveCount(0)
  await page.waitForTimeout(1000)
  expect(mapRuntimeErrors).toEqual([])
  await expect(page.locator('.catalog-map-panel .rs-metro-marker')).toHaveCount(3, { timeout: 15_000 })
  await expect(page.locator('.catalog-map-pin-wrapper')).toHaveCount(1)

  await page.locator('.catalog-map-pin-wrapper').click()
  const mapCard = page.locator('.catalog-map-card')
  await expect(mapCard.getByRole('heading', { name: restaurant.name })).toBeVisible()
  await expect(mapCard.locator('.metro-stations__list')).toHaveText('м Тверская (500м), м Лубянка (750м)')
  await expect(mapCard).not.toContainText('Кузнецкий Мост')
  await mapCard.getByRole('button', { name: 'Развернуть все' }).click()
  await expect(mapCard).toContainText('м Кузнецкий Мост (900м)')
  await expect(mapCard.getByRole('button', { name: 'Открыть меню' })).toBeVisible()

  await page.getByRole('button', { name: 'Список', exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('list')
  await expect(page.locator('.catalog-card')).toHaveCount(1)
  await expect(page.locator('.catalog-card__metro')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Список', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.catalog-grid')).toBeVisible()
})

test('falls back to raster tiles when the vector base map cannot load', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/styles/positron*', (route) => route.fulfill({
    json: {
      version: 8,
      sources: {
        openmaptiles: {
          type: 'vector',
          tiles: ['https://tiles.openfreemap.org/broken/{z}/{x}/{y}.pbf'],
        },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#f4f4f1' } },
        { id: 'roads', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
      ],
    },
  }))
  await page.route('https://tiles.openfreemap.org/broken/**', (route) => route.abort('failed'))
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    body: transparentPng,
    contentType: 'image/png',
  }))

  await page.goto('/catalog/moskva/')

  await expect(page.locator('.catalog-map-panel .leaflet-tile-pane img')).not.toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.catalog-map-panel .maplibregl-canvas')).toHaveCount(0)
  await expect(page.locator('.catalog-map-panel .leaflet-control-attribution')).toContainText('OpenStreetMap')
})

test('falls back to raster tiles when the vector style request stalls', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/styles/positron*', () => new Promise(() => {}))
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    body: transparentPng,
    contentType: 'image/png',
  }))

  await page.goto('/catalog/moskva/')

  await expect(page.locator('.catalog-map-panel .leaflet-tile-pane img')).not.toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.catalog-map-panel .maplibregl-canvas')).toHaveCount(0)
  await expect(page.locator('.catalog-map-panel .leaflet-control-attribution')).toContainText('OpenStreetMap')
})

test('falls back to raster tiles when WebGL context is lost', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.fulfill({
    body: transparentPng,
    contentType: 'image/png',
  }))

  await page.goto('/catalog/moskva/')

  const canvas = page.locator('.catalog-map-panel .maplibregl-canvas')
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  })

  await expect(page.locator('.catalog-map-panel .leaflet-tile-pane img')).not.toHaveCount(0, { timeout: 15_000 })
  await expect(canvas).toHaveCount(0)
  await expect(page.locator('.catalog-map-panel .leaflet-control-attribution')).toContainText('OpenStreetMap')
})

test('filters both map and list by the primary venue type', async ({ page }) => {
  await page.goto('/catalog/moskva/')

  await page.getByLabel('Тип заведения').selectOption('coffee_tea')
  await expect(page.locator('.catalog-map-pin-wrapper')).toHaveCount(1)

  await page.getByLabel('Тип заведения').selectOption('restaurant')
  await expect(page.locator('.catalog-map-pin-wrapper')).toHaveCount(0)

  await page.getByRole('button', { name: 'Список', exact: true }).click()
  await expect(page.locator('.catalog-card')).toHaveCount(0)
})

test('shows the filtered restaurant count above the list', async ({ page }) => {
  await page.goto('/catalog/moskva/?view=list')

  const summary = page.locator('.catalog-results__summary')
  await expect(summary).toHaveText('Найдено: 1 ресторан')

  await page.getByLabel('Тип заведения').selectOption('restaurant')
  await expect(summary).toHaveText('Найдено: 0 ресторанов')
})

test('keeps the auto-update badge next to the restaurant name', async ({ page }) => {
  await page.route((url) => (
    isCatalogApi(url) && new URL(url).pathname.endsWith('/restaurants')
  ), (route) => route.fulfill({
    json: {
      items: [{ ...restaurant, chainSlug: null, chainName: null }],
      total: 1,
    },
  }))
  await page.goto('/catalog/moskva/?view=list')

  const title = page.locator('.catalog-card__title')
  const name = title.locator('.catalog-card__title-text')
  const badge = title.locator('.catalog-card__auto-updated')

  await expect(badge).toBeVisible()
  await expect(page.locator('.catalog-card__metro .metro-stations__list')).toHaveText('м Тверская (500м), м Лубянка (750м)')
  await expect(page.locator('.catalog-card')).not.toContainText('Кузнецкий Мост')
  await page.getByRole('button', { name: 'Развернуть все' }).click()
  await expect(page.locator('.catalog-card__metro')).toContainText('м Кузнецкий Мост (900м)')
  await page.getByRole('button', { name: 'Свернуть' }).click()
  await expect(page.locator('.catalog-card')).not.toContainText('Кузнецкий Мост')
  await expect(page.locator('.catalog-card__metro .metro-stations__symbol').first()).toHaveCSS('color', 'rgb(126, 87, 194)')
  await expect(title).toHaveCSS('display', 'flex')

  const [nameBox, badgeBox] = await Promise.all([
    name.boundingBox(),
    badge.boundingBox(),
  ])

  expect(nameBox).not.toBeNull()
  expect(badgeBox).not.toBeNull()
  expect(Math.abs(
    (nameBox.y + nameBox.height / 2) - (badgeBox.y + badgeBox.height / 2),
  )).toBeLessThanOrEqual(1)
  expect(badgeBox.x - (nameBox.x + nameBox.width)).toBeLessThanOrEqual(14)
})

test('list includes restaurants whose map point is near the selected metro', async ({ page }) => {
  await page.goto('/catalog/moskva/?view=list')

  await page.getByRole('button', { name: 'Станции метро' }).click()
  await page.getByPlaceholder('Поиск станции...').fill('Лубянка')
  await page.getByRole('button', { name: 'Лубянка', exact: true }).click()

  await expect(page.locator('.catalog-card')).toHaveCount(1)
  await expect(page.locator('.catalog-card')).toContainText(restaurant.chainName)
})

test('suggests a matching chain and leaves only nearby metro markers after selection', async ({ page }) => {
  await page.goto('/catalog/moskva/')

  const search = page.getByRole('combobox', { name: 'Поиск по ресторанам' })
  await search.fill('Кофе')

  const suggestion = page.getByRole('option', { name: /Кофемания/ })
  await expect(suggestion).toBeVisible()
  await expect(suggestion).toContainText('Сеть · 1 ресторан')
  await suggestion.click()

  await expect(search).toHaveValue('Кофемания')
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Кофемания')
  await expect(page.locator('.catalog-map-pin-wrapper')).toHaveCount(1)
  await expect(page.locator('.catalog-map-panel .rs-metro-marker')).toHaveCount(2)
})

test('finds the She chain by the Cyrillic query ши', async ({ page }) => {
  await page.route((url) => {
    const path = new URL(url).pathname
    return isCatalogApi(url) && path.endsWith('/restaurants') && !path.endsWith('/restaurants/map')
  }, (route) => route.fulfill({ json: { items: [sheRestaurant], total: 1 } }))

  await page.goto('/catalog/moskva/?view=list')
  await page.getByRole('combobox', { name: 'Поиск по ресторанам' }).fill('ши')

  await expect(page.getByRole('option', { name: /She/ })).toBeVisible()
})

test('highlights only stations selected through a metro line', async ({ page }) => {
  await page.goto('/catalog/moskva/')

  await expect(page.locator('.catalog-map-panel .rs-metro-marker')).toHaveCount(3, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Станции метро' }).click()
  await page.getByRole('button', { name: 'Тестовая линия', exact: true }).click()

  await expect(page.locator('.catalog-map-panel .rs-metro-marker.is-selected')).toHaveCount(1)
  await expect(page.locator('.catalog-map-panel .rs-metro-marker.is-muted')).toHaveCount(2)
})
