/* ============================================================
   CalcInvest — Calc Compound (CORE, pure)
   Intérêts composés : capital initial + versements mensuels
   ZÉRO accès au DOM. Portable Node.js / RN / API.
   ============================================================ */

(function (global) {
  'use strict';

  const FIN = global.FIN || require('./finance-utils.js');

  /**
   * calcCompound(p) — simulation complète
   * @param {number} p.initialAmount   Capital initial (€)
   * @param {number} p.monthlyAmount   Versement mensuel (€)
   * @param {number} p.annualRate      Taux de rendement (%/an)
   * @param {number} p.years           Durée (années)
   * @param {number} p.inflation       Inflation (%/an) — pour valeur réelle
   * @param {number} p.feesPct         Frais annuels (%/an) ex: TER ETF
   */
  function calcCompound(p) {
    const annualRate  = (p.annualRate  || 0) / 100;
    const feesPct     = (p.feesPct    || 0) / 100;
    const inflation   = (p.inflation  || 0) / 100;
    const years       = Math.max(1, Math.floor(p.years || 10));
    const initial     = Math.max(0, p.initialAmount || 0);
    const monthly     = Math.max(0, p.monthlyAmount || 0);

    // Taux net de frais (annuel → mensuel)
    const netAnnualRate = annualRate - feesPct;
    const monthlyRate   = Math.pow(1 + netAnnualRate, 1 / 12) - 1;

    let value         = initial;
    let totalInvested = initial;
    const yearly      = [];

    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) {
        value         += monthly;       // versement début de mois
        totalInvested += monthly;
        value         *= (1 + monthlyRate); // intérêts
      }
      const interest  = value - totalInvested;
      const realValue = inflation > 0 ? value / Math.pow(1 + inflation, y) : value;
      yearly.push({ year: y, value, invested: totalInvested, interest, realValue });
    }

    const finalValue    = yearly[yearly.length - 1].value;
    const finalInvested = yearly[yearly.length - 1].invested;
    const finalInterest = finalValue - finalInvested;
    const multiplier    = finalInvested > 0 ? finalValue / finalInvested : 1;
    const doublingYears = netAnnualRate > 0 ? Math.log(2) / Math.log(1 + netAnnualRate) : null;
    const interestShare = finalValue > 0 ? (finalInterest / finalValue) * 100 : 0;

    // Simulation sans frais (pour comparer le coût des frais)
    let noFeesValue = initial;
    const grossMonthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    for (let y = 0; y < years; y++) {
      for (let m = 0; m < 12; m++) {
        noFeesValue += monthly;
        noFeesValue *= (1 + grossMonthlyRate);
      }
    }
    const feesCost = noFeesValue - finalValue;

    return {
      yearly,
      finalValue, finalInvested, finalInterest,
      multiplier, doublingYears, interestShare,
      netAnnualRate: netAnnualRate * 100,
      noFeesValue, feesCost
    };
  }

  /**
   * calcCompoundMultiRate(p, rates)
   * Même investissement avec plusieurs taux — pour comparaison
   */
  function calcCompoundMultiRate(p, rates) {
    rates = rates || [2, 4, 6, 8, 10, 12];
    return rates.map(function (rate) {
      var r = calcCompound(Object.assign({}, p, { annualRate: rate, feesPct: 0, inflation: 0 }));
      return { rate: rate, finalValue: r.finalValue, finalInvested: r.finalInvested, multiplier: r.multiplier, yearly: r.yearly };
    });
  }

  /**
   * calcGoal(p)
   * Calculateur inversé :
   *   - p.goalAmount + p.years → required monthly (p.monthlyAmount absent)
   *   - p.goalAmount + p.monthlyAmount → years to goal (p.years absent)
   */
  function calcGoal(p) {
    const annualRate = ((p.annualRate || 0) - (p.feesPct || 0)) / 100;
    const r          = Math.pow(1 + annualRate, 1 / 12) - 1;
    const initial    = Math.max(0, p.initialAmount || 0);
    const goal       = Math.max(0, p.goalAmount || 0);

    if (p.years) {
      // Calculer le versement mensuel requis
      const n            = Math.round(p.years * 12);
      const fvInitial    = initial * Math.pow(1 + r, n);
      const remaining    = goal - fvInitial;
      var requiredMonthly;
      if (r <= 0) {
        requiredMonthly = n > 0 ? remaining / n : 0;
      } else {
        // Annuité : FV = pmt * ((1+r)^n - 1) / r * (1+r) [annuité-due, versement début de période]
        const factor    = ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
        requiredMonthly = remaining / factor;
      }
      // Simuler avec ce versement pour vérification
      var sim = requiredMonthly > 0
        ? calcCompound(Object.assign({}, p, { monthlyAmount: requiredMonthly }))
        : null;
      return { mode: 'monthly', requiredMonthly: Math.max(0, requiredMonthly), sim: sim };
    } else {
      // Calculer le nombre d'années pour atteindre l'objectif
      const monthly = Math.max(0, p.monthlyAmount || 0);
      var yearsToGoal;
      if (r <= 0) {
        const totalPerMonth = monthly;
        yearsToGoal = totalPerMonth > 0 ? (goal - initial) / totalPerMonth / 12 : null;
      } else {
        const months = FIN.yearsToGoal(goal, r, monthly, initial);
        yearsToGoal  = (months != null && months > 0) ? months / 12 : null;
      }
      return { mode: 'time', yearsToGoal: yearsToGoal };
    }
  }

  /**
   * calcEarlyStart(p, extraYearsArr)
   * "Et si j'avais commencé N ans plus tôt ?"
   * Pour chaque N dans extraYearsArr, calcule le capital accumulé
   * après p.years + N ans (même versement mensuel, depuis N ans plus tôt)
   */
  function calcEarlyStart(p, extraYearsArr) {
    extraYearsArr = extraYearsArr || [5, 10, 15, 20];
    const horizon = p.years || 20;

    // Baseline: commence aujourd'hui
    const baseline = calcCompound(p);

    return extraYearsArr.map(function (extra) {
      // Commence extra années plus tôt → total years = horizon + extra
      var full = calcCompound(Object.assign({}, p, { years: horizon + extra }));
      // On veut la valeur à l'horizon (pas à horizon+extra)
      // La personne qui a commencé extra ans plus tôt a maintenant extra ans de DCA en plus
      // Donc la valeur "à aujourd'hui" = résultat après extra ans
      // Et "dans horizon ans" = résultat après (horizon + extra) ans
      return {
        extra:          extra,
        valueAtHorizon: full.finalValue,           // valeur au même horizon futur
        invested:       full.finalInvested,
        interest:       full.finalInterest,
        multiplier:     full.multiplier,
        yearly:         full.yearly
      };
    }).concat([{
      extra:          0,
      valueAtHorizon: baseline.finalValue,
      invested:       baseline.finalInvested,
      interest:       baseline.finalInterest,
      multiplier:     baseline.multiplier,
      yearly:         baseline.yearly
    }]).sort(function (a, b) { return a.extra - b.extra; });
  }

  // Export
  const mod = { calcCompound, calcCompoundMultiRate, calcGoal, calcEarlyStart };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    global.CalcCompound = mod;
  }
})(typeof window !== 'undefined' ? window : this);
