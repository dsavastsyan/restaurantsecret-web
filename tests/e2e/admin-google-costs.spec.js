import { expect, test } from '@playwright/test'

function monthBefore(month) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7)
}

function report({ billing = true } = {}) {
  return {
    ok: true,
    month: '2026-10',
    settings: {
      credit_baseline_gbp: '226.17',
      baseline_date: '2026-10-07',
      credit_expires: '2026-12-31',
      fx_usd_gbp: '0.75',
      vertex_block_gbp: '5',
    },
    skus: [
      {
        sku: 'places_ui_kit_query',
        label: 'Places UI Kit Query',
        service: 'Google Places',
        used: 750,
        input_tokens: 0,
        output_tokens: 0,
        free_cap: 1000,
        free_remaining: 250,
        paid_requests: 0,
        current_tier: { number: 0, price_gbp_per_1000: 0.04 },
        cycle: 0,
        pct_in_cycle: 0.75,
        estimated_cost_gbp: 0,
        approximate: false,
      },
      {
        sku: 'vertex_gemini',
        label: 'Gemini',
        service: 'Vertex AI',
        used: 12,
        input_tokens: 1000000,
        output_tokens: 500000,
        free_cap: 0,
        free_remaining: 0,
        paid_requests: 12,
        current_tier: { input_gbp_per_1m_tokens: 0.1, output_gbp_per_1m_tokens: 0.2 },
        cycle: 1,
        pct_in_cycle: 0.2,
        estimated_cost_gbp: 0.2,
        approximate: true,
      },
    ],
    total_estimated_cost_gbp: 0.2,
    forecast_cost_gbp: 0.6,
    credit: {
      baseline_gbp: 226.17,
      used_gbp: 180,
      remaining_gbp: 46.17,
      days_to_expiry: 14,
      expires: '2026-12-31',
      source: 'billing',
    },
    alerts: [{ sent_at: '2026-10-08T12:30:00Z', sku: 'places_ui_kit_query', kind: 'usage_pct', threshold: 75, delivery: 'sent' }],
    ...(billing ? {
      billing: {
        available: true,
        last_sync_at: '2026-10-08T12:00:00Z',
        total_cost: 0.25,
        total_credits: 0.05,
        lines: [{ service: 'Google Places', sku: 'places-ui', our_sku: 'places_ui_kit_query', cost: 0.25, credits: 0.05, usage_amount: 750, usage_unit: 'requests' }],
        mismatches: [],
      },
    } : {}),
  }
}

async function mockAdmin(page, { costs = () => report(), settings = () => ({ status: 200, json: { ok: true, settings: report().settings } }), onRequest } = {}) {
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/admin/auth/me') {
      return route.fulfill({ json: { ok: true, role: 'admin', csrf_token: 'csrf' } })
    }
    if (url.pathname === '/api/admin/google-costs' && request.method() === 'GET') {
      onRequest?.(request)
      const response = await costs(request)
      return route.fulfill(response?.json ? response : { json: response })
    }
    if (url.pathname === '/api/admin/google-costs/settings' && request.method() === 'PUT') {
      onRequest?.(request)
      const response = await settings(request)
      return route.fulfill(response)
    }
    return route.fulfill({ status: 404, json: { ok: false } })
  })
}

test('@smoke Google costs page renders billing, counters, alerts, settings, and mobile SKU cards', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockAdmin(page)
  await page.goto('/admin/google-costs')

  await expect(page.getByRole('heading', { name: 'Расходы Google' })).toBeVisible()
  await expect(page.getByText('Триал-кредит', { exact: true })).toBeVisible()
  await expect(page.getByText('£46,17')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Счёт Google по строкам' })).toBeVisible()
  await expect(page.getByText('Расхождений нет')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Журнал алертов' })).toBeVisible()
  await expect(page.getByText('порог 75%')).toBeVisible()
  await expect(page.getByText(/^Обновлено/)).toBeVisible()

  await page.setViewportSize({ width: 375, height: 900 })
  await expect(page.locator('.google-costs__sku-cards')).toBeVisible()
  await expect(page.locator('.google-costs__sku-table-wrap')).toBeHidden()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('@smoke Google costs page hides billing section when the billing block is absent', async ({ page }) => {
  await mockAdmin(page, { costs: () => ({ json: report({ billing: false }) }) })
  await page.goto('/admin/google-costs')

  await expect(page.getByRole('heading', { name: 'Расходы Google' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Счёт Google по строкам' })).toHaveCount(0)
  await expect(page.getByText('Обновлено по счётчикам')).toBeVisible()
})

test('@smoke Google costs page exposes a retry action for unavailable data', async ({ page }) => {
  let attempts = 0
  await mockAdmin(page, {
    costs: async () => {
      attempts += 1
      if (attempts === 1) return { status: 503, json: { ok: false, error: { code: 'google_costs_unavailable' } } }
      return report()
    },
  })
  await page.goto('/admin/google-costs')

  await expect(page.getByText('google_costs_unavailable')).toBeVisible()
  await page.getByRole('button', { name: 'Повторить' }).click()
  await expect(page.getByRole('heading', { name: 'Запросы по сервисам' })).toBeVisible()
})

test('@smoke changing month requests a different month and never enables a future month', async ({ page }) => {
  const months = []
  await mockAdmin(page, {
    onRequest: (request) => months.push(new URL(request.url()).searchParams.get('month')),
  })
  await page.goto('/admin/google-costs')
  await expect(page.getByRole('heading', { name: 'Расходы Google' })).toBeVisible()
  const current = new Date().toISOString().slice(0, 7)
  await expect.poll(() => months.at(-1)).toBe(current)
  await expect(page.getByRole('button', { name: 'Следующий месяц' })).toBeDisabled()
  await page.getByRole('button', { name: 'Предыдущий месяц' }).click()
  await expect.poll(() => months.at(-1)).toBe(monthBefore(current))
})

test('@smoke settings save sends the expected PUT and displays a 422 error', async ({ page }) => {
  let putBody
  await mockAdmin(page, {
    onRequest: (request) => {
      if (request.method() === 'PUT') putBody = request.postDataJSON()
    },
    settings: async () => ({ status: 422, json: { ok: false, error: { code: 'invalid_google_billing_setting' } } }),
  })
  await page.goto('/admin/google-costs')
  await page.getByText('Настройки', { exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect.poll(() => putBody).toEqual({
    credit_baseline_gbp: '226.17',
    baseline_date: '2026-10-07',
    credit_expires: '2026-12-31',
    fx_usd_gbp: '0.75',
    vertex_block_gbp: '5',
  })
  await expect(page.getByText('Проверьте значения настроек')).toBeVisible()
})
