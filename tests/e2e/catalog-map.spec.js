import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

const restaurant = {
  id: 'coffee-1',
  slug: 'coffee-test',
  name: 'Кофемания Тестовая',
  cuisine: 'Европейская',
  primary_venue_type: 'coffee_tea',
  metro: 'Тверская',
  lat: 55.7645,
  lon: 37.6055,
  dishesCount: 42,
}

const isCatalogApi = (url) => (
  url.hostname === 'restaurantsecret-api-staging.dsavastyan.workers.dev'
  || /^\/api(?:\/catalog)?\//.test(url.pathname)
)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('catalog_city', 'Москва')
  })

  await page.route('**/maintenance.json?*', (route) => route.fulfill({ json: { enabled: false } }))

  await page.route((url) => isCatalogApi(url), (route) => {
    const path = new URL(route.request().url()).pathname

    if (path.endsWith('/restaurants/map')) return route.fulfill({ json: { items: [restaurant] } })
    if (path.endsWith('/restaurants')) return route.fulfill({ json: { items: [restaurant], total: 1 } })
    if (path.endsWith('/metro')) {
      return route.fulfill({
        json: {
          lines: [],
          stations: [{ id: 1, city: 'Москва', name_ru: 'Тверская', lat: 55.7653, lon: 37.6038 }],
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
  await page.goto('/catalog/moskva/')

  await expect(page.getByRole('button', { name: 'Карта', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.catalog-map-panel')).toBeVisible()
  await expect(page.locator('.catalog-map-panel .leaflet-control-attribution')).toContainText('OpenStreetMap')
  const firstTile = page.locator('.catalog-map-panel .leaflet-tile-pane img').first()
  await expect(firstTile).toBeVisible()
  await expect(firstTile).toHaveAttribute('src', /tile\.openstreetmap\.org/)
  await expect(page.locator('.catalog-map-panel .rs-metro-marker')).toHaveCount(1)
  await expect(page.locator('.catalog-map-pin-wrapper')).toHaveCount(1)

  await page.locator('.catalog-map-pin-wrapper').click()
  const mapCard = page.locator('.catalog-map-card')
  await expect(mapCard.getByRole('heading', { name: restaurant.name })).toBeVisible()
  await expect(mapCard.getByRole('button', { name: 'Открыть меню' })).toBeVisible()

  await page.getByRole('button', { name: 'Список', exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('list')
  await expect(page.locator('.catalog-card')).toHaveCount(1)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Список', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.catalog-grid')).toBeVisible()
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
