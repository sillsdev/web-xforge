const CACHE = 'sf-cache';
const offlineFallbackPage = 'offline.html';

self.addEventListener('install', async event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(offlineFallbackPage)));
});

self.addEventListener('fetch', event => {
  const path = event.request.url.substring(event.request.url.indexOf('/', event.request.url.indexOf('://') + 3) + 1);
  if (event.request.mode === 'navigate' && path === '') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch (error) {
          const cache = await caches.open(CACHE);
          return await cache.match(offlineFallbackPage);
        }
      })()
    );
  }
});
importScripts('./ngsw-worker.js');
