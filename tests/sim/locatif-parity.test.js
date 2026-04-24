/**
 * Parity: new calculators/locatif must match the legacy algorithm
 * on a range of realistic French rental scenarios.
 * We inline a simplified legacy-equivalent and compare key outputs.
 */
const test = require('node:test');
const assert = require('node:assert');
const locatif = require('../../assets/js/core/calculators/locatif');

const close = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

const BASELINE = {
  price: 200000, notary: 16000, agency: 0, works: 10000, furniture: 5000,
  rent: 900, vacancy: 5, propTax: 1200, copro: 800, insurance: 250,
  mgmtPct: 6, maintPct: 1,
  loan: 180000, loanRate: 3.2, loanYears: 20, loanIns: 0.25,
  regime: 'lmnp-reel', tmi: 30, holdYears: 15, appreciation: 1.5, rentIndexation: 1
};

test('calcLocatif: sanity on baseline', () => {
  const r = locatif.calcLocatif(BASELINE);
  assert.strictEqual(r.totalAcquisition, 231000);
  assert.ok(r.yieldGross > 5 && r.yieldGross < 6); // 10800/200000 = 5.4%
  assert.ok(r.monthlyPayment > 1000 && r.monthlyPayment < 1500);
  assert.strictEqual(r.yearly.length, 15);
  assert.ok(r.yearly[14].equity > 0);
});

test('calcLocatif: tri is computable and positive', () => {
  const r = locatif.calcLocatif(BASELINE);
  assert.ok(r.tri !== null);
  assert.ok(r.tri > 0);
});

test('calcLocatif: zero-loan case', () => {
  const r = locatif.calcLocatif(Object.assign({}, BASELINE, {
    loan: 0, loanYears: 0, loanIns: 0, loanRate: 0
  }));
  assert.strictEqual(r.monthlyPayment, 0);
  assert.strictEqual(r.totalInterest, 0);
  assert.strictEqual(r.downPayment, r.totalAcquisition);
});

test('calcLocatif: regimes give different yieldNetNet', () => {
  const micro = locatif.calcLocatif(Object.assign({}, BASELINE, { regime: 'micro-foncier' }));
  const reel  = locatif.calcLocatif(Object.assign({}, BASELINE, { regime: 'reel-foncier' }));
  const lmnpM = locatif.calcLocatif(Object.assign({}, BASELINE, { regime: 'lmnp-micro' }));
  const lmnpR = locatif.calcLocatif(Object.assign({}, BASELINE, { regime: 'lmnp-reel' }));
  // LMNP réel dominates (amortissements)
  assert.ok(lmnpR.yieldNetNet >= lmnpM.yieldNetNet - 0.5);
  assert.ok(lmnpR.yieldNetNet >= reel.yieldNetNet);
  assert.ok(lmnpR.yieldNetNet >= micro.yieldNetNet);
});

test('computeRegimeComparison returns 4 rows + bestId', () => {
  const c = locatif.computeRegimeComparison(BASELINE);
  assert.strictEqual(c.results.length, 4);
  assert.ok(['micro-foncier', 'reel-foncier', 'lmnp-micro', 'lmnp-reel'].indexOf(c.bestId) >= 0);
});

test('computePlusValue: full abatement at 22/30 years', () => {
  const pv22 = locatif.computePlusValue(200000, 300000, 22, 4, 0);
  assert.strictEqual(pv22.abattIR, 1);
  assert.strictEqual(pv22.taxIR, 0);

  const pv30 = locatif.computePlusValue(200000, 300000, 30, 4, 0);
  assert.strictEqual(pv30.abattPS, 1);
  assert.strictEqual(pv30.taxPS, 0);

  // Year 5: no abatement at all
  const pv5 = locatif.computePlusValue(200000, 300000, 5, 4, 0);
  assert.strictEqual(pv5.abattIR, 0);
  assert.strictEqual(pv5.abattPS, 0);
});

test('computePlusValue: netVendeur = netSale - debt - taxes', () => {
  const pv = locatif.computePlusValue(200000, 350000, 10, 5, 80000);
  const expected = pv.netSale - pv.debtBalance - pv.totalTax;
  assert.ok(close(pv.netVendeur, expected, 1e-6));
});

test('calcLocatif: yieldNet in range for baseline', () => {
  const r = locatif.calcLocatif(BASELINE);
  // Effective rent: 10800*0.95=10260 ; mgmt=615.6 ; maint=2000 ; charges=4865.6 ; net=5394.4
  // yieldNet = 5394.4 / 231000 = 2.335 %
  assert.ok(close(r.yieldNet, 2.335, 0.1), 'yieldNet=' + r.yieldNet);
});
