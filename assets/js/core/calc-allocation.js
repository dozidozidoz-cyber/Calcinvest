/* ============================================================
   CalcInvest — Backtest Allocations Portefeuille

   Stratégies prédéfinies (proxy historique avec data disponible) :
   - Buy & Hold 100 % stocks (référence)
   - 60/40 (60 % stocks + 40 % bonds, rebalancing annuel)
   - All-Weather Dalio (30 stocks / 40 LT bonds / 15 IT bonds / 7.5 or / 7.5 commodities)
   - Golden Butterfly (20 stocks LC / 20 stocks SC / 20 LT bonds / 20 ST bonds / 20 or)
   - Permanent Portfolio Browne (25 stocks / 25 LT bonds / 25 or / 25 cash)
   - Custom (user-defined weights)

   Rebalancing : annuel (par défaut), trimestriel, ou jamais.
   Période : selon data disponible.

   Proxy "bonds" : on n'a pas de série bonds historique → on utilise
   un rendement annualisé constant (3-4 % typique LT, 1.5-2 % cash).
   Pour les vrais geeks, on pourrait ajouter un fetch TLT/IEF, mais
   ça nécessite un appel API en plus.
   ============================================================ */
(function (global) {
  'use strict';

  // Hypothèses de rendements pour les classes d'actifs SANS data historique
  // (calibrées sur moyennes historiques longues 1970-2025)
  const PROXY_RETURNS = {
    bondsLT:   { annual: 0.045, monthVol: 0.025 },  // Treasuries long terme
    bondsIT:   { annual: 0.035, monthVol: 0.015 },  // Treasuries intermédiaires
    bondsST:   { annual: 0.025, monthVol: 0.008 },  // Treasuries court terme
    cash:      { annual: 0.020, monthVol: 0.001 },  // Livret type / monétaire
    commodities:{ annual: 0.025, monthVol: 0.060 }  // Bloomberg Commodity Index
  };

  // Box-Muller pour bruit normal (utilisé en proxy bonds/cash)
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Stratégies prédéfinies (poids en %).
   * Les clés correspondent aux classes utilisées dans la simulation.
   */
  const STRATEGIES = {
    'buyhold': {
      name: 'Buy & Hold 100 % actions',
      desc: 'Référence : 100 % S&P 500 sans rebalancing.',
      weights: { stocks: 100 }
    },
    '60_40': {
      name: '60/40 classique',
      desc: '60 % actions + 40 % obligations longues. La référence Bogle.',
      weights: { stocks: 60, bondsLT: 40 }
    },
    'all_weather': {
      name: 'All-Weather (Dalio)',
      desc: 'Conçu pour résister à tous les régimes économiques (croissance/récession × inflation/déflation).',
      weights: { stocks: 30, bondsLT: 40, bondsIT: 15, gold: 7.5, commodities: 7.5 }
    },
    'golden_butterfly': {
      name: 'Golden Butterfly',
      desc: 'Inspiré de Browne, équilibre 5 buckets de 20 % chacun.',
      weights: { stocks: 40, bondsLT: 20, bondsST: 20, gold: 20 }
    },
    'permanent': {
      name: 'Permanent Portfolio (Browne)',
      desc: 'Quatre buckets égaux. Conçu pour la robustesse, pas la performance.',
      weights: { stocks: 25, bondsLT: 25, gold: 25, cash: 25 }
    }
  };

  /**
   * Simule une allocation sur une période donnée.
   *
   * @param {Object} p
   * @param {Object} p.weights       { stocks: 60, bondsLT: 40, ... }  (% — total = 100)
   * @param {Array}  p.pricesStocks  Série mensuelle prix actions (S&P 500)
   * @param {Array}  p.pricesGold    Série mensuelle prix or (optionnel)
   * @param {number} p.K0            Capital initial (€)
   * @param {number} p.monthly       Versement mensuel (€)
   * @param {string} p.rebalancing   'annual' | 'quarterly' | 'never'
   */
  function simulate(p) {
    const weights = normalize(p.weights);
    const months = Math.min(
      (p.pricesStocks || []).length,
      (p.pricesGold || []).length || Infinity
    );
    const K0 = num(p.K0, 10000);
    const monthly = num(p.monthly, 0);
    const rebalanceEvery = p.rebalancing === 'quarterly' ? 3 :
                          p.rebalancing === 'never' ? 99999 : 12;

    if (months < 12) return { error: 'Pas assez de données pour simuler (min 12 mois)' };

    // Initial allocation
    const allocation = {};
    let totalCapital = K0;
    Object.keys(weights).forEach(k => {
      allocation[k] = K0 * (weights[k] / 100);
    });

    const equityCurve = [{ month: 0, value: K0, totalIn: K0 }];
    let totalIn = K0;
    const monthsSinceRebal = { count: 0 };

    for (let m = 1; m < months; m++) {
      // Returns mensuels pour chaque classe
      const returns = {};
      const stockRet = p.pricesStocks[m] / p.pricesStocks[m-1] - 1;
      const goldRet = p.pricesGold ? p.pricesGold[m] / p.pricesGold[m-1] - 1 : 0;
      returns.stocks = stockRet;
      returns.gold = goldRet;
      // Bonds / cash / commodities : proxy
      const monthlyRate = (annual) => Math.pow(1 + annual, 1/12) - 1;
      returns.bondsLT     = monthlyRate(PROXY_RETURNS.bondsLT.annual) + PROXY_RETURNS.bondsLT.monthVol * gauss();
      returns.bondsIT     = monthlyRate(PROXY_RETURNS.bondsIT.annual) + PROXY_RETURNS.bondsIT.monthVol * gauss();
      returns.bondsST     = monthlyRate(PROXY_RETURNS.bondsST.annual) + PROXY_RETURNS.bondsST.monthVol * gauss();
      returns.cash        = monthlyRate(PROXY_RETURNS.cash.annual);
      returns.commodities = monthlyRate(PROXY_RETURNS.commodities.annual) + PROXY_RETURNS.commodities.monthVol * gauss();

      // Appliquer les returns sur chaque bucket
      Object.keys(allocation).forEach(k => {
        allocation[k] = allocation[k] * (1 + (returns[k] || 0));
      });

      // Verser le mensuel proportionnellement aux poids cibles
      if (monthly > 0) {
        Object.keys(weights).forEach(k => {
          allocation[k] = (allocation[k] || 0) + monthly * (weights[k] / 100);
        });
        totalIn += monthly;
      }

      // Rebalancing
      monthsSinceRebal.count++;
      if (monthsSinceRebal.count >= rebalanceEvery) {
        const total = Object.values(allocation).reduce((s, v) => s + v, 0);
        Object.keys(weights).forEach(k => {
          allocation[k] = total * (weights[k] / 100);
        });
        monthsSinceRebal.count = 0;
      }

      totalCapital = Object.values(allocation).reduce((s, v) => s + v, 0);
      equityCurve.push({ month: m, value: totalCapital, totalIn });
    }

    // Stats
    const values = equityCurve.map(p => p.value);
    const finalValue = values[values.length - 1];
    const years = (months - 1) / 12;
    const cagr = years > 0 ? (Math.pow(finalValue / K0, 1 / years) - 1) * 100 : 0;
    let peak = -Infinity, maxDD = 0;
    values.forEach(v => {
      if (v > peak) peak = v;
      const dd = (v - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    });

    // Volatility annualisée (returns mensuels)
    const monthlyReturns = [];
    for (let i = 1; i < values.length; i++) {
      monthlyReturns.push(values[i] / values[i-1] - 1);
    }
    const meanRet = monthlyReturns.reduce((s, r) => s + r, 0) / monthlyReturns.length;
    const variance = monthlyReturns.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / monthlyReturns.length;
    const monthlyStd = Math.sqrt(variance);
    const annualVol = monthlyStd * Math.sqrt(12) * 100;
    const sharpe = annualVol > 0 ? ((cagr - 2) / annualVol) : 0; // risk-free 2 %

    return {
      finalValue,
      totalInvested: totalIn,
      gain: finalValue - totalIn,
      cagr,
      annualVol,
      maxDrawdown: maxDD * 100,
      sharpe,
      equityCurve,
      months,
      years,
      finalAllocation: allocation,
      weights
    };
  }

  /**
   * Compare plusieurs stratégies sur la même période / même capital.
   */
  function compareStrategies(p) {
    const results = {};
    Object.keys(STRATEGIES).forEach(key => {
      const strat = STRATEGIES[key];
      const res = simulate({
        weights: strat.weights,
        pricesStocks: p.pricesStocks,
        pricesGold: p.pricesGold,
        K0: p.K0,
        monthly: p.monthly,
        rebalancing: p.rebalancing
      });
      results[key] = { ...res, name: strat.name, desc: strat.desc };
    });
    return results;
  }

  function normalize(w) {
    const sum = Object.values(w).reduce((s, v) => s + v, 0);
    if (sum === 0) return { stocks: 100 };
    if (Math.abs(sum - 100) < 0.01) return w;
    // Normalise à 100
    const out = {};
    Object.keys(w).forEach(k => { out[k] = w[k] / sum * 100; });
    return out;
  }

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  const api = { simulate, compareStrategies, STRATEGIES, PROXY_RETURNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ALLOC = api;
})(typeof window !== 'undefined' ? window : globalThis);
