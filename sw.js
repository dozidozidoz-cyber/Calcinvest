// CalcInvest Service Worker
// Stratégie : network-first pour HTML (toujours récent), cache-first pour assets statiques

const CACHE_VERSION = 'calcinvest-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/common.js',
  '/assets/js/core/finance-utils.js',
  '/assets/js/core/calc-locatif.js',
  '/assets/js/core/calc-dca.js',
  '/assets/data/manifest.json',
  '/manifest.json',
  '/assets/icons/icon-192.svg',
  '/assets/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML : network-first (pour avoir les updates tout de suite)
  if (request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  // Assets : cache-first
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
