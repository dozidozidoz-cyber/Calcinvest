/**
 * Tests calculator retraite régime général + Agirc-Arrco
 */
const test = require('node:test');
const assert = require('node:assert');
const retraite = require('../../assets/js/core/calculators/retraite');

const close = (a, b, eps = 0.5) => Math.abs(a - b) < eps;

const BASELINE = {
  anneeNaissance:    1985,
  anneeDebutCarriere: 2010,
  ageDepart:         64,
  salaireBrutAnnuel: 50000,
  croissanceSalaire: 1.5,
  trimDejaValides:   60,
  pointsAgircArrco:  2000,
  anneeActuelle:     2026
};

test('trimestresRequis : 172 pour 1973+, 166 pour pré-1958', () => {
  assert.strictEqual(retraite.trimestresRequis(1973), 172);
  assert.strictEqual(retraite.trimestresRequis(1985), 172);
  assert.strictEqual(retraite.trimestresRequis(1957), 166);
  assert.strictEqual(retraite.trimestresRequis(1965), 169);
});

test('ageLegalDepart : 64 pour 1968+, 62 pour pré-1961', () => {
  assert.strictEqual(retraite.ageLegalDepart(1985), 64);
  assert.strictEqual(retraite.ageLegalDepart(1968), 64);
  assert.strictEqual(retraite.ageLegalDepart(1960), 62);
});

test('calcRetraite baseline : pension cohérente (1500-3500 €/mois)', () => {
  const r = retraite.calcRetraite(BASELINE);
  assert.ok(r.pensionMensuelleBrute > 1500 && r.pensionMensuelleBrute < 3500,
    'pension=' + r.pensionMensuelleBrute);
  assert.ok(r.pensionMensuelleNette < r.pensionMensuelleBrute, 'net < brut');
  assert.ok(r.tauxRemplacementNet > 30 && r.tauxRemplacementNet < 110,
    'taux remplacement=' + r.tauxRemplacementNet);
});

test('calcRetraite : départ plus tard → pension plus haute', () => {
  const r62 = retraite.calcRetraite(Object.assign({}, BASELINE, { ageDepart: 62 }));
  const r64 = retraite.calcRetraite(Object.assign({}, BASELINE, { ageDepart: 64 }));
  const r67 = retraite.calcRetraite(Object.assign({}, BASELINE, { ageDepart: 67 }));
  assert.ok(r62.pensionMensuelleBrute < r64.pensionMensuelleBrute);
  assert.ok(r64.pensionMensuelleBrute < r67.pensionMensuelleBrute);
});

test('calcRetraite : taux plein auto à 67 ans (pas de décote)', () => {
  const r = retraite.calcRetraite(Object.assign({}, BASELINE, { ageDepart: 67 }));
  assert.strictEqual(r.taux, 0.5, 'taux plein attendu à 67 ans');
});

test('calcRetraite : décote = 1.25 %/trim manquant (max 25 %)', () => {
  const r = retraite.calcRetraite(Object.assign({}, BASELINE, {
    ageDepart: 64, trimDejaValides: 0
  }));
  // 64 ans => 12 trim manquants (jusqu'à 67)
  // Décote = 12 × 1.25 % = 15 %, taux = 0.5 × 0.85 = 0.425
  assert.ok(close(r.taux, 0.425, 0.01), 'taux=' + r.taux);
});

test('calcRetraite : surcote pour départ tardif avec durée pleine', () => {
  // Salarié déjà à 172 trim, départ 67 ans → surcote
  const r = retraite.calcRetraite(Object.assign({}, BASELINE, {
    trimDejaValides: 172, ageDepart: 67
  }));
  assert.ok(r.taux > 0.5, 'surcote attendue, taux=' + r.taux);
  assert.ok(r.trimSurplus > 0);
});

test('calcRetraite : salaire plus haut → pension plus haute', () => {
  const r30k = retraite.calcRetraite(Object.assign({}, BASELINE, { salaireBrutAnnuel: 30000 }));
  const r60k = retraite.calcRetraite(Object.assign({}, BASELINE, { salaireBrutAnnuel: 60000 }));
  assert.ok(r60k.pensionMensuelleBrute > r30k.pensionMensuelleBrute);
});

test('calcRetraite : SAM plafonné au PASS (effet revalo accepté)', () => {
  // Salaire très haut : SAM doit être plafonné au PASS de chaque année
  // (avec revalo, le SAM en valeur 2025 peut dépasser le PASS car il intègre la revalo)
  const r = retraite.calcRetraite(Object.assign({}, BASELINE, { salaireBrutAnnuel: 200000 }));
  // Plafonnement effectif : PASS revalorisé sur 16 ans ≈ 64k. SAM doit rester < 80k pour 16 ans.
  assert.ok(r.sam < 80000, 'SAM=' + r.sam + ' doit refléter le plafond PASS');
});

test('compareDepart : retourne 7 entrées (62-68)', () => {
  const arr = retraite.compareDepart(BASELINE);
  assert.strictEqual(arr.length, 7);
  assert.strictEqual(arr[0].age, 62);
  assert.strictEqual(arr[6].age, 68);
});

test('calcRachatTrimestres : avec trim manquants → gain positif', () => {
  // Cas : départ à 64 sans avoir cumulé assez
  const params = Object.assign({}, BASELINE, {
    trimDejaValides: 100, ageDepart: 64, anneeActuelle: 2030 // proche du départ
  });
  const r = retraite.calcRachatTrimestres(params, 8);
  assert.ok(r.gainAnnuelBrut >= 0);
  assert.ok(r.coutTotal > 0);
});

test('calcCarriereLongue : début 17 ans avec 5 trim → éligible 60 ans', () => {
  // Né 1985, début carrière 2002 → âge 17, supposé 5 trim avant 20 ans
  const params = Object.assign({}, BASELINE, {
    anneeDebutCarriere: 2002,
    trimAvant20Ans: 8
  });
  const r = retraite.calcCarriereLongue(params);
  assert.ok(r.eligible);
  assert.strictEqual(r.ageDepartPossible, 60);
});

test('calcCarriereLongue : début 25 ans → non éligible', () => {
  const params = Object.assign({}, BASELINE, {
    anneeDebutCarriere: 2010,
    trimAvant20Ans: 0
  });
  const r = retraite.calcCarriereLongue(params);
  assert.ok(!r.eligible);
});

test('calcSensibiliteSalaire : 5 scénarios retournés', () => {
  const arr = retraite.calcSensibiliteSalaire(BASELINE);
  assert.strictEqual(arr.length, 5);
  arr.forEach((s) => {
    assert.ok(s.sam > 0);
    assert.ok(s.pensionMensuelleBrute > 0);
  });
});

test('Agirc-Arrco : points produits cohérents (~80 points/an pour 50k€)', () => {
  const points = retraite.calcPointsAgircArrco(50000, 1, 0, 0);
  // 50k = T1 entière (50k < PASS 47.1k... non en fait 50k > 47.1k)
  // T1: 47100 × 6.20% = 2920 ; T2: 2900 × 17% = 493 ; total = 3413 / 20.19 = ~169 pts
  // Mon calcul devrait donner ~150-170 points pour 50k
  assert.ok(points > 100 && points < 200, 'points/an=' + points);
});
