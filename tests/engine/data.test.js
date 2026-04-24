const test = require('node:test');
const assert = require('node:assert');
const returns = require('../../assets/js/core/data/returns');
const manifest = require('../../assets/js/core/data/manifest');
const assetLoader = require('../../assets/js/core/data/asset-loader');

test('returns.fromPrices: 100 → 110 → 121 ≈ [0.10, 0.10]', () => {
  const r = returns.fromPrices([100, 110, 121]);
  assert.ok(Math.abs(r[0] - 0.10) < 1e-12);
  assert.ok(Math.abs(r[1] - 0.10) < 1e-12);
});

test('returns.fromPrices empty/single input', () => {
  assert.deepStrictEqual(returns.fromPrices([]), []);
  assert.deepStrictEqual(returns.fromPrices([100]), []);
});

test('returns.totalReturn includes dividends', () => {
  // Index starts at 1 for dividends (aligned with prices), so divs[1]=2 → r = (110+2)/100 - 1 = 0.12
  const r = returns.totalReturn([100, 110, 120], [0, 2, 3]);
  assert.ok(Math.abs(r[0] - 0.12) < 1e-12);
  assert.ok(Math.abs(r[1] - (120 + 3) / 110 + 1) < 1e-12);
});

test('returns.deflate: divide nominal by CPI', () => {
  const prices = [100, 105, 110];
  const cpi = [100, 102, 104];
  const real = returns.deflate(prices, cpi);
  // base = last cpi = 104
  assert.ok(Math.abs(real[0] - 100 * 104 / 100) < 1e-9);
  assert.ok(Math.abs(real[2] - 110) < 1e-9);
});

test('manifest.parse groups by category and status', () => {
  const raw = {
    assets: [
      { id: 'sp500', category: 'equity', features: ['dividends'], status: 'live' },
      { id: 'gold', category: 'commodity', status: 'live' },
      { id: 'cw8', category: 'equity', status: 'soon' }
    ]
  };
  const m = manifest.parse(raw);
  assert.strictEqual(m.all.length, 3);
  assert.strictEqual(m.live.length, 2);
  assert.strictEqual(m.soon.length, 1);
  assert.strictEqual(m.byCategory.equity.length, 2);
  assert.strictEqual(m.hasFeature('sp500', 'dividends'), true);
  assert.strictEqual(m.hasFeature('sp500', 'cpi'), false);
  assert.strictEqual(m.hasFeature('gold', 'dividends'), false);
  assert.strictEqual(m.get('sp500').id, 'sp500');
  assert.strictEqual(m.get('unknown'), null);
});

test('asset-loader: injected fetcher works', async () => {
  assetLoader.configure({
    clearCache: true,
    fetcher: function (url) {
      return Promise.resolve({ url: url, ok: true });
    }
  });
  const data = await assetLoader.loadAsset('sp500');
  assert.ok(data.url.endsWith('sp500.json'));
});

test('asset-loader: caches results', async () => {
  let calls = 0;
  assetLoader.configure({
    clearCache: true,
    fetcher: function () { calls++; return Promise.resolve({ v: calls }); }
  });
  await assetLoader.loadAsset('x');
  await assetLoader.loadAsset('x');
  await assetLoader.loadAsset('x');
  assert.strictEqual(calls, 1);
});
