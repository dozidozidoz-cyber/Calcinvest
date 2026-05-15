/* ============================================================
   CalcInvest — Core Fiscalité Trading FR
   PFU 30 % vs option IR · CTO vs PEA · Trader occasionnel vs habituel
   Imputation moins-values · Comparateur scénarios
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  // Barème IR français 2025 (revenus 2024)
  // Source : impots.gouv.fr
  const IR_BRACKETS = [
    { from: 0,      to: 11497,  rate: 0    },
    { from: 11497,  to: 29315,  rate: 0.11 },
    { from: 29315,  to: 83823,  rate: 0.30 },
    { from: 83823,  to: 180294, rate: 0.41 },
    { from: 180294, to: Infinity, rate: 0.45 }
  ];

  /**
   * Calcule l'IR sur un revenu donné selon le barème progressif.
   * Si quotient_familial > 1, applique le QF.
   */
  function calcIR(revenue, qf) {
    qf = num(qf, 1);
    const perPart = revenue / qf;
    let ir = 0;
    for (const b of IR_BRACKETS) {
      if (perPart <= b.from) break;
      const taxableInBracket = Math.min(perPart, b.to) - b.from;
      ir += taxableInBracket * b.rate;
    }
    return ir * qf;
  }

  /**
   * TMI (tranche marginale d'imposition) selon un revenu et QF.
   */
  function getTMI(revenue, qf) {
    const perPart = revenue / num(qf, 1);
    for (const b of IR_BRACKETS) {
      if (perPart >= b.from && perPart < b.to) return b.rate * 100;
    }
    return 45;
  }

  /**
   * Compare PFU 30 % vs option IR sur une plus-value de trading.
   *
   * @param {Object} p
   * @param {number} p.plusValue       PV totale de l'année (gains − pertes)
   * @param {number} p.otherRevenue    autres revenus du foyer (salaire net imposable, etc.)
   * @param {number} p.qf              quotient familial (parts)
   *
   * @returns {Object}
   */
  function pfuVsIR(p) {
    const pv = num(p.plusValue, 0);
    const otherRev = num(p.otherRevenue, 35000);
    const qf = num(p.qf, 1);

    if (pv <= 0) {
      return { error: 'Pas de plus-value à imposer (utilisez l\'imputation des moins-values)' };
    }

    // ─── PFU (flat tax 30 %) ───
    const pfuIR = pv * 0.128;  // 12.8 % IR
    const pfuPS = pv * 0.172;  // 17.2 % PS
    const pfuTotal = pfuIR + pfuPS;

    // ─── Option IR (barème progressif) ───
    // L'option IR = PV ajoutée aux revenus, taxée au barème, MAIS toujours 17.2 % PS
    const irBase = calcIR(otherRev, qf);
    const irWithPv = calcIR(otherRev + pv, qf);
    const irOnPv = irWithPv - irBase;
    const psOnPv = pv * 0.172;
    const irTotal = irOnPv + psOnPv;

    // ─── Comparaison ───
    const winner = pfuTotal <= irTotal ? 'PFU' : 'IR';
    const savings = Math.abs(pfuTotal - irTotal);

    return {
      plusValue: pv,
      pfu: {
        ir: pfuIR,
        ps: pfuPS,
        total: pfuTotal,
        netGain: pv - pfuTotal,
        effectiveRate: (pfuTotal / pv) * 100
      },
      ir: {
        ir: irOnPv,
        ps: psOnPv,
        total: irTotal,
        netGain: pv - irTotal,
        effectiveRate: (irTotal / pv) * 100
      },
      winner,
      savings,
      tmiBefore: getTMI(otherRev, qf),
      tmiAfter:  getTMI(otherRev + pv, qf)
    };
  }

  /**
   * Compare CTO (PFU 30 %) vs PEA (exonéré après 5 ans, hors PS 17.2 %).
   *
   * @param {Object} p
   * @param {number} p.plusValue
   * @param {number} p.yearsHeld    durée détention PEA
   */
  function ctoVsPEA(p) {
    const pv = num(p.plusValue, 10000);
    const yrs = num(p.yearsHeld, 6);

    // CTO PFU
    const ctoIR = pv * 0.128;
    const ctoPS = pv * 0.172;
    const ctoTotal = ctoIR + ctoPS;

    // PEA
    let peaIR = 0, peaPS = pv * 0.172;
    if (yrs < 5) {
      // Avant 5 ans : retrait = clôture, IR 12.8 %
      peaIR = pv * 0.128;
    }
    // Après 5 ans : exonération IR ; mais PS toujours dus
    const peaTotal = peaIR + peaPS;

    return {
      cto: { ir: ctoIR, ps: ctoPS, total: ctoTotal, netGain: pv - ctoTotal },
      pea: { ir: peaIR, ps: peaPS, total: peaTotal, netGain: pv - peaTotal, eligible: yrs >= 5 },
      savings: Math.abs(ctoTotal - peaTotal),
      winner: peaTotal <= ctoTotal ? 'PEA' : 'CTO',
      yearsHeld: yrs,
      plusValue: pv,
      // Limites PEA
      peaPlafond: 150000  // info
    };
  }

  /**
   * Statut occasionnel vs habituel (BIC professionnel).
   * Pas un calcul exact (dépend de la jurisprudence), mais alerte sur les seuils.
   */
  function statutOccasionnelVsHabituel(p) {
    const nbTrades   = num(p.nbTrades, 50);     // nb de trades/an
    const turnover   = num(p.turnover, 50000);   // volume total échangé
    const profit     = num(p.profit, 5000);      // bénéfice annuel
    const isPrincipal = !!p.isPrincipalActivity;

    // Critères jurisprudence (approximatifs)
    const flags = [];
    if (nbTrades > 200) flags.push('Plus de 200 trades/an');
    if (turnover > 200000) flags.push('Volume échangé > 200 k€');
    if (isPrincipal) flags.push('Activité déclarée comme principale');
    if (profit > 30000) flags.push('Bénéfices > 30 k€/an');

    const risk = flags.length;
    let verdict, regime;
    if (risk === 0) {
      verdict = 'Occasionnel — PFU 30 % (ou option IR)';
      regime = 'occasionnel';
    } else if (risk === 1 || risk === 2) {
      verdict = 'Zone grise — vérifier avec un fiscaliste';
      regime = 'gris';
    } else {
      verdict = 'Habituel — risque de requalification en BIC professionnel';
      regime = 'habituel';
    }

    // Si BIC pro : impôt = IR + cotisations sociales URSSAF (~22-45 % des bénéfices)
    let ratesBIC = null;
    if (regime === 'habituel') {
      ratesBIC = {
        urssaf: 0.22,           // micro-entreprise : ~22 %
        irMargnal: 0.30,        // estimation TMI
        totalApprox: 0.45       // total ~45 %
      };
    }

    return {
      nbTrades, turnover, profit, isPrincipal,
      flags,
      risk,
      verdict,
      regime,
      ratesBIC
    };
  }

  /**
   * Imputation des moins-values : combien de gains futurs sont déductibles
   * de pertes antérieures. Report 10 ans.
   */
  function imputationMV(p) {
    const lossesByYear = p.lossesByYear || []; // [{year, loss}]
    const currentGain  = num(p.currentGain, 0);
    const currentYear  = num(p.currentYear, 2025);

    // Reportable : pertes des 10 dernières années
    const reportable = lossesByYear
      .filter(l => currentYear - l.year <= 10 && l.year <= currentYear)
      .reduce((s, l) => s + Math.abs(l.loss), 0);

    const offsetUsed = Math.min(reportable, currentGain);
    const taxableGain = Math.max(0, currentGain - offsetUsed);
    const remainingLoss = Math.max(0, reportable - currentGain);

    return {
      currentGain,
      totalLossesAvailable: reportable,
      offsetUsed,
      taxableGain,
      remainingLossCarried: remainingLoss,
      taxSavingsApprox: offsetUsed * 0.30 // ~30 % d'IR+PS économisés
    };
  }

  const api = { calcIR, getTMI, pfuVsIR, ctoVsPEA, statutOccasionnelVsHabituel, imputationMV, IR_BRACKETS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.FISCAT = api;
  }

})(typeof window !== 'undefined' ? window : global);
