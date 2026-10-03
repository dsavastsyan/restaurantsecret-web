import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('rs_menu_guide_v1', 'dismissed')
    localStorage.setItem('rs_consent_v1', JSON.stringify({
      analytics: 'denied',
      updatedAt: new Date().toISOString(),
      policyVersion: 'cookies_v1_2026-01-16',
    }))
  })
})

const dish = (id, name, menuSection, category, nutrition = {}) => ({
  id,
  name,
  menuSection,
  normalizedCategory: category,
  per: 'portion',
  kcal: nutrition.kcal ?? 200,
  protein: nutrition.protein ?? 10,
  fat: nutrition.fat ?? 8,
  carbs: nutrition.carbs ?? 20,
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

async function dismissMenuGuide(page) {
  const dismiss = page.locator('.rsm2-guide__dismiss')
  await expect(dismiss).toBeVisible()
  await dismiss.click()
  await expect(page.locator('.rsm2-guide-scrim')).toHaveCount(0)
}

test('menu defaults to food, then expands into curated category order', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')
  await dismissMenuGuide(page)

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

test('first onboarding hint collapses filters without applying one and shows the second hint', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')

  const filterToggle = page.getByRole('button', { name: /Фильтры/ })
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true')
  const lowKcal = page.locator('.rsm2-filter-cluster .rsm2-chip').first()
  await expect(lowKcal).toBeVisible()

  await lowKcal.click()
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.rsm2-filter-cluster')).toHaveCount(0)
  await expect(page.locator('.rsm2-filter-toggle__count')).toHaveCount(0)
  await expect(page.locator('.rsm2-guide--dish')).toContainText('Добавляйте любимые меню и рестораны в избранное')

  await filterToggle.click()
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('tab', { name: 'Еда' })).toBeVisible()
})

test('section switch stays hidden when the menu has only food', async ({ page }) => {
  await mockMenu(page, { ...mixedMenu, categories: mixedMenu.categories.filter((category) => category.menuSection === 'food') })
  await page.goto('/restaurants/test-menu/menu')

  await expect(page.getByRole('tablist', { name: 'Раздел меню' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Закуски' })).toBeVisible()
})

test('keeps the curated order by default and sorts only after an explicit choice', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rs_access', 'active-token')
  })
  await page.route((url) => isApiRequest(url, '/api/subscriptions/status'), (route) => route.fulfill({
    json: { status: 'active', statusNorm: 'active' },
  }))
  await mockMenu(page, {
    name: 'Меню с сортировкой',
    categories: [
      {
        name: 'Закуски',
        menuSection: 'food',
        dishes: [
          dish(1, 'Калорийная закуска', 'food', 'Закуски', { kcal: 700, protein: 8, fat: 30 }),
          dish(2, 'Лёгкая закуска', 'food', 'Закуски', { kcal: 300, protein: 22, fat: 5 }),
        ],
      },
      {
        name: 'Салаты',
        menuSection: 'food',
        dishes: [
          dish(3, 'Сытный салат', 'food', 'Салаты', { kcal: 500, protein: 12, fat: 20 }),
          dish(4, 'Свежий салат', 'food', 'Салаты', { kcal: 150, protein: 6, fat: 3 }),
        ],
      },
    ],
  })
  await page.goto('/restaurants/test-menu/menu')
  await dismissMenuGuide(page)

  const sections = page.locator('.rsm2-section__head')
  const firstSort = sections.nth(0).getByRole('button', { name: /Сортировка категории/ })
  const firstCards = page.locator('.rsm2-grid.rsm2-desktop-only').nth(0).locator('.rsm2-tile__cover-name, .rsm2-paywall__name')
  const secondCards = page.locator('.rsm2-grid.rsm2-desktop-only').nth(1).locator('.rsm2-tile__cover-name, .rsm2-paywall__name')

  await expect(firstSort).toContainText('Сортировать')
  await expect(firstCards).toHaveText(['Калорийная закуска', 'Лёгкая закуска'])
  await expect(secondCards).toHaveText(['Сытный салат', 'Свежий салат'])

  await firstSort.click()
  let sortMenu = page.getByRole('menu')
  await sortMenu.getByRole('menuitem', { name: 'Белки' }).click()
  await sortMenu.getByRole('button', { name: 'Только категория' }).click()
  await sortMenu.getByRole('button', { name: 'По возрастанию' }).click()

  await expect(firstCards).toHaveText(['Калорийная закуска', 'Лёгкая закуска'])
  await expect(secondCards).toHaveText(['Сытный салат', 'Свежий салат'])

  await firstSort.click()
  sortMenu = page.getByRole('menu')
  await sortMenu.getByRole('button', { name: 'По убыванию' }).click()
  await expect(firstCards).toHaveText(['Лёгкая закуска', 'Калорийная закуска'])

  await firstSort.click()
  sortMenu = page.getByRole('menu')
  await sortMenu.getByRole('button', { name: 'Всё меню' }).click()
  await sortMenu.getByRole('menuitem', { name: 'Белки' }).click()
  await sortMenu.getByRole('button', { name: 'По возрастанию' }).click()
  await expect(firstCards).toHaveText(['Калорийная закуска', 'Лёгкая закуска'])
  await expect(secondCards).toHaveText(['Свежий салат', 'Сытный салат'])

  await firstSort.click()
  await page.getByRole('menu').getByRole('button', { name: 'Сбросить' }).click()
  await expect(firstSort).toContainText('Сортировать')
  await expect(firstCards).toHaveText(['Калорийная закуска', 'Лёгкая закуска'])
  await expect(secondCards).toHaveText(['Сытный салат', 'Свежий салат'])
})

test('sends a guest to the subscription flow when sorting is attempted', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('rs_menu_guide_v2', 'dismissed')
  })
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')

  const firstSort = page.locator('.rsm2-section__head').first().getByRole('button', { name: /Сортировка категории/ })
  await firstSort.click()
  await expect(page).toHaveURL(/\/login$/)
})

test('diary CTA opens the AnyEat waitlist modal instead of writing to the web diary', async ({ page }) => {
  let diaryRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/diary') diaryRequests += 1
  })

  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')
  await dismissMenuGuide(page)

  await page.locator('.rsm2-desktop-only .rsm2-dbtn').first().click()

  const modal = page.getByRole('dialog', { name: /Вся еда/ })
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Скоро в приложении')).toBeVisible()
  await expect(modal.getByRole('button', { name: /Получить код/ })).toBeVisible()

  await modal.getByRole('button', { name: 'Закрыть' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.rsm2-mobile-only .rsm2-dbtn').first().click()
  await expect(modal).toBeVisible()
  expect(diaryRequests).toBe(0)
})
