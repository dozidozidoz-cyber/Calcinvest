/**
 * Impôt sur le revenu (France) — barème 2025 sur revenus 2024.
 *
 * Les valeurs attendues sont calculées À LA MAIN à partir du barème
 * officiel, pas relevées depuis le code : un test qui recopie sa
 * sortie ne prouverait rien.
 *
 * Barème retenu par le module (impots.gouv.fr, revenus 2024) :
 *   0 %  jusqu'à     11 497 €
 *   11 % de  11 497 à  29 315 €
 *   30 % de  29 315 à  83 823 €
 *   41 % de  83 823 à 180 294 €
 *   45 % au-delà
 * Plafond QF : 1 791 € par demi-part · Décote : 873 / 1 444 à 45,25 %
 * Abattement 10 % : plancher 504 €, plafond 14 426 €
 */
const test = require('node:test');
const assert = require('node:assert');
const IR = require('../../assets/js/core/calc-impot');

const cents = (a, b) => assert.ok(Math.abs(a - b) < 0.01,
  `attendu ${b}, obtenu ${a} (écart ${Math.abs(a - b).toFixed(4)})`);

/* ---------------------------------------------------------------- */
/* Barème nu                                                         */
/* ---------------------------------------------------------------- */

test('irOnPart : aucun impôt sous le seuil de la 1re tranche', () => {
  cents(IR.irOnPart(0), 0);
  cents(IR.irOnPart(11497), 0);
});

test('irOnPart : 1re tranche à 11 %', () => {
  // 20 000 - 11 497 = 8 503 × 11 %
  cents(IR.irOnPart(20000), 8503 * 0.11);
});

test('irOnPart : cumul des tranches 11 % puis 30 %', () => {
  // (29 315 - 11 497) × 11 %  +  (50 000 - 29 315) × 30 %
  const attendu = 17818 * 0.11 + 20685 * 0.30;
  cents(IR.irOnPart(50000), attendu);
});

test('irOnPart : tranche à 45 % atteinte', () => {
  const attendu = 17818 * 0.11 + 54508 * 0.30 + 96471 * 0.41 + 19706 * 0.45;
  cents(IR.irOnPart(200000), attendu);
});

test('tmiFromPart : bornes de chaque tranche', () => {
  assert.strictEqual(IR.tmiFromPart(10000), 0);
  assert.strictEqual(IR.tmiFromPart(11497), 11);
  assert.strictEqual(IR.tmiFromPart(29314), 11);
  assert.strictEqual(IR.tmiFromPart(29315), 30);
  assert.strictEqual(IR.tmiFromPart(83823), 41);
  assert.strictEqual(IR.tmiFromPart(180294), 45);
});

/* ---------------------------------------------------------------- */
/* Abattement 10 %                                                   */
/* ---------------------------------------------------------------- */

test('abattementSalaire : 10 % dans la plage courante', () => {
  cents(IR.abattementSalaire(35000), 3500);
});

test('abattementSalaire : plancher 504 € sur les petits salaires', () => {
  cents(IR.abattementSalaire(3000), 504);   // 10 % = 300 < 504
});

test('abattementSalaire : plafond 14 426 € sur les hauts salaires', () => {
  cents(IR.abattementSalaire(200000), 14426); // 10 % = 20 000 > 14 426
});

/* ---------------------------------------------------------------- */
/* Cas complets vérifiés à la main                                   */
/* ---------------------------------------------------------------- */

test('calcIR : célibataire, 35 000 € nets, sans enfant', () => {
  // abattement 3 500 -> RNI 31 500 -> 1 part
  // (29 315-11 497)×11 % + (31 500-29 315)×30 % = 1 959,98 + 655,50
  const r = IR.calcIR({ salaireNet: 35000, adultes: 1, enfants: 0 });
  cents(r.abattement, 3500);
  cents(r.revenuNetImposable, 31500);
  cents(r.irNet, 2615.48);
  assert.strictEqual(r.tmi, 30);
  assert.strictEqual(r.parts, 1);
});

test('calcIR : célibataire à 20 000 € — la décote s\'applique', () => {
  // RNI 18 000 -> IR brut (18 000-11 497)×11 % = 715,33
  // décote = 873 - 715,33 × 45,25 % = 549,31
  const r = IR.calcIR({ salaireNet: 20000, adultes: 1, enfants: 0 });
  cents(r.decote, 549.31);
  cents(r.irNet, 166.02);
});

test('calcIR : couple avec 2 enfants, 60 000 € — quotient familial', () => {
  // 3 parts, RNI 54 000, 18 000/part
  // IR avec QF = 715,33 × 3 = 2 145,99 ; décote couple = 472,94
  const r = IR.calcIR({ salaireNet: 60000, adultes: 2, enfants: 2 });
  assert.strictEqual(r.parts, 3);
  cents(r.irNet, 1673.05);
});

/* ---------------------------------------------------------------- */
/* Quotient familial                                                 */
/* ---------------------------------------------------------------- */

test('parts : les 2 premiers enfants valent une demi-part, le 3e une part', () => {
  const p = n => IR.calcIR({ salaireNet: 40000, adultes: 2, enfants: n }).parts;
  assert.strictEqual(p(0), 2);
  assert.strictEqual(p(1), 2.5);
  assert.strictEqual(p(2), 3);
  assert.strictEqual(p(3), 4);   // 3e enfant = 1 part entière
  assert.strictEqual(p(4), 5);
});

test('plafonnement du QF : l\'avantage est borné sur les hauts revenus', () => {
  // Couple + 2 enfants à 200 000 € : l'avantage dépasse 2 × 1 791 €
  const r = IR.calcIR({ salaireNet: 200000, adultes: 2, enfants: 2 });
  assert.ok(r.plafondAtteint, 'le plafonnement devrait être actif');
  // avec plafonnement, l'IR ne peut pas descendre sous irSansQF - plafond
  const sansEnfant = IR.calcIR({ salaireNet: 200000, adultes: 2, enfants: 0 });
  const gain = sansEnfant.irNet - r.irNet;
  assert.ok(gain <= 2 * 1791 + 0.01, `gain ${gain} > plafond 3 582 €`);
});

test('plafonnement du QF : inactif quand l\'avantage reste sous le plafond', () => {
  const r = IR.calcIR({ salaireNet: 60000, adultes: 2, enfants: 2 });
  assert.strictEqual(r.plafondAtteint, false);
});

/* ---------------------------------------------------------------- */
/* Invariants                                                        */
/* ---------------------------------------------------------------- */

test('invariant : l\'IR ne décroît jamais quand le revenu augmente', () => {
  let precedent = -1;
  for (let s = 0; s <= 300000; s += 2500) {
    const ir = IR.calcIR({ salaireNet: s, adultes: 1, enfants: 0 }).irNet;
    assert.ok(ir >= precedent - 0.01, `IR recule à ${s} € : ${ir} < ${precedent}`);
    precedent = ir;
  }
});

test('invariant : jamais d\'IR négatif, jamais de NaN', () => {
  [0, -5000, 1, 8000, 1e7].forEach(s => {
    [0, 1, 3].forEach(e => {
      const r = IR.calcIR({ salaireNet: s, adultes: 1, enfants: e });
      assert.ok(Number.isFinite(r.irNet), `NaN pour salaire=${s} enfants=${e}`);
      assert.ok(r.irNet >= 0, `IR négatif pour salaire=${s}`);
    });
  });
});

test('invariant : un enfant de plus ne peut pas augmenter l\'impôt', () => {
  for (const s of [25000, 45000, 90000, 200000]) {
    let precedent = Infinity;
    for (let e = 0; e <= 4; e++) {
      const ir = IR.calcIR({ salaireNet: s, adultes: 2, enfants: e }).irNet;
      assert.ok(ir <= precedent + 0.01, `${s} € : ${e} enfants coûte plus cher que ${e - 1}`);
      precedent = ir;
    }
  }
});

test('invariant : le taux moyen reste inférieur à la TMI', () => {
  [20000, 50000, 120000, 400000].forEach(s => {
    const r = IR.calcIR({ salaireNet: s, adultes: 1, enfants: 0 });
    assert.ok(r.tauxMoyen <= r.tmi + 0.01,
      `taux moyen ${r.tauxMoyen} > TMI ${r.tmi} à ${s} €`);
  });
});

test('déductions (PER…) : réduisent le revenu imposable à l\'euro près', () => {
  const sans = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 0 });
  const avec = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 0, deductions: 5000 });
  cents(sans.revenuNetImposable - avec.revenuNetImposable, 5000);
  assert.ok(avec.irNet < sans.irNet);
});

/* ---------------------------------------------------------------- */
/* Limite connue — à ne pas confondre avec un test de conformité     */
/* ---------------------------------------------------------------- */

test('parent isolé : la case T ajoute bien une demi-part', () => {
  const avec = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 1, parentIsole: true });
  const sans = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 1, parentIsole: false });
  assert.strictEqual(avec.parts, 2);
  assert.strictEqual(sans.parts, 1.5);
  assert.ok(avec.irNet <= sans.irNet);
});

test('parent isolé : SIMPLIFICATION — plafond générique appliqué', () => {
  // ⚠ Ce test fige le comportement ACTUEL, il ne valide pas la conformité.
  // Le code applique 1 791 €/demi-part à toutes les demi-parts. Or la
  // demi-part liée au 1er enfant d'un parent isolé bénéficie en droit
  // français d'un plafond spécifique, nettement supérieur.
  // Conséquence : l'impôt des parents isolés est SURESTIMÉ.
  // À confronter au plafond en vigueur sur impots.gouv.fr avant correction.
  const r = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 1, parentIsole: true });
  assert.ok(r.plafondAtteint);
  const sansEnfant = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 0 });
  const gain = sansEnfant.irNet - r.irNet;
  assert.ok(Math.abs(gain - 2 * IR.QF_CAP_PER_HALFPART) < 0.01,
    `gain plafonné à ${gain}, soit le plafond générique 2 × ${IR.QF_CAP_PER_HALFPART}`);
});
