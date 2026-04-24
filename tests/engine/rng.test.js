const test = require('node:test');
const assert = require('node:assert');
const rng = require('../../assets/js/core/engine/rng');
const stats = require('../../assets/js/core/engine/stats');

test('mulberry32 is deterministic for same seed', () => {
  const a = rng.mulberry32(42);
  const b = rng.mulberry32(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a(), b());
});

test('mulberry32 output is in [0,1)', () => {
  const r = rng.mulberry32(1);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test('normal sampler: mean ≈ 0, std ≈ 1 over 10k draws', () => {
  const r = rng.mulberry32(123);
  const n = rng.normal(r);
  const xs = [];
  for (let i = 0; i < 10000; i++) xs.push(n());
  const mean = stats.mean(xs);
  const std = stats.std(xs);
  assert.ok(Math.abs(mean) < 0.05, 'mean=' + mean);
  assert.ok(Math.abs(std - 1) < 0.05, 'std=' + std);
});

test('studentT sampler: heavier tails than normal', () => {
  const r = rng.mulberry32(456);
  const t = rng.studentT(r, 5);
  let extreme = 0;
  for (let i = 0; i < 10000; i++) if (Math.abs(t()) > 3) extreme++;
  // Normal gives ~27 per 10k beyond 3σ; Student-t(5) substantially more.
  assert.ok(extreme > 80, 'tails too thin: extreme=' + extreme);
});

test('intBelow is in [0, n)', () => {
  const r = rng.mulberry32(1);
  for (let i = 0; i < 1000; i++) {
    const v = rng.intBelow(r, 10);
    assert.ok(v >= 0 && v < 10);
    assert.strictEqual(Math.floor(v), v);
  }
});
