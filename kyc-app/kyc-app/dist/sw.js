// Service Worker pentru PWA
const CACHE_NAME = 'superparty-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
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
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip caching for:
  // - POST/PUT/DELETE requests
  // - Socket.io requests
  // - Firebase Functions
  // - External APIs
  const shouldCache = 
    request.method === 'GET' &&
    !url.pathname.includes('/socket.io/') &&
    !url.hostname.includes('cloudfunctions.net') &&
    !url.hostname.includes('firebaseio.com') &&
    !url.hostname.includes('googleapis.com');
  
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache GET requests for same-origin resources
        if (shouldCache && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache only for cacheable requests
        if (shouldCache) {
          return caches.match(request);
        }
        // For non-cacheable requests, return a network error
        return new Response('Network error', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
