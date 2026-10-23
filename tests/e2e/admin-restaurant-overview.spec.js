import { expect, test } from '@playwright/test'

const manualMenu = (overrides) => ({
  cities: ['Москва'],
  source_type: 'website_cards',
  source_url: 'https://example.test/kbju',
  last_checked_at: '2026-10-10T10:00:00Z',
  status: 'current',
  lead_id: null,
  dm_state: 'none',
  dm_last_sent_at: null,
  next_followup_at: null,
  kbju_stale: false,
  notes: null,
  ...overrides,
})

const manualMenus = [
  manualMenu({ slug: 'syrovarnya-arbat', name: 'Сыроварня Арбат', lead_id: 5, kbju_stale: true, dm_state: 'requested', dm_last_sent_at: '2026-10-14T09:00:00Z', next_followup_at: '2026-10-21T09:00:00Z' }),
  manualMenu({ slug: 'syrovarnya-kazan', name: 'Сыроварня Казань', cities: ['Казань'], lead_id: 5, dm_state: 'waiting_restaurant' }),
  manualMenu({ slug: 'loulou', name: 'Loulou', source_type: 'instagram_highlights', source_url: 'https://instagram.com/loulou/' }),
  manualMenu({ slug: 'bez-istochnika', name: 'Без источника', source_type: null, source_url: null, status: 'source_missing', notes: 'Хайлайтов нет, на сайте только фото меню' }),
]

const menuSources = [
  { slug: 'loulou', source_type: 'website_cards', source_url: 'https://loulou.test/menu', last_checked_at: '2026-10-19T10:00:00Z', last_changed_at: '2026-10-18T10:00:00Z', catalog_missing_count: 2 },
  { slug: 'syrovarnya-arbat', source_type: 'website_cards', source_url: 'https://syrovarnya.test/arbat', last_checked_at: '2026-10-19T10:00:00Z', last_changed_at: null, catalog_missing_count: 0 },
  { slug: 'syrovarnya-kazan', source_type: 'document', source_url: 'https://syrovarnya.test/kazan.pdf', last_checked_at: '2026-10-19T10:00:00Z', last_changed_at: null, catalog_missing_count: 0 },
]

const restaurants = [
  ...manualMenus.map(({ slug, name, cities }) => ({ slug, name, cities, parsers: [], public_menu_url: `/restaurants/${slug}/menu` })),
  { slug: 'sage', name: 'Sage', cities: ['Казань'], parsers: ['sage'], public_menu_url: '/restaurants/sage/menu' },
]

async function mockAdmin(page, requests = []) {
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    requests.push(path)
    if (path === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (path === '/api/admin/restaurants') return route.fulfill({ json: { ok: true, restaurants, filters: { cities: [], menu_statuses: [], partnerships: [] } } })
    if (path === '/api/admin/manual-menu-freshness') return route.fulfill({ json: { ok: true, stale_after_days: 90, restaurants: manualMenus } })
    if (path === '/api/admin/menu-sources') return route.fulfill({ json: { ok: true, sources: menuSources } })
    if (path === '/api/admin/menu-sources/loulou') return route.fulfill({ json: { ok: true, source: { ...menuSources[0], dish_names: ['Борщ', 'Сырники', 'Тыквенный суп'], catalog_missing: ['Сырники', 'Тыквенный суп'] } } })
    if (path === '/api/admin/menu-catalog-audits') return route.fulfill({ json: { ok: true, audits: [
      { id: 12, slug: 'loulou', result: 'differs', summary: 'В основном меню появились хинкали, пропали пхали', audited_at: '2026-10-20T12:00:00Z', catalog_captured_at: '2026-02-14 10:00:00', catalog_dish_count: 3, new_count: 1, missing_count: 1, menu_url: 'https://loulou.test/menu' },
    ] } })
    if (path === '/api/admin/menu-catalog-audits/12') return route.fulfill({ json: { ok: true, audit: {
      id: 12, slug: 'loulou', result: 'differs', summary: 'В основном меню появились хинкали, пропали пхали', audited_at: '2026-10-20T12:00:00Z',
      catalog_captured_at: '2026-02-14 10:00:00', catalog_dish_count: 3, menu_url: 'https://loulou.test/menu',
      files: [{ url: 'https://loulou.test/menu/main.pdf', label: 'Основное меню' }], new_dishes: ['Хинкали'], missing_dishes: ['Пхали'],
    }, history: [
      { id: 12, slug: 'loulou', result: 'differs', summary: 'В основном меню появились хинкали, пропали пхали', audited_at: '2026-10-20T12:00:00Z' },
      { id: 4, slug: 'loulou', result: 'unreadable', summary: 'Меню картинками', audited_at: '2026-08-10T12:00:00Z' },
    ] } })
    if (path === '/api/admin/parser-runs') return route.fulfill({ json: { ok: true, parsers: [{
      parser_id: 'sage', restaurant_slug: 'sage', restaurant_name: 'Sage', cities: ['Казань'], enabled: true,
      freshness: { status: 'error', days_since_success: 4 },
      run: { status: 'error', finished_at: '2026-10-19T03:00:00Z', last_success_at: '2026-10-15T03:00:00Z', item_count: 40, error_message: 'Не найден список блюд', source_url: 'https://sage.test/menu' },
    }] } })
    if (path === '/api/admin/menu-health') return route.fulfill({ json: { ok: true, items: [
      { publicId: 'rest-loulou', restaurant_name: 'Loulou', city: 'Москва', in_production: true, status: 'warning', summary: 'Мало блюд для ресторана', reasons: ['few_dishes'], warnings: ['no_cuisine'], checked_at: '2026-10-18T10:00:00Z' },
    ] } })
    if (path === '/api/admin/menu-health/rest-loulou') return route.fulfill({ json: { ok: true, record: { publicId: 'rest-loulou' }, history: [
      { id: 1, status: 'warning', checked_at: '2026-10-18T10:00:00Z', summary: 'Мало блюд для ресторана' },
    ] } })
    if (path === '/api/admin/kbju-leads') return route.fulfill({ json: { ok: true, leads: [
      { id: 5, name: 'Сыроварня', city: 'Москва', instagram_handle: 'syrovarnya', instagram_url: 'https://instagram.com/syrovarnya/', dm_sent_at: '2026-10-01T09:00:00Z', last_reply_at: '2026-10-16T12:00:00Z', notes: 'Прислали файл только по Москве' },
    ] } })
    if (path === '/api/admin/kbju-flagged-restaurant-items') return route.fulfill({ json: { ok: true, items: [{ id: 1, restaurant_name: 'Loulou' }] } })
    if (path === '/api/admin/restaurant-attribute-reviews') return route.fulfill({ json: { ok: true, reviews: [], stats: [], cities: [] } })
    return route.fulfill({ json: { ok: true } })
  })
}

test('«Все рестораны» shows one card per menu and opens the restaurant page', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin/restaurants')
  await expect(page).toHaveURL(/\/admin\/restaurants\/all$/)
  await expect(page.getByRole('link', { name: 'Все рестораны' })).toHaveClass(/active/)

  const cards = page.locator('.admin-restaurants__cards > a')
  await expect(cards).toHaveCount(5)
  await expect(cards.nth(0)).toContainText('Сыроварня Арбат')
  await expect(cards.nth(0)).toContainText('КБЖУ отстало')
  await expect(cards.filter({ hasText: 'Sage' })).toContainText('Ошибка парсера')
  await expect(cards.filter({ hasText: 'Loulou' })).toContainText('Меню изменилось')
  await expect(cards.filter({ hasText: 'Loulou' })).toContainText('На сайте 2 блюда без КБЖУ')

  await page.getByLabel('Как обновляется').selectOption('parser')
  await expect(cards).toHaveCount(1)
  await page.getByLabel('Как обновляется').selectOption('')
  await page.getByLabel('Проблемы').selectOption('accuracy')
  await expect(cards).toHaveCount(1)
  await expect(cards.nth(0)).toContainText('Странные КБЖУ: 1')
  await page.getByLabel('Проблемы').selectOption('')
  await page.getByPlaceholder('Ресторан, slug или город').fill('казань')
  await expect(cards).toHaveCount(2)
  await page.getByPlaceholder('Ресторан, slug или город').fill('')

  await page.getByRole('link', { name: 'Открыть Loulou' }).click()
  await expect(page).toHaveURL(/\/admin\/restaurants\/all\/loulou$/)
  await expect(page.getByRole('heading', { name: 'Loulou', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Все рестораны' })).toHaveClass(/active/)
  await expect(page.getByRole('link', { name: /Публичное меню/ })).toHaveAttribute('href', '/restaurants/loulou/menu')
  await expect(page.getByText('Instagram Highlights')).toBeVisible()
  await expect(page.getByText('Есть на сайте, нет в каталоге')).toBeVisible()
  await expect(page.getByText('Сырники, Тыквенный суп')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Странные КБЖУ: 1' })).toHaveAttribute('href', '/admin/restaurants/quality/accuracy/kbju')
  await expect(page.getByRole('link', { name: 'Полный отчёт' })).toHaveAttribute('href', '/admin/restaurants/publication/health/rest-loulou')
  await expect(page.getByText('Меню на сайте изменилось')).toBeVisible()
  await expect(page.getByText('Хелс-чек: Предупреждения')).toBeVisible()
  await expect(page.getByText('Меню не привязано к лиду')).toBeVisible()

  await page.goto('/admin/restaurants/all/syrovarnya-arbat')
  await expect(page.getByText('Запрос отправлен')).toBeVisible()
  await expect(page.getByText('Лид: Сыроварня · Москва')).toBeVisible()
  await expect(page.getByText('Прислали файл только по Москве')).toBeVisible()
  await expect(page.getByText('Ресторан ответил')).toBeVisible()

  await page.goto('/admin/restaurants/all/sage')
  await expect(page.getByText('Не найден список блюд').first()).toBeVisible()
  await expect(page.getByText('Переписка')).toHaveCount(0)

  await page.goto('/admin/restaurants/all/net-takogo')
  await expect(page.getByRole('alert')).toContainText('Меню «net-takogo» не найдено')
})

test('manual updates show both sources, DM state and chain branches side by side', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin/restaurants/freshness/manual')
  const table = page.locator('.admin-manual-menu__table')
  const rowNames = () => table.locator('tbody tr td:first-child strong').allTextContents()
  await expect.poll(rowNames).toEqual(['Сыроварня Арбат', 'Сыроварня Казань', 'Loulou', 'Без источника'])
  await expect(table.locator('.admin-restaurants__group-title')).toHaveText('Сыроварня · 2 меню')

  const arbat = table.getByRole('row').filter({ hasText: 'Сыроварня Арбат' })
  await expect(arbat.getByText('КБЖУ отстало', { exact: true })).toBeVisible()
  await expect(arbat.getByText('Запрос отправлен')).toBeVisible()
  await expect(arbat.getByText(/Фолоу-ап 21 окт\./)).toBeVisible()
  await expect(arbat.getByRole('link', { name: 'Сыроварня Арбат', exact: true })).toHaveAttribute('href', '/admin/restaurants/all/syrovarnya-arbat')

  const loulou = table.getByRole('row').filter({ hasText: 'Loulou' })
  await expect(loulou.getByText('Меню изменилось', { exact: true })).toBeVisible()
  await expect(loulou.getByRole('link', { name: 'Открыть источник меню' })).toHaveAttribute('href', 'https://loulou.test/menu')
  await expect(table.getByRole('row').filter({ hasText: 'Без источника' }).getByText('Не найден')).toBeVisible()

  await page.getByLabel('Тип источника меню').selectOption('document')
  await expect.poll(rowNames).toEqual(['Сыроварня Казань'])
  await page.getByLabel('Тип источника меню').selectOption('')
  await page.getByLabel('Тип источника КБЖУ').selectOption('none')
  await expect.poll(rowNames).toEqual(['Без источника'])
  await page.getByLabel('Тип источника КБЖУ').selectOption('')
  await page.getByLabel('Статус актуальности').selectOption('menu_changed')
  await expect.poll(rowNames).toEqual(['Loulou'])
})

test('completeness lists what each menu lacks and what was already checked', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin/restaurants/quality')
  await expect(page).toHaveURL(/\/admin\/restaurants\/quality\/completeness$/)
  await expect(page.getByRole('link', { name: 'Полнота' })).toHaveClass(/active/)
  await expect(page.getByRole('link', { name: 'Точность' })).toBeVisible()

  const rows = page.locator('.admin-restaurants__table tbody tr:not(.admin-restaurants__group-title)')
  await expect(rows).toHaveCount(2)
  const missing = rows.filter({ hasText: 'Без источника' })
  await expect(missing).toContainText('Нет источника КБЖУ')
  await expect(missing).toContainText('Нет источника меню')
  await expect(missing).toContainText('Хайлайтов нет, на сайте только фото меню')
  const loulou = rows.filter({ hasText: 'Loulou' })
  await expect(loulou).toContainText('На сайте 2 блюда без КБЖУ')
  await expect(loulou).toContainText('Мало блюд')
  await expect(loulou).toContainText('Не указана кухня')

  await page.getByLabel('Проблема полноты').selectOption('catalog_missing')
  await expect(rows).toHaveCount(1)
  await rows.first().getByRole('link', { name: 'Loulou' }).click()
  await expect(page).toHaveURL(/\/admin\/restaurants\/all\/loulou$/)
})

test('the health-check card links the catalog check report of a manual menu', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin/restaurants/all/loulou')
  const card = page.locator('.admin-health-report__card', { has: page.getByRole('heading', { name: 'Хелс-чек' }) })
  await expect(card.getByText('Сверка меню с каталогом', { exact: true })).toBeVisible()
  await expect(card.getByText('Есть расхождения')).toBeVisible()
  await expect(card.getByText(/новых на сайте 1 · нет на сайте 1/)).toBeVisible()
  await expect(page.getByText('Сверка меню с каталогом: Есть расхождения')).toBeVisible()
  await card.getByRole('link', { name: 'Отчёт сверки' }).click()

  await expect(page).toHaveURL(/\/admin\/restaurants\/all\/loulou\/catalog-audit\/12$/)
  await expect(page.getByRole('heading', { name: 'Loulou', level: 1 })).toBeVisible()
  await expect(page.getByText('В основном меню появились хинкали, пропали пхали').first()).toBeVisible()
  await expect(page.getByText('Хинкали', { exact: true })).toBeVisible()
  await expect(page.getByText('Пхали', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Основное меню' })).toHaveAttribute('href', 'https://loulou.test/menu/main.pdf')
  await expect(page.getByRole('link', { name: 'Меню не прочитать' })).toHaveAttribute('href', '/admin/restaurants/all/loulou/catalog-audit/4')
  if (process.env.AUDIT_SCREENSHOT) {
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${process.env.AUDIT_SCREENSHOT}-report.png`, fullPage: true })
    await page.goto('/admin/restaurants/all/loulou')
    await page.waitForTimeout(2500)
    await page.locator('.admin-health-report__card', { has: page.getByRole('heading', { name: 'Хелс-чек' }) }).screenshot({ path: `${process.env.AUDIT_SCREENSHOT}-card.png` })
  }

  await page.goto('/admin/restaurants/all/syrovarnya-kazan')
  await expect(page.getByText('Это меню ещё не сверяли')).toBeVisible()
})
