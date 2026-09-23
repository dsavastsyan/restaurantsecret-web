import { expect, test } from '@playwright/test'

test('updates landing counters and map when the city changes', async ({ page }) => {
  const mapCities = []

  await page.addInitScript(() => {
    window.localStorage.setItem('catalog_city', 'Москва')
    window.localStorage.setItem('rs_maint_bypass', 'RS-DEV-BYPASS-KEY-TOKEN-2026')
  })

  await page.route('**/cities', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [
        { id: 'Москва', name: 'Москва', center: { lat: 55.751244, lon: 37.618423 }, recommendedZoom: 10 },
        { id: 'Санкт-Петербург', name: 'Санкт-Петербург', center: { lat: 59.93428, lon: 30.335099 }, recommendedZoom: 10 },
      ],
    }),
  }))
  await page.route('**/landing/stats?city=*', (route) => {
    const city = new URL(route.request().url()).searchParams.get('city')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(city === 'Санкт-Петербург'
        ? { restaurants: 8, dishes: 1200, weeklyAdded: 2 }
        : { restaurants: 316, dishes: 36803, weeklyAdded: 12 }),
    })
  })
  await page.route('**/restaurants/map?*', (route) => {
    mapCities.push(new URL(route.request().url()).searchParams.get('city'))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })
  await page.route('**/restaurants?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [] }),
  }))
  await page.route('**/filters?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ cuisines: [] }),
  }))
  await page.route('**/metro', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ lines: [], stations: [] }),
  }))

  await page.goto('/')
  await expect(page.locator('.landing-warm__stats p').first()).toHaveText('316')

  await page.locator('.landing-warm__city-picker--desktop button').evaluate((button) => button.click())
  const dialog = page.getByRole('dialog', { name: 'Выберите город' })
  await dialog.getByRole('button', { name: /Санкт-Петербург/ }).evaluate((button) => button.click())

  await expect(page.locator('.landing-warm__stats p').first()).toHaveText('8')
  await expect(page.locator('.landing-warm__stats p').nth(1)).toHaveText('1 200')
  await expect(page.locator('.landing-warm__stats p').nth(2)).toHaveText('+2')
  await page.locator('#map').scrollIntoViewIfNeeded()
  await expect(page.locator('.landing-warm__map-overlay h3')).toContainText('города Санкт-Петербург')
  await expect.poll(() => mapCities.includes('Санкт-Петербург')).toBe(true)
})
