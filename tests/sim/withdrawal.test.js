const test = require('node:test');
const assert = require('node:assert');
const withdrawal = require('../../assets/js/core/sim/withdrawal');
const distributions = require('../../assets/js/core/engine/distributions');
const rng = require('../../assets/js/core/engine/rng');

test('4% rule on 7%/16%, 30yr, 2% inflation → high survival', () => {
  const seed = 20260101;
  const r = rng.mulberry32(seed);
  const n = rng.normal(r);
  const sampler = distributions.lognormalMonthly(0.07, 0.16, n);
  const res = withdrawal.run({
    N: 2000,
    years: 30,
    initial: 1_000_000,
    annualWithdrawal: 40000, // 4%
    inflationAnnual: 0.02,
    returnSampler: function () { return sampler(); },
    rand: r
  });
  // Pure-equity (σ=16%) + 4% rule + MC sequence-of-returns risk typically lands 65-85%.
  // (Trinity 95% figure is for 60/40 balanced, not 100% equity.)
  assert.ok(res.survivalRate > 0.60, 'survivalRate=' + res.survivalRate);
});

test('reproducible with same seed', () => {
  function once() {
    const r = rng.mulberry32(7);
    const n = rng.normal(r);
    const s = distributions.lognormalMonthly(0.05, 0.12, n);
    return withdrawal.run({
      N: 300, years: 20, initial: 500_000,
      annualWithdrawal: 25_000, inflationAnnual: 0.02,
      returnSampler: function () { return s(); },
      rand: r
    });
  }
  const a = once();
  const b = once();
  assert.strictEqual(a.survivalRate, b.survivalRate);
});

test('unrealistic withdrawal → total ruin', () => {
  const r = rng.mulberry32(1);
  const res = withdrawal.run({
    N: 200, years: 10, initial: 100_000,
    annualWithdrawal: 50_000, // 50%/yr
    inflationAnnual: 0,
    returnSampler: function () { return 0.002; }, // ~2.4%/yr
    rand: r
  });
  assert.ok(res.survivalRate < 0.1);
});
