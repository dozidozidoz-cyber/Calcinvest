/* ============================================================
   CalcInvest — Core Monte Carlo Trading
   Simule N trajectoires d'un système de trading
   Distribution des drawdowns, courbes équité percentiles,
   probabilité d'atteindre l'objectif.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  /**
   * RNG seedé pour reproductibilité
   */
  function seededRNG(seed) {
    let s = seed || 42;
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  /**
   * Simule une trajectoire unique de N trades.
   * Chaque trade : win avec proba WR (gain = avg_win × balance × risk%),
   * loss sinon (perte = avg_loss × balance × risk%).
   * Risk% peut être fixed-fractional (= % du solde courant).
   */
  function simulateOnePath(p, rng) {
    const winRate    = p.winRate / 100;
    const rrRatio    = p.rrRatio;
    const riskPct    = p.riskPct / 100;
    const numTrades  = p.numTrades;
    const startBal   = p.startBalance;

    let balance = startBal;
    let peak = startBal;
    let maxDD = 0;
    let trades = [balance];
    let nWins = 0, nLosses = 0;
    let consecLosses = 0, maxConsecLosses = 0;

    for (let i = 0; i < numTrades; i++) {
      const risk = balance * riskPct;
      if (rng() < winRate) {
        balance += risk * rrRatio;
        nWins++;
        consecLosses = 0;
      } else {
        balance -= risk;
        nLosses++;
        consecLosses++;
        if (consecLosses > maxConsecLosses) maxConsecLosses = consecLosses;
      }
      // Ruine = compte sous 10 % du capital initial
      if (balance < startBal * 0.1) {
        // On garde le compte ouvert pour la fin mais on log "ruin"
      }
      if (balance > peak) peak = balance;
      const dd = (peak - balance) / peak;
      if (dd > maxDD) maxDD = dd;
      trades.push(balance);
    }

    return {
      finalBalance: balance,
      peak,
      maxDDPct: maxDD * 100,
      nWins,
      nLosses,
      maxConsecLosses,
      trades,
      ruined: balance < startBal * 0.5  // ruine = perte de 50 %
    };
  }

  /**
   * Lance N simulations et agrège les statistiques.
   *
   * @param {Object} p
   * @param {number} p.winRate     %
   * @param {number} p.rrRatio
   * @param {number} p.riskPct     % du solde par trade (fixed-fractional)
   * @param {number} p.numTrades   horizon
   * @param {number} p.startBalance
   * @param {number} [p.numSims=2000]
   * @param {number} [p.targetBalance]  objectif optionnel
   */
  function monteCarlo(p) {
    const numSims = Math.max(100, Math.min(5000, num(p.numSims, 2000)));
    const target = num(p.targetBalance, 0);
    const rng = seededRNG(42);

    const results = [];
    for (let i = 0; i < numSims; i++) {
      results.push(simulateOnePath(p, rng));
    }

    // ─── Stats agrégées ───
    const finals = results.map(r => r.finalBalance).sort((a, b) => a - b);
    const maxDDs = results.map(r => r.maxDDPct).sort((a, b) => a - b);

    function percentile(arr, pct) {
      const idx = Math.floor(arr.length * pct);
      return arr[Math.max(0, Math.min(arr.length - 1, idx))];
    }

    const startBal = p.startBalance;
    const probRuin = (results.filter(r => r.ruined).length / numSims) * 100;
    const probTarget = target > 0
      ? (results.filter(r => r.finalBalance >= target).length / numSims) * 100
      : null;

    // Trajectoires pour le graphe : médiane + percentiles 5 / 25 / 75 / 95
    const numCheckpoints = Math.min(100, p.numTrades);
    const step = Math.floor(p.numTrades / numCheckpoints);
    const checkpoints = [];
    for (let t = 0; t <= p.numTrades; t += Math.max(1, step)) {
      const valuesAtT = results.map(r => r.trades[t] || r.trades[r.trades.length - 1]).sort((a, b) => a - b);
      checkpoints.push({
        trade: t,
        p5:  percentile(valuesAtT, 0.05),
        p25: percentile(valuesAtT, 0.25),
        p50: percentile(valuesAtT, 0.50),
        p75: percentile(valuesAtT, 0.75),
        p95: percentile(valuesAtT, 0.95)
      });
    }

    return {
      numSims,
      numTrades: p.numTrades,
      startBalance: startBal,
      // Distribution des soldes finaux
      finalP5:  finals[Math.floor(numSims * 0.05)],
      finalP25: finals[Math.floor(numSims * 0.25)],
      finalP50: finals[Math.floor(numSims * 0.50)],
      finalP75: finals[Math.floor(numSims * 0.75)],
      finalP95: finals[Math.floor(numSims * 0.95)],
      finalMean: finals.reduce((s, v) => s + v, 0) / numSims,
      // Distribution drawdowns
      maxDDP50: maxDDs[Math.floor(numSims * 0.50)],
      maxDDP75: maxDDs[Math.floor(numSims * 0.75)],
      maxDDP95: maxDDs[Math.floor(numSims * 0.95)],
      maxDDMax: maxDDs[numSims - 1],
      // Probabilités
      probRuin,
      probTarget,
      probLoss: (results.filter(r => r.finalBalance < startBal).length / numSims) * 100,
      probDouble: (results.filter(r => r.finalBalance >= startBal * 2).length / numSims) * 100,
      probTriple: (results.filter(r => r.finalBalance >= startBal * 3).length / numSims) * 100,
      // Pour le chart
      checkpoints,
      // Streak max moyen
      avgMaxConsecLosses: results.reduce((s, r) => s + r.maxConsecLosses, 0) / numSims
    };
  }

  /**
   * Heatmap : pour différents WR × R/R, donne le % de simulations profitables.
   * Plus léger (200 sims par cellule).
   */
  function heatmapWRvsRR(p) {
    const wrValues = [40, 45, 50, 55, 60, 65, 70];
    const rrValues = [0.5, 1, 1.5, 2, 2.5, 3];
    const cells = [];

    wrValues.forEach(wr => {
      const row = [];
      rrValues.forEach(rr => {
        const r = monteCarlo({
          ...p, winRate: wr, rrRatio: rr, numSims: 200
        });
        row.push({
          wr, rr,
          profitable: 100 - r.probLoss,
          ruin: r.probRuin,
          medianGain: ((r.finalP50 - p.startBalance) / p.startBalance) * 100
        });
      });
      cells.push(row);
    });

    return { wrValues, rrValues, cells };
  }

  const api = { monteCarlo, heatmapWRvsRR, simulateOnePath };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.MCTRADE = api;
  }

})(typeof window !== 'undefined' ? window : global);
