import { expect, test } from '@playwright/test'

test.skip('administrator validates versioned normalized menus without publishing', async ({ page }) => {
  let normalizedUploads = 0
  const revision = {
    id: 12,
    draft_id: 91,
    restaurant_name: 'Aero Menu Шереметьево',
    kind: 'initial',
    status: 'needs_preparation',
    lock_version: 1,
    internal_comment: '',
  }
  const source = {
    id: 5,
    role: 'source',
    original_name: 'menu.png',
    content_type: 'image/png',
    size_bytes: 1200,
    page_count: 1,
  }
  const detail = () => ({
    ok: true,
    revision,
    files: [
      source,
      ...(normalizedUploads
        ? [{
            id: 20,
            role: 'normalized',
            version: 1,
            original_name: 'menu-v1.xlsx',
            content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size_bytes: 700,
            validation_status: normalizedUploads === 1 ? 'invalid' : 'valid',
            validation_errors: normalizedUploads === 1 ? [{ row: 4, message: 'Не заполнена цена.' }] : [],
          }]
        : []),
    ],
    messages: [],
    draft: { draft: { id: 91 }, items: [], photos: [], summary: {} },
  })

  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/admin/auth/login') return route.fulfill({ json: { ok: true, role: 'admin' } })
    if (path === '/api/admin/auth/me') return route.fulfill({ json: { ok: true, role: 'admin' } })
    if (path === '/api/admin/menu-revisions') {
      return route.fulfill({
        json: {
          ok: true,
          revisions: [{
            ...revision,
            source_files_count: 1,
            source_pages_count: 1,
            source_content_types: 'image/png',
          }],
        },
      })
    }
    if (path === '/api/admin/menu-revisions/12/normalized') {
      normalizedUploads += 1
      if (normalizedUploads === 1) {
        return route.fulfill({
          status: 422,
          json: {
            error: { code: 'data_quality_gate_failed', message: 'Подготовленный Excel не прошёл проверку.' },
            errors: [{ row: 4, message: 'Не заполнена цена.' }],
          },
        })
      }
      revision.status = 'ready_for_restaurant'
      revision.lock_version += 1
      return route.fulfill({ json: detail() })
    }
    if (path === '/api/admin/menu-revisions/12') return route.fulfill({ json: detail() })
    if (path === '/api/admin/menu-revision-files/5') {
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>',
      })
    }
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/admin/login')
  await page.getByLabel('Ключ доступа').fill('secret')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Рестораны' })).toBeVisible()
  await page.goto('/admin/menu-revisions')
  await expect(page.getByRole('heading', { name: 'Задачи по меню' })).toBeVisible()
  await page.goto('/admin/menu-revisions/12')
  await expect(page.getByRole('heading', { name: 'Aero Menu Шереметьево' })).toBeVisible()
  await expect(page.getByText('menu.png')).toBeVisible()

  const input = page.locator('.admin-menu__upload input')
  await input.setInputFiles({ name: 'menu-v1.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('invalid') })
  await expect(page.getByText('Строка 4:')).toBeVisible()

  await input.setInputFiles({ name: 'menu-v2.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('valid') })
  await expect(page.getByText('Передано ресторану')).toBeVisible()
})
