// CalcInvest Service Worker
// Stratégie :
//   - HTML + JS + CSS : network-first (toujours à jour, fallback offline cache)
//   - manifest.json (data + PWA) : network-first (source de vérité features)
//   - Data prix JSON, icons : cache-first (stable, gros fichiers)
//
// IMPORTANT : la CSS est volontairement EXCLUE de cache-first depuis v52
// car le navigateur n'invalidait pas l'install event si seule la CSS changeait
// (sw.js identique → pas d'update détecté → CSS stale jusqu'au prochain bump
//  manuel de CACHE_VERSION). En network-first, chaque navigation revalide
// la CSS via Vercel (304 Not Modified si inchangée, donc latence négligeable).

const CACHE_VERSION = 'calcinvest-v67';

// Seuls les assets STABLES vont en cache-first (icons, data JSONs).
const STATIC_ASSETS = [
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
  '/assets/data/oil_wti.json',
  '/assets/data/cw8.json',
  '/assets/data/cspx.json',
  '/assets/data/eimi.json',
  '/assets/data/panx.json',
  '/assets/data/btc.json',
  '/assets/data/eth.json',
  '/assets/data/xrp.json',
  '/assets/data/bnb.json',
  '/assets/data/sol.json'
];

// HTML, JS, CSS, manifest → toujours network-first
const NETWORK_FIRST_PATTERNS = [
  /\.html$/,
  /\.css$/,                          // ← AJOUT v52 : la CSS reste fraîche
  /\/assets\/js\//,
  /\/manifest\.json$/,
  /\/assets\/data\/manifest\.json$/,
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
