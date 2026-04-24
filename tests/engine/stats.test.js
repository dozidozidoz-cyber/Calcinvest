const test = require('node:test');
const assert = require('node:assert');
const stats = require('../../assets/js/core/engine/stats');

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('mean / std', () => {
  assert.strictEqual(stats.mean([1, 2, 3, 4, 5]), 3);
  // sample std of [1..5] = sqrt(2.5)
  assert.ok(close(stats.std([1, 2, 3, 4, 5]), Math.sqrt(2.5), 1e-12));
  // population std
  assert.ok(close(stats.std([1, 2, 3, 4, 5], true), Math.sqrt(2), 1e-12));
});

test('min / max', () => {
  assert.strictEqual(stats.min([3, 1, 2]), 1);
  assert.strictEqual(stats.max([3, 1, 2]), 3);
});

test('quantile (type-7 linear)', () => {
  const xs = [1, 2, 3, 4, 5];
  assert.strictEqual(stats.quantile(xs, 0), 1);
  assert.strictEqual(stats.quantile(xs, 1), 5);
  assert.strictEqual(stats.quantile(xs, 0.5), 3);
  assert.ok(close(stats.quantile(xs, 0.25), 2, 1e-12));
});

test('quantile does not mutate input', () => {
  const xs = [5, 3, 1, 4, 2];
  const copy = xs.slice();
  stats.quantile(xs, 0.5);
  assert.deepStrictEqual(xs, copy);
});

test('percentiles bundle', () => {
  const xs = [];
  for (let i = 1; i <= 100; i++) xs.push(i);
  const p = stats.percentiles(xs);
  assert.ok(close(p.p5, 5.95, 1e-9));
  assert.ok(close(p.p50, 50.5, 1e-9));
  assert.ok(close(p.p95, 95.05, 1e-9));
});

test('cvar: worst 5% of 1..100 = mean of [1..5] = 3', () => {
  const xs = [];
  for (let i = 1; i <= 100; i++) xs.push(i);
  assert.strictEqual(stats.cvar(xs, 0.05), 3);
});

test('summary empty-safe', () => {
  const s = stats.summary([]);
  assert.strictEqual(s.n, 0);
  assert.ok(Number.isNaN(s.mean));
});
