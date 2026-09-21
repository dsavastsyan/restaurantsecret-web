import { expect, test } from '@playwright/test'

// The menu API response now carries chainHubPath (set server-side — see
// restaurantsecret-api's restaurants.js) for branches of a multi-location
// chain whose bare brand URL actually resolves to a hub. Menu.jsx should
// canonicalize to that hub instead of its own URL; a standalone restaurant
// (chainHubPath: null) must keep pointing at itself. Mocking the API here
// makes the test deterministic and independent of whether staging has this
// backend change deployed yet.
const MENU_FIXTURE = {
  name: 'Сыроварня',
  slug: 'syrovarnya-almetevsk',
  categories: [],
  restaurant: { slug: 'syrovarnya-almetevsk', name: 'Сыроварня', city: 'Альметьевск' },
  city: 'Альметьевск',
  instagramUrl: null,
  snapshot: null,
  menuCapturedAt: null,
  autoUpdated: false,
  chainSlug: 'syrovarnya',
  chainName: 'Сыроварня',
  chainHubPath: '/restaurants/syrovarnya/',
  items: [],
}

test('@smoke a chain branch menu page canonicalizes to the chain hub', async ({ page }) => {
  // Match only the API fetch (dev mode points at the staging Worker's own
  // origin — see src/config/api.js), not the SPA's own /restaurants/.../menu
  // route, which the app's client-side router also navigates to and which a
  // bare "**/restaurants/.../menu*" glob would incorrectly intercept too.
  await page.route((url) =>
    url.pathname.endsWith('/restaurants/syrovarnya-almetevsk/menu')
      && (url.pathname.startsWith('/api/') || !['127.0.0.1', 'localhost'].includes(url.hostname)), (route) =>
    route.fulfill({ json: MENU_FIXTURE })
  )

  await page.goto('/restaurants/syrovarnya-almetevsk/menu')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Сыроварня')

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://restaurantsecret.ru/restaurants/syrovarnya/'
  )
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('@smoke a standalone restaurant menu page still canonicalizes to itself', async ({ page }) => {
  await page.route((url) =>
    url.pathname.endsWith('/restaurants/solo-restaurant/menu')
      && (url.pathname.startsWith('/api/') || !['127.0.0.1', 'localhost'].includes(url.hostname)), (route) =>
    route.fulfill({
      json: {
        ...MENU_FIXTURE,
        name: 'Solo Restaurant',
        slug: 'solo-restaurant',
        restaurant: { slug: 'solo-restaurant', name: 'Solo Restaurant', city: 'Москва' },
        city: 'Москва',
        chainSlug: null,
        chainName: null,
        chainHubPath: null,
      },
    })
  )

  await page.goto('/restaurants/solo-restaurant/menu')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Solo Restaurant')

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://restaurantsecret.ru/restaurants/solo-restaurant/menu/'
  )
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})
