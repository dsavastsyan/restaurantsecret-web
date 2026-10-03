import { expect, test } from '@playwright/test'

const mockAnyEatApi = async (page, { authenticated = false } = {}) => {
  let otpRequests = 0

  if (authenticated) {
    await page.addInitScript(() => {
      window.localStorage.setItem('rs_access', 'stored-token')
    })
  }

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

  return () => otpRequests
}

test('AnyEat launch form locks the account email for authenticated users', async ({ page }) => {
  const getOtpRequests = await mockAnyEatApi(page, { authenticated: true })

  await page.goto('/anyeat-account-preview')

  const emailInput = page.locator('#rs-anyeat-email')
  await expect(emailInput).toHaveValue('user@example.com')
  await expect(emailInput).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Сообщить мне о запуске →' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Получить код →' })).toHaveCount(0)
  expect(getOtpRequests()).toBe(0)
})

test('AnyEat launch flow requests OTP for guests', async ({ page }) => {
  const getOtpRequests = await mockAnyEatApi(page)

  await page.goto('/anyeat-account-preview')
  await expect(page.getByRole('button', { name: 'Получить код →' })).toBeVisible()

  await page.locator('#rs-anyeat-email').fill('user@example.com')
  await page.getByRole('button', { name: 'Получить код →' }).click()
  await expect(page.getByPlaceholder('Код из письма')).toBeVisible()
  expect(getOtpRequests()).toBe(1)

  await page.locator('#rs-anyeat-code').fill('123456')
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Даю согласие на')).toBeVisible()
})
