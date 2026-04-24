const test = require('node:test');
const assert = require('node:assert');
const portfolio = require('../../assets/js/core/sim/portfolio');
const rng = require('../../assets/js/core/engine/rng');
const stats = require('../../assets/js/core/engine/stats');

test('fit returns mu/sigma per asset', () => {
  const s1 = [0.01, 0.02, -0.01, 0.005, 0.015];
  const s2 = [0.005, 0.01, 0.0, 0.002, 0.008];
  const f = portfolio.fit([s1, s2]);
  assert.strictEqual(f.length, 2);
  assert.ok(Math.abs(f[0].muMonthly - stats.mean(s1)) < 1e-12);
  assert.ok(Math.abs(f[1].sigmaMonthly - stats.std(s2)) < 1e-12);
});

test('corrMatrix of 2 assets is 2×2 symmetric', () => {
  const s1 = [0.01, 0.02, -0.01, 0.005, 0.015, 0.008, -0.003, 0.012];
  const s2 = [0.005, 0.015, -0.008, 0.003, 0.011, 0.006, -0.002, 0.010];
  const m = portfolio.corrMatrix([s1, s2]);
  assert.strictEqual(m.length, 2);
  assert.strictEqual(m[0][0], 1);
  assert.strictEqual(m[1][1], 1);
  assert.ok(Math.abs(m[0][1] - m[1][0]) < 1e-12);
});

test('makeSampler generates returns with correct weight blend', () => {
  // Two independent-ish synthetic series (need non-degenerate corr matrix)
  const seed = rng.mulberry32(99);
  const n = rng.normal(seed);
  const s1 = [], s2 = [];
  for (let i = 0; i < 120; i++) {
    s1.push(0.01 + 0.03 * n());
    s2.push(0.005 + 0.02 * n());
  }
  const r = rng.mulberry32(1);
  const sampler = portfolio.makeSampler({
    returnsSeries: [s1, s2], weights: [0.5, 0.5], rand: r
  });
  const draws = [];
  for (let i = 0; i < 5000; i++) draws.push(sampler());
  const mean = stats.mean(draws);
  // Expected portfolio mean ≈ 0.5 * 0.01 + 0.5 * 0.005 = 0.0075
  assert.ok(Math.abs(mean - 0.0075) < 0.003, 'mean=' + mean);
});

test('makeSampler rejects mismatched weights', () => {
  const s1 = [0.01, 0.02, 0.015];
  const s2 = [0.005, 0.01, 0.008];
  const r = rng.mulberry32(1);
  assert.throws(() => portfolio.makeSampler({
    returnsSeries: [s1, s2], weights: [1], rand: r
  }));
});
