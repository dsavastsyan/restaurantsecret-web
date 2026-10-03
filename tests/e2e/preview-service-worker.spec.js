import { expect, test } from '@playwright/test'

test('@smoke preview removes legacy service worker caches', async ({ page }) => {
  await page.goto('/')

  // Reproduce a browser that previously visited this permanent URL while the
  // production worker was enabled. The preview worker should retire itself,
  // remove the stale shell, and reload the tab from the current deployment.
  await page.evaluate(async () => {
    const cache = await caches.open('static-v3')
    await cache.put('/legacy-preview-shell', new Response('legacy'))
    await navigator.serviceWorker.register('/service-worker.js')
  }).catch(() => {
    // Activation deliberately reloads the page and may destroy this context.
  })

  await page.waitForLoadState('domcontentloaded')
  await expect.poll(async () => page.evaluate(async () => ({
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    cacheNames: await caches.keys(),
  })).catch(() => null), { timeout: 15_000 }).toEqual({
    registrations: 0,
    cacheNames: [],
  })
})
