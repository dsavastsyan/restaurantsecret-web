import { expect, test } from '@playwright/test'

test('unauthenticated admin preview redirects before loading protected page data', async ({ page }) => {
  const protectedCalls = []

  await page.route('**/api/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/admin/auth/me') {
      return route.fulfill({
        status: 401,
        json: { ok: false, error: { code: 'admin_session_required' } },
      })
    }
    protectedCalls.push(path)
    return route.fulfill({ status: 401, json: { ok: false } })
  })

  await page.goto('/admin/google-place-reviews')

  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByLabel('Ключ доступа')).toBeVisible()
  expect(protectedCalls).toEqual([])
})

test('administrator confirms a network alias and attaches a Google point to a branch', async ({ page }) => {
  const decisions = []

  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/api/admin/auth/me') {
      return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    }
    if (path === '/api/admin/google-place-network-reviews' && request.method() === 'GET') {
      return route.fulfill({
        json: {
          ok: true,
          stats: { pending: 1, retry_requested: 0, confirmed: 0, rejected: 0 },
          reviews: [{
            id: 41,
            network_id: 7,
            network_name: 'Братья Карваевы',
            city: 'Москва',
            status: 'pending',
            reason: 'no_network_points',
            query_name: 'Братья Карваевы',
            suggested_alias: 'Кулинарная лавка братьев Караваевых',
            candidate_place_ids: ['place-karavaevy'],
            candidate_count: 1,
            aliases: [],
            restaurants: [{ id: 70, name: 'Братья Карваевы', branch: 'Тверская' }],
            locations: [{
              google_place_id: 'place-karavaevy',
              google_display_name: 'Кулинарная лавка братьев Караваевых',
              address: 'Тверская улица, 10',
              google_maps_uri: 'https://maps.google.com/?cid=karavaevy',
            }],
          }],
        },
      })
    }
    if (path === '/api/admin/google-place-branch-reviews' && request.method() === 'GET') {
      return route.fulfill({
        json: {
          ok: true,
          reviews: [{
            id: 92,
            network_name: 'Братья Карваевы',
            city: 'Москва',
            google_place_id: 'place-karavaevy',
            google_display_name: 'Кулинарная лавка братьев Караваевых',
            address: 'Тверская улица, 10',
            google_maps_uri: 'https://maps.google.com/?cid=karavaevy',
            branches: [{ id: 70, name: 'Братья Карваевы', branch: 'Тверская' }],
          }],
        },
      })
    }
    if (request.method() === 'POST' && path.endsWith('/decision')) {
      decisions.push({ path, body: request.postDataJSON() })
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ status: 404, json: { ok: false } })
  })

  await page.goto('/admin/google-place-reviews')

  await expect(page.getByRole('heading', { name: 'Ревью сетей и точек' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Братья Карваевы' })).toBeVisible()
  await page.getByText('Проверить найденные точки (1)').click()
  await expect(page.getByRole('link', { name: 'Кулинарная лавка братьев Караваевых' }))
    .toHaveAttribute('href', 'https://maps.google.com/?cid=karavaevy')
  await expect(page.getByLabel('Название сети в Google'))
    .toHaveValue('Кулинарная лавка братьев Караваевых')

  await page.getByRole('button', { name: 'Это та же сеть' }).click()
  await expect(page.getByText('В этой очереди сейчас ничего нет.')).toBeVisible()
  await expect.poll(() => decisions[0]).toEqual({
    path: '/api/admin/google-place-network-reviews/41/decision',
    body: {
      action: 'confirm_alias',
      alias: 'Кулинарная лавка братьев Караваевых',
    },
  })

  await page.getByRole('button', { name: 'Привязка филиалов' }).click()
  await expect(page).toHaveURL(/queue=branches/)
  await page.getByLabel('Филиал').selectOption('70')
  await page.getByRole('button', { name: 'Привязать к филиалу' }).click()

  await expect.poll(() => decisions[1]).toEqual({
    path: '/api/admin/google-place-branch-reviews/92/decision',
    body: { action: 'attach', restaurant_id: 70 },
  })
})
