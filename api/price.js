/* ============================================================
   CalcInvest — /api/price
   Vercel Serverless Function — Spot price proxy (Yahoo Finance)
   Couvre les classes d'actifs sans free API CORS-friendly :
   - Stocks US (AAPL, MSFT, ...)
   - Indices (US30, NAS100, SPX500, GER40, FRA40, UK100, JPN225)
   - Métaux précieux (XAU, XAG, XPT)
   - Commodities (WTI, BRENT, NATGAS)

   GET /api/price?symbol=AAPL
   GET /api/price?symbol=XAU/USD
   GET /api/price?symbol=US30

   Réponse :
   { price: 190.42, currency: "USD", source: "yahoo", ticker: "AAPL", time: 1715789012 }
   ============================================================ */

// Map nos symboles → tickers Yahoo Finance
const SYMBOL_MAP = {
  // Indices CFD → ETF/Indice Yahoo
  'US30':    '^DJI',     // Dow Jones
  'NAS100':  '^NDX',     // Nasdaq 100
  'SPX500':  '^GSPC',    // S&P 500
  'GER40':   '^GDAXI',   // DAX
  'FRA40':   '^FCHI',    // CAC 40
  'UK100':   '^FTSE',    // FTSE 100
  'JPN225':  '^N225',    // Nikkei 225

  // Métaux précieux → futures Yahoo
  'XAU/USD': 'GC=F',     // Gold futures
  'XAG/USD': 'SI=F',     // Silver futures
  'XPT/USD': 'PL=F',     // Platinum futures

  // Énergie → futures
  'WTI':     'CL=F',     // WTI Crude
  'BRENT':   'BZ=F',     // Brent
  'NATGAS':  'NG=F',     // Natural Gas
};

function toYahooTicker(symbol) {
  symbol = String(symbol).toUpperCase().trim();
  if (SYMBOL_MAP[symbol]) return SYMBOL_MAP[symbol];
  // Actions US : passe-plat (AAPL → AAPL)
  if (/^[A-Z]{1,5}$/.test(symbol)) return symbol;
  // Tickers déjà Yahoo (^DJI, GC=F, BRK-B)
  if (/^[A-Z0-9.\-^=]{1,12}$/.test(symbol)) return symbol;
  // Paire de type X/Y non mappée : refuse
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const raw = req.query.symbol || '';
  if (!raw) return res.status(400).json({ error: 'Paramètre `symbol` requis.' });

  const ticker = toYahooTicker(raw);
  if (!ticker) {
    return res.status(400).json({ error: `Symbole "${raw}" non supporté par /api/price. Utilisez Frankfurter (forex) ou CoinGecko (crypto) côté client.` });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CalcInvest/1.0)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!r.ok) {
      if (r.status === 404) return res.status(404).json({ error: `Ticker "${ticker}" introuvable.` });
      return res.status(502).json({ error: 'Erreur Yahoo Finance (' + r.status + ')' });
    }

    const json = await r.json();
    const result = json.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: `Aucune donnée pour "${ticker}".` });

    const meta = result.meta || {};
    const price = meta.regularMarketPrice ?? meta.previousClose;
    if (price == null || !Number.isFinite(price)) {
      return res.status(422).json({ error: `Prix indisponible pour "${ticker}".` });
    }

    // Cache CDN 60s, stale-while-revalidate 5min — Vercel Edge cachera donc 1 appel/min/ticker
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      symbol:          raw.toUpperCase(),
      ticker,
      price:           Math.round(price * 10000) / 10000,
      currency:        meta.currency || 'USD',
      previousClose:   meta.previousClose ?? null,
      change:          meta.regularMarketPrice != null && meta.previousClose != null
                          ? Math.round((meta.regularMarketPrice - meta.previousClose) * 10000) / 10000
                          : null,
      changePercent:   meta.regularMarketPrice != null && meta.previousClose
                          ? Math.round(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 10000)) / 100
                          : null,
      marketState:     meta.marketState || null,
      exchange:        meta.fullExchangeName || meta.exchangeName || null,
      time:            meta.regularMarketTime || Math.floor(Date.now() / 1000),
      source:          'yahoo'
    });

  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout Yahoo Finance.' });
    }
    console.error('[api/price] error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur inattendue.' });
  }
};
