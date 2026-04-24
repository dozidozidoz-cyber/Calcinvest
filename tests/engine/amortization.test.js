const test = require('node:test');
const assert = require('node:assert');
const amort = require('../../assets/js/core/engine/amortization');

const close = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('amortization: 200k, 3%, 20yr', () => {
  const s = amort.build(0.03, 20, 200000);
  assert.strictEqual(s.monthly.length, 240);
  assert.strictEqual(s.yearly.length, 20);
  assert.ok(close(s.pmt, 1109.20, 1e-1), 'pmt=' + s.pmt);
  // Final balance ≈ 0
  assert.ok(s.monthly[239].balance < 0.01);
  // Sum of principal ≈ 200k
  const sumP = s.monthly.reduce((a, r) => a + r.principal, 0);
  assert.ok(close(sumP, 200000, 1));
});

test('amortization with insurance', () => {
  const s = amort.build(0.03, 10, 100000, { insuranceRate: 0.004 });
  // Insurance = 100000 * 0.004 / 12 = 33.33/mo
  assert.ok(close(s.insurance, 33.3333, 1e-3));
  assert.strictEqual(s.totalInsurance, s.insurance * 120);
});

test('amortization totalCost = pmt*nper + insurance*nper', () => {
  const s = amort.build(0.025, 15, 150000, { insuranceRate: 0.003 });
  const expected = s.pmt * 180 + s.insurance * 180;
  assert.ok(close(s.totalCost, expected, 1e-6));
});
