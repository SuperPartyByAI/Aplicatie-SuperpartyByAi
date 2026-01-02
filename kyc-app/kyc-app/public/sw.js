// Service Worker pentru PWA
const CACHE_NAME = 'superparty-v4-keyboard-fix-2026-01-02-2200';
const urlsToCache = ['/', '/index.html', '/manifest.json'];

// Install
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
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

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip Service Worker entirely for:
  // - POST/PUT/DELETE requests
  // - Socket.io requests
  // - Firebase Functions
  // - External APIs (Railway, etc.)
  const shouldIntercept =
    request.method === 'GET' &&
    !url.pathname.includes('/socket.io/') &&
    !url.hostname.includes('cloudfunctions.net') &&
    !url.hostname.includes('firebaseio.com') &&
    !url.hostname.includes('googleapis.com') &&
    !url.hostname.includes('railway.app');

  // Don't intercept non-cacheable requests at all
  if (!shouldIntercept) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful GET requests
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache).catch(() => {
              // Ignore cache errors
            });
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(request);
      })
  );
});
