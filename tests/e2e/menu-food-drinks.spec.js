import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

const dish = (id, name, menuSection, category) => ({
  id,
  name,
  menuSection,
  normalizedCategory: category,
  per: 'portion',
  kcal: 200,
  protein: 10,
  fat: 8,
  carbs: 20,
})

const mixedMenu = {
  name: 'Тестовое меню',
  categories: [
    { name: 'Кофе', menuSection: 'drinks', dishes: [dish(1, 'Латте', 'drinks', 'Кофе')] },
    {
      name: 'Закуски',
      menuSection: 'food',
      dishes: [
        dish(20, 'Брускетта', 'food', 'Закуски'),
        dish(2, 'Хумус', 'food', 'Закуски'),
      ],
    },
    { name: 'Салаты', menuSection: 'food', dishes: [dish(3, 'Цезарь', 'food', 'Салаты')] },
    { name: 'Холодные напитки', menuSection: 'drinks', dishes: [dish(4, 'Лимонад', 'drinks', 'Холодные напитки')] },
  ],
}

const isApiRequest = (url, suffix) => (
  url.hostname === 'restaurantsecret-api-staging.dsavastyan.workers.dev'
    || /^\/api(?:\/catalog)?\//.test(url.pathname)
) && url.pathname.endsWith(suffix)

async function mockMenu(page, payload) {
  await page.route((url) => isApiRequest(url, '/restaurants/test-menu/menu'), (route) => route.fulfill({ json: payload }))
  await page.route((url) => isApiRequest(url, '/restaurants/map'), (route) => route.fulfill({ json: { items: [] } }))
}

test('menu defaults to food, then expands into curated category order', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')

  const sectionTabs = page.getByRole('tablist', { name: 'Раздел меню' })
  await expect(sectionTabs).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Еда' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Закуски' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Салаты' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Кофе' })).toHaveCount(0)

  const headings = page.locator('.rsm2-section__title')
  await expect(headings).toHaveText(['Закуски', 'Салаты'])
  await expect(page.locator('.rsm2-grid.rsm2-desktop-only .rsm2-tile__cover-name')).toHaveText([
    'Брускетта',
    'Хумус',
  ])

  await page.getByRole('tab', { name: 'Напитки' }).click()
  await expect(page.getByRole('heading', { name: 'Кофе' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Холодные напитки' })).toBeVisible()
  await expect(headings).toHaveText(['Кофе', 'Холодные напитки'])
})

test('section switch stays hidden when the menu has only food', async ({ page }) => {
  await mockMenu(page, { ...mixedMenu, categories: mixedMenu.categories.filter((category) => category.menuSection === 'food') })
  await page.goto('/restaurants/test-menu/menu')

  await expect(page.getByRole('tablist', { name: 'Раздел меню' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Закуски' })).toBeVisible()
})
