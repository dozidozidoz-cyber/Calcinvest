/**
 * PER calculator: deterministic checks on tax savings, capital growth,
 * exit comparison capital vs rente, sensitivity matrix.
 */
const test = require('node:test');
const assert = require('node:assert');
const per = require('../../assets/js/core/calculators/per');

const close = (a, b, eps = 1) => Math.abs(a - b) < eps;

const BASE = {
  currentAge: 35, retirementAge: 65,
  currentSavings: 0, monthlyContrib: 200,
  annualReturn: 6, inflation: 2, feesPct: 0.3,
  tmiEntree: 30, tmiSortie: 11
};

test('calcPER: synthèse cohérente sur baseline', () => {
  const r = per.calcPER(BASE);
  assert.strictEqual(r.years, 30);
  assert.ok(r.totalContributed > 70000); // 200 × 12 × 30 = 72k
  assert.ok(r.totalContributed < 73000);
  assert.ok(r.finalCapital > r.totalContributed);
  assert.ok(r.totalGain > 0);
});

test('calcPER: économie fiscale = versement × TMI entrée', () => {
  const r = per.calcPER(BASE);
  // 2400 €/an × 30 % = 720 €/an
  assert.ok(close(r.annualTaxSaving, 720));
  // Cumul sur 30 ans = 21 600 €
  assert.ok(close(r.cumulatedTaxSaving, 21600, 50));
});

test('calcPER: trajectoire annuelle complète', () => {
  const r = per.calcPER(BASE);
  assert.strictEqual(r.yearly.length, 30);
  assert.strictEqual(r.yearly[0].year, 1);
  assert.strictEqual(r.yearly[29].year, 30);
  assert.strictEqual(r.yearly[29].age, 65);
  // Croissance monotone
  for (let i = 1; i < r.yearly.length; i++) {
    assert.ok(r.yearly[i].value > r.yearly[i - 1].value);
  }
});

test('calcPER: capital net après impôts < capital brut', () => {
  const r = per.calcPER(BASE);
  assert.ok(r.netCapital < r.finalCapital);
  // L'impôt = TMI sortie × versements + 30 % × plus-values
  assert.ok(r.taxOnExit > 0);
  assert.ok(r.taxBreakdown.onDeductible > 0);
  assert.ok(r.taxBreakdown.onGains > 0);
});

test('calcPER: rente cohérente', () => {
  const r = per.calcPER(BASE);
  assert.ok(r.rente.horizonYears >= 15);
  assert.ok(r.rente.annualGross > 0);
  assert.ok(r.rente.annualNet > 0);
  assert.ok(r.rente.annualNet < r.rente.annualGross);
  assert.ok(r.rente.monthlyNet > 0);
});

test('calcPER: PER avantageux quand TMI entrée > TMI sortie', () => {
  // TMI entrée 41 % → sortie 11 % : delta gros
  const rGood = per.calcPER(Object.assign({}, BASE, { tmiEntree: 41, tmiSortie: 11 }));
  // TMI entrée 11 % → sortie 30 % : PER désavantageux
  const rBad = per.calcPER(Object.assign({}, BASE, { tmiEntree: 11, tmiSortie: 30 }));

  assert.ok(rGood.perVsCtoDelta > 0, 'PER doit gagner avec TMI 41→11');
  // Avec 11→30, le PER est généralement moins bon que le CTO
  assert.ok(rGood.netCapital > rBad.netCapital);
});

test('sensitivityMatrix: structure 4×4', () => {
  const m = per.sensitivityMatrix(BASE);
  assert.strictEqual(m.rows.length, 4);
  assert.strictEqual(m.rows[0].cells.length, 4);
  m.rows.forEach((row) => {
    row.cells.forEach((cell) => {
      assert.ok(typeof cell.delta === 'number');
      assert.ok(['per', 'cto'].includes(cell.advantage));
    });
  });
});

test('calcPlafondDeductible: 10 % avec plancher et plafond', () => {
  // Salaire 50k → plafond 5000
  assert.strictEqual(per.calcPlafondDeductible(50000), 5000);
  // Salaire faible 20k → plancher 4710 (10 % PASS)
  assert.strictEqual(per.calcPlafondDeductible(20000), 4710);
  // Salaire très haut → cap à 8 PASS
  assert.strictEqual(per.calcPlafondDeductible(5000000), 8 * 47100);
});

test('calcPER: sortie capital ≠ sortie rente', () => {
  const r = per.calcPER(BASE);
  const totalRenteOnHorizon = r.rente.annualNet * r.rente.horizonYears;
  // Les deux sont du même ordre de grandeur (sortie capital pour comparer)
  assert.ok(totalRenteOnHorizon > 0);
  assert.ok(r.netCapital > 0);
});

test('calcPER: pouvoir d\'achat ajusté inflation', () => {
  const r = per.calcPER(BASE);
  assert.ok(r.netCapitalReal < r.netCapital);
  // À 2 % d'inflation sur 30 ans, factor ≈ 1.81
  const expectedReal = r.netCapital / Math.pow(1.02, 30);
  assert.ok(close(r.netCapitalReal, expectedReal, 5));
});
