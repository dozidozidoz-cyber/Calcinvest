const test = require('node:test');
const assert = require('node:assert');
const sampling = require('../../assets/js/core/engine/sampling');
const rng = require('../../assets/js/core/engine/rng');
const stats = require('../../assets/js/core/engine/stats');

test('iidBootstrap returns values from the series', () => {
  const src = [1, 2, 3, 4, 5];
  const r = rng.mulberry32(1);
  const s = sampling.iidBootstrap(src, 1000, r);
  s.forEach(v => assert.ok(src.indexOf(v) >= 0));
  // Mean should ≈ mean of source
  assert.ok(Math.abs(stats.mean(s) - 3) < 0.15);
});

test('blockBootstrap preserves length', () => {
  const src = [];
  for (let i = 0; i < 100; i++) src.push(i);
  const r = rng.mulberry32(1);
  const s = sampling.blockBootstrap(src, 50, 12, r);
  assert.strictEqual(s.length, 50);
  s.forEach(v => assert.ok(v >= 0 && v < 100));
});

test('blockBootstrap rejects invalid block length', () => {
  const r = rng.mulberry32(1);
  assert.throws(() => sampling.blockBootstrap([1, 2, 3], 10, 0, r));
  assert.throws(() => sampling.blockBootstrap([1, 2, 3], 10, 99, r));
});

test('stationaryBootstrap returns expected length + preserves mean', () => {
  const src = [];
  for (let i = 0; i < 120; i++) src.push(Math.sin(i / 10));
  const r = rng.mulberry32(7);
  const s = sampling.stationaryBootstrap(src, 10000, 12, r);
  assert.strictEqual(s.length, 10000);
  // Mean of source is ~0; stationary bootstrap should preserve it.
  assert.ok(Math.abs(stats.mean(s) - stats.mean(src)) < 0.05);
});

test('antitheticNormal yields paired opposites', () => {
  const r = rng.mulberry32(1);
  const n = rng.normal(r);
  const anti = sampling.antitheticNormal(n);
  for (let i = 0; i < 100; i++) {
    const a = anti();
    const b = anti();
    assert.ok(Math.abs(a + b) < 1e-12);
  }
});
