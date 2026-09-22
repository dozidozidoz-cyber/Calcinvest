/* ============================================================
   CalcInvest — Core Impôt sur le Revenu (France)
   Barème des revenus 2025 (déclaration 2026) · Quotient familial
   Décote · Abattement 10 % salaires · Plafonnement QF

   Sources (vérifiées le 22/09/2026) :
   - Tranches : loi de finances 2026 (loi n° 2026-103 du 19/02/2026),
     indexation de 0,9 % des limites — BOFiP ACTU-2026-00022.
   - Plafonds QF : BOFiP BOI-IR-LIQ-20-20-20, § III-A-40 et III-B-1-70.
   - Abattement 10 % : impots.gouv.fr, déduction forfaitaire.

   ⚠ À REVALORISER chaque année après la loi de finances. Les valeurs
   sont regroupées ci-dessous et couvertes par tests/fisc/impot.test.js :
   mettre à jour les deux ensemble.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  // Barème IR 2026 (revenus 2025)
  const BRACKETS = [
    { from: 0,      to: 11600,  rate: 0    },
    { from: 11600,  to: 29579,  rate: 0.11 },
    { from: 29579,  to: 84577,  rate: 0.30 },
    { from: 84577,  to: 181917, rate: 0.41 },
    { from: 181917, to: Infinity, rate: 0.45 }
  ];

  // Plafonnement du quotient familial (revenus 2025)
  const QF_CAP_PER_HALFPART = 1807;   // par demi-part supplémentaire
  // La part entière liée au 1er enfant d'un parent isolé (case T) relève
  // d'un plafond spécifique, bien supérieur au générique. Sans lui, l'impôt
  // de ces foyers était surestimé de plusieurs centaines d'euros.
  const QF_CAP_PARENT_ISOLE = 4262;

  // Décote (revenus 2025). Cohérence : seuil = somme fixe ÷ taux.
  //   897 / 0,4525 = 1 982   ·   1 483 / 0,4525 = 3 277
  const DECOTE_THRESHOLD_SINGLE = 1982;
  const DECOTE_THRESHOLD_COUPLE = 3277;
  const DECOTE_REF_SINGLE = 897;
  const DECOTE_REF_COUPLE = 1483;
  const DECOTE_RATE = 0.4525;

  // Abattement forfaitaire 10 % frais professionnels (revenus 2025)
  const ABATTEMENT_MIN = 509;
  const ABATTEMENT_MAX = 14555;

  /**
   * Calcule l'IR brut sur un revenu net imposable par part.
   */
  function irOnPart(perPart) {
    let ir = 0;
    for (const b of BRACKETS) {
      if (perPart <= b.from) break;
      const inBracket = Math.min(perPart, b.to) - b.from;
      ir += inBracket * b.rate;
    }
    return ir;
  }

  /**
   * TMI (tranche marginale) sur un revenu par part.
   */
  function tmiFromPart(perPart) {
    for (const b of BRACKETS) {
      if (perPart >= b.from && perPart < b.to) return b.rate * 100;
    }
    return 45;
  }

  /**
   * Abattement forfaitaire 10 % sur les salaires.
   */
  function abattementSalaire(salaire) {
    const r = salaire * 0.10;
    return Math.min(Math.max(r, ABATTEMENT_MIN), ABATTEMENT_MAX);
  }

  /**
   * Calcule l'IR complet sur un foyer.
   * @param {Object} p
   * @param {number} p.salaireNet            Salaire net annuel (avant abattement 10%)
   * @param {number} p.autresRevenus         Autres revenus déjà nets (fonciers nets, etc.)
   * @param {number} p.adultes               1 ou 2
   * @param {number} p.enfants               Nombre d'enfants à charge
   * @param {boolean} p.parentIsole          Parent isolé (case T)
   * @param {number} p.deductions            Déductions diverses (PER, etc.)
   * @param {boolean} p.applyAbattement10    Appliquer l'abattement 10% sur salaires
   */
  function calcIR(p) {
    const salaire   = num(p.salaireNet, 0);
    const autres    = num(p.autresRevenus, 0);
    const adultes   = Math.min(Math.max(num(p.adultes, 1), 1), 2);
    const enfants   = Math.max(num(p.enfants, 0), 0);
    const parentIsole = !!p.parentIsole;
    const deductions = num(p.deductions, 0);
    const applyAb = p.applyAbattement10 !== false;

    // Abattement 10 % salaires
    const ab = applyAb ? abattementSalaire(salaire) : 0;
    const salaireImposable = Math.max(salaire - ab, 0);

    const revenuNetImposable = Math.max(salaireImposable + autres - deductions, 0);

    // Parts fiscales
    // Adulte seul : 1 ; couple : 2
    // 1er et 2e enfant : 0.5 ; à partir du 3e : 1 part
    // Parent isolé : +0.5 part pour le 1er enfant
    let parts = adultes;
    if (enfants >= 1) parts += 0.5;
    if (enfants >= 2) parts += 0.5;
    if (enfants >= 3) parts += (enfants - 2);
    if (parentIsole && enfants >= 1 && adultes === 1) parts += 0.5;

    const perPart = revenuNetImposable / parts;
    const irAvecQF = irOnPart(perPart) * parts;

    // IR sans QF (pour calcul du plafonnement)
    const partsBase = adultes; // 1 ou 2
    const irSansQF = irOnPart(revenuNetImposable / partsBase) * partsBase;
    const avantageQF = irSansQF - irAvecQF;
    const halfParts = (parts - partsBase) * 2; // nombre de demi-parts supplémentaires

    // Parent isolé : le 1er enfant ouvre droit à une PART entière (2 demi-parts)
    // dont l'avantage relève d'un plafond spécifique et global — pas du
    // plafond générique appliqué demi-part par demi-part. Les demi-parts
    // suivantes (enfants 2, 3…) restent au plafond générique.
    const beneficieCaseT = parentIsole && enfants >= 1 && adultes === 1;
    let plafondAvantage;
    if (beneficieCaseT) {
      const halfPartsRestantes = Math.max(halfParts - 2, 0);
      plafondAvantage = QF_CAP_PARENT_ISOLE + halfPartsRestantes * QF_CAP_PER_HALFPART;
    } else {
      plafondAvantage = halfParts * QF_CAP_PER_HALFPART;
    }

    let irApresPlafond = irAvecQF;
    let plafondAtteint = false;
    if (avantageQF > plafondAvantage) {
      irApresPlafond = irSansQF - plafondAvantage;
      plafondAtteint = true;
    }

    // Décote
    const seuil = adultes === 2 ? DECOTE_THRESHOLD_COUPLE : DECOTE_THRESHOLD_SINGLE;
    let decote = 0;
    if (irApresPlafond < seuil) {
      const ref = adultes === 2 ? DECOTE_REF_COUPLE : DECOTE_REF_SINGLE;
      decote = Math.max(ref - irApresPlafond * DECOTE_RATE, 0);
      decote = Math.min(decote, irApresPlafond);
    }
    const irNet = Math.max(irApresPlafond - decote, 0);

    const tmi = tmiFromPart(perPart);
    const tauxMoyen = revenuNetImposable > 0 ? (irNet / revenuNetImposable) * 100 : 0;

    // Mensualisation
    const irMensuel = irNet / 12;

    // Décomposition par tranche (pour le diagramme)
    const decomposition = BRACKETS.map(b => {
      const inBracket = Math.max(0, Math.min(perPart, b.to) - b.from);
      const irBracket = inBracket * b.rate * parts;
      return {
        from: b.from,
        to: b.to === Infinity ? null : b.to,
        rate: b.rate * 100,
        amountInBracket: inBracket * parts,
        irForBracket: irBracket
      };
    }).filter(d => d.amountInBracket > 0);

    return {
      salaire,
      abattement: ab,
      salaireImposable,
      autresRevenus: autres,
      deductions,
      revenuNetImposable,
      parts,
      perPart,
      irBrut: irAvecQF,
      irSansQF,
      avantageQF,
      plafondAvantage,
      plafondAtteint,
      decote,
      irNet,
      irMensuel,
      tmi,
      tauxMoyen,
      decomposition,
      revenuNetApresImpot: salaire + autres - irNet
    };
  }

  /**
   * Compare deux scenarios (avant / après un événement type augmentation).
   */
  function compareScenarios(scenarioA, scenarioB) {
    const a = calcIR(scenarioA);
    const b = calcIR(scenarioB);
    return {
      a, b,
      diffIR: b.irNet - a.irNet,
      diffNet: b.revenuNetApresImpot - a.revenuNetApresImpot,
      diffTauxMoyen: b.tauxMoyen - a.tauxMoyen
    };
  }

  /**
   * Marginalité : combien de € d'IR sur le prochain euro gagné ?
   * Renvoie TMI + part PS si applicable.
   */
  function marginalCost(scenario, increment) {
    increment = num(increment, 1000);
    const a = calcIR(scenario);
    const b = calcIR({ ...scenario, salaireNet: num(scenario.salaireNet, 0) + increment });
    const irMarginal = b.irNet - a.irNet;
    return {
      increment,
      irMarginal,
      effectiveRate: increment > 0 ? (irMarginal / increment) * 100 : 0
    };
  }

  /**
   * Optimiseur PER : trouve le versement qui fait passer en tranche inférieure
   * (ou minimise l'IR).
   */
  function perOptimizer(scenario) {
    const base = calcIR(scenario);
    const currentTMI = base.tmi / 100;
    const idx = BRACKETS.findIndex(b => b.rate === currentTMI);
    if (idx <= 0) {
      return {
        deja: true,
        currentTMI: base.tmi,
        message: 'Déjà dans la tranche la plus basse — pas d\'optimisation PER possible'
      };
    }
    const lowerBracket = BRACKETS[idx - 1];
    const seuilParPart = lowerBracket.to;
    const baisseNecessaireParPart = Math.max(0, base.perPart - seuilParPart);
    const versementMin = baisseNecessaireParPart * base.parts;

    const newScenario = { ...scenario, deductions: (scenario.deductions || 0) + versementMin };
    const after = calcIR(newScenario);
    const gainFiscal = base.irNet - after.irNet;
    const coutNet = versementMin - gainFiscal;

    // Plafond PER 2025 : 10 % des revenus pro N-1, plancher = PASS × 10 % (4 710 €),
    // plafond = PASS × 8 × 10 % (35 194 €)
    const PASS_2025 = 47100;
    const plafond = Math.max(PASS_2025 * 0.10, Math.min((scenario.salaireNet || 0) * 0.10, PASS_2025 * 0.80));

    return {
      deja: false,
      versementPourTrancheInferieure: versementMin,
      currentTMI: base.tmi,
      newTMI: after.tmi,
      irAvant: base.irNet,
      irApres: after.irNet,
      gainFiscal,
      coutNetReel: coutNet,
      tauxEconomieEffectif: versementMin > 0 ? (gainFiscal / versementMin) * 100 : 0,
      plafondPER: plafond,
      depassePlafond: versementMin > plafond
    };
  }

  const api = {
    calcIR, compareScenarios, marginalCost, perOptimizer,
    BRACKETS, QF_CAP_PER_HALFPART, QF_CAP_PARENT_ISOLE,
    DECOTE_THRESHOLD_SINGLE, DECOTE_THRESHOLD_COUPLE,
    DECOTE_REF_SINGLE, DECOTE_REF_COUPLE,
    ABATTEMENT_MIN, ABATTEMENT_MAX,
    abattementSalaire, tmiFromPart, irOnPart
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.IR = api;
})(typeof window !== 'undefined' ? window : globalThis);
