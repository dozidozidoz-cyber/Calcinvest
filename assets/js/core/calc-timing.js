/* ============================================================
   CalcInvest — Backtest stratégies de timing

   Compare 5 stratégies vs Buy & Hold sur la même période :

   1. Buy & Hold (référence) — investi 100 % du temps
   2. Golden Cross — long si MA50 > MA200, cash sinon
   3. Exit < MA200 — long si prix > MA200, cash sinon (Faber GTAA simplifié)
   4. RSI mensuel — DCA classique mais double l'achat si RSI < 30
   5. Faber GTAA momentum — long si return 12m > 0, cash sinon
   6. Volatility target — réduit exposition si vol > seuil

   Tous démarrent avec K0 + versement mensuel.
   Cash hors marché rémunéré à 2 %/an (Livret A).

   Renvoie pour chaque stratégie : finalValue, CAGR, maxDD, Sharpe,
   nbTrades, tempsHorsMarché, equityCurve.
   ============================================================ */
(function (global) {
  'use strict';

  function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
  function stdev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
  }

  const CASH_ANNUAL = 0.02; // Livret A
  function monthlyCashRate() { return Math.pow(1 + CASH_ANNUAL, 1/12) - 1; }

  /**
   * Calcule moyenne mobile à l'index idx sur period mois.
   */
  function ma(prices, idx, period) {
    if (idx < period - 1) return null;
    let s = 0;
    for (let i = idx - period + 1; i <= idx; i++) s += prices[i];
    return s / period;
  }

  /**
   * RSI 14 mois (utilise returns mensuels).
   */
  function rsi(prices, idx, period) {
    period = period || 14;
    if (idx < period) return null;
    let gains = 0, losses = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
      const ret = prices[i] - prices[i-1];
      if (ret > 0) gains += ret; else losses -= ret;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - 100 / (1 + rs);
  }

  /**
   * Backtest générique. La fonction signal(idx) renvoie l'exposition cible (0-1).
   */
  function backtestStrategy(name, prices, K0, monthly, signalFn) {
    let inMarket = K0;       // capital investi
    let inCash = 0;          // capital hors marché
    let invested = inMarket > 0;
    let totalIn = K0;
    let nbTrades = 0;
    let monthsOutOfMarket = 0;
    const equityCurve = [{ month: 0, value: K0, totalIn: K0, inMarket, inCash }];
    const cashMonthlyRate = monthlyCashRate();

    for (let m = 1; m < prices.length; m++) {
      const stockRet = prices[m] / prices[m-1] - 1;

      // Returns selon l'état actuel
      inMarket *= (1 + stockRet);
      inCash *= (1 + cashMonthlyRate);

      // Décision basée sur signal au mois précédent
      const signal = signalFn(m - 1); // exposition cible 0-1

      // Versement mensuel : alloué selon signal
      if (monthly > 0) {
        inMarket += monthly * signal;
        inCash += monthly * (1 - signal);
        totalIn += monthly;
      }

      // Rebalancing exposition (si signal change drastiquement)
      const totalCap = inMarket + inCash;
      const currentExpo = totalCap > 0 ? inMarket / totalCap : 0;
      if (Math.abs(currentExpo - signal) > 0.1) {
        nbTrades++;
        inMarket = totalCap * signal;
        inCash = totalCap * (1 - signal);
      }

      if (signal < 0.5) monthsOutOfMarket++;

      equityCurve.push({
        month: m,
        value: inMarket + inCash,
        totalIn,
        inMarket,
        inCash
      });
    }

    const values = equityCurve.map(p => p.value);
    const finalValue = values[values.length - 1];
    const years = (prices.length - 1) / 12;
    const cagr = years > 0 ? (Math.pow(finalValue / K0, 1 / years) - 1) * 100 : 0;
    let peak = -Infinity, maxDD = 0;
    values.forEach(v => {
      if (v > peak) peak = v;
      const dd = (v - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    });
    const monthlyReturns = [];
    for (let i = 1; i < values.length; i++) {
      monthlyReturns.push(values[i] / values[i-1] - 1);
    }
    const annualVol = stdev(monthlyReturns) * Math.sqrt(12) * 100;
    const sharpe = annualVol > 0 ? ((cagr - 2) / annualVol) : 0;

    return {
      name,
      finalValue,
      totalInvested: totalIn,
      gain: finalValue - totalIn,
      cagr,
      annualVol,
      maxDrawdown: maxDD * 100,
      sharpe,
      nbTrades,
      monthsOutOfMarket,
      pctOutOfMarket: prices.length > 0 ? (monthsOutOfMarket / prices.length * 100) : 0,
      equityCurve
    };
  }

  /**
   * Exécute toutes les stratégies sur la même série.
   */
  function compareAll(p) {
    const prices = p.prices || [];
    const K0 = Number(p.K0) || 10000;
    const monthly = Number(p.monthly) || 0;

    if (prices.length < 24) {
      return { error: 'Pas assez de données (min 24 mois)' };
    }

    const results = {};

    // 1. Buy & Hold
    results.buyhold = backtestStrategy('Buy & Hold', prices, K0, monthly, () => 1);

    // 2. Golden Cross MA50/MA200 (proxy mensuel : MA2.5 ≈ 50 jours, MA10 ≈ 200 jours)
    results.golden_cross = backtestStrategy('Golden Cross', prices, K0, monthly, (idx) => {
      const ma50  = ma(prices, idx, 3);
      const ma200 = ma(prices, idx, 10);
      if (ma50 == null || ma200 == null) return 1;
      return ma50 > ma200 ? 1 : 0;
    });

    // 3. Exit < MA200 (Faber GTAA simplifié)
    results.faber = backtestStrategy('Faber GTAA', prices, K0, monthly, (idx) => {
      const ma200 = ma(prices, idx, 10);
      if (ma200 == null) return 1;
      return prices[idx] > ma200 ? 1 : 0;
    });

    // 4. Momentum 12m
    results.momentum_12m = backtestStrategy('Momentum 12m', prices, K0, monthly, (idx) => {
      if (idx < 12) return 1;
      const ret12 = prices[idx] / prices[idx - 12] - 1;
      return ret12 > 0 ? 1 : 0;
    });

    // 5. RSI mensuel — long si RSI > 30 (sort en survente extrême)
    results.rsi_oversold = backtestStrategy('RSI mensuel', prices, K0, monthly, (idx) => {
      const r = rsi(prices, idx, 14);
      if (r == null) return 1;
      if (r < 30) return 1;   // suracheté pas, on RESTE long
      if (r > 75) return 0.5; // sur-acheté, réduit
      return 1;
    });

    // 6. Volatility target — réduit si vol annualisée > 20 %
    results.vol_target = backtestStrategy('Volatility Target', prices, K0, monthly, (idx) => {
      if (idx < 12) return 1;
      const rets = [];
      for (let i = idx - 11; i <= idx; i++) rets.push(prices[i] / prices[i-1] - 1);
      const annVol = stdev(rets) * Math.sqrt(12);
      if (annVol > 0.25) return 0.5;
      if (annVol > 0.20) return 0.75;
      return 1;
    });

    return results;
  }

  const STRATEGY_META = {
    buyhold:      { name: 'Buy & Hold',         color: '#3B82F6', desc: 'Référence. Investi 100 % du temps.' },
    golden_cross: { name: 'Golden Cross',       color: '#10B981', desc: 'Long si MA50 > MA200, cash sinon. Classique TA.' },
    faber:        { name: 'Faber GTAA',         color: '#F97316', desc: 'Long si prix > MA200. Sort des bear markets.' },
    momentum_12m: { name: 'Momentum 12m',       color: '#D97706', desc: 'Long si return 12m > 0. Trend-following pur.' },
    rsi_oversold: { name: 'RSI mensuel',        color: '#A855F7', desc: 'Réduit exposition si RSI mensuel > 75 (suracheté).' },
    vol_target:   { name: 'Volatility Target',  color: '#EC4899', desc: 'Réduit exposition si volatilité 12m > 20 %.' }
  };

  const api = { compareAll, backtestStrategy, ma, rsi, STRATEGY_META };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TIMING = api;
})(typeof window !== 'undefined' ? window : globalThis);
