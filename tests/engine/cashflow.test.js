const test = require('node:test');
const assert = require('node:assert');
const cashflow = require('../../assets/js/core/engine/cashflow');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('PMT matches Excel: 200k, 3%/yr, 20yr monthly', () => {
  const monthlyRate = 0.03 / 12;
  const p = cashflow.pmt(monthlyRate, 20 * 12, 200000);
  // Excel PMT(0.03/12, 240, -200000) = 1109.20
  assert.ok(close(p, 1109.20, 1e-1), 'p=' + p);
});

test('PMT zero rate = pv/n', () => {
  assert.strictEqual(cashflow.pmt(0, 12, 1200), 100);
});

test('IPMT + PPMT = PMT', () => {
  const rate = 0.004;
  const pv = 100000;
  const n = 120;
  for (let per = 1; per <= 10; per++) {
    const i = cashflow.ipmt(rate, per, n, pv);
    const p = cashflow.ppmt(rate, per, n, pv);
    const pmt = cashflow.pmt(rate, n, pv);
    assert.ok(close(i + p, pmt, 1e-6));
  }
});

test('NPV: -100 + 110/(1.1) = 0', () => {
  assert.ok(close(cashflow.npv(0.10, [-100, 110]), 0, 1e-10));
});

test('IRR: [-100, 110] = 10%', () => {
  assert.ok(close(cashflow.irr([-100, 110]), 0.10, 1e-6));
});

test('IRR: DCA series over 5 years', () => {
  // 60 monthly investments of -100, terminal +10000
  const cf = new Array(61).fill(-100);
  cf[0] = -100;
  cf[60] = 10000;
  // Adjust: keep first 60 negative, replace index 60 with +10000
  for (let i = 0; i < 60; i++) cf[i] = -100;
  cf[60] = 10000;
  const r = cashflow.irr(cf);
  assert.ok(r !== null);
  assert.ok(r > 0 && r < 0.1, 'irr=' + r);
});

test('IRR returns null on degenerate inputs', () => {
  assert.strictEqual(cashflow.irr([1, 2, 3]), null);
  assert.strictEqual(cashflow.irr([-1]), null);
});

test('FV: 0 pv, 100/mo, 0.5%/mo, 12 months', () => {
  const fv = cashflow.fv(0.005, 12, 100, 0);
  // 100 * ((1.005^12 - 1) / 0.005) = 1233.556
  assert.ok(close(fv, 1233.556, 1e-2));
});

test('FV zero rate = pv + pmt*n', () => {
  assert.strictEqual(cashflow.fv(0, 10, 50, 100), 600);
});

test('yearsToGoal: PV=0, pmt=100/mo at 0 rate, goal 12000 → 120 months', () => {
  assert.strictEqual(cashflow.yearsToGoal(12000, 0, 100, 0), 120);
});
