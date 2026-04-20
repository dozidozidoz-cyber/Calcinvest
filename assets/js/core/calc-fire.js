/* ============================================================
   CalcInvest — Calc FIRE (CORE, pure)
   Financial Independence, Retire Early
   ZÉRO accès au DOM. Portable Node.js / tests.
   ============================================================ */

(function (global) {
  'use strict';

  const FIN = global.FIN || require('./finance-utils.js');

  /* ------------------------------------------------------------------ */
  /* Helpers                                                               */
  /* ------------------------------------------------------------------ */

  function monthlyRate(annualRate) {
    return Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  }

  function fvAfterMonths(initial, monthly, rMonthly, months) {
    let v = initial;
    for (let m = 0; m < months; m++) {
      v = (v + monthly) * (1 + rMonthly);
    }
    return v;
  }

  /* ------------------------------------------------------------------ */
  /* calcFIRE — simulation principale                                      */
  /* ------------------------------------------------------------------ */
  /**
   * @param {object} p
   *   p.currentAge        {number}  Âge actuel
   *   p.targetAge         {number}  Âge cible FIRE (optionnel, sinon calculé)
   *   p.annualExpenses    {number}  Dépenses annuelles en retraite (€)
   *   p.currentSavings    {number}  Capital actuel (€)
   *   p.monthlyContrib    {number}  Versement mensuel actuel (€)
   *   p.annualReturn      {number}  Rendement (%/an)
   *   p.withdrawalRate    {number}  Taux de retrait (%/an) — défaut 4
   *   p.inflation         {number}  Inflation (%/an)
   *   p.safetyMargin      {number}  Marge de sécurité (% au-dessus de la règle)
   */
  function calcFIRE(p) {
    const annualReturn   = p.annualReturn   || 7;
    const withdrawalRate = (p.withdrawalRate || 4) / 100;
    const inflation      = p.inflation      || 2;
    const safetyMargin   = (p.safetyMargin  || 0) / 100;
    const currentAge     = p.currentAge     || 30;
    const annualExpenses = p.annualExpenses  || 30000;
    const currentSavings = p.currentSavings  || 0;
    const monthlyContrib = p.monthlyContrib  || 1000;

    const r = monthlyRate(annualReturn);

    // Capital cible (règle du taux de retrait, + marge)
    const fireTarget = (annualExpenses / withdrawalRate) * (1 + safetyMargin);

    // Variantes FIRE
    const leanTarget  = (annualExpenses * 0.7)  / withdrawalRate;
    const fatTarget   = (annualExpenses * 1.5)  / withdrawalRate;
    const baristaTarget = (annualExpenses * 0.5) / withdrawalRate; // mi-temps en retraite

    // Simulation mensuelle jusqu'à atteindre la cible (max 600 mois / 50 ans)
    let value         = currentSavings;
    let months        = 0;
    const trajectory  = [{ month: 0, value: currentSavings, invested: currentSavings }];
    let totalInvested = currentSavings;

    while (value < fireTarget && months < 600) {
      value = (value + monthlyContrib) * (1 + r);
      totalInvested += monthlyContrib;
      months++;
      // Enregistrer seulement les points annuels
      if (months % 12 === 0) {
        trajectory.push({ month: months, value, invested: totalInvested });
      }
    }

    const fireAge         = currentAge + months / 12;
    const yearsToFire     = months / 12;
    const finalValue      = value;
    const totalContributed = totalInvested;
    const achieved        = value >= fireTarget;

    // Mois pour les variantes
    let mLean = 0, vLean = currentSavings;
    while (vLean < leanTarget && mLean < 600) { vLean = (vLean + monthlyContrib) * (1 + r); mLean++; }
    let mFat = 0, vFat = currentSavings;
    while (vFat < fatTarget && mFat < 600) { vFat = (vFat + monthlyContrib) * (1 + r); mFat++; }
    let mBarista = 0, vBarista = currentSavings;
    while (vBarista < baristaTarget && mBarista < 600) { vBarista = (vBarista + monthlyContrib) * (1 + r); mBarista++; }

    // Coast FIRE : capital nécessaire MAINTENANT pour atteindre la cible sans verser
    const coastCapital = fireTarget / Math.pow(1 + annualReturn / 100, yearsToFire || 20);
    const isCoastFIRE  = currentSavings >= coastCapital;

    // Simulation phase de retrait : combien d'années avant épuisement ?
    const withdrawalSimulation = simulateWithdrawal(
      fireTarget, annualExpenses, annualReturn, inflation, 50
    );

    return {
      // Cibles
      fireTarget, leanTarget, fatTarget, baristaTarget, coastCapital,

      // Résultat principal
      fireAge, yearsToFire, finalValue, totalContributed, achieved,
      isCoastFIRE,

      // Variantes
      leanAge:    currentAge + mLean / 12,
      fatAge:     currentAge + mFat  / 12,
      baristaAge: currentAge + mBarista / 12,
      leanYears:  mLean / 12,
      fatYears:   mFat  / 12,
      baristaYears: mBarista / 12,

      // Trajectoire annuelle
      trajectory,

      // Phase retrait
      withdrawalSimulation,

      // Paramètres exposés
      withdrawalRate: withdrawalRate * 100,
      annualReturn,
      inflation
    };
  }

  /* ------------------------------------------------------------------ */
  /* simulateWithdrawal — phase de décaissement                           */
  /* ------------------------------------------------------------------ */
  /**
   * Simule la phase de retrait jusqu'à épuisement ou 50 ans.
   * Dépenses indexées sur l'inflation.
   */
  function simulateWithdrawal(capital, annualExpenses, annualReturn, inflation, maxYears) {
    const r    = monthlyRate(annualReturn);
    const rInf = inflation / 100 / 12;
    let   v    = capital;
    let   exp  = annualExpenses / 12;
    const pts  = [{ year: 0, value: capital, expenses: annualExpenses }];

    for (let y = 1; y <= maxYears; y++) {
      for (let m = 0; m < 12; m++) {
        v   = v * (1 + r) - exp;
        exp = exp * (1 + rInf);
        if (v <= 0) { v = 0; break; }
      }
      pts.push({ year: y, value: Math.max(0, v), expenses: exp * 12 });
      if (v <= 0) break;
    }

    const depleted     = v <= 0;
    const depletedYear = depleted ? pts.findIndex((p) => p.value === 0) : null;

    return { pts, depleted, depletedYear, finalValue: v };
  }

  /* ------------------------------------------------------------------ */
  /* calcFireSensitivity — analyse de sensibilité                         */
  /* ------------------------------------------------------------------ */
  /**
   * Pour différents taux de rendement et taux de retrait,
   * calcule les années pour atteindre FIRE.
   */
  function calcFireSensitivity(p) {
    const returns  = [4, 5, 6, 7, 8, 9, 10];
    const rates    = [3, 3.5, 4, 4.5, 5];

    return {
      byReturn: returns.map((ret) => {
        const r = calcFIRE({ ...p, annualReturn: ret });
        return { return: ret, years: r.yearsToFire, age: r.fireAge, target: r.fireTarget };
      }),
      byWithdrawal: rates.map((wr) => {
        const r = calcFIRE({ ...p, withdrawalRate: wr });
        return { rate: wr, years: r.yearsToFire, target: r.fireTarget, age: r.fireAge };
      })
    };
  }

  /* ------------------------------------------------------------------ */
  /* calcMonteCarloFIRE — simulation Monte Carlo phase retrait            */
  /* ------------------------------------------------------------------ */
  /**
   * Bootstrap sur rendements historiques S&P 500 (passés en paramètre).
   * Retourne le % de trajectoires qui survivent jusqu'à `years` ans.
   */
  function calcMonteCarloFIRE(capital, annualExpenses, monthlyReturns, years, runs) {
    runs  = runs  || 1000;
    years = years || 30;
    const months = years * 12;
    const n      = monthlyReturns.length;
    let   success = 0;

    const trajectories = [];
    const trackEvery   = Math.max(1, Math.floor(runs / 20)); // 20 trajectoires à afficher

    for (let sim = 0; sim < runs; sim++) {
      let v = capital;
      const monthlyExp = annualExpenses / 12;
      const pts = sim % trackEvery === 0 ? [capital] : null;

      for (let m = 0; m < months; m++) {
        const ret = monthlyReturns[Math.floor(Math.random() * n)];
        v = v * (1 + ret) - monthlyExp;
        if (pts) pts.push(Math.max(0, v));
        if (v <= 0) { v = 0; break; }
      }
      if (v > 0) success++;
      if (pts) trajectories.push(pts);
    }

    const successRate = (success / runs) * 100;

    // Percentiles à chaque année
    const percentiles = [];
    for (let y = 0; y <= years; y++) {
      const idx  = y * 12;
      const vals = trajectories.map((t) => t[Math.min(idx, t.length - 1)] || 0).sort((a, b) => a - b);
      const p10  = vals[Math.floor(vals.length * 0.1)];
      const p50  = vals[Math.floor(vals.length * 0.5)];
      const p90  = vals[Math.floor(vals.length * 0.9)];
      percentiles.push({ year: y, p10, p50, p90 });
    }

    return { successRate, runs, trajectories, percentiles };
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                               */
  /* ------------------------------------------------------------------ */
  const mod = { calcFIRE, simulateWithdrawal, calcFireSensitivity, calcMonteCarloFIRE };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    global.CalcFIRE = mod;
  }
})(typeof window !== 'undefined' ? window : this);
