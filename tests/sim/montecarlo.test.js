const test = require('node:test');
const assert = require('node:assert');
const montecarlo = require('../../assets/js/core/sim/montecarlo');
const distributions = require('../../assets/js/core/engine/distributions');
const rng = require('../../assets/js/core/engine/rng');

test('montecarlo.run is reproducible for same seed', () => {
  function once(seed) {
    const r1 = rng.mulberry32(seed);
    const n1 = rng.normal(r1);
    const s1 = distributions.lognormalMonthly(0.07, 0.16, n1);
    return montecarlo.run({
      N: 500, T: 120, initial: 10000, seed,
      returnSampler: function () { return s1(); },
      rand: r1,
      method: 'lognormal'
    });
  }
  const a = once(42);
  const b = once(42);
  assert.strictEqual(a.stats.mean, b.stats.mean);
  assert.strictEqual(a.stats.std, b.stats.std);
  assert.deepStrictEqual(Array.from(a.terminal), Array.from(b.terminal));
});

test('montecarlo.run: deterministic 0-vol = (1+r)^T', () => {
  const r = rng.mulberry32(1);
  const res = montecarlo.run({
    N: 10, T: 12, initial: 1000,
    returnSampler: function () { return 0.01; }, // constant 1%/mo
    rand: r, method: 'const'
  });
  const expected = 1000 * Math.pow(1.01, 12);
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(res.terminal[i] - expected) < 1e-6);
  }
});

test('montecarlo.run: success rate computed against goal', () => {
  const r = rng.mulberry32(1);
  const res = montecarlo.run({
    N: 100, T: 12, initial: 1000,
    returnSampler: function () { return 0.01; },
    rand: r, goal: 1100, method: 'const'
  });
  // All paths reach ~1126 > 1100 → 100%
  assert.strictEqual(res.successRate, 1);
  assert.strictEqual(res.shortfallProb, 0);
});

test('montecarlo.run: keepPaths limit respected', () => {
  const r = rng.mulberry32(1);
  const res = montecarlo.run({
    N: 1000, T: 24, initial: 100,
    returnSampler: function () { return 0.005; },
    rand: r, keepPaths: 10, method: 'const'
  });
  assert.ok(res.paths.length <= 10);
  assert.strictEqual(res.paths[0].length, 25); // T+1
});

test('montecarlo.run throws on missing required opts', () => {
  assert.throws(() => montecarlo.run({ N: 10, T: 12, returnSampler: () => 0 }));
  assert.throws(() => montecarlo.run({ N: 10, T: 12, rand: rng.mulberry32(1) }));
});
