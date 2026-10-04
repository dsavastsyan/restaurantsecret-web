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

const catalogCities = {
  items: [
    { id: 'Москва', name: 'Москва', restaurantCount: 601 },
    { id: 'Казань', name: 'Казань', restaurantCount: 89 },
    { id: 'Минск', name: 'Минск', restaurantCount: 12 },
  ],
}

const isApiRequest = (url, suffix) => (
  url.hostname === 'restaurantsecret-api-staging.dsavastyan.workers.dev'
    || /^\/api(?:\/catalog)?\//.test(url.pathname)
) && url.pathname.endsWith(suffix)

async function mockMenu(page, payload) {
  await page.route((url) => isApiRequest(url, '/restaurants/test-menu/menu'), (route) => route.fulfill({ json: payload }))
  await page.route((url) => isApiRequest(url, '/restaurants/map'), (route) => route.fulfill({ json: { items: [] } }))
  await page.route((url) => isApiRequest(url, '/cities'), (route) => route.fulfill({ json: catalogCities }))
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

test('places the outdated-menu action after the hero icons', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')

  await expect.poll(() => page.locator('.rsm2-hero__actions > button').evaluateAll((buttons) => (
    buttons.map((button) => button.getAttribute('aria-label') || button.textContent.trim())
  ))).toEqual([
    'Добавить ресторан в избранное',
    'Показать на карте',
    'Поделиться',
    'Меню устарело?',
  ])
})

test('first onboarding hint collapses filters without applying one and shows the second hint', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')

  const filterToggle = page.getByRole('button', { name: /Фильтры/ })
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true')
  const lowKcal = page.locator('.rsm2-filter-cluster .rsm2-chip').first()
  await expect(lowKcal).toBeVisible()
  await expect(page.locator('.rsm2-filter-panel .rsm2-guide--filters')).toBeVisible()

  await lowKcal.click()
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.rsm2-filter-cluster')).toHaveCount(0)
  await expect(page.locator('.rsm2-filter-toggle__count')).toHaveCount(0)
  await expect(page.locator('.rsm2-guide--dish')).toContainText('Добавляйте любимые блюда и рестораны в избранное')

  await filterToggle.click()
  await expect(page.locator('.rsm2-guide--restaurants')).toBeVisible()
})

test('favorites guide bridges the restaurant and first dish hearts on desktop and mobile', async ({ page }) => {
  await mockMenu(page, mixedMenu)

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/restaurants/test-menu/menu')
    await expect(page.locator('.rsm2-guide--filters')).toBeVisible()

    const category = viewport.width <= 640
      ? page.locator('.rsm2-mobile-only .rsm2-cat').first()
      : page.locator('.rsm2-category-bar .rsm2-cat').first()
    await category.click()
    await expect(page.locator('.rsm2-guide--dish')).toBeVisible()
    await expect.poll(async () => page.evaluate(() => {
      const guide = document.querySelector('.rsm2-guide--dish')?.getBoundingClientRect()
      const restaurant = document.querySelector('.rsm2-icon-btn.is-guide-target')?.getBoundingClientRect()
      const dish = [...document.querySelectorAll('.rsm2-fav.is-guide-target')]
        .map((element) => element.getBoundingClientRect())
        .find((rect) => rect.width > 0 && rect.height > 0)
      if (!guide || !restaurant || !dish) return Number.POSITIVE_INFINITY
      const guideCenter = guide.top + guide.height / 2
      const targetCenter = (
        restaurant.top + restaurant.height / 2 + dish.top + dish.height / 2
      ) / 2
      return Math.abs(guideCenter - targetCenter)
    })).toBeLessThan(8)

    await expect(page.locator('.rsm2-guide-connectors line')).toHaveCount(2)
    const connectorEnds = await page.evaluate(() => {
      const root = document.querySelector('.rsm2-root')
      const svg = document.querySelector('.rsm2-guide-connectors')
      const restaurant = document.querySelector('.rsm2-icon-btn.is-guide-target')
      const dish = [...document.querySelectorAll('.rsm2-fav.is-guide-target')]
        .find((element) => element.getBoundingClientRect().width > 0)
      if (!root || !svg || !restaurant || !dish) return null

      const rootRect = root.getBoundingClientRect()
      const toLocal = (rect) => ({
        top: rect.top - rootRect.top,
        bottom: rect.bottom - rootRect.top,
      })
      const lines = [...svg.querySelectorAll('line')]
      return {
        restaurant: toLocal(restaurant.getBoundingClientRect()),
        dish: toLocal(dish.getBoundingClientRect()),
        restaurantLineY: Number(lines[0].getAttribute('y1')),
        dishLineY: Number(lines[1].getAttribute('y2')),
      }
    })
    expect(connectorEnds).not.toBeNull()
    expect(connectorEnds.restaurantLineY).toBeGreaterThan(connectorEnds.restaurant.top + 1)
    expect(connectorEnds.restaurantLineY).toBeLessThanOrEqual(connectorEnds.restaurant.bottom + 1)
    expect(connectorEnds.dishLineY).toBeGreaterThanOrEqual(connectorEnds.dish.top - 1)
    expect(connectorEnds.dishLineY).toBeLessThan(connectorEnds.dish.bottom - 1)
    const guideBox = await page.locator('.rsm2-guide--dish').boundingBox()
    expect(guideBox.width).toBe(viewport.width <= 640 ? viewport.width - 32 : 820)
  }
})

test('favorite targets advance the tour without changing favorites', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  const favoriteRequests = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/favorites')) favoriteRequests.push(request)
  })

  await page.goto('/restaurants/test-menu/menu')
  await expect(page.locator('.rsm2-guide--filters')).toBeVisible()
  await page.locator('.rsm2-category-bar .rsm2-cat').first().click()
  await expect(page.locator('.rsm2-guide--dish')).toBeVisible()

  await page.locator('.rsm2-icon-btn.is-guide-target').click()
  await expect(page.locator('.rsm2-guide--restaurants')).toBeVisible()
  expect(favoriteRequests).toHaveLength(0)

  await page.reload()
  await expect(page.locator('.rsm2-guide--filters')).toBeVisible()
  await page.locator('.rsm2-category-bar .rsm2-cat').first().click()
  await expect(page.locator('.rsm2-guide--dish')).toBeVisible()

  await page.locator('.rsm2-grid.rsm2-desktop-only .rsm2-fav.is-guide-target').click()
  await expect(page.locator('.rsm2-guide--restaurants')).toBeVisible()
  expect(favoriteRequests).toHaveLength(0)
})

test('second hint advances when its card is clicked away from the target', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')

  await page.locator('.rsm2-category-bar .rsm2-cat').first().click()
  await expect(page.locator('.rsm2-guide--dish')).toBeVisible()

  await page.locator('.rsm2-guide--dish .rsm2-guide__copy').click()
  await expect(page.locator('.rsm2-guide--restaurants')).toBeVisible()
})

test('third hint closes and consumes any click', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')
  await expect(page.locator('.rsm2-guide--filters')).toBeVisible()
  await page.locator('.rsm2-category-bar .rsm2-cat').first().click()
  await expect(page.locator('.rsm2-guide--dish')).toBeVisible()
  await page.locator('.rsm2-icon-btn.is-guide-target').click()
  await expect(page.locator('.rsm2-guide--restaurants')).toBeVisible()
  await expect(page.locator('.rsm2-guide--restaurants')).toContainText('Более 702 ресторанов в 3 городах')
  await expect(page.locator('.rsm2-guide--restaurants')).toHaveCSS('position', 'absolute')

  const guideAndTarget = await page.evaluate(() => {
    const guide = document.querySelector('.rsm2-guide--restaurants')?.getBoundingClientRect()
    const target = document.querySelector('.navbar__center a[data-rs-menu-nav="restaurants"]')?.getBoundingClientRect()
    if (!guide || !target) return null
    return {
      guideTop: guide.top,
      guideLeft: guide.left,
      guideRight: guide.right,
      targetBottom: target.bottom,
      targetCenter: target.left + target.width / 2,
    }
  })
  expect(guideAndTarget).not.toBeNull()
  expect(guideAndTarget.guideTop).toBeGreaterThan(guideAndTarget.targetBottom)
  expect(guideAndTarget.targetCenter).toBeGreaterThanOrEqual(guideAndTarget.guideLeft)
  expect(guideAndTarget.targetCenter).toBeLessThanOrEqual(guideAndTarget.guideRight)

  await page.getByRole('link', { name: 'Рестораны' }).click()
  await expect(page.locator('.rsm2-guide')).toHaveCount(0)
  await expect(page).toHaveURL(/\/restaurants\/test-menu\/menu/)
})

test('guide locks page scrolling until the tour is dismissed', async ({ page }) => {
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')
  await expect(page.locator('.rsm2-guide--filters')).toBeVisible()

  await expect.poll(() => page.evaluate(() => window.getComputedStyle(document.documentElement).overflow))
    .toBe('hidden')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

  await page.locator('.rsm2-guide__dismiss').click()
  await expect(page.locator('.rsm2-guide')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.getComputedStyle(document.documentElement).overflow))
    .not.toBe('hidden')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('section switch stays hidden when the menu has only food', async ({ page }) => {
  await mockMenu(page, { ...mixedMenu, categories: mixedMenu.categories.filter((category) => category.menuSection === 'food') })
  await page.goto('/restaurants/test-menu/menu')

  await expect(page.getByRole('tablist', { name: 'Раздел меню' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Закуски' })).toBeVisible()
})

test('gives milk variants more room while keeping size-only filters on one line', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rs_access', 'active-token')
    sessionStorage.setItem('rs_menu_guide_v2', 'dismissed')
  })
  await page.route((url) => isApiRequest(url, '/api/subscriptions/status'), (route) => route.fulfill({
    json: { status: 'active', statusNorm: 'active' },
  }))
  await mockMenu(page, {
    name: 'Меню с вариантами',
    categories: [{
      name: 'Кофе',
      menuSection: 'food',
      dishes: [
        {
          ...dish(10, 'Айс-латте', 'food', 'Кофе'),
          variants: [
            { ...dish(10, 'Айс-латте', 'food', 'Кофе'), size: { key: 'grand', label: 'Grand' }, milk: { key: 'regular', label: 'Обычное' } },
            { ...dish(11, 'Айс-латте', 'food', 'Кофе'), size: { key: 'tall', label: 'Tall' }, milk: { key: 'oat', label: 'Овсяное' } },
          ],
        },
        {
          ...dish(20, 'Американо', 'food', 'Кофе'),
          variants: [
            { ...dish(20, 'Американо', 'food', 'Кофе'), size: { key: 'grand', label: 'Grand' } },
            { ...dish(21, 'Американо', 'food', 'Кофе'), size: { key: 'tall', label: 'Tall' } },
          ],
        },
      ],
    }],
  })
  await page.setViewportSize({ width: 499, height: 800 })
  await page.goto('/restaurants/test-menu/menu')

  const pickers = page.locator('.rsm2-row .rsm2-variant-picker')
  await expect(pickers).toHaveCount(2)
  const layouts = await pickers.evaluateAll((elements) => elements.map((picker) => {
    const fields = [...picker.querySelectorAll('.rsm2-variant-picker__field')]
    return {
      fieldCount: fields.length,
      sizeWidth: fields.find((field) => !field.classList.contains('rsm2-variant-picker__field--milk'))?.getBoundingClientRect().width || 0,
      milkWidth: fields.find((field) => field.classList.contains('rsm2-variant-picker__field--milk'))?.getBoundingClientRect().width || 0,
    }
  }))

  expect(layouts[0].milkWidth).toBeGreaterThan(layouts[0].sizeWidth)
  expect(layouts[1].fieldCount).toBe(1)
})

test('keeps the curated order by default and sorts only after an explicit choice', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rs_access', 'active-token')
    sessionStorage.setItem('rs_menu_guide_v2', 'dismissed')
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

  await expect(firstSort).toContainText('↑')
  await expect(firstCards).toHaveText(['Калорийная закуска', 'Лёгкая закуска'])
  await expect(secondCards).toHaveText(['Сытный салат', 'Свежий салат'])

  await firstSort.click()
  sortMenu = page.getByRole('menu')
  await sortMenu.getByRole('button', { name: 'По убыванию' }).click()
  await expect(firstSort).toContainText('↓')
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

test('keeps sorting beside the category title and inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('rs_access', 'active-token')
    sessionStorage.setItem('rs_menu_guide_v2', 'dismissed')
  })
  await page.route((url) => isApiRequest(url, '/api/subscriptions/status'), (route) => route.fulfill({
    json: { status: 'active', statusNorm: 'active' },
  }))
  await mockMenu(page, mixedMenu)
  await page.goto('/restaurants/test-menu/menu')

  const section = page.locator('.rsm2-section__head').first()
  const titleBox = await section.locator('.rsm2-section__title').boundingBox()
  const sortButton = section.getByRole('button', { name: /Сортировка категории/ })
  const sortBox = await sortButton.boundingBox()

  expect(sortBox.x).toBeGreaterThan(titleBox.x)
  expect(sortBox.y).toBeLessThan(titleBox.y + titleBox.height + 4)

  await sortButton.click()
  const menuBox = await page.getByRole('menu').boundingBox()
  expect(menuBox.x).toBeGreaterThanOrEqual(0)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390)
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
