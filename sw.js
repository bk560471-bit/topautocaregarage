// Service Worker for Top Autocare Garage PWA
// Syncs caching for all pages (Dashboard, Profile, Services, Notifications, Verify Email, etc.)
// Version: v2 (increment for updates to bust cache)

const CACHE_NAME = 'top-autocare-v2';
const urlsToCache = [
  // Core HTML Pages (all synced for offline navigation)
  'index.html',
  'dashboard.html',
  'profile.html',
  'services.html',
  'pricing.html',
  'notifications.html',
  'verify-email.html',
  'reset-password.html',
  'privacy-policy.html',
  'terms-of-service.html',
  'signin.html',
  'signup.html',
  'book-appointment.html',
  'myvehicles.html',
  'contact.html',
  'forgot-password.html',

  // Styles and Shared Assets
  'main.css',
  'manifest.json',

  // JavaScript (Firebase config and common scripts)
  'assets/js/firebase-config.js',

  // Firebase SDKs (cached for offline UI; dynamic calls need network)
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',

  // Fonts and Icons (for consistent rendering across pages)
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',

  // Images (background, logo, icons from manifest)
  'images/background.png',
  'images/logo.png',
  'assets/images/app-icon-72.png',
  'assets/images/app-icon-96.png',
  'assets/images/app-icon-128.png',
  'assets/images/app-icon-144.png',
  'assets/images/app-icon-152.png',
  'assets/images/app-icon-167.png',
  'assets/images/app-icon-180.png',
  'assets/images/app-icon-192.png',
  'assets/images/app-icon-512.png',

  // Screenshots (optional, from manifest)
  'assets/images/screenshot-1.png',
  'assets/images/screenshot-2.png'
];

// Install Event: Precache essentials
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching core assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force activation after install (skip waiting for immediate sync)
        self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Cache addAll failed:', error);
      })
  );
});

// Activate Event: Clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    // Clean old caches (keep only current version for sync)
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => {
      // Take control of all open pages immediately (sync across tabs)
      return self.clients.claim();
    })
  );
});

// Fetch Event: Handle requests with caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests (e.g., POST for forms in book-appointment.html)
  if (request.method !== 'GET') {
    return;
  }

  // Ignore cross-origin (external) unless static assets
  if (url.origin !== location.origin) {
    // Cache-first for external static (Firebase SDKs, fonts—sync UI offline)
    if (request.destination === 'script' || request.destination === 'style' || request.destination === 'font') {
      event.respondWith(
        caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then((networkResponse) => {
            // Cache successful network responses
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          }).catch(() => {
            // Fallback for offline external resources
            return new Response('Offline: Could not load resource', { status: 503 });
          });
        })
      );
      return;
    }
    // Network-first for external APIs (e.g., Firebase dynamic—e.g., auth in signin.html)
    return fetch(request);
  }

  // Same-origin: Cache-first for static (HTML/CSS/JS/images—sync pages offline)
  if (request.destination === 'document' || request.destination === 'image' || request.destination === 'style' || request.destination === 'script') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Use cache, but refresh in background (stale-while-revalidate)
          event.waitUntil(
            fetch(request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
            }).catch(() => {
              // Network failed; use cache
              console.warn('Service Worker: Network failed, using cache:', request.url);
            })
          );
          return cachedResponse;
        }

        // No cache: Try network and cache success
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch((error) => {
          console.error('Service Worker: Fetch failed:', error);
          // Offline fallback: Serve cached index.html for HTML requests (sync navigation)
          if (request.destination === 'document') {
            return caches.match('index.html');
          }
          // For other assets, empty offline response
          return new Response('Offline', {
            headers: { 'Content-Type': 'text/plain' },
            status: 503
          });
        });
      })
    );
  } else {
    // Dynamic/API requests (Firebase Firestore/Auth—network-first, e.g., loadServices in services.html)
    event.respondWith(
      fetch(request).catch(() => {
        // Network failed: Fallback to cache (previous data) or offline message
        return caches.match(request) || new Response('Offline: Service unavailable. Reconnect for updates.', { 
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
  }
});

// Optional: Push Notifications (for future, e.g., appointment reminders in notifications.html)
self.addEventListener('push', (event) => {
  const title = 'Top Autocare Update';
  const options = {
    body: event.data ? event.data.text() : 'You have a new notification.',
    icon: 'images/logo.png',
    badge: 'assets/images/app-icon-72.png',
    vibrate: [100, 50, 100],
    data: { primaryKey: '1' },
    actions: [
      { action: 'view', title: 'View', icon: 'images/logo.png' },
      { action: 'close', title: 'Close', icon: 'images/logo.png' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Optional: Notification Clicks (open notifications.html)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('notifications.html')
  );
});
