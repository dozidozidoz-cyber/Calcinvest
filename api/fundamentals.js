/* ============================================================
   CalcInvest — /api/fundamentals
   Vercel Serverless Function — Fondamentaux Yahoo Finance

   Yahoo a verrouillé v10/quoteSummary derrière un crumb anti-bot
   depuis 2024. On effectue le "crumb dance" :
   1. GET fc.yahoo.com → set-cookie (consent)
   2. GET v1/test/getcrumb avec cookie → renvoie le crumb
   3. GET v10/finance/quoteSummary avec cookie + crumb

   Cache : crumb valide ~1h, fondamentaux 1h aussi.

   GET /api/fundamentals?ticker=AAPL
   GET /api/fundamentals?ticker=AIR.PA       (Airbus Paris)
   GET /api/fundamentals?ticker=NESN.SW      (Nestlé Suisse)
   ============================================================ */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CRUMB_TTL_MS = 50 * 60 * 1000; // 50 min

// Cache module-level (partagé entre invocations chaudes)
let _crumbCache = { value: null, cookie: null, fetchedAt: 0 };

async function getCrumb() {
  if (_crumbCache.value && (Date.now() - _crumbCache.fetchedAt) < CRUMB_TTL_MS) {
    return _crumbCache;
  }
  // Step 1 : consent cookie depuis fc.yahoo.com
  const consentRes = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual'
  });
  const setCookies = [];
  for (const h of consentRes.headers.getSetCookie ? consentRes.headers.getSetCookie() : []) {
    const m = h.match(/^([^=]+=[^;]+)/);
    if (m) setCookies.push(m[1]);
  }
  // Fallback : single set-cookie header
  if (setCookies.length === 0) {
    const h = consentRes.headers.get('set-cookie');
    if (h) {
      h.split(',').forEach(c => {
        const m = c.trim().match(/^([^=]+=[^;]+)/);
        if (m) setCookies.push(m[1]);
      });
    }
  }
  const cookie = setCookies.join('; ');

  // Step 2 : récupère le crumb
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
      'Accept': '*/*'
    }
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length > 32) {
    throw new Error('Crumb invalide : ' + crumb.slice(0, 100));
  }
  _crumbCache = { value: crumb, cookie, fetchedAt: Date.now() };
  return _crumbCache;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const raw = (req.query.ticker || '').trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: 'Paramètre `ticker` requis (ex : AAPL, AIR.PA, NESN.SW)' });
  if (!/^[A-Z0-9.\-^=]{1,16}$/.test(raw)) {
    return res.status(400).json({ error: 'Ticker invalide : ' + raw });
  }
  const ticker = raw;

  const modules = [
    'summaryDetail',
    'defaultKeyStatistics',
    'financialData',
    'price',
    'summaryProfile',
    'earningsTrend',
    'incomeStatementHistory'
  ].join(',');

  try {
    // Crumb dance avec retry une fois si crumb invalide
    let attempt = 0;
    let data;
    while (attempt < 2) {
      const { value: crumb, cookie } = await getCrumb();
      const url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' +
                  encodeURIComponent(ticker) + '?modules=' + modules + '&crumb=' + encodeURIComponent(crumb);
      const r = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (r.ok) {
        data = await r.json();
        break;
      }
      if (r.status === 401 || r.status === 403) {
        // Crumb expiré, on force le refresh
        _crumbCache = { value: null, cookie: null, fetchedAt: 0 };
        attempt++;
        continue;
      }
      if (r.status === 404) return res.status(404).json({ error: 'Ticker "' + ticker + '" introuvable.' });
      return res.status(502).json({ error: 'Erreur Yahoo (' + r.status + ')' });
    }

    const result = data?.quoteSummary?.result?.[0];
    if (!result) {
      return res.status(404).json({ error: 'Aucune donnée pour "' + ticker + '". Essayez un suffixe : AIR.PA (Paris), NESN.SW (Suisse), BAS.DE (Frankfurt), VOD.L (Londres).' });
    }

    // Helper : Yahoo renvoie { raw: 1234, fmt: "1.23B" }
    const v = (obj, ...path) => {
      let cur = obj;
      for (const p of path) {
        if (!cur || typeof cur !== 'object') return null;
        cur = cur[p];
      }
      if (cur && typeof cur === 'object' && 'raw' in cur) return cur.raw;
      return cur ?? null;
    };

    const price     = result.price || {};
    const summary   = result.summaryDetail || {};
    const stats     = result.defaultKeyStatistics || {};
    const financial = result.financialData || {};
    const profile   = result.summaryProfile || {};
    const trend     = result.earningsTrend?.trend || [];
    const incomeHist= result.incomeStatementHistory?.incomeStatementHistory || [];

    const trend5y = trend.find(t => t?.period === '+5y');
    const trend1y = trend.find(t => t?.period === '+1y');
    const growth5y = v(trend5y, 'growth');
    const growth1y = v(trend1y, 'growth');

    const revenueTTM = v(financial, 'totalRevenue');
    const fcfTTM     = v(financial, 'freeCashflow');
    const fcfMargin  = (revenueTTM && fcfTTM) ? (fcfTTM / revenueTTM) : null;

    // CAGR revenus 5 ans (historique réel)
    let cagr5y = null;
    if (incomeHist.length >= 2) {
      const recent = v(incomeHist[0], 'totalRevenue');
      const oldest = v(incomeHist[incomeHist.length - 1], 'totalRevenue');
      const years = incomeHist.length - 1;
      if (recent && oldest && years > 0 && oldest > 0) {
        cagr5y = Math.pow(recent / oldest, 1 / years) - 1;
      }
    }

    // Cache CDN 1h
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=21600');

    return res.status(200).json({
      ticker,
      name:              v(price, 'longName') || v(price, 'shortName') || ticker,
      currency:          v(price, 'currency') || 'USD',
      exchange:          v(price, 'exchangeName'),
      sector:            profile.sector || null,
      industry:          profile.industry || null,
      // Prix
      price:             v(price, 'regularMarketPrice'),
      previousClose:     v(price, 'regularMarketPreviousClose'),
      marketCap:         v(price, 'marketCap'),
      // Revenus & rentabilité
      revenueTTM,
      fcfTTM,
      fcfMargin:         fcfMargin != null ? Math.round(fcfMargin * 1000) / 10 : null,
      profitMargin:      v(financial, 'profitMargins') != null ? Math.round(v(financial, 'profitMargins') * 1000) / 10 : null,
      ebitdaMargin:      v(financial, 'ebitdaMargins') != null ? Math.round(v(financial, 'ebitdaMargins') * 1000) / 10 : null,
      // Croissance (en %)
      growth5yEstimate:  growth5y != null ? Math.round(growth5y * 1000) / 10 : null,
      growth1yEstimate:  growth1y != null ? Math.round(growth1y * 1000) / 10 : null,
      cagrRevenue5y:     cagr5y != null ? Math.round(cagr5y * 1000) / 10 : null,
      // Capital
      sharesOutstanding: v(stats, 'sharesOutstanding') || v(price, 'sharesOutstanding'),
      totalDebt:         v(financial, 'totalDebt'),
      totalCash:         v(financial, 'totalCash'),
      netDebt:           ((v(financial, 'totalDebt') || 0) - (v(financial, 'totalCash') || 0)),
      // Risque
      beta:              v(stats, 'beta') || v(summary, 'beta'),
      payoutRatio:       v(summary, 'payoutRatio'),
      // Méta
      source:            'yahoo-finance',
      asOf:              Math.floor(Date.now() / 1000)
    });

  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout Yahoo Finance.' });
    }
    console.error('[api/fundamentals] error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur : ' + err.message });
  }
};
