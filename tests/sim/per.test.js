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

test('calcPER: rente cohérente (50 % rente)', () => {
  const r = per.calcPER(Object.assign({}, BASE, { exitCapitalPct: 0.5 }));
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

test('calcPER: sortie capital ≠ sortie rente (mix 50/50)', () => {
  const r = per.calcPER(Object.assign({}, BASE, { exitCapitalPct: 0.5 }));
  const totalRenteOnHorizon = r.rente.annualNet * r.rente.horizonYears;
  assert.ok(totalRenteOnHorizon > 0);
  assert.ok(r.netCapital > 0);
  // Les deux parties non nulles
  assert.ok(r.capitalPart > 0);
  assert.ok(r.rentePart > 0);
});

test('calcPER: pouvoir d\'achat ajusté inflation', () => {
  const r = per.calcPER(BASE);
  assert.ok(r.netCapitalReal < r.netCapital);
  // À 2 % d'inflation sur 30 ans, factor ≈ 1.81
  const expectedReal = r.netCapital / Math.pow(1.02, 30);
  assert.ok(close(r.netCapitalReal, expectedReal, 5));
});

// ============================================================
// Session 1 — nouveaux tests : plafond, reportabilité, mix, profils, forfait
// ============================================================

test('calcPlafondDeductible + computeDeductibleSavings: versement dans plafond', () => {
  const plafond = per.calcPlafondDeductible(50000); // 5 000 €
  const ds = per.computeDeductibleSavings(2400, plafond, 0, 0.30);
  // 2 400 < 5 000 → tout déductible
  assert.strictEqual(ds.deductible, 2400);
  assert.strictEqual(ds.excess, 0);
  assert.ok(close(ds.taxSaving, 720)); // 2400 × 30 %
  // Report restant = 5000 - 2400 = 2600 (marge non utilisée)
  assert.ok(close(ds.newReportable, 2600, 1));
});

test('computeDeductibleSavings: versement > plafond avec report', () => {
  const plafond = 3000;
  const reportable = 1500; // reports 3 ans
  const versement = 4000;
  const ds = per.computeDeductibleSavings(versement, plafond, reportable, 0.30);
  // Dispo = 3000 + 1500 = 4500 → versement 4000 entièrement déductible
  assert.strictEqual(ds.deductible, 4000);
  assert.strictEqual(ds.excess, 0);
  assert.ok(close(ds.taxSaving, 1200)); // 4000 × 30 %
});

test('computeDeductibleSavings: versement > plafond + report → excess', () => {
  const plafond = 2000;
  const reportable = 500;
  const versement = 4000;
  const ds = per.computeDeductibleSavings(versement, plafond, reportable, 0.30);
  // Dispo = 2500 → excess = 4000 - 2500 = 1500
  assert.strictEqual(ds.deductible, 2500);
  assert.strictEqual(ds.excess, 1500);
  assert.ok(close(ds.taxSaving, 750)); // 2500 × 30 %
});

test('calcPER: profils — dynamique > équilibré > prudent (capital final)', () => {
  const base = Object.assign({}, BASE, { feesPct: 0 });
  const rPrudent  = per.calcPER(Object.assign({}, base, { annualReturn: 4, feesPct: 1.5, profileId: 'prudent' }));
  const rBalanced = per.calcPER(Object.assign({}, base, { annualReturn: 6, feesPct: 1.0, profileId: 'balanced' }));
  const rDynamic  = per.calcPER(Object.assign({}, base, { annualReturn: 8, feesPct: 0.7, profileId: 'dynamic' }));
  assert.ok(rDynamic.finalCapital > rBalanced.finalCapital, 'dynamique > équilibré');
  assert.ok(rBalanced.finalCapital > rPrudent.finalCapital, 'équilibré > prudent');
  // Vérifier que les profileIds sont bien retournés
  assert.strictEqual(rPrudent.profileId, 'prudent');
  assert.strictEqual(rDynamic.profileId, 'dynamic');
});

test('calcPER: mix sortie 50/50 capital+rente', () => {
  const r = per.calcPER(Object.assign({}, BASE, { exitCapitalPct: 0.5 }));
  // Capital part = 50 % du final
  assert.ok(close(r.capitalPart, r.finalCapital * 0.5, 1));
  assert.ok(close(r.rentePart, r.finalCapital * 0.5, 1));
  assert.ok(r.rente.annualGross > 0, 'rente non nulle avec 50 %');
  assert.ok(r.netCapital > 0, 'capital net > 0');
  assert.ok(r.exitCapitalPct === 0.5);
});

test('calcPER: mix 0 % capital (tout en rente)', () => {
  const r = per.calcPER(Object.assign({}, BASE, { exitCapitalPct: 0 }));
  assert.ok(close(r.capitalPart, 0, 1));
  assert.ok(close(r.rentePart, r.finalCapital, 1));
  // Capital net = 0, impôt sur capital = 0
  assert.ok(close(r.netCapital, 0, 1));
  assert.ok(close(r.taxOnExit, 0, 1));
  assert.ok(r.rente.annualGross > 0);
});

test('calcPER: forfait flat tax vs barème IR — auto choisit le min', () => {
  // Avec TMI sortie élevée (41 %), barème IR > flat tax → auto = flatTax
  const rHigh = per.calcPER(Object.assign({}, BASE, { tmiSortie: 41, exitTaxMethod: 'auto' }));
  assert.strictEqual(rHigh.taxMethod, 'flatTax');
  assert.ok(rHigh.taxBreakdown.baremeIR >= rHigh.taxBreakdown.flatTax);

  // Avec TMI sortie faible (0 %), barème IR < flat tax → auto = baremeIR
  const rLow = per.calcPER(Object.assign({}, BASE, { tmiSortie: 0, exitTaxMethod: 'auto' }));
  assert.strictEqual(rLow.taxMethod, 'baremeIR');
  assert.ok(rLow.taxBreakdown.baremeIR <= rLow.taxBreakdown.flatTax);
});

test('calcPER: forcer flatTax override la sélection auto', () => {
  const rAuto  = per.calcPER(Object.assign({}, BASE, { tmiSortie: 0, exitTaxMethod: 'auto' }));
  const rForce = per.calcPER(Object.assign({}, BASE, { tmiSortie: 0, exitTaxMethod: 'flatTax' }));
  // auto préfère barème à TMI 0 %, mais forced flat tax coûte plus
  assert.strictEqual(rForce.taxMethod, 'flatTax');
  assert.ok(rForce.taxOnExit >= rAuto.taxOnExit);
});

test('calcPER: plafondSummary absent sans revenuPro', () => {
  const r = per.calcPER(BASE); // pas de revenuPro
  assert.strictEqual(r.plafond, null);
  assert.ok(r.cumulatedTaxSaving > 0); // calcul toujours fait, juste pas plafonné
});

test('calcPER: plafondSummary présent avec revenuPro', () => {
  const r = per.calcPER(Object.assign({}, BASE, { revenuPro: 50000 }));
  assert.ok(r.plafond !== null);
  assert.ok(close(r.plafond.annualPlafond, 5000, 1)); // 10 % × 50k
  assert.ok(r.plafond.utilisationRatio > 0);
  assert.ok(r.plafond.utilisationRatio <= 1); // 2400/an < 5000 plafond → ratio < 1
});

test('PROFILES: structure correcte des 3 profils', () => {
  const profiles = per.PROFILES;
  ['prudent', 'balanced', 'dynamic'].forEach((id) => {
    assert.ok(profiles[id], `profil ${id} existe`);
    assert.ok(typeof profiles[id].annualReturn === 'number');
    assert.ok(typeof profiles[id].feesPct === 'number');
    assert.ok(profiles[id].annualReturn > 0);
    assert.ok(profiles[id].feesPct >= 0);
  });
  // Rendement croissant prudent < balanced < dynamic
  assert.ok(profiles.prudent.annualReturn < profiles.balanced.annualReturn);
  assert.ok(profiles.balanced.annualReturn < profiles.dynamic.annualReturn);
  // Frais décroissants (profil actif = frais bas)
  assert.ok(profiles.prudent.feesPct > profiles.balanced.feesPct);
  assert.ok(profiles.balanced.feesPct > profiles.dynamic.feesPct);
});
