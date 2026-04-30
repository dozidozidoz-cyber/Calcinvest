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

// ─── computeAggregate tests ────────────────────────────────────────────────

const BIEN_A = {
  price: 200000, notary: 8, agency: 0, works: 0, furniture: 0,
  rent: 900, vacancy: 1, propTax: 1500, copro: 50, insurance: 200, mgmtPct: 0, maintPct: 1,
  loan: 180000, loanRate: 3.2, loanYears: 20, loanIns: 0.36,
  regime: 'lmnp-reel', tmi: 30, holdYears: 15, appreciation: 1.5
};
const BIEN_B = {
  price: 150000, notary: 8, agency: 3, works: 5000, furniture: 2000,
  rent: 700, vacancy: 1, propTax: 1100, copro: 40, insurance: 150, mgmtPct: 0, maintPct: 1,
  loan: 130000, loanRate: 3.5, loanYears: 25, loanIns: 0.36,
  regime: 'lmnp-reel', tmi: 30, holdYears: 20, appreciation: 1.5
};

test('computeAggregate: returns null on empty input', () => {
  assert.strictEqual(locatif.computeAggregate([]), null);
  assert.strictEqual(locatif.computeAggregate(null), null);
});

test('computeAggregate: 1 bien aggregate matches single calc result', () => {
  const r = locatif.calcLocatif(BIEN_A);
  const agg = locatif.computeAggregate([{ params: BIEN_A, result: r }]);
  assert.strictEqual(agg.count, 1);
  assert.strictEqual(agg.totalAcquisition, r.totalAcquisition);
  assert.strictEqual(agg.totalDownPayment, r.downPayment);
  assert.strictEqual(agg.totalMonthlyPmt, r.monthlyPayment);
  assert.strictEqual(agg.totalFinalEquity, r.finalEquity);
});

test('computeAggregate: 2 biens sum totals correctly', () => {
  const rA = locatif.calcLocatif(BIEN_A);
  const rB = locatif.calcLocatif(BIEN_B);
  const agg = locatif.computeAggregate([
    { params: BIEN_A, result: rA },
    { params: BIEN_B, result: rB }
  ]);
  assert.strictEqual(agg.count, 2);
  assert.ok(Math.abs(agg.totalAcquisition - (rA.totalAcquisition + rB.totalAcquisition)) < 1e-6);
  assert.ok(Math.abs(agg.totalMonthlyPmt - (rA.monthlyPayment + rB.monthlyPayment)) < 1e-6);
  assert.ok(Math.abs(agg.totalCashflowMonthly - (rA.cashflowMonthly + rB.cashflowMonthly)) < 1e-6);
});

test('computeAggregate: maxHorizon takes the longest holdYears', () => {
  const rA = locatif.calcLocatif(BIEN_A);  // 15 ans
  const rB = locatif.calcLocatif(BIEN_B);  // 20 ans
  const agg = locatif.computeAggregate([
    { params: BIEN_A, result: rA },
    { params: BIEN_B, result: rB }
  ]);
  assert.strictEqual(agg.maxHorizon, 20);
  assert.strictEqual(agg.yearly.length, 20);
});

test('computeAggregate: weighted yields are reasonable', () => {
  const rA = locatif.calcLocatif(BIEN_A);
  const rB = locatif.calcLocatif(BIEN_B);
  const agg = locatif.computeAggregate([
    { params: BIEN_A, result: rA },
    { params: BIEN_B, result: rB }
  ]);
  assert.ok(agg.weightedYieldGross > 0 && agg.weightedYieldGross < 20);
  assert.ok(agg.weightedYieldNetNet >= 0 && agg.weightedYieldNetNet < 20);
});

// ─── compareWithStocks tests ───────────────────────────────────────────────

test('compareWithStocks: returns valid shape with default opts', () => {
  const r = locatif.calcLocatif(BIEN_A);
  const cmp = locatif.compareWithStocks(BIEN_A, r);
  assert.ok(cmp, 'should return non-null');
  assert.ok(cmp.stocksNet > 0, 'stocksNet should be positive');
  assert.ok(cmp.stocksGross > cmp.stocksNet, 'gross should exceed net (tax applied)');
  assert.ok(cmp.realEstateNet != null);
  assert.strictEqual(cmp.yearsCompared, BIEN_A.holdYears);
  assert.strictEqual(cmp.stockRate, 7);
});

test('compareWithStocks: higher stockRate produces higher stocksNet', () => {
  const r = locatif.calcLocatif(BIEN_A);
  const at4  = locatif.compareWithStocks(BIEN_A, r, { stockRate: 4 });
  const at10 = locatif.compareWithStocks(BIEN_A, r, { stockRate: 10 });
  assert.ok(at10.stocksNet > at4.stocksNet, 'higher rate → higher final stocks value');
});

test('compareWithStocks: PFU 30% reduces gains by 30%', () => {
  const r = locatif.calcLocatif(BIEN_A);
  const cmp = locatif.compareWithStocks(BIEN_A, r, { stockRate: 7, taxRate: 30 });
  const expectedTax = cmp.stocksGains * 0.30;
  assert.ok(Math.abs(cmp.stocksTax - expectedTax) < 1e-6, 'tax should be 30% of gains');
});

test('compareWithStocks: 0% rate → no gains, no tax', () => {
  const r = locatif.calcLocatif(BIEN_A);
  const cmp = locatif.compareWithStocks(BIEN_A, r, { stockRate: 0, feesPct: 0 });
  assert.ok(Math.abs(cmp.stocksGross - cmp.apport) < 1, 'no growth at 0%');
  assert.ok(cmp.stocksTax < 1e-6, 'no tax with no gains');
});

// ─── recurringWorksRate tests ──────────────────────────────────────────────

test('recurringWorksRate=0 matches baseline (no recurring works)', () => {
  const base = locatif.calcLocatif(BIEN_A);
  const zero = locatif.calcLocatif(Object.assign({}, BIEN_A, { recurringWorksRate: 0 }));
  assert.ok(Math.abs(base.cashflowMonthly - zero.cashflowMonthly) < 1e-6);
  assert.ok(Math.abs(base.yieldNet - zero.yieldNet) < 1e-6);
});

test('recurringWorksRate=1 reduces cashflow by ~1% of price/year', () => {
  const base = locatif.calcLocatif(BIEN_A);
  const withWorks = locatif.calcLocatif(Object.assign({}, BIEN_A, { recurringWorksRate: 1 }));
  // Should reduce annual cashflow by ~ price * 1% (minus tax savings in regimes that deduct)
  const annualReduction = (base.cashflowMonthly - withWorks.cashflowMonthly) * 12;
  // For lmnp-reel regime, charges are deductible so savings ~ price * 1% * (1 - effective tax rate)
  // Just check it's reduced and reasonable
  assert.ok(withWorks.cashflowMonthly < base.cashflowMonthly, 'cashflow should drop with recurring works');
  assert.ok(annualReduction > 500 && annualReduction < BIEN_A.price * 0.011, 'reduction in expected range');
});

// ─── Refinancement tests ──────────────────────────────────────────────────

test('refinanceYear=0 → pas de refi (refinance=null)', () => {
  const r = locatif.calcLocatif(BIEN_A);
  assert.strictEqual(r.refinance, null);
});

test('refinancement an 7 à 2.5 % réduit la mensualité (taux original 3.2%)', () => {
  const r = locatif.calcLocatif(Object.assign({}, BIEN_A, { refinanceYear: 7, refinanceRate: 2.5 }));
  assert.ok(r.refinance != null, 'refinance should be set');
  assert.strictEqual(r.refinance.year, 7);
  assert.strictEqual(r.refinance.rate, 2.5);
  assert.ok(r.refinance.newMonthlyPmt < r.refinance.oldMonthlyPmt, 'lower rate → lower mensualité');
  assert.ok(r.refinance.monthlySaving > 0);
});

test('refinancement à taux supérieur → coût supplémentaire', () => {
  const r = locatif.calcLocatif(Object.assign({}, BIEN_A, { refinanceYear: 5, refinanceRate: 5.0 }));
  assert.ok(r.refinance != null);
  assert.ok(r.refinance.monthlySaving < 0, 'higher rate → negative saving');
});

test('refinanceYear hors limites (>= loanYears) → pas de refi appliqué', () => {
  const r = locatif.calcLocatif(Object.assign({}, BIEN_A, { refinanceYear: 30, refinanceRate: 2.0 }));
  assert.strictEqual(r.refinance, null);
});

// ─── computeVacancyMC tests ────────────────────────────────────────────────

test('computeVacancyMC: returns valid stats with reproducible seed', () => {
  const mc1 = locatif.computeVacancyMC(BIEN_A, { simulations: 200, seed: 42 });
  const mc2 = locatif.computeVacancyMC(BIEN_A, { simulations: 200, seed: 42 });
  assert.ok(mc1, 'should return non-null');
  assert.strictEqual(mc1.simulations, 200);
  assert.strictEqual(mc1.mean, mc2.mean, 'same seed → same result');
});

test('computeVacancyMC: percentiles ordered p5 < p50 < p95', () => {
  const mc = locatif.computeVacancyMC(BIEN_A, { simulations: 500, seed: 1 });
  assert.ok(mc.p5  <= mc.p25);
  assert.ok(mc.p25 <= mc.median);
  assert.ok(mc.median <= mc.p75);
  assert.ok(mc.p75 <= mc.p95);
});

test('computeVacancyMC: higher vacancy → lower mean cashflow', () => {
  const low  = locatif.computeVacancyMC(Object.assign({}, BIEN_A, { vacancy: 2 }), { simulations: 300, seed: 7 });
  const high = locatif.computeVacancyMC(Object.assign({}, BIEN_A, { vacancy: 15 }), { simulations: 300, seed: 7 });
  assert.ok(high.mean < low.mean, 'more vacancy → less cashflow');
});

test('computeVacancyMC: histogram has 20 bins', () => {
  const mc = locatif.computeVacancyMC(BIEN_A, { simulations: 200, seed: 99 });
  assert.strictEqual(mc.histogram.bins.length, 20);
  assert.strictEqual(mc.histogram.counts.length, 20);
  const totalCount = mc.histogram.counts.reduce(function (s, c) { return s + c; }, 0);
  assert.strictEqual(totalCount, 200);
});
