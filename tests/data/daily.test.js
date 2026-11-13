const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildSeries, slug } = require('../../scripts/fetch_daily');
const assetLoader = require('../../assets/js/core/data/asset-loader');

const DAILY_DIR = path.join(__dirname, '..', '..', 'assets', 'data', 'daily');
const DAY = 86400;
const T0 = Date.UTC(2026, 0, 5) / 1000; // lundi 5 janvier 2026, 00:00 UTC

function yahoo(rows, adj) {
  return {
    meta: { gmtoffset: 0, currency: 'USD' },
    timestamp: rows.map((_, i) => T0 + i * DAY),
    indicators: {
      quote: [{
        open: rows.map(r => r[0]), high: rows.map(r => r[1]),
        low: rows.map(r => r[2]), close: rows.map(r => r[3])
      }],
      adjclose: adj ? [{ adjclose: adj }] : undefined
    }
  };
}

test('buildSeries : OHLC brut quand pas d\'ajustement', () => {
  const s = buildSeries(yahoo([[10, 12, 9, 11], [11, 13, 10, 12]]), '2030-01-01');
  assert.deepStrictEqual(s.d, ['2026-01-05', '2026-01-06']);
  assert.deepStrictEqual(s.o, [10, 11]);
  assert.deepStrictEqual(s.h, [12, 13]);
  assert.deepStrictEqual(s.l, [9, 10]);
  assert.deepStrictEqual(s.c, [11, 12]);
});

test('buildSeries : applique le facteur adjclose/close à O, H, L, C', () => {
  // Séance 1 : adjclose = close / 2 (split 2:1 ultérieur) → tout est divisé par 2
  const s = buildSeries(yahoo([[100, 120, 90, 110], [55, 60, 50, 58]], [55, 58]), '2030-01-01');
  assert.deepStrictEqual([s.o[0], s.h[0], s.l[0], s.c[0]], [50, 60, 45, 55]);
  assert.deepStrictEqual([s.o[1], s.h[1], s.l[1], s.c[1]], [55, 60, 50, 58]);
});

test('buildSeries : écarte les séances nulles et la séance du jour', () => {
  const s = buildSeries(yahoo([[10, 12, 9, 11], [null, null, null, null], [11, 13, 10, 12]]), '2026-01-07');
  assert.deepStrictEqual(s.d, ['2026-01-05']); // le 06 est nul, le 07 est "aujourd'hui"
});

test('buildSeries : le plus haut / plus bas encadre toujours open et close', () => {
  const s = buildSeries(yahoo([[10, 9.5, 10.2, 11]]), '2030-01-01'); // high < open, low > open : données incohérentes
  assert.strictEqual(s.h[0], 11);
  assert.strictEqual(s.l[0], 9.5);
});

test('slug : ticker Yahoo → nom de fichier', () => {
  assert.strictEqual(slug('0388.HK'), '0388_hk');
  assert.strictEqual(slug('^GSPC'), 'gspc');
  assert.strictEqual(slug('BTC-USD'), 'btc_usd');
});

test('fichiers daily : colonnes cohérentes, dates croissantes, low ≤ open/close ≤ high', () => {
  const index = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, 'index.json'), 'utf8'));
  assert.ok(index.series.length > 0, 'index.json vide');
  for (const entry of index.series) {
    const j = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, entry.id + '.json'), 'utf8'));
    const n = j.d.length;
    assert.strictEqual(j.points, n, entry.id + ' : points');
    for (const k of ['o', 'h', 'l', 'c']) assert.strictEqual(j[k].length, n, entry.id + ' : longueur ' + k);
    assert.strictEqual(j.start, j.d[0]);
    assert.strictEqual(j.end, j.d[n - 1]);
    assert.strictEqual(entry.points, n, entry.id + ' : index désynchronisé');
    for (let i = 0; i < n; i++) {
      if (i > 0) assert.ok(j.d[i] > j.d[i - 1], entry.id + ' : dates non croissantes à ' + j.d[i]);
      assert.ok(j.l[i] > 0 && j.l[i] <= j.o[i] && j.l[i] <= j.c[i] && j.h[i] >= j.o[i] && j.h[i] >= j.c[i],
        entry.id + ' : OHLC incohérent le ' + j.d[i]);
    }
  }
});

test('assetLoader.loadDaily : lit daily/{id}.json et met en cache', async () => {
  let calls = 0;
  assetLoader.configure({
    clearCache: true,
    basePath: '/assets/data/',
    fetcher: url => {
      calls++;
      const file = path.join(__dirname, '..', '..', url);
      return Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  });
  const a = await assetLoader.loadDaily('sp500');
  const b = await assetLoader.loadDaily('sp500');
  assert.strictEqual(a, b);
  assert.strictEqual(calls, 1);
  assert.strictEqual(a.meta.id, 'sp500');
  const idx = await assetLoader.loadDailyIndex();
  assert.ok(idx.series.some(s => s.id === 'sp500'));
  assetLoader.configure({ clearCache: true });
});
