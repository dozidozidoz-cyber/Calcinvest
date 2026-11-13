const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const assetLoader = require('../../assets/js/core/data/asset-loader');

// La logique de construction des séries (scripts/fetch_daily.py) est testée
// en Python : tests/py/test_fetch_daily.py. Ici on valide les fichiers produits.
const DATA_DIR = path.join(__dirname, '..', '..', 'assets', 'data');
const DAILY_DIR = path.join(DATA_DIR, 'daily');

test('fichiers daily : colonnes cohérentes, dates croissantes, low ≤ open/close ≤ high', () => {
  const index = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, 'series.json'), 'utf8'));
  assert.ok(index.series.length > 0, 'series.json vide');
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
  const cryptoIds = new Set(manifest.assets.filter(a => a.category === 'crypto').map(a => a.id));
  for (const entry of index.series) {
    const j = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, entry.id + '.json'), 'utf8'));
    const n = j.d.length;
    assert.strictEqual(j.points, n, entry.id + ' : points');
    for (const k of ['o', 'h', 'l', 'c']) assert.strictEqual(j[k].length, n, entry.id + ' : longueur ' + k);
    assert.strictEqual(j.start, j.d[0]);
    assert.strictEqual(j.end, j.d[n - 1]);
    assert.strictEqual(entry.points, n, entry.id + ' : index désynchronisé');
    // Hors crypto (cotée 7j/7), aucune séance ne tombe un week-end : une date
    // de week-end trahit un décalage de fuseau horaire dans le fetch.
    const isCrypto = cryptoIds.has(entry.id);
    for (let i = 0; i < n; i++) {
      if (!isCrypto) {
        const dow = new Date(j.d[i] + 'T00:00:00Z').getUTCDay();
        assert.ok(dow !== 0 && dow !== 6, entry.id + ' : séance un week-end le ' + j.d[i]);
      }
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
