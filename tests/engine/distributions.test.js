const test = require('node:test');
const assert = require('node:assert');
const distributions = require('../../assets/js/core/engine/distributions');
const rng = require('../../assets/js/core/engine/rng');
const stats = require('../../assets/js/core/engine/stats');

test('lognormalMonthly: annualized mean ≈ target', () => {
  const r = rng.mulberry32(1);
  const n = rng.normal(r);
  const sampler = distributions.lognormalMonthly(0.07, 0.16, n);
  // Generate 50 years × 12 months = 600 monthly returns, repeat 1000 times and annualize
  const annualReturns = [];
  for (let trial = 0; trial < 1000; trial++) {
    let product = 1;
    for (let i = 0; i < 12; i++) product *= 1 + sampler();
    annualReturns.push(product - 1);
  }
  const meanAnnual = stats.mean(annualReturns);
  // Expected ≈ 0.07 (within MC noise)
  assert.ok(Math.abs(meanAnnual - 0.07) < 0.03, 'meanAnnual=' + meanAnnual);
});

test('studentMonthly requires df > 2', () => {
  const r = rng.mulberry32(1);
  assert.throws(() => distributions.studentMonthly(0.05, 0.3, 2, r));
  assert.throws(() => distributions.studentMonthly(0.05, 0.3, 1, r));
});

test('studentMonthly clips at -99.9%', () => {
  const r = rng.mulberry32(1);
  const s = distributions.studentMonthly(0.05, 0.80, 4, r);
  for (let i = 0; i < 10000; i++) {
    const v = s();
    assert.ok(v >= -0.999, 'clip failed: ' + v);
  }
});
