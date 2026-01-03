// Service Worker - No caching + Push notifications
const CACHE_NAME = 'superparty-disabled-' + Date.now();

// Install
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

// Fetch - Network ONLY
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});

// Push Notification - Keep-alive optimized
self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    // Keep-alive notification (silent, no UI)
    if (data.type === 'keep-alive') {
      event.waitUntil(handleKeepAlive(data));
      return;
    }

    // Real notification (show to user)
    if (data.type === 'message' || data.type === 'event') {
      event.waitUntil(showNotification(data));
      return;
    }
  } catch (error) {
    console.error('Push handler error:', error);
  }
});

// Keep-alive handler (optimized, minimal processing)
async function handleKeepAlive(data) {
  // Minimal processing - just keep Service Worker alive
  // No network requests, no heavy computation

  // Optional: Update badge
  if (data.badge) {
    self.registration.badge = data.badge;
  }

  // Optional: Sync critical data only
  if (data.syncRequired) {
    await syncMinimalData();
  }

  // Log for debugging (remove in production)
  console.log('Keep-alive ping:', new Date().toISOString());
}

// Sync minimal data (optimized)
async function syncMinimalData() {
  try {
    // Only sync if absolutely necessary
    // Use cache-first strategy
    const cache = await caches.open('api-cache');
    const response = await fetch('/api/minimal-sync', {
      method: 'GET',
      headers: { 'Cache-Control': 'max-age=300' },
    });

    if (response.ok) {
      await cache.put('/api/minimal-sync', response.clone());
    }
  } catch (error) {
    // Fail silently - don't waste battery on retries
    console.error('Sync failed:', error);
  }
}

// Show real notification
async function showNotification(data) {
  const options = {
    body: data.body,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    vibrate: [200, 100, 200],
    data: data,
    actions: data.actions || [],
  };

  await self.registration.showNotification(data.title, options);
}

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
