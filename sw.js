// Fuel Tracker service worker
// Caches the app shell so the app opens with no connection (e.g. at a rural
// gas station). Fuel entries made offline are queued in IndexedDB by the page
// and synced when connectivity returns — this worker only handles caching.
//
// Bump CACHE_VERSION whenever you deploy changes to index.html so clients
// pick up the new version promptly.
const CACHE_VERSION = 'fuel-tracker-v7';   // keep in sync with APP_VERSION in index.html

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './FuelLogPumpGreen.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE_VERSION; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept Google API, auth, or Drive traffic — those must always
  // hit the network with fresh credentials.
  if (url.hostname.endsWith('googleapis.com') ||
      url.hostname.endsWith('googleusercontent.com') ||
      url.hostname === 'accounts.google.com' ||
      url.hostname === 'apis.google.com') {
    return;
  }

  // Network-first so updates propagate immediately; fall back to the cache
  // when offline. Navigations fall back to the cached index.html.
  event.respondWith(
    fetch(req)
      .then(function (resp) {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION)
            .then(function (cache) { cache.put(req, copy); })
            .catch(function () {});
        }
        return resp;
      })
      .catch(function () {
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
