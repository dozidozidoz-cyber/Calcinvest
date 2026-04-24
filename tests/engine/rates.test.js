const test = require('node:test');
const assert = require('node:assert');
const rates = require('../../assets/js/core/engine/rates');

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('monthly → annualize roundtrip', () => {
  const m = rates.monthly(0.07);
  const a = rates.annualize(m);
  assert.ok(close(a, 0.07, 1e-12));
});

test('monthly: 7% annual ≈ 0.5654% monthly', () => {
  assert.ok(close(rates.monthly(0.07), 0.005654145387405, 1e-12));
});

test('monthlySigma / annualSigma roundtrip', () => {
  const ms = rates.monthlySigma(0.16);
  assert.ok(close(rates.annualSigma(ms), 0.16, 1e-12));
});

test('real rate (Fisher)', () => {
  // 7% nominal, 2% inflation → 4.9019% real
  assert.ok(close(rates.real(0.07, 0.02), 0.04901960784313726, 1e-12));
});

test('cagr basic', () => {
  // 100 → 200 over 10 years → 7.1773%
  assert.ok(close(rates.cagr(100, 200, 10), Math.pow(2, 0.1) - 1, 1e-12));
  assert.strictEqual(rates.cagr(0, 200, 10), null);
  assert.strictEqual(rates.cagr(100, 200, 0), null);
});

test('perPeriod: weekly from 10% annual', () => {
  const w = rates.perPeriod(0.10, 52);
  // (1.10)^(1/52) - 1
  assert.ok(close(w, Math.pow(1.10, 1 / 52) - 1, 1e-12));
});
