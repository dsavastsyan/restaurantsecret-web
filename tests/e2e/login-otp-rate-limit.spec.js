import { expect, test } from '@playwright/test'

test('shows a Russian rate-limit message and locks OTP controls after 429', async ({ page }) => {
  await page.route('**/auth/request-otp', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.route('**/auth/verify-otp', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'too_many_requests' }),
    })
  })

  await page.goto('/login')
  await page.getByPlaceholder('Введите email...').fill('otp-rate-limit@example.com')
  await page.getByRole('button', { name: 'Продолжить' }).click()

  await expect(page.getByText('Отправили код на почту')).toBeVisible()
  await page.getByPlaceholder('Введите код').fill('000000')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.locator('.login__alert')).toHaveText(
    'Слишком много попыток. Попробуйте снова через 10 мин.',
  )
  await expect(page.getByPlaceholder('Введите код')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Повторная отправка временно заблокирована' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Назад к email' })).toBeEnabled()
})
