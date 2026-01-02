// Service Worker DISABLED - No caching to ensure fresh updates
const CACHE_NAME = 'superparty-disabled-' + Date.now();
const urlsToCache = [];

// Install - skip caching
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - Network ONLY, no caching
self.addEventListener('fetch', event => {
  // Always fetch from network, never cache
  event.respondWith(fetch(event.request));
});
