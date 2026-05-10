/* ============================================================
   CalcInvest — /api/ticker
   Vercel Serverless Function : proxy Yahoo Finance côté serveur
   Évite les restrictions CORS du browser.

   GET /api/ticker?symbol=AXON
   GET /api/ticker?symbol=NVDA&period=10y
   ============================================================ */

module.exports = async function handler(req, res) {
  // CORS headers (au cas où)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const symbol = (req.query.symbol || '').toUpperCase().replace(/\s/g, '');
  const period = ['1y','2y','5y','10y','20y','max'].includes(req.query.period)
    ? req.query.period
    : '20y';

  // Validation basique du ticker
  if (!symbol || !/^[A-Z0-9.\-^=]{1,12}$/.test(symbol)) {
    return res.status(400).json({ error: 'Ticker invalide. Exemples : AXON, NVDA, MSFT, BRK-B' });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
              `?interval=1mo&range=${period}&events=div`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CalcInvest/1.0)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!r.ok) {
      if (r.status === 404) return res.status(404).json({ error: `Ticker "${symbol}" introuvable sur Yahoo Finance.` });
      return res.status(502).json({ error: 'Erreur Yahoo Finance (' + r.status + ')' });
    }

    const json = await r.json();
    const result = json.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: `Aucune donnée pour "${symbol}". Vérifiez le ticker (ex: BRK-B, ^GSPC).` });
    }

    const timestamps = result.timestamp || [];
    const closes     = result.indicators?.quote?.[0]?.close || [];

    if (timestamps.length < 6) {
      return res.status(422).json({ error: `Données insuffisantes pour "${symbol}" (moins de 6 mois disponibles).` });
    }

    // Forward-fill des prix manquants (suspensions temporaires)
    let lastGood = null;
    const raw = closes.map(p => {
      if (p != null && isFinite(p) && p > 0) { lastGood = p; return Math.round(p * 100) / 100; }
      return lastGood;
    });

    // Trim les nulls au début
    let startIdx = 0;
    while (startIdx < raw.length && raw[startIdx] == null) startIdx++;
    const prices = raw.slice(startIdx).filter(p => p != null);

    if (prices.length < 6) {
      return res.status(422).json({ error: `Données trop courtes pour "${symbol}".` });
    }

    // Dates start/end
    const tsStart = timestamps[startIdx];
    const tsEnd   = timestamps[timestamps.length - 1];
    const toYM = (ts) => {
      const d = new Date(ts * 1000);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    };

    // Dividendes mensuels (optionnel)
    let dividends = null;
    const divEvents = result.events?.dividends;
    if (divEvents && Object.keys(divEvents).length > 0) {
      // Map dividendes sur la grille mensuelle
      dividends = new Array(prices.length).fill(0);
      Object.values(divEvents).forEach(ev => {
        const evYM = toYM(ev.date);
        const startYM = toYM(tsStart);
        // Trouver l'index mensuel
        const [sy, sm] = startYM.split('-').map(Number);
        const [ey, em] = evYM.split('-').map(Number);
        const idx = (ey - sy) * 12 + (em - sm) - startIdx;
        if (idx >= 0 && idx < dividends.length) {
          dividends[idx] += Math.round(ev.amount * 100) / 100;
        }
      });
      // Si tous à 0, pas de dividendes
      if (dividends.every(d => d === 0)) dividends = null;
    }

    // Réponse
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.status(200).json({
      meta: {
        id:       symbol.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name:     result.meta.longName || result.meta.shortName || symbol,
        ticker:   symbol,
        currency: result.meta.currency || 'USD',
        category: 'stock',
        pea:      false,
        source:   'Yahoo Finance'
      },
      start:    toYM(tsStart),
      end:      toYM(tsEnd),
      points:   prices.length,
      prices,
      dividends
    });

  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout Yahoo Finance — réessayez dans quelques secondes.' });
    }
    console.error('[api/ticker] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur inattendue.' });
  }
};
