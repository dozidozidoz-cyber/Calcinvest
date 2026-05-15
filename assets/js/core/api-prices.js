/* ============================================================
   CalcInvest — Prix en temps réel (API publiques gratuites)
   - Forex : frankfurter.app (ECB, CORS OK, no key)
   - Crypto : CoinGecko v3 (CORS OK, no key, rate-limit 30/min)
   - Métaux : metals.dev fallback ou frankfurter pour XAU si dispo, sinon prix hard-coded
   - Stocks/indices/commodities : pas de free API CORS-friendly → fallback prix indicatifs
   ============================================================ */
(function (global) {
  'use strict';

  const TTL_MS = 5 * 60 * 1000; // 5 min cache
  const CACHE_KEY = 'ci_price_cache_v1';
  const CACHE_TS_KEY = 'ci_price_cache_ts_v1';

  // ─── Cache ───────────────────────────────────────────────────
  function readCache() {
    try {
      const data = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
      const ts = parseInt(sessionStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (Date.now() - ts > TTL_MS) return {};
      return data;
    } catch { return {}; }
  }
  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
      sessionStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch {}
  }

  // ─── CoinGecko symbol map ────────────────────────────────────
  const COINGECKO_IDS = {
    'BTC': 'bitcoin',  'ETH': 'ethereum', 'SOL': 'solana',
    'BNB': 'binancecoin', 'XRP': 'ripple', 'DOGE': 'dogecoin',
    'ADA': 'cardano', 'AVAX': 'avalanche-2'
  };

  // Symboles routés via le proxy /api/price (Yahoo Finance côté serveur)
  // Couvre stocks, indices, métaux, commodities
  const YAHOO_PROXIED = new Set([
    'XAU/USD', 'XAG/USD', 'XPT/USD',
    'WTI', 'BRENT', 'NATGAS',
    'US30', 'NAS100', 'SPX500', 'GER40', 'FRA40', 'UK100', 'JPN225',
    'AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL'
  ]);

  /**
   * Appelle le proxy serverless /api/price pour les actifs non couverts
   * par les API publiques CORS-friendly.
   * @param {string} symbol  Ex. "AAPL", "XAU/USD", "US30"
   * @returns {Promise<number|null>}
   */
  async function fetchProxyPrice(symbol) {
    try {
      const res = await fetch('/api/price?symbol=' + encodeURIComponent(symbol), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && typeof data.price === 'number' && Number.isFinite(data.price)) {
        return data.price;
      }
      return null;
    } catch (e) {
      console.warn('[api-prices] proxy fetch failed:', e.message);
      return null;
    }
  }

  /**
   * Récupère les taux forex via frankfurter.app (ECB).
   * Base par défaut : EUR. Renvoie un dict { USD: 1.08, GBP: 0.86, ... }
   */
  async function fetchForexRates(base) {
    base = base || 'EUR';
    try {
      const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('frankfurter ' + res.status);
      const data = await res.json();
      return data.rates || {};
    } catch (e) {
      console.warn('[api-prices] forex fetch failed:', e.message);
      return null;
    }
  }

  /**
   * Récupère les prix crypto via CoinGecko.
   * @param {string[]} symbols  Liste de symboles (BTC, ETH, ...)
   * @returns {Object}          { BTC: 95000, ETH: 3500, ... }
   */
  async function fetchCryptoPrices(symbols) {
    const ids = symbols.map(s => COINGECKO_IDS[s.toUpperCase()]).filter(Boolean);
    if (!ids.length) return {};
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('coingecko ' + res.status);
      const data = await res.json();
      const out = {};
      for (const sym of symbols) {
        const id = COINGECKO_IDS[sym.toUpperCase()];
        if (id && data[id] && typeof data[id].usd === 'number') {
          out[sym.toUpperCase()] = data[id].usd;
        }
      }
      return out;
    } catch (e) {
      console.warn('[api-prices] crypto fetch failed:', e.message);
      return null;
    }
  }

  /**
   * Récupère le prix d'une paire de la base PIPS.
   * Logique :
   * - Forex (EUR/USD, etc.) → frankfurter (cross-rate via EUR)
   * - Crypto X/USD → CoinGecko
   * - Métaux XAU/USD, XAG/USD → frankfurter rate (XAU est une devise frankfurter)
   * - Autres (stocks, indices, commodities) → null (pas de free API CORS)
   *
   * @param {string} pair  Ex. "EUR/USD", "BTC/USD", "XAU/USD"
   * @returns {Promise<number|null>}
   */
  async function getPrice(pair) {
    if (!pair) return null;
    const cache = readCache();
    if (cache[pair] != null) return cache[pair];

    // Symboles sans "/" (US30, AAPL, WTI...) → proxy direct
    if (!pair.includes('/')) {
      if (YAHOO_PROXIED.has(pair)) {
        const p = await fetchProxyPrice(pair);
        if (p != null) { cache[pair] = p; writeCache(cache); return p; }
      }
      return null;
    }

    const [base, quote] = pair.split('/');

    // Crypto
    if (COINGECKO_IDS[base.toUpperCase()] && quote === 'USD') {
      const prices = await fetchCryptoPrices([base]);
      if (!prices) return null;
      const p = prices[base.toUpperCase()];
      if (p != null) {
        cache[pair] = p; writeCache(cache);
        return p;
      }
      return null;
    }

    // Métaux + paires proxied (XAU/USD, XAG/USD, ...) → proxy serverless
    if (YAHOO_PROXIED.has(pair)) {
      const p = await fetchProxyPrice(pair);
      if (p != null) { cache[pair] = p; writeCache(cache); return p; }
      // Fall through au cas où Frankfurter aurait quelque chose
    }

    // Forex via frankfurter
    try {
      const rates = await fetchForexRates(base);
      if (rates) {
        const r = rates[quote];
        if (r != null) {
          cache[pair] = r; writeCache(cache);
          return r;
        }
      }
      // Fallback : essayer le sens inverse (1 / rate(quote → base))
      const reverse = await fetchForexRates(quote);
      if (reverse && reverse[base]) {
        const p = 1 / reverse[base];
        cache[pair] = p; writeCache(cache);
        return p;
      }
    } catch {}

    // Dernier recours : essayer le proxy même si non explicitement mappé
    const p = await fetchProxyPrice(pair);
    if (p != null) { cache[pair] = p; writeCache(cache); return p; }

    return null;
  }

  /**
   * Récupère les prix pour plusieurs paires en parallèle.
   * @param {string[]} pairs
   * @returns {Promise<Object>}  { 'EUR/USD': 1.08, ... }
   */
  async function getPrices(pairs) {
    const cache = readCache();
    const missing = pairs.filter(p => cache[p] == null);
    if (!missing.length) {
      const out = {};
      pairs.forEach(p => { if (cache[p] != null) out[p] = cache[p]; });
      return out;
    }
    // Batch crypto en un seul appel
    const cryptoMissing = missing.filter(p => {
      const b = p.split('/')[0];
      return COINGECKO_IDS[b] && p.endsWith('/USD');
    });
    const otherMissing = missing.filter(p => !cryptoMissing.includes(p));

    const tasks = [];
    if (cryptoMissing.length) {
      tasks.push(fetchCryptoPrices(cryptoMissing.map(p => p.split('/')[0])).then(prices => {
        if (!prices) return;
        cryptoMissing.forEach(p => {
          const sym = p.split('/')[0];
          if (prices[sym] != null) cache[p] = prices[sym];
        });
      }));
    }
    // Pour le forex/métaux : group par base
    const byBase = {};
    otherMissing.forEach(p => {
      const [b] = p.split('/');
      (byBase[b] = byBase[b] || []).push(p);
    });
    Object.keys(byBase).forEach(base => {
      tasks.push(fetchForexRates(base).then(rates => {
        if (!rates) return;
        byBase[base].forEach(p => {
          const q = p.split('/')[1];
          if (rates[q] != null) cache[p] = rates[q];
        });
      }));
    });

    await Promise.all(tasks);
    writeCache(cache);

    const out = {};
    pairs.forEach(p => { if (cache[p] != null) out[p] = cache[p]; });
    return out;
  }

  /**
   * Met à jour `PIPS.PAIRS[pair].price` avec un prix live (si dispo).
   * Utile pour que les conversions internes (pip value, margin) utilisent
   * un taux à jour. Renvoie le prix appliqué ou null.
   */
  async function syncPipsBase(pair) {
    if (!global.PIPS || !global.PIPS.PAIRS || !global.PIPS.PAIRS[pair]) return null;
    const price = await getPrice(pair);
    if (price != null && Number.isFinite(price)) {
      global.PIPS.PAIRS[pair].price = price;
      global.PIPS.PAIRS[pair].priceUpdatedAt = Date.now();
      return price;
    }
    return null;
  }

  /**
   * Force la mise à jour du cache (ignore TTL).
   */
  function clearCache() {
    try {
      sessionStorage.removeItem(CACHE_KEY);
      sessionStorage.removeItem(CACHE_TS_KEY);
    } catch {}
  }

  /**
   * Renvoie l'âge du cache en secondes (ou null si vide).
   */
  function cacheAge() {
    try {
      const ts = parseInt(sessionStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (!ts) return null;
      return Math.floor((Date.now() - ts) / 1000);
    } catch { return null; }
  }

  const api = {
    getPrice, getPrices, syncPipsBase,
    fetchForexRates, fetchCryptoPrices,
    clearCache, cacheAge,
    COINGECKO_IDS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PRICES = api;
})(typeof window !== 'undefined' ? window : globalThis);
