/**
 * Impôt sur le revenu (France) — barème 2026 sur revenus 2025.
 *
 * Les valeurs attendues sont calculées À LA MAIN à partir du barème
 * officiel, pas relevées depuis le code : un test qui recopie sa
 * sortie ne prouverait rien.
 *
 * Barème retenu par le module (revenus 2025, déclaration 2026) :
 *   0 %  jusqu'à     11 600 €
 *   11 % de  11 600 à  29 579 €
 *   30 % de  29 579 à  84 577 €
 *   41 % de  84 577 à 181 917 €
 *   45 % au-delà
 * Plafond QF : 1 807 €/demi-part, 4 262 € pour le 1er enfant d'un parent
 * isolé · Décote : 897 / 1 483 à 45,25 %
 * Abattement 10 % : plancher 509 €, plafond 14 555 €
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
  cents(IR.irOnPart(11600), 0);
});

test('irOnPart : 1re tranche à 11 %', () => {
  // 20 000 - 11 600 = 8 400 × 11 %
  cents(IR.irOnPart(20000), 8400 * 0.11);
});

test('irOnPart : cumul des tranches 11 % puis 30 %', () => {
  // (29 579 - 11 600) × 11 %  +  (50 000 - 29 579) × 30 %
  const attendu = 17979 * 0.11 + 20421 * 0.30;
  cents(IR.irOnPart(50000), attendu);
});

test('irOnPart : tranche à 45 % atteinte', () => {
  const attendu = 17979 * 0.11 + 54998 * 0.30 + 97340 * 0.41 + 18083 * 0.45;
  cents(IR.irOnPart(200000), attendu);
});

test('tmiFromPart : bornes de chaque tranche', () => {
  assert.strictEqual(IR.tmiFromPart(10000), 0);
  assert.strictEqual(IR.tmiFromPart(11600), 11);
  assert.strictEqual(IR.tmiFromPart(29578), 11);
  assert.strictEqual(IR.tmiFromPart(29579), 30);
  assert.strictEqual(IR.tmiFromPart(84577), 41);
  assert.strictEqual(IR.tmiFromPart(181917), 45);
});

/* ---------------------------------------------------------------- */
/* Abattement 10 %                                                   */
/* ---------------------------------------------------------------- */

test('abattementSalaire : 10 % dans la plage courante', () => {
  cents(IR.abattementSalaire(35000), 3500);
});

test('abattementSalaire : plancher 509 € sur les petits salaires', () => {
  cents(IR.abattementSalaire(3000), 509);   // 10 % = 300 < 509
});

test('abattementSalaire : plafond 14 555 € sur les hauts salaires', () => {
  cents(IR.abattementSalaire(200000), 14555); // 10 % = 20 000 > 14 555
});

/* ---------------------------------------------------------------- */
/* Cas complets vérifiés à la main                                   */
/* ---------------------------------------------------------------- */

test('calcIR : célibataire, 35 000 € nets, sans enfant', () => {
  // abattement 3 500 -> RNI 31 500 -> 1 part
  // (29 579-11 600)×11 % + (31 500-29 579)×30 % = 1 977,69 + 576,30
  const r = IR.calcIR({ salaireNet: 35000, adultes: 1, enfants: 0 });
  cents(r.abattement, 3500);
  cents(r.revenuNetImposable, 31500);
  cents(r.irNet, 2553.99);
  assert.strictEqual(r.tmi, 30);
  assert.strictEqual(r.parts, 1);
});

test('calcIR : célibataire à 20 000 € — la décote s\'applique', () => {
  // RNI 18 000 -> IR brut (18 000-11 600)×11 % = 704
  // décote = 897 - 704 × 45,25 % = 578,44
  const r = IR.calcIR({ salaireNet: 20000, adultes: 1, enfants: 0 });
  cents(r.decote, 578.44);
  cents(r.irNet, 125.56);
});

test('calcIR : couple avec 2 enfants, 60 000 € — quotient familial', () => {
  // 3 parts, RNI 54 000, 18 000/part
  // IR avec QF = 704 × 3 = 2 112 ; décote couple = 527,32
  const r = IR.calcIR({ salaireNet: 60000, adultes: 2, enfants: 2 });
  assert.strictEqual(r.parts, 3);
  cents(r.irNet, 1584.68);
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
  // Couple + 2 enfants à 200 000 € : l'avantage dépasse 2 × 1 807 €
  const r = IR.calcIR({ salaireNet: 200000, adultes: 2, enfants: 2 });
  assert.ok(r.plafondAtteint, 'le plafonnement devrait être actif');
  // avec plafonnement, l'IR ne peut pas descendre sous irSansQF - plafond
  const sansEnfant = IR.calcIR({ salaireNet: 200000, adultes: 2, enfants: 0 });
  const gain = sansEnfant.irNet - r.irNet;
  assert.ok(gain <= 2 * 1807 + 0.01, `gain ${gain} > plafond 3 614 €`);
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
/* Parent isolé (case T) — plafond spécifique                        */
/* ---------------------------------------------------------------- */

test('parent isolé : la case T ajoute bien une demi-part', () => {
  const avec = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 1, parentIsole: true });
  const sans = IR.calcIR({ salaireNet: 60000, adultes: 1, enfants: 1, parentIsole: false });
  assert.strictEqual(avec.parts, 2);
  assert.strictEqual(sans.parts, 1.5);
  assert.ok(avec.irNet <= sans.irNet);
});

test('parent isolé : l\'avantage du 1er enfant est plafonné à 4 262 €', () => {
  // BOFiP BOI-IR-LIQ-20-20-20 § III-B-1-70 : la part entière liée au 1er
  // enfant d'un parent isolé relève d'un plafond spécifique et global,
  // et non du plafond générique par demi-part.
  [60000, 90000, 150000].forEach(salaire => {
    const avec = IR.calcIR({ salaireNet: salaire, adultes: 1, enfants: 1, parentIsole: true });
    const sans = IR.calcIR({ salaireNet: salaire, adultes: 1, enfants: 0 });
    assert.ok(avec.plafondAtteint, `plafonnement inactif à ${salaire} €`);
    const gain = sans.irNet - avec.irNet;
    assert.ok(Math.abs(gain - IR.QF_CAP_PARENT_ISOLE) < 0.01,
      `${salaire} € : gain ${gain.toFixed(2)} au lieu de ${IR.QF_CAP_PARENT_ISOLE}`);
  });
});

test('parent isolé : les enfants suivants restent au plafond générique', () => {
  // 3 enfants -> parts = 1 + 0,5 + 0,5 + 1 + 0,5 (case T) = 3,5
  // soit 5 demi-parts : 2 pour le 1er enfant (plafond spécifique)
  // et 3 au plafond générique.
  const avec = IR.calcIR({ salaireNet: 200000, adultes: 1, enfants: 3, parentIsole: true });
  const sans = IR.calcIR({ salaireNet: 200000, adultes: 1, enfants: 0 });
  const gain = sans.irNet - avec.irNet;
  const attendu = IR.QF_CAP_PARENT_ISOLE + 3 * IR.QF_CAP_PER_HALFPART;
  assert.ok(avec.plafondAtteint);
  assert.ok(Math.abs(gain - attendu) < 0.01,
    `gain ${gain.toFixed(2)} au lieu de ${attendu} (4 262 + 3 × 1 807)`);
});

test('parent isolé : le plafond spécifique ne fuite pas sur un couple', () => {
  // parentIsole n'a de sens qu'avec un seul adulte : un couple doit
  // rester au plafond générique même si le drapeau est passé par erreur.
  const couple = IR.calcIR({ salaireNet: 200000, adultes: 2, enfants: 1, parentIsole: true });
  const sans = IR.calcIR({ salaireNet: 200000, adultes: 2, enfants: 0 });
  const gain = sans.irNet - couple.irNet;
  assert.ok(gain <= IR.QF_CAP_PER_HALFPART + 0.01,
    `gain ${gain.toFixed(2)} > plafond générique ${IR.QF_CAP_PER_HALFPART}`);
});

/* ---------------------------------------------------------------- */
/* Constantes du millésime — à revoir à chaque loi de finances       */
/* ---------------------------------------------------------------- */

test('constantes revenus 2025 conformes aux sources officielles', () => {
  assert.deepStrictEqual(IR.BRACKETS.map(b => b.from), [0, 11600, 29579, 84577, 181917]);
  assert.deepStrictEqual(IR.BRACKETS.map(b => b.rate), [0, 0.11, 0.30, 0.41, 0.45]);
  assert.strictEqual(IR.QF_CAP_PER_HALFPART, 1807);
  assert.strictEqual(IR.QF_CAP_PARENT_ISOLE, 4262);
  assert.strictEqual(IR.DECOTE_THRESHOLD_SINGLE, 1982);
  assert.strictEqual(IR.DECOTE_THRESHOLD_COUPLE, 3277);
  assert.strictEqual(IR.ABATTEMENT_MIN, 509);
  assert.strictEqual(IR.ABATTEMENT_MAX, 14555);
});

test('décote : le seuil d\'application vaut bien la somme fixe ÷ 45,25 %', () => {
  // Contrôle de cohérence interne : au seuil, la décote doit s'annuler.
  // C'est ce test qui a permis de départager deux jeux de chiffres
  // contradictoires trouvés en ligne.
  const eps = 1;
  assert.ok(Math.abs(IR.DECOTE_REF_SINGLE / 0.4525 - IR.DECOTE_THRESHOLD_SINGLE) < eps);
  assert.ok(Math.abs(IR.DECOTE_REF_COUPLE / 0.4525 - IR.DECOTE_THRESHOLD_COUPLE) < eps);
});
