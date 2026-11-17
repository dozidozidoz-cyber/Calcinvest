/* ============================================================
   CalcInvest — /api/daily
   Vercel Serverless Function : cours JOURNALIERS d'un ticker Yahoo,
   OHLC ajusté dividendes/splits, au même format que
   assets/data/daily/{id}.json (généré par scripts/fetch_daily.py).

   GET /api/daily?symbol=AAPL
   GET /api/daily?symbol=MC.PA&since=2010-01-01

   Réponse :
   { meta: { id, name, ticker, currency, adjusted, source },
     start, end, points, d: ["YYYY-MM-DD"], o: [], h: [], l: [], c: [] }
   ============================================================ */
'use strict';

const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,15}$/;

function round(v) {
  return Number(v.toPrecision(7));
}

/**
 * Convertit chart.result[0] de Yahoo en série colonnaire ajustée.
 * Les dates sont exprimées dans le fuseau de la bourse (meta.exchangeTimezoneName),
 * heure d'été comprise : un décalage fixe (gmtoffset) date mal les séances
 * des contrats à terme pendant l'été.
 * @param {object} result  chart.result[0]
 * @param {string} today   "YYYY-MM-DD" : les séances >= today sont écartées (incomplètes)
 */
function buildSeries(result, today) {
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const adj = result.indicators && result.indicators.adjclose && result.indicators.adjclose[0]
    ? result.indicators.adjclose[0].adjclose : null;
  const tz = (result.meta && result.meta.exchangeTimezoneName) || 'UTC';
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (_) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const d = [], o = [], h = [], l = [], c = [];
  let prev = null;
  for (let i = 0; i < ts.length; i++) {
    const open = q.open && q.open[i], high = q.high && q.high[i];
    const low = q.low && q.low[i], cl = q.close && q.close[i];
    if (![open, high, low, cl].every(v => Number.isFinite(v) && v > 0)) continue;
    const date = fmt.format(new Date(ts[i] * 1000));
    if (date >= today || (prev && date <= prev)) continue;
    const f = adj && Number.isFinite(adj[i]) && adj[i] > 0 ? adj[i] / cl : 1;
    d.push(date);
    o.push(round(open * f));
    h.push(round(Math.max(open, high, low, cl) * f));
    l.push(round(Math.min(open, high, low, cl) * f));
    c.push(round(cl * f));
    prev = date;
  }
  return { d, o, h, l, c };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const symbol = String(req.query.symbol || '').toUpperCase().replace(/\s/g, '');
  if (!SYMBOL_RE.test(symbol)) {
    return res.status(400).json({ error: 'Ticker invalide. Exemples : AAPL, MC.PA, 0388.HK, BTC-USD, ^GSPC' });
  }
  const since = /^\d{4}-\d{2}-\d{2}$/.test(req.query.since || '') ? req.query.since : '2000-01-01';
  const period1 = Math.floor(Date.parse(since + 'T00:00:00Z') / 1000);
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
    '?period1=' + period1 + '&period2=9999999999&interval=1d&events=div%2Csplits';

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CalcInvest/1.0)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(9000)
    });
    if (!r.ok) {
      if (r.status === 404) return res.status(404).json({ error: `Ticker "${symbol}" introuvable sur Yahoo Finance.` });
      return res.status(502).json({ error: 'Erreur Yahoo Finance (' + r.status + ')' });
    }
    const json = await r.json();
    const result = json.chart && json.chart.result && json.chart.result[0];
    if (!result) return res.status(404).json({ error: `Aucune donnée pour "${symbol}". Vérifiez le ticker (ex. MC.PA pour Paris, 0388.HK pour Hong Kong).` });

    const today = new Date().toISOString().slice(0, 10);
    const s = buildSeries(result, today);
    if (s.d.length < 60) {
      return res.status(422).json({ error: `Historique trop court pour "${symbol}" (${s.d.length} séances).` });
    }
    const meta = result.meta || {};
    // Cours de clôture : inutile de rafraîchir plus d'une fois toutes les 6 h
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json({
      meta: {
        id: symbol.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
        name: meta.longName || meta.shortName || symbol,
        ticker: symbol,
        currency: meta.currency || null,
        adjusted: true,
        source: 'Yahoo Finance (' + symbol + ') — OHLC journalier ajusté dividendes/splits'
      },
      start: s.d[0], end: s.d[s.d.length - 1], points: s.d.length,
      d: s.d, o: s.o, h: s.h, l: s.l, c: s.c
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout Yahoo Finance.' });
    }
    console.error('[api/daily] error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur inattendue.' });
  }
}

module.exports = handler;
module.exports.buildSeries = buildSeries;
