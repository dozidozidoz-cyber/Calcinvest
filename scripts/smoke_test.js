#!/usr/bin/env node
/* ============================================================
   CalcInvest — Smoke test pre-launch
   Vérifie que :
   1. Toutes les URLs du sitemap pointent vers des fichiers HTML existants
   2. Toutes les URLs du TOOL_CATALOG pointent vers des fichiers
   3. Tous les data JSON déclarés dans manifest.json sont valides
   4. Tous les modules core JS se chargent sans erreur
   5. Calcs de base sur quelques outils marchent

   Usage : node scripts/smoke_test.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;
let warns = 0;
const ok = (msg) => console.log('  \x1b[32m✓\x1b[0m ' + msg);
const fail = (msg) => { console.log('  \x1b[31m✗\x1b[0m ' + msg); errors++; };
const warn = (msg) => { console.log('  \x1b[33m⚠\x1b[0m ' + msg); warns++; };
const section = (title) => console.log('\n\x1b[1m▶ ' + title + '\x1b[0m');

/* ─── 1. Sitemap → HTML files ─────────────────────────────── */
section('Sitemap → fichiers HTML existants');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>https:\/\/calcinvest\.fr([^<]*)<\/loc>/g)].map(m => m[1]);
urls.forEach(url => {
  const slug = url === '/' ? 'index' : url.replace(/^\//, '');
  const file = path.join(ROOT, slug + '.html');
  if (fs.existsSync(file)) ok(slug + '.html');
  else fail(slug + '.html MANQUANT (URL: ' + url + ')');
});

/* ─── 2. TOOL_CATALOG → HTML files ────────────────────────── */
section('TOOL_CATALOG (common.js) → fichiers HTML');
const common = fs.readFileSync(path.join(ROOT, 'assets/js/common.js'), 'utf8');
const catalogMatch = common.match(/TOOL_CATALOG\s*=\s*\{([\s\S]*?)^\s*\}/m);
if (catalogMatch) {
  const toolUrls = [...catalogMatch[1].matchAll(/['"](\/[a-z0-9-]+)['"]\s*:/g)].map(m => m[1]);
  toolUrls.forEach(url => {
    const slug = url.replace(/^\//, '');
    const file = path.join(ROOT, slug + '.html');
    if (fs.existsSync(file)) ok(slug + '.html');
    else fail(slug + '.html MANQUANT');
  });
} else {
  warn('TOOL_CATALOG non trouvé dans common.js');
}

/* ─── 3. Data JSON valides ────────────────────────────────── */
section('Data assets (JSON parsable + structure)');
const manifestData = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/manifest.json'), 'utf8'));
const assets = manifestData.assets || [];
ok(assets.length + ' actifs déclarés dans manifest.json');
assets.forEach(a => {
  if (a.status !== 'live') return;
  const file = path.join(ROOT, 'assets/data', a.id + '.json');
  if (!fs.existsSync(file)) { fail(a.id + '.json MANQUANT'); return; }
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!d.prices || !Array.isArray(d.prices) || d.prices.length === 0) {
      fail(a.id + '.json : prices vide ou invalide');
    } else if (d.prices.some(p => !Number.isFinite(p))) {
      fail(a.id + '.json : valeurs non-numériques dans prices');
    } else {
      ok(a.id + '.json (' + d.prices.length + ' points, ' + d.start + ' → ' + d.end + ')');
    }
  } catch (e) {
    fail(a.id + '.json : JSON invalide — ' + e.message);
  }
});

/* ─── 4. Modules core JS chargent sans erreur ─────────────── */
section('Modules core JS (chargement Node)');
const coreModules = [
  'finance-utils.js',
  'calc-locatif.js',
  'calc-dca.js',
  'calc-journal.js',
  'calc-fire.js',
  'calc-allocation.js',
  'calc-valuation.js',
  'calc-regime.js',
  'calc-timing.js'
];
global.window = global;  // bootstrap UMD pattern
coreModules.forEach(m => {
  const file = path.join(ROOT, 'assets/js/core', m);
  if (!fs.existsSync(file)) { warn(m + ' inexistant (peut être normal)'); return; }
  try {
    delete require.cache[require.resolve(file)];
    require(file);
    ok(m);
  } catch (e) {
    fail(m + ' — ' + e.message);
  }
});

/* ─── 5. Tests fonctionnels rapides ───────────────────────── */
section('Calculs fonctionnels (smoke checks)');
try {
  const FIN = require(path.join(ROOT, 'assets/js/core/finance-utils.js'));
  const pmt = FIN.pmt(0.04 / 12, 240, 200000);
  if (Math.abs(Math.abs(pmt) - 1211.96) < 1) ok('FIN.pmt(4%, 20a, 200k) = ' + Math.abs(pmt).toFixed(2) + ' €/mois');
  else fail('FIN.pmt incorrect : ' + pmt);

  const real = FIN.realRate(0.07, 0.02);
  if (Math.abs(real - 0.049) < 0.001) ok('FIN.realRate(7%, 2%) = ' + (real*100).toFixed(2) + ' %');
  else fail('FIN.realRate incorrect : ' + real);

  if (FIN.TAX_REGIMES && FIN.TAX_REGIMES.cto && FIN.TAX_REGIMES.cto.gainRate === 0.30) {
    ok('FIN.TAX_REGIMES.cto = 30 % PFU');
  } else fail('FIN.TAX_REGIMES incomplet');

  // Quick test journal
  const JOURNAL = require(path.join(ROOT, 'assets/js/core/calc-journal.js'));
  const stats = JOURNAL.stats([
    { instrument: 'EUR/USD', side: 'long', entry_price: 1.08, exit_price: 1.09, size: 10000, stop_loss: 1.075, pnl: 100, entry_date: '2026-01-15', exit_date: '2026-01-16' }
  ]);
  if (stats.winrate === 100 && stats.totalPnl === 100) ok('JOURNAL.stats() winrate=100%, pnl=100€');
  else fail('JOURNAL.stats incorrect');
} catch (e) {
  fail('Tests fonctionnels : ' + e.message);
}

/* ─── 6. Fichiers critiques présents ──────────────────────── */
section('Fichiers critiques pour la prod');
const critical = [
  'index.html', 'robots.txt', 'sitemap.xml', 'manifest.json', 'sw.js', 'vercel.json',
  'assets/css/style.css', 'assets/js/common.js', 'assets/icons/icon-192.svg', 'assets/icons/icon-512.svg'
];
critical.forEach(f => {
  if (fs.existsSync(path.join(ROOT, f))) ok(f);
  else fail(f + ' MANQUANT');
});

/* ─── 7. Service Worker version ───────────────────────────── */
section('Service Worker');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const versionMatch = sw.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
if (versionMatch) ok('CACHE_VERSION = ' + versionMatch[1]);
else fail('CACHE_VERSION non trouvée dans sw.js');

/* ─── Rapport final ───────────────────────────────────────── */
console.log('\n' + '─'.repeat(60));
if (errors === 0 && warns === 0) {
  console.log('\x1b[32m\x1b[1m✓ All systems go.\x1b[0m');
  process.exit(0);
} else if (errors === 0) {
  console.log('\x1b[33m\x1b[1m⚠ ' + warns + ' warning(s), 0 erreur. Go.\x1b[0m');
  process.exit(0);
} else {
  console.log('\x1b[31m\x1b[1m✗ ' + errors + ' erreur(s), ' + warns + ' warning(s). À corriger avant le go-live.\x1b[0m');
  process.exit(1);
}
