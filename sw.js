const CACHE_NAME = 'keub-app-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll([
        '/',
        OFFLINE_URL,
      ]);
    } catch (err) {
      console.warn('SW: failed to pre-cache', err);
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== CACHE_NAME) return caches.delete(k);
      return null;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API, Supabase, Stripe or any cross-origin request —
  // always go straight to network so cached bundles can't return stale 401/404.
  const isApiCall = url.hostname !== self.location.hostname
    || url.pathname.startsWith('/rest/')
    || url.pathname.startsWith('/functions/')
    || url.pathname.startsWith('/realtime/')
    || url.pathname.startsWith('/auth/');
  if (isApiCall) {
    // bypass SW entirely — let browser handle it directly
    return;
  }

  // Only handle navigation requests to serve offline page
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResp = await event.preloadResponse;
        if (preloadResp) return preloadResp;

        const networkResp = await fetch(event.request);
        return networkResp;
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(OFFLINE_URL);
        return cached || Response.error();
      }
    })());
    return;
  }

  // For other requests, try network first then cache
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      return response;
    } catch (err) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      return cached || Response.error();
    }
  })());
});
