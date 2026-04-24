const test = require('node:test');
const assert = require('node:assert');
const ENGINE = require('../../assets/js/core/engine');

test('ENGINE aggregator exposes all modules', () => {
  ['units', 'dates', 'rates', 'stats', 'rng', 'sampling',
    'distributions', 'correlation', 'cashflow', 'amortization'
  ].forEach(k => {
    assert.ok(ENGINE[k], 'missing: ' + k);
  });
});

test('FIN legacy shim preserves signatures', () => {
  const FIN = ENGINE.FIN;
  assert.strictEqual(typeof FIN.pmt, 'function');
  assert.strictEqual(typeof FIN.amortization, 'function');
  assert.strictEqual(typeof FIN.irr, 'function');
  assert.strictEqual(typeof FIN.cagr, 'function');
  assert.strictEqual(typeof FIN.num, 'function');
  // Sanity: FIN.pmt == cashflow.pmt
  assert.strictEqual(FIN.pmt(0.01, 12, 1000), ENGINE.cashflow.pmt(0.01, 12, 1000));
});

test('FIN.amortization wraps new amortization.build', () => {
  const FIN = ENGINE.FIN;
  const s = FIN.amortization(0.03, 20, 200000);
  assert.strictEqual(s.monthly.length, 240);
  assert.ok(s.pmt > 1100 && s.pmt < 1120);
});

test('FIN output matches legacy finance-utils exactly', () => {
  const legacy = require('../../assets/js/core/finance-utils');
  const FIN = ENGINE.FIN;
  assert.strictEqual(FIN.pmt(0.005, 120, 100000), legacy.pmt(0.005, 120, 100000));
  assert.strictEqual(FIN.cagr(100, 200, 10), legacy.cagr(100, 200, 10));
  assert.strictEqual(FIN.realRate(0.07, 0.02), legacy.realRate(0.07, 0.02));
  const l = legacy.amortization(0.03, 20, 200000);
  const n = FIN.amortization(0.03, 20, 200000);
  assert.strictEqual(l.monthly.length, n.monthly.length);
  assert.ok(Math.abs(l.pmt - n.pmt) < 1e-9);
});
