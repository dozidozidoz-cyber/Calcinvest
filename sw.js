// CalcInvest Service Worker
// Stratégie :
//   - HTML + JS applicatif : network-first (toujours à jour)
//   - Data JSON, CSS, icons  : cache-first (stable, gros fichiers)

const CACHE_VERSION = 'calcinvest-v7';

// Seuls les assets vraiment stables vont en cache-first
const STATIC_ASSETS = [
  '/assets/css/style.css',
  '/assets/data/manifest.json',
  '/manifest.json',
  '/assets/icons/icon-192.svg',
  '/assets/icons/icon-512.svg',
  '/assets/data/sp500.json',
  '/assets/data/nasdaq.json',
  '/assets/data/nikkei.json',
  '/assets/data/cac40.json',
  '/assets/data/msci_world.json',
  '/assets/data/paeem.json',
  '/assets/data/gold.json',
  '/assets/data/silver.json',
  '/assets/data/oil_brent.json',
  '/assets/data/oil_wti.json'
];

// JS et HTML → toujours network-first
const NETWORK_FIRST_PATTERNS = [
  /\.html$/,
  /\/assets\/js\//,
  /^\/$/
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

  const isNetworkFirst =
    request.destination === 'document' ||
    NETWORK_FIRST_PATTERNS.some((re) => re.test(url.pathname));

  if (isNetworkFirst) {
    // Network-first : toujours chercher en réseau, fallback cache si offline
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first pour les données JSON et assets statiques lourds
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
