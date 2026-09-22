/**
 * Salaire brut / net (France) — cotisations salariales 2025.
 *
 * Le module s'annonce lui-même comme une approximation (±2 %). Les
 * tests visent donc les INVARIANTS et la cohérence interne, pas des
 * montants au centime : figer une valeur approximative reviendrait à
 * verrouiller l'approximation plutôt qu'à la vérifier.
 *
 * PSS 2025 = 3 925 €/mois. T1 = 0→1 PSS, T2 = 1→8 PSS.
 */
const test = require('node:test');
const assert = require('node:assert');
const S = require('../../assets/js/core/calc-salaire');

const STATUTS = ['cadre', 'nonCadre'];
const PALIERS = [1801.80, 2000, 3000, 3925, 5000, 8000, 12000, 31400];

/* ---------------------------------------------------------------- */
/* Cohérence interne                                                 */
/* ---------------------------------------------------------------- */

test('aller-retour : netToBrut(brutToNet(x)) redonne x à moins d\'1 €', () => {
  STATUTS.forEach(statut => {
    PALIERS.forEach(brut => {
      const net = S.brutToNet({ brut, statut }).netAvantImpot;
      const retour = S.netToBrut({ net, statut });
      const v = typeof retour === 'object' ? (retour.brut ?? retour.brutMensuel) : retour;
      assert.ok(Math.abs(v - brut) < 1,
        `${statut} ${brut} € -> net ${net.toFixed(2)} -> brut ${Number(v).toFixed(2)}`);
    });
  });
});

test('le net est toujours strictement inférieur au brut', () => {
  STATUTS.forEach(statut => {
    PALIERS.forEach(brut => {
      const r = S.brutToNet({ brut, statut });
      assert.ok(r.netAvantImpot < brut, `${statut} ${brut} € : net >= brut`);
      assert.ok(r.netAvantImpot > 0, `${statut} ${brut} € : net <= 0`);
    });
  });
});

test('monotonie : un brut supérieur donne toujours un net supérieur', () => {
  STATUTS.forEach(statut => {
    let precedent = -1;
    for (let brut = 500; brut <= 40000; brut += 250) {
      const net = S.brutToNet({ brut, statut }).netAvantImpot;
      assert.ok(net > precedent, `${statut} : net recule à ${brut} €`);
      precedent = net;
    }
  });
});

test('total des cotisations = brut - net, sans perte d\'arrondi', () => {
  STATUTS.forEach(statut => {
    PALIERS.forEach(brut => {
      const r = S.brutToNet({ brut, statut });
      assert.ok(Math.abs((brut - r.netAvantImpot) - r.totalCotisations) < 0.01,
        `${statut} ${brut} € : décomposition incohérente`);
    });
  });
});

/* ---------------------------------------------------------------- */
/* Découpage en tranches (PSS)                                       */
/* ---------------------------------------------------------------- */

test('tranches : sous le PSS, tout est en T1 et T2 est nulle', () => {
  const r = S.brutToNet({ brut: 3000, statut: 'cadre' });
  assert.strictEqual(r.t1, 3000);
  assert.strictEqual(r.t2, 0);
});

test('tranches : au PSS exact, T1 est pleine et T2 vaut zéro', () => {
  const r = S.brutToNet({ brut: S.PSS_MONTHLY, statut: 'cadre' });
  assert.strictEqual(r.t1, S.PSS_MONTHLY);
  assert.strictEqual(r.t2, 0);
});

test('tranches : au-dessus du PSS, T1 plafonne et le surplus bascule en T2', () => {
  const brut = 6000;
  const r = S.brutToNet({ brut, statut: 'cadre' });
  assert.strictEqual(r.t1, S.PSS_MONTHLY);
  assert.strictEqual(r.t2, brut - S.PSS_MONTHLY);
  assert.strictEqual(r.t1 + r.t2, brut);
});

test('tranches : T2 est bornée à 8 PSS', () => {
  const r = S.brutToNet({ brut: 60000, statut: 'cadre' });
  assert.strictEqual(r.t2, 7 * S.PSS_MONTHLY); // de 1 PSS à 8 PSS
});

/* ---------------------------------------------------------------- */
/* Plausibilité                                                      */
/* ---------------------------------------------------------------- */

test('le ratio net/brut reste dans une fourchette réaliste', () => {
  STATUTS.forEach(statut => {
    PALIERS.forEach(brut => {
      const ratio = S.brutToNet({ brut, statut }).netAvantImpot / brut;
      assert.ok(ratio > 0.72 && ratio < 0.83,
        `${statut} ${brut} € : ratio ${(ratio * 100).toFixed(1)} % hors fourchette 72-83 %`);
    });
  });
});

test('un cadre ne peut pas cotiser moins qu\'un non-cadre à brut égal', () => {
  PALIERS.forEach(brut => {
    const c = S.brutToNet({ brut, statut: 'cadre' }).totalCotisations;
    const nc = S.brutToNet({ brut, statut: 'nonCadre' }).totalCotisations;
    assert.ok(c >= nc - 0.01, `${brut} € : cadre ${c} < non-cadre ${nc}`);
  });
});

test('ÉCART CADRE / NON-CADRE — fige l\'écart actuel, très faible', () => {
  // ⚠ Fige le comportement ACTUEL, ne valide pas la conformité.
  // netToBrut amorce son itération sur « cadre ~74 %, non-cadre ~77 % »,
  // soit 3 points d'écart attendus. brutToNet n'en produit que ~0,2 :
  // seules la CET et l'APEC distinguent les deux statuts, et elles pèsent
  // 0,16 %. L'itération de Newton corrige (d'où l'aller-retour juste),
  // mais les deux fonctions ne reposent pas sur le même modèle.
  const brut = 5000;
  const c = S.brutToNet({ brut, statut: 'cadre' }).netAvantImpot / brut;
  const nc = S.brutToNet({ brut, statut: 'nonCadre' }).netAvantImpot / brut;
  const ecartPoints = (nc - c) * 100;
  assert.ok(ecartPoints > 0 && ecartPoints < 1,
    `écart cadre/non-cadre = ${ecartPoints.toFixed(2)} pt (attendu < 1 pt aujourd'hui)`);
});

/* ---------------------------------------------------------------- */
/* Entrées limites                                                   */
/* ---------------------------------------------------------------- */

test('entrées nulles, négatives ou absurdes ne produisent ni NaN ni négatif', () => {
  [0, -1000, null, undefined, NaN, 'abc'].forEach(brut => {
    STATUTS.forEach(statut => {
      const r = S.brutToNet({ brut, statut });
      assert.ok(Number.isFinite(r.netAvantImpot), `NaN pour brut=${brut}`);
      assert.ok(r.netAvantImpot >= 0, `net négatif pour brut=${brut}`);
      assert.ok(Number.isFinite(r.totalCotisations));
    });
  });
});

test('statut inconnu : repli silencieux sur non-cadre', () => {
  const inconnu = S.brutToNet({ brut: 3000, statut: 'astronaute' });
  const nonCadre = S.brutToNet({ brut: 3000, statut: 'nonCadre' });
  assert.strictEqual(inconnu.netAvantImpot, nonCadre.netAvantImpot);
});

test('le net annuel vaut douze fois le net mensuel', () => {
  STATUTS.forEach(statut => {
    const r = S.brutToNet({ brut: 3500, statut });
    assert.ok(Math.abs(r.netAnnuel - r.netAvantImpot * 12) < 0.01);
    assert.ok(Math.abs(r.brutAnnuel - 3500 * 12) < 0.01);
  });
});

test('constantes 2025 : PSS et SMIC conformes aux valeurs publiées', () => {
  assert.strictEqual(S.PSS_MONTHLY, 3925);
  assert.strictEqual(S.PSS_ANNUAL, 47100);
  assert.strictEqual(S.SMIC_MONTHLY, 1801.80);
});
