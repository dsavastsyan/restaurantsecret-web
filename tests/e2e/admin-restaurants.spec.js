import { expect, test } from '@playwright/test'

const loulou = {
  slug: 'loulou',
  name: 'Loulou',
  cities: ['Москва', 'Санкт-Петербург'],
  city_label: 'Москва, Санкт-Петербург',
  contacts: [{ id: 7, email: 'manager@loulou.test', invite_delivery_status: 'sent', invite_sent_at: '2026-07-21T10:01:00.000Z' }],
  menu_status: 'awaiting_admin',
  menu_status_label: 'Ждёт обработки администратором',
  partnership: 'partner',
  partnership_label: 'Партнёр',
  parsers: [],
  invited: true,
  access_blocked: false,
  invite_error: false,
  last_activity_at: '2026-08-02T10:00:00.000Z',
  next_action: 'Обработать меню',
  requires_action: true,
  has_published_menu: true,
  public_menu_url: '/restaurants/loulou/menu',
  active_revision_id: 12,
}

const sage = {
  slug: 'sage',
  name: 'Sage',
  cities: [],
  city_label: 'Город не указан',
  contacts: [],
  menu_status: 'published',
  menu_status_label: 'Опубликовано',
  partnership: 'parsing',
  partnership_label: 'Парсинг',
  parsers: ['sage'],
  invited: false,
  access_blocked: false,
  invite_error: false,
  last_activity_at: '2026-07-25T10:00:00.000Z',
  next_action: 'Пригласить ресторан',
  requires_action: false,
  has_published_menu: true,
  public_menu_url: '/restaurants/sage/menu',
  active_revision_id: null,
}

test.skip('administrator filters networks, reuses a catalog restaurant and manages invitations', async ({ page }) => {
  const requests = []
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    requests.push({ path, method: request.method(), body: request.postDataJSON?.() })
    if (path === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (path === '/api/admin/restaurants' && request.method() === 'GET') {
      const onlyPartners = url.searchParams.get('partnership') === 'partner'
      return route.fulfill({
        json: {
          ok: true,
          restaurants: onlyPartners ? [loulou] : [loulou, sage],
          filters: {
            cities: ['Москва', 'Санкт-Петербург'],
            menu_statuses: [
              { value: 'awaiting_admin', label: 'Ждёт обработки администратором' },
              { value: 'published', label: 'Опубликовано' },
            ],
            partnerships: [
              { value: 'partner', label: 'Партнёры' },
              { value: 'parsing', label: 'Парсинг' },
              { value: 'not_invited', label: 'Не приглашённые' },
              { value: 'not_partner', label: 'Не партнёры' },
            ],
          },
        },
      })
    }
    if (path === '/api/admin/restaurants' && request.method() === 'POST') {
      const body = request.postDataJSON()
      if (!body.existing_slug) {
        return route.fulfill({
          status: 409,
          json: {
            error: { code: 'existing_network_confirmation_required', message: 'Похожая сеть уже есть в базе.' },
            candidates: [{ slug: 'sage', name: 'Sage', cities: ['Москва'], partnership_label: 'Не партнёр' }],
          },
        })
      }
      return route.fulfill({ status: 200, json: { ok: true, slug: body.existing_slug, invited: false, email_sent: false } })
    }
    if (/\/contacts\/7\/invite$/.test(path)) {
      const body = request.postDataJSON()
      return route.fulfill({ json: { ok: true, email_sent: body.send_email, invite_url: 'https://example.test/invite/new' } })
    }
    if (/\/access$/.test(path)) return route.fulfill({ json: { ok: true, access_blocked: true } })
    return route.fulfill({ json: { ok: true } })
  })

  page.on('dialog', (dialog) => dialog.accept())

  await page.goto('/admin/restaurants')
  await expect(page.getByRole('heading', { name: 'Рестораны' })).toBeVisible()
  const table = page.getByRole('table')
  await expect(table.getByText('Ждёт обработки администратором')).toBeVisible()
  await expect(table.getByText('Парсинг')).toBeVisible()
  await expect(table.getByText('Пригласить ресторан')).toBeVisible()
  await expect(table.getByText('Москва, Санкт-Петербург')).toBeVisible()

  await page.getByLabel('Партнёрство').selectOption('partner')
  await expect(table.getByRole('row').filter({ hasText: 'Sage' })).toHaveCount(0)
  await expect.poll(() => requests.some(({ path }) => path.includes('/api/admin/restaurants'))).toBeTruthy()

  await page.getByRole('button', { name: 'Добавить ресторан' }).click()
  await page.getByLabel('Название сети').fill('Sage')
  await page.getByLabel('Первый город').fill('Москва')
  await page.getByRole('button', { name: 'Создать ресторан' }).click()
  await expect(page.getByText('Похожая сеть уже есть')).toBeVisible()
  await page.getByRole('button', { name: /Sage/ }).click()
  await expect(page.getByText('Письмо не отправлено')).toBeVisible()
  expect(requests.some(({ body }) => body?.existing_slug === 'sage')).toBeTruthy()

  // # Сохранение перезагружает таблицу — дожидаемся её, иначе строка исчезнет из-под клика.
  const listCalls = () => requests.filter(({ path, method }) => path === '/api/admin/restaurants' && method === 'GET').length
  await expect.poll(listCalls).toBe(3)
  const row = page.getByRole('row').filter({ hasText: 'Loulou' })
  await expect(row).toHaveCount(1)
  await row.getByText('Действия').click()
  await row.getByRole('button', { name: 'Отправить повторно' }).click()
  await expect(page.getByText('Приглашение отправлено на manager@loulou.test.')).toBeVisible()
  expect(requests.some(({ path, body }) => /contacts\/7\/invite$/.test(path) && body?.send_email === true)).toBeTruthy()
})

test.skip('administrator edits a restaurant row and adds emails without sending letters', async ({ page }) => {
  const requests = []
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    requests.push({ path, method: request.method(), body: request.postDataJSON?.() })
    if (path === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (path === '/api/admin/restaurants' && request.method() === 'GET') {
      return route.fulfill({
        json: {
          ok: true,
          restaurants: [sage],
          filters: { cities: [], menu_statuses: [], partnerships: [] },
        },
      })
    }
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/admin/restaurants')
  const row = page.getByRole('row').filter({ hasText: 'Sage' })
  await row.getByText('Действия').click()
  await row.getByRole('button', { name: 'Редактировать' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название сети').fill('Sage Bistro')
  await dialog.getByLabel('Город').fill('Москва')
  await dialog.getByLabel('Новый email 1').fill('owner@sage.test')
  await dialog.getByRole('button', { name: 'Добавить email' }).click()
  await dialog.getByLabel('Новый email 2').fill('chef@sage.test')
  await dialog.getByRole('button', { name: 'Сохранить' }).click()

  await expect(page.getByText('Новые адреса добавлены без письма.')).toBeVisible()
  expect(requests.some(({ path, method, body }) => (
    path === '/api/admin/restaurants/sage' && method === 'PATCH' && body?.name === 'Sage Bistro' && body?.city === 'Москва'
  ))).toBeTruthy()
  const contactCalls = requests.filter(({ path, method }) => path === '/api/admin/restaurants/sage/contacts' && method === 'POST')
  expect(contactCalls.map(({ body }) => body.email)).toEqual(['owner@sage.test', 'chef@sage.test'])
  expect(contactCalls.every(({ body }) => body.send_invite === false)).toBeTruthy()
})

test('administrator configures and confirms a manual menu', async ({ page }) => {
  const requests = []
  let configured = false
  let confirmed = false
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    requests.push({ path, method: request.method(), body: request.postDataJSON?.() })
    if (path === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (path === '/api/admin/manual-menu-freshness' && request.method() === 'GET') {
      return route.fulfill({ json: {
        ok: true,
        stale_after_days: 90,
        restaurants: [{
          slug: 'loulou', name: 'Loulou', cities: ['Москва'],
          source_type: configured ? 'instagram_highlight' : null,
          source_url: configured ? 'https://instagram.com/loulou/' : null,
          last_checked_at: confirmed ? '2026-09-11T12:00:00Z' : '2026-09-01T12:00:00Z',
          status: configured ? 'current' : 'source_missing',
        }],
      } })
    }
    if (path.endsWith('/source') && request.method() === 'PATCH') {
      configured = true
      return route.fulfill({ json: { ok: true } })
    }
    if (path.endsWith('/confirm') && request.method() === 'POST') {
      confirmed = true
      return route.fulfill({ json: { ok: true, last_checked_at: '2026-09-11T12:00:00Z' } })
    }
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/admin/restaurants')
  await expect(page.getByRole('tab', { name: 'Ручные меню' })).toHaveAttribute('aria-selected', 'true')
  const row = page.getByRole('row').filter({ hasText: 'Loulou' })
  await expect(row.getByText('Источник не указан')).toBeVisible()
  await row.getByLabel('Источник меню Loulou').selectOption('instagram_highlight')
  await row.getByLabel('Ссылка на меню Loulou').fill('https://instagram.com/loulou/')
  await row.getByRole('button', { name: 'Сохранить' }).click()
  await expect(row.getByText('Актуально')).toBeVisible()
  await row.getByRole('button', { name: 'Подтвердить актуальность' }).click()

  await expect.poll(() => requests.some(({ path, method }) => path.endsWith('/loulou/confirm') && method === 'POST')).toBeTruthy()
  expect(requests.some(({ path, method, body }) => (
    path.endsWith('/loulou/source') && method === 'PATCH'
      && body?.source_type === 'instagram_highlight'
      && body?.source_url === 'https://instagram.com/loulou/'
  ))).toBeTruthy()
})

test('administrator sees parser status, source and error without leaving the restaurant dashboard', async ({ page }) => {
  await page.route('**/api/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    if (path === '/api/admin/restaurants') return route.fulfill({ json: { ok: true, restaurants: [], filters: { cities: [], menu_statuses: [], partnerships: [] } } })
    if (path === '/api/admin/parser-runs') return route.fulfill({ json: {
      ok: true,
      parsers: [{
        parser_id: 'sage', enabled: true, restaurant_name: 'Sage', cities: ['Москва'],
        published_at: '2026-09-09T06:00:00Z',
        run: {
          status: 'error', finished_at: '2026-09-10T06:00:05Z', last_success_at: '2026-09-08T06:00:05Z',
          source_url: 'https://sage.example/menu', exit_code: 1,
          error_message: 'Не найден список блюд', log_excerpt: 'ValueError: menu is empty',
          github_run_url: 'https://github.com/example/actions/runs/123',
        },
      }],
    } })
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/admin/restaurants')
  await page.getByRole('tab', { name: 'Автоматическое обновление' }).click()
  await expect(page.getByRole('tab', { name: 'Все рестораны' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Задачи меню' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ревью ресторанов' })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'Sage' })
  await expect(row.getByText('Ошибка', { exact: true })).toBeVisible()
  await expect(row.getByRole('link', { name: 'Открыть' })).toHaveAttribute('href', 'https://sage.example/menu')
  await row.getByText('Что случилось').click()
  await expect(row.getByText('Не найден список блюд')).toBeVisible()
  await expect(row.getByText('ValueError: menu is empty')).toBeVisible()

  await page.goto('/admin/menu-revisions')
  await expect(page).toHaveURL(/\/admin\/restaurants$/)
})

test('administrator reviews an enrichment suggestion', async ({ page }) => {
  const decisions = []
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/admin/auth/me') {
      return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    }
    if (path === '/api/admin/restaurant-attribute-reviews' && request.method() === 'GET') {
      return route.fulfill({ json: { ok: true, reviews: [{
        id: 72,
        restaurant_id: 3650,
        restaurant_name: 'Сыроварня',
        restaurant_slug: 'syrovarnya',
        field: 'manual_coordinates',
        suggested_value: '44.877824, 37.310663',
        confidence: 0.8,
        note: null,
        status: 'pending',
      }] } })
    }
    if (path === '/api/admin/restaurant-attribute-reviews/72/decision') {
      decisions.push(request.postDataJSON())
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: { ok: true, restaurants: [] } })
  })

  await page.goto('/admin/restaurant-reviews')
  await expect(page.getByRole('heading', { name: 'Ревью и правки' })).toBeVisible()
  await expect(page.getByText('Сыроварня')).toBeVisible()
  await page.getByLabel('Значение (можно поправить перед применением)').fill('44.877900, 37.310700')
  await page.getByRole('button', { name: 'Применить' }).click()

  await expect.poll(() => decisions).toEqual([{
    decision: 'approve',
    value: '44.877900, 37.310700',
  }])
  await expect(page.getByText('Сыроварня')).toHaveCount(0)
})
