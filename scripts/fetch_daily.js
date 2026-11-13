#!/usr/bin/env node
/* ============================================================
   CalcInvest — Fetch des cours JOURNALIERS (OHLC ajusté)
   ============================================================
   Les JSON mensuels (assets/data/{id}.json) suffisent pour le DCA,
   pas pour tester un stop ou une moyenne mobile : il faut le plus
   haut / plus bas de chaque séance. Ce script écrit
   assets/data/daily/{id}.json pour chaque actif du manifest, plus
   assets/data/daily/series.json (liste des séries disponibles).

   Usage (Node >= 18, aucune dépendance) :
     node scripts/fetch_daily.js                    # tous les actifs du manifest
     node scripts/fetch_daily.js --only sp500       # un seul actif
     node scripts/fetch_daily.js --since 1990-01-01 # historique plus long
     node scripts/fetch_daily.js --ticker TWST --ticker 0388.HK
                                                    # tickers Yahoo hors manifest

   Format de sortie (colonnaire, compact) :
     { meta: { id, name, ticker, currency, adjusted, source },
       start, end, points,
       d: ["YYYY-MM-DD", ...], o: [...], h: [...], l: [...], c: [...] }

   Les prix sont AJUSTÉS des dividendes et des splits (facteur
   adjclose / close appliqué à O, H, L, C) : sans ça, un détachement
   de dividende ou un split ressemble à une chute et déclenche un
   faux stop dans un backtest.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'assets', 'data');
const DAILY_DIR = path.join(DATA_DIR, 'daily');
const DEFAULT_SINCE = '2000-01-01';
const DELAY_MS = 400;

function parseArgs(argv) {
  const args = { only: null, since: DEFAULT_SINCE, tickers: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--ticker') args.tickers.push(argv[++i]);
    else throw new Error('Argument inconnu : ' + a);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.since)) throw new Error('--since attend YYYY-MM-DD');
  return args;
}

function slug(ticker) {
  return ticker.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function round(v) {
  return Number(v.toPrecision(7));
}

/**
 * Transforme une réponse Yahoo chart en série colonnaire ajustée.
 * Fonction pure (testée dans tests/data/daily.test.js).
 * @param {object} result  chart.result[0]
 * @param {string} today   "YYYY-MM-DD" — les séances >= today sont écartées (incomplètes)
 */
function buildSeries(result, today) {
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const adj = result.indicators && result.indicators.adjclose && result.indicators.adjclose[0]
    ? result.indicators.adjclose[0].adjclose : null;
  const offset = (result.meta && result.meta.gmtoffset) || 0;

  const d = [], o = [], h = [], l = [], c = [];
  let prevDate = null;
  for (let i = 0; i < ts.length; i++) {
    const open = q.open && q.open[i], high = q.high && q.high[i];
    const low = q.low && q.low[i], close = q.close && q.close[i];
    if (![open, high, low, close].every(v => Number.isFinite(v) && v > 0)) continue;
    const date = new Date((ts[i] + offset) * 1000).toISOString().slice(0, 10);
    if (date >= today) continue;          // séance du jour : incomplète
    if (prevDate && date <= prevDate) continue; // doublon / désordre
    const f = adj && Number.isFinite(adj[i]) && adj[i] > 0 ? adj[i] / close : 1;
    const hi = Math.max(open, high, low, close), lo = Math.min(open, high, low, close);
    d.push(date);
    o.push(round(open * f)); h.push(round(hi * f)); l.push(round(lo * f)); c.push(round(close * f));
    prevDate = date;
  }
  return { d, o, h, l, c };
}

async function fetchChart(ticker, since) {
  const period1 = Math.floor(new Date(since + 'T00:00:00Z').getTime() / 1000);
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) +
    '?period1=' + period1 + '&period2=9999999999&interval=1d&events=div%2Csplits';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error((json.chart && json.chart.error && json.chart.error.description) || 'réponse vide');
  return result;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchOne(job, since, today) {
  for (const ticker of job.tickers) {
    try {
      const result = await fetchChart(ticker, since);
      const s = buildSeries(result, today);
      if (s.d.length < 30) throw new Error('série trop courte (' + s.d.length + ' séances)');
      return {
        meta: {
          id: job.id,
          name: job.name || (result.meta && (result.meta.longName || result.meta.shortName)) || ticker,
          ticker,
          currency: (result.meta && result.meta.currency) || job.currency || null,
          adjusted: true,
          source: 'Yahoo Finance (' + ticker + ') — OHLC journalier ajusté dividendes/splits'
        },
        start: s.d[0], end: s.d[s.d.length - 1], points: s.d.length,
        d: s.d, o: s.o, h: s.h, l: s.l, c: s.c
      };
    } catch (e) {
      console.log('    ⚠ ' + ticker + ' : ' + e.message);
    }
    await sleep(DELAY_MS);
  }
  return null;
}

function buildJobs(args) {
  const jobs = [];
  if (!args.tickers.length || args.only) {
    const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
    for (const a of manifest.assets) {
      if (args.only && a.id !== args.only) continue;
      const tickers = [a.ticker];
      // Ticker réellement utilisé par le fetch mensuel (peut différer du manifest)
      try {
        const monthly = JSON.parse(fs.readFileSync(path.join(DATA_DIR, a.id + '.json'), 'utf8'));
        const t = monthly.meta && monthly.meta.ticker;
        if (t && !tickers.includes(t)) tickers.push(t);
      } catch (_) { /* pas de JSON mensuel */ }
      jobs.push({ id: a.id, name: a.name, currency: a.currency, tickers });
    }
  }
  for (const t of args.tickers) jobs.push({ id: slug(t), name: null, currency: null, tickers: [t] });
  return jobs;
}

function writeIndex() {
  const series = fs.readdirSync(DAILY_DIR)
    .filter(f => f.endsWith('.json') && f !== 'series.json')
    .map(f => {
      const j = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, f), 'utf8'));
      return { id: j.meta.id, name: j.meta.name, ticker: j.meta.ticker, currency: j.meta.currency, start: j.start, end: j.end, points: j.points };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(DAILY_DIR, 'series.json'), JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), series }, null, 2) + '\n');
  return series.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(DAILY_DIR, { recursive: true });

  const jobs = buildJobs(args);
  if (!jobs.length) throw new Error('Aucun actif à récupérer (vérifiez --only)');
  const ok = [], fail = [];
  for (const job of jobs) {
    console.log('\n▶ ' + job.id.padEnd(12) + ' | ' + job.tickers.join(', '));
    const out = await fetchOne(job, args.since, today);
    if (!out) { console.log('    ❌ aucune donnée'); fail.push(job.id); continue; }
    const file = path.join(DAILY_DIR, job.id + '.json');
    fs.writeFileSync(file, JSON.stringify(out));
    console.log('    ✓ ' + out.start + ' → ' + out.end + ' | ' + out.points + ' séances | ' + (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
    ok.push(job.id);
    await sleep(DELAY_MS);
  }
  const n = writeIndex();
  console.log('\n' + '='.repeat(50));
  console.log('✅ ' + ok.length + ' séries récupérées, ' + n + ' dans series.json');
  if (fail.length) console.log('❌ Échecs : ' + fail.join(', '));
  if (!ok.length) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
}

module.exports = { buildSeries, slug, parseArgs };
