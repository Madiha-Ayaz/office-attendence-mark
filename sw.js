const CACHE_NAME = 'attendance-system-v2.0.0';
const STATIC_CACHE = 'attendance-static-v2.0.0';
const DYNAMIC_CACHE = 'attendance-dynamic-v2.0.0';

const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
];

const FALLBACK_FILES = [
  './index.html'
];

// Install Event
self.addEventListener('install', event => {
  console.log('SW: Installing Service Worker v2.0.0');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('SW: Precaching core files');
        return cache.addAll(CORE_FILES);
      }),
      self.skipWaiting()
    ])
  );
});

// Activate Event
self.addEventListener('activate', event => {
  console.log('SW: Activating Service Worker v2.0.0');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch Event - Advanced Caching Strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle different types of requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Core files - Cache First Strategy
  if (CORE_FILES.includes(request.url) || CORE_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // External CDN resources - Stale While Revalidate
  if (url.origin === 'https://cdnjs.cloudflare.com') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  
  // Same origin requests - Network First with Cache Fallback
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // External resources - Cache First with Network Fallback
  event.respondWith(cacheFirst(request));
});

// Cache First Strategy
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('SW: Cache First failed:', error);
    
    // Return fallback for navigation requests
    if (request.mode === 'navigate') {
      const fallbackResponse = await caches.match('./index.html');
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }
    
    // Return offline page or error response
    return new Response(
      JSON.stringify({
        error: 'Network error and no cached version available',
        offline: true,
        timestamp: new Date().toISOString()
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Network First Strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('SW: Network failed, trying cache:', error);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return fallback for navigation requests
    if (request.mode === 'navigate') {
      const fallbackResponse = await caches.match('./index.html');
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }
    
    // Return offline response
    return new Response(
      JSON.stringify({
        error: 'Offline - No network connection',
        offline: true,
        timestamp: new Date().toISOString()
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  const networkResponsePromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(error => {
    console.log('SW: Network update failed:', error);
    return null;
  });
  
  // Return cached version immediately, update in background
  return cachedResponse || networkResponsePromise;
}

// Background Sync for data persistence
self.addEventListener('sync', event => {
  console.log('SW: Background sync triggered:', event.tag);
  
  if (event.tag === 'attendance-sync') {
    event.waitUntil(syncAttendanceData());
  }
});

// Sync attendance data when online
async function syncAttendanceData() {
  try {
    // Get stored attendance data
    const clients = await self.clients.matchAll();
    
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_ATTENDANCE',
        timestamp: new Date().toISOString()
      });
    });
    
    console.log('SW: Attendance data sync completed');
  } catch (error) {
    console.error('SW: Sync failed:', error);
  }
}

// Handle push notifications (for future use)
self.addEventListener('push', event => {
  console.log('SW: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'Attendance reminder',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 'attendance-notification'
    },
    actions: [
      {
        action: 'checkin',
        title: 'Check In',
        icon: './icon-checkin.png'
      },
      {
        action: 'checkout',
        title: 'Check Out',
        icon: './icon-checkout.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Attendance System', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('SW: Notification click received');
  
  event.notification.close();
  
  const action = event.action;
  const urlToOpen = action ? `./index.html?action=${action}` : './';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Check if app is already open
        for (const client of clients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Message handling
self.addEventListener('message', event => {
  console.log('SW: Message received:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_ATTENDANCE_DATA':
      cacheAttendanceData(data);
      break;
      
    case 'GET_CACHE_STATUS':
      getCacheStatus().then(status => {
        event.ports[0].postMessage(status);
      });
      break;
      
    default:
      console.log('SW: Unknown message type:', type);
  }
});

// Cache attendance data
async function cacheAttendanceData(data) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    await cache.put('attendance-data-backup', response);
    console.log('SW: Attendance data cached successfully');
  } catch (error) {
    console.error('SW: Failed to cache attendance data:', error);
  }
}

// Get cache status
async function getCacheStatus() {
  try {
    const cacheNames = await caches.keys();
    const status = {
      caches: cacheNames,
      timestamp: new Date().toISOString(),
      version: 'v2.0.0'
    };
    
    // Get cache sizes
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      status[cacheName] = keys.length;
    }
    
    return status;
  } catch (error) {
    console.error('SW: Failed to get cache status:', error);
    return { error: error.message };
  }
}

// Periodic cleanup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cleanup') {
    event.waitUntil(performCleanup());
  }
});

// Cleanup old cache entries
async function performCleanup() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    // Remove entries older than 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    for (const request of requests) {
      const response = await cache.match(request);
      const dateHeader = response.headers.get('date');
      
      if (dateHeader) {
        const responseDate = new Date(dateHeader).getTime();
        if (responseDate < thirtyDaysAgo) {
          await cache.delete(request);
          console.log('SW: Cleaned up old cache entry:', request.url);
        }
      }
    }
    
    console.log('SW: Cache cleanup completed');
  } catch (error) {
    console.error('SW: Cache cleanup failed:', error);
  }
}