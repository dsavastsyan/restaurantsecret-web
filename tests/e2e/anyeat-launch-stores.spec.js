import { expect, test } from '@playwright/test'

test('AnyEat beta window shows the store buttons', async ({ page }) => {
  await page.goto('/anyeat-account-preview')

  await expect(page.getByText('Бета-версия · ранний доступ')).toBeVisible()
  await expect(page.getByRole('link', { name: /App Store/ })).toHaveAttribute('href', 'https://apps.apple.com/ru/app/id6799767816')
  await expect(page.getByRole('link', { name: /Скачать APK/ })).toHaveAttribute('href', 'https://anyeat.ru/downloads/AnyEat-0.1.0.apk')
})
