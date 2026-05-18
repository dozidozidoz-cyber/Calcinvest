/* ============================================================
   CalcInvest — Core Décumulation
   Simule le RETRAIT d'un capital placé (l'opposé du DCA).
   Réponse à : "Mon capital de 500k tient-il 30 ans à 3000€/mois ?"
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  /**
   * Simulation déterministe : capital fixe, retrait mensuel constant
   * (optionnellement indexé inflation), rendement annuel constant.
   */
  function decumulationDeterministe(p) {
    const K0 = num(p.capital, 500000);
    const retraitMensuel = num(p.retraitMensuel, 2000);
    const rendementAnnuel = num(p.rendementAnnuel, 5) / 100;
    const inflation = num(p.inflation, 2) / 100;
    const dureeMax = Math.max(1, num(p.dureeMax, 40));
    const indexeInflation = p.indexeInflation !== false;

    const rMonthly = Math.pow(1 + rendementAnnuel, 1/12) - 1;
    const inflMonthly = Math.pow(1 + inflation, 1/12) - 1;

    let capital = K0;
    let retrait = retraitMensuel;
    let totalRetire = 0;
    const serie = [{ month: 0, capital, retraitDuMois: 0, cumRetire: 0, retraitReel: retrait }];

    let monthsToZero = null;
    for (let m = 1; m <= dureeMax * 12; m++) {
      // Croissance du capital
      capital = capital * (1 + rMonthly);
      // Retrait
      const realRetrait = Math.min(retrait, Math.max(0, capital));
      capital -= realRetrait;
      totalRetire += realRetrait;
      // Indexation
      if (indexeInflation) retrait = retrait * (1 + inflMonthly);

      serie.push({ month: m, capital, retraitDuMois: realRetrait, cumRetire: totalRetire, retraitReel: retrait });
      if (capital <= 0 && monthsToZero === null) {
        monthsToZero = m;
      }
    }

    const finalCapital = capital;
    const yearsToZero = monthsToZero ? monthsToZero / 12 : null;
    const survie = monthsToZero === null ? 'illimitée' : (yearsToZero.toFixed(1) + ' ans');

    return {
      K0, retraitMensuel, rendementAnnuel: rendementAnnuel * 100,
      inflation: inflation * 100,
      finalCapital,
      totalRetire,
      monthsToZero, yearsToZero,
      epuise: monthsToZero !== null,
      survie,
      serie
    };
  }

  /**
   * Safe Withdrawal Rate : combien retirer pour tenir N années avec 95 % de réussite ?
   * Approche : Monte Carlo bootstrap des rendements historiques (S&P 500 + bonds)
   * Simplifié ici sans bootstrap → utilise des rendements normaux.
   */
  function safeWithdrawalRate(p) {
    const K0 = num(p.capital, 500000);
    const annees = Math.max(1, num(p.annees, 30));
    const allocStocks = num(p.allocStocks, 60) / 100;
    const allocBonds = 1 - allocStocks;
    const inflation = num(p.inflation, 2) / 100;

    // Hypothèses historiques (Trinity Study) : stocks 7% réel, bonds 2% réel
    const stockMean = 0.07, stockStd = 0.18;
    const bondMean = 0.02, bondStd = 0.07;

    // Cherche la plus haute SWR qui survit dans X % des scénarios
    const trials = 1000;
    function survives(swrPct) {
      let success = 0;
      for (let t = 0; t < trials; t++) {
        let cap = K0;
        let retrait = K0 * swrPct;
        let alive = true;
        for (let y = 0; y < annees; y++) {
          const rs = stockMean + stockStd * gauss();
          const rb = bondMean + bondStd * gauss();
          const r = allocStocks * rs + allocBonds * rb;
          cap = cap * (1 + r) - retrait;
          retrait = retrait * (1 + inflation);
          if (cap <= 0) { alive = false; break; }
        }
        if (alive) success++;
      }
      return success / trials;
    }

    // Binary search SWR entre 1 % et 8 %
    let lo = 0.01, hi = 0.10, swr = 0.04;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const succ = survives(mid);
      if (succ >= 0.95) lo = mid; else hi = mid;
      swr = lo;
    }
    return {
      swr: swr * 100,
      capitalMin: K0,
      retraitMensuel: K0 * swr / 12,
      retraitAnnuel: K0 * swr,
      annees,
      allocStocks: allocStocks * 100,
      successRate: 95
    };
  }

  // Box-Muller
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Stratégie 3 buckets (cash 2-3y / bonds 5-7y / stocks 15y+)
   * Simule un rebalancing annuel.
   */
  function strategie3Buckets(p) {
    const K0 = num(p.capital, 500000);
    const retraitAnnuel = num(p.retraitAnnuel, 24000);
    const annees = num(p.annees, 30);
    const inflation = num(p.inflation, 2) / 100;

    // Allocation initiale : 10% cash, 30% bonds, 60% stocks
    let cash = K0 * 0.10;
    let bonds = K0 * 0.30;
    let stocks = K0 * 0.60;
    let retrait = retraitAnnuel;
    const serie = [];

    for (let y = 1; y <= annees; y++) {
      // Rendements aléatoires (normal)
      const rStocks = 0.07 + 0.18 * gauss();
      const rBonds = 0.02 + 0.07 * gauss();
      const rCash = 0.025; // taux livret moyen

      stocks *= (1 + rStocks);
      bonds *= (1 + rBonds);
      cash *= (1 + rCash);

      // Retrait depuis le cash bucket
      cash -= retrait;
      // Si cash vide, on tire des bonds
      if (cash < 0) { bonds += cash; cash = 0; }
      if (bonds < 0) { stocks += bonds; bonds = 0; }

      // Rebalancing : si stocks > 60% du total → on rebalance pour reconstituer cash/bonds
      const total = stocks + bonds + cash;
      if (total > 0 && stocks / total > 0.65) {
        const excedent = stocks - total * 0.55;
        stocks -= excedent;
        const ajoutCash = Math.max(0, total * 0.10 - cash);
        cash += Math.min(excedent, ajoutCash);
        bonds += excedent - Math.min(excedent, ajoutCash);
      }

      retrait *= (1 + inflation);
      serie.push({ year: y, cash, bonds, stocks, total: cash + bonds + stocks });

      if (cash + bonds + stocks <= 0) break;
    }

    return {
      finalTotal: cash + bonds + stocks,
      serie,
      survival: serie.length === annees ? 'OK' : ('épuisé an ' + serie.length)
    };
  }

  const api = { decumulationDeterministe, safeWithdrawalRate, strategie3Buckets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.DECUM = api;
})(typeof window !== 'undefined' ? window : globalThis);
