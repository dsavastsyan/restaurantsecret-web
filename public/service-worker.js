const STATIC_CACHE = 'static-v4';
const API_CACHE = 'api-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];
const IS_LOCAL_DEVELOPMENT = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    if (IS_LOCAL_DEVELOPMENT) {
      await Promise.all(cacheNames
        .filter((name) => name.startsWith('static-') || name.startsWith('api-'))
        .map((name) => caches.delete(name)));
      await self.registration.unregister();
      return;
    }

    await Promise.all(cacheNames
      .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL_DEVELOPMENT) return;
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put('/index.html', networkResponse.clone());
          return networkResponse;
        }

        // GitHub Pages returns its 404 document for SPA deep links such as
        // /partners/dashboard. Refresh the app shell from the root before serving
        // it so a direct navigation cannot keep an older deployment alive forever.
        if (networkResponse.status === 404) {
          const cache = await caches.open(STATIC_CACHE);
          const freshShell = await fetch(new Request('/', { cache: 'reload' }));
          if (freshShell.ok) {
            await cache.put('/index.html', freshShell.clone());
            return freshShell;
          }
          const appShell = await cache.match('/index.html');
          if (appShell) return appShell;
        }

        return networkResponse;
      } catch (error) {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match('/index.html');
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (sameOrigin && ['style', 'script', 'font', 'image'].includes(event.request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const networkResponse = await fetch(event.request);
      cache.put(event.request, networkResponse.clone());
      return networkResponse;
    })());
    return;
  }

  if (sameOrigin && (url.pathname.startsWith('/filters') || url.pathname.startsWith('/restaurants') || url.pathname.startsWith('/search'))) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      const cached = await cache.match(event.request);
      try {
        const networkResponse = await fetch(event.request);
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })());
  }
});
