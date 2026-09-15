// @ts-check
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    // Explicit --host so this binds to IPv4 127.0.0.1: Vite's default host
    // ("localhost") can resolve to the IPv6 loopback on some CI runners,
    // which would never satisfy an IPv4 readiness check below and time out.
    command: 'npm run dev -- --host 127.0.0.1',
    // Local Vite has no production Caddy route for /api/catalog. Keep browser
    // smoke tests on the existing backend unless the caller supplies another
    // API base explicitly.
    env: {
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || 'https://pd.restaurantsecret.ru/cf'
    },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
