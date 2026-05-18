/* ============================================================
   CalcInvest — Core Impôt sur le Revenu (France 2025)
   Barème progressif 2024 (déclaration 2025) · Quotient familial
   Décote · Abattement 10 % salaires · Plafonnement QF
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  // Barème IR 2025 (revenus 2024) — source impots.gouv.fr
  const BRACKETS = [
    { from: 0,      to: 11497,  rate: 0    },
    { from: 11497,  to: 29315,  rate: 0.11 },
    { from: 29315,  to: 83823,  rate: 0.30 },
    { from: 83823,  to: 180294, rate: 0.41 },
    { from: 180294, to: Infinity, rate: 0.45 }
  ];

  // Plafond avantage QF par demi-part supplémentaire (2025) : 1 791 €
  const QF_CAP_PER_HALFPART = 1791;
  // Décote (2025) : si IR < 1 964 (célib) ou 3 248 (couple), application décote
  const DECOTE_THRESHOLD_SINGLE = 1964;
  const DECOTE_THRESHOLD_COUPLE = 3248;
  const DECOTE_RATE = 0.4525;

  // Plafond abattement 10 % frais professionnels
  const ABATTEMENT_MIN = 504;
  const ABATTEMENT_MAX = 14426;

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
    const plafondAvantage = halfParts * QF_CAP_PER_HALFPART;

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
      const ref = adultes === 2 ? 1444 : 873; // valeurs 2025
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
    BRACKETS, QF_CAP_PER_HALFPART,
    DECOTE_THRESHOLD_SINGLE, DECOTE_THRESHOLD_COUPLE,
    abattementSalaire, tmiFromPart, irOnPart
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.IR = api;
})(typeof window !== 'undefined' ? window : globalThis);
