import { expect, test } from '@playwright/test'

test('AnyEat launch flow requests OTP even with a stored access token', async ({ page }) => {
  let otpRequests = 0

  await page.addInitScript(() => {
    window.localStorage.setItem('rs_access', 'stale-token')
  })

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.endsWith('/auth/request-otp')) {
      otpRequests += 1
      await route.fulfill({ json: { ok: true } })
      return
    }

    if (url.pathname.endsWith('/auth/verify-otp')) {
      await route.fulfill({ json: { ok: true, access_token: 'verified-token' } })
      return
    }

    if (url.pathname.endsWith('/api/consent/communications')) {
      if (request.method() === 'GET') {
        await route.fulfill({ json: { personal_data_advertising: false, marketing_communications: false } })
      } else {
        await route.fulfill({ json: { ok: true } })
      }
      return
    }

    if (url.pathname.endsWith('/api/v1/me') || url.pathname.endsWith('/me')) {
      await route.fulfill({ json: { ok: true, user: { email: 'user@example.com' } } })
      return
    }

    await route.continue()
  })

  await page.goto('/anyeat-account-preview')

  await expect(page.getByRole('button', { name: 'Получить код →' })).toBeVisible()
  await expect(page.getByText('Укажите почту вашего аккаунта RestaurantSecret.')).toHaveCount(0)

  await page.locator('#rs-anyeat-email').fill('user@example.com')
  await page.getByRole('button', { name: 'Получить код →' }).click()
  await expect(page.getByPlaceholder('Код из письма')).toBeVisible()
  expect(otpRequests).toBe(1)

  await page.locator('#rs-anyeat-code').fill('123456')
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Даю согласие на')).toBeVisible()
})
