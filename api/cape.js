/* ============================================================
   CalcInvest — /api/cape
   Vercel Serverless Function — CAPE Shiller live

   Source : multpl.com/shiller-pe (publication mensuelle Robert Shiller)
   On scrape l'élément <div id="current"> de la page HTML.

   Pour les autres indices que le S&P 500, on garde les valeurs
   hardcodées (rafraîchies trimestriellement) — pas de source live
   gratuite fiable pour CAC 40 / Nasdaq CAPE / MSCI World.

   Cache : 12h (le CAPE mensuel ne bouge pas dans la journée).

   GET /api/cape                  → { sp500: 32.4, cac40: 21.5, ... }
   GET /api/cape?index=sp500      → { value: 32.4, asOf: '2026-05', source: 'multpl.com' }
   ============================================================ */

const USER_AGENT = 'Mozilla/5.0 (compatible; CalcInvestBot/1.0; +https://calcinvest.fr)';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// Valeurs par défaut (mises à jour trimestriellement)
const FALLBACK = {
  sp500: 32.1,
  cac40: 21.5,
  nasdaq: 38.8,
  msci_world: 25.2,
  nikkei: 22.8
};

let _cache = { data: null, fetchedAt: 0 };

async function fetchSP500CAPE() {
  try {
    const res = await fetch('https://www.multpl.com/shiller-pe', {
      headers: { 'User-Agent': USER_AGENT },
      cf: { cacheTtl: 3600 }
    });
    if (!res.ok) throw new Error('multpl ' + res.status);
    const html = await res.text();
    // Cherche <div id="current">XX.XX</div> ou <b>XX.XX</b> dans le markup
    const m = html.match(/id="current"[^>]*>\s*([\d.]+)\s*</);
    if (m) return parseFloat(m[1]);
    // Fallback : pattern alternatif "Current Shiller PE Ratio: XX.XX"
    const m2 = html.match(/Current Shiller PE Ratio[^0-9]*([\d.]+)/i);
    if (m2) return parseFloat(m2[1]);
    return null;
  } catch (e) {
    console.warn('[cape] multpl scrape échec:', e.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();
  if (!_cache.data || (now - _cache.fetchedAt) > CACHE_TTL_MS) {
    const sp = await fetchSP500CAPE();
    _cache.data = { ...FALLBACK };
    if (sp && sp > 5 && sp < 100) {
      _cache.data.sp500 = sp;
      _cache.data._source = 'multpl.com (live)';
    } else {
      _cache.data._source = 'fallback hardcoded';
    }
    _cache.data._asOf = new Date().toISOString().slice(0, 7);
    _cache.fetchedAt = now;
  }

  const idx = req.query && req.query.index;
  if (idx && _cache.data[idx] != null) {
    return res.status(200).json({
      value: _cache.data[idx],
      index: idx,
      asOf: _cache.data._asOf,
      source: idx === 'sp500' ? _cache.data._source : 'hardcoded'
    });
  }

  return res.status(200).json({
    sp500: _cache.data.sp500,
    cac40: _cache.data.cac40,
    nasdaq: _cache.data.nasdaq,
    msci_world: _cache.data.msci_world,
    nikkei: _cache.data.nikkei,
    asOf: _cache.data._asOf,
    source: _cache.data._source
  });
};
