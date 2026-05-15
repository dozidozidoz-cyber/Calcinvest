/* ============================================================
   CalcInvest — Core Risk Management Trading
   Position sizing · R/R · Expectancy · Drawdown · Probabilité de ruine
   ============================================================ */
(function (global) {
  'use strict';

  /**
   * Calcule la taille de position selon le risque % et le stop.
   *
   * @param {Object} p
   * @param {number} p.balance      Capital total
   * @param {number} p.riskPct      % du capital risqué (1 = 1 %)
   * @param {number} p.stopPct      Stop loss en % du prix d'entrée
   *                                (ex: 5 = stop à -5 % de l'entrée)
   * @returns {Object} { riskAmount, positionSize, positionPct }
   */
  function positionSizing(p) {
    const balance = num(p.balance, 10000);
    const riskPct = num(p.riskPct, 1) / 100;
    const stopPct = num(p.stopPct, 5) / 100;

    if (stopPct <= 0) return { error: 'Stop loss doit être > 0 %' };

    const riskAmount = balance * riskPct;
    // Position size = montant en € investi
    // Si je risque 100 € et que mon stop est à -5 %, je peux investir 100/0.05 = 2 000 €
    const positionSize = riskAmount / stopPct;
    const positionPct = positionSize / balance * 100;
    const leverage = positionPct / 100;

    return {
      riskAmount,
      positionSize,
      positionPct,
      leverage,
      balance, riskPct: p.riskPct, stopPct: p.stopPct
    };
  }

  /**
   * Calcule l'expectancy d'un système de trading.
   * Expectancy = (Win% × Avg_Win) − (Loss% × Avg_Loss)
   *
   * @param {Object} p
   * @param {number} p.winRate    Taux de réussite en % (50 = 50 %)
   * @param {number} p.avgWin     Gain moyen par trade gagnant (€)
   * @param {number} p.avgLoss    Perte moyenne par trade perdant (€, valeur absolue)
   * @returns {Object}
   */
  function expectancy(p) {
    const wr = num(p.winRate, 50) / 100;
    const aw = num(p.avgWin, 200);
    const al = num(p.avgLoss, 100);

    const expPerTrade = (wr * aw) - ((1 - wr) * al);
    const rrRatio = al > 0 ? aw / al : 0;
    const breakevenWR = al + aw > 0 ? al / (al + aw) * 100 : 0;
    const profitFactor = al > 0 && (1 - wr) > 0 ? (wr * aw) / ((1 - wr) * al) : Infinity;

    return {
      winRate: p.winRate,
      avgWin: aw,
      avgLoss: al,
      rrRatio,
      expectancyPerTrade: expPerTrade,
      breakevenWinRate: breakevenWR,
      profitFactor,
      // Expectancy in R-multiples (perte = 1R)
      expectancyR: al > 0 ? expPerTrade / al : 0
    };
  }

  /**
   * Construit la table breakeven : pour chaque R/R, quel win rate suffit ?
   * Formule : breakeven WR = 1 / (1 + R/R)
   */
  function breakevenTable() {
    const rrValues = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
    return rrValues.map(rr => ({
      rr,
      breakeven: 1 / (1 + rr) * 100,
      // Win rate "confortable" = breakeven + 10 pts pour viser ~+5 % expectancy/trade
      target: Math.min(95, (1 / (1 + rr) + 0.10) * 100)
    }));
  }

  /**
   * Simule une séquence de N trades selon les paramètres pour visualiser
   * la distribution des drawdowns. Pas du Monte Carlo full (juste 1 séquence
   * en mode déterministe : worst-case sur tâche de N losses d'affilée).
   *
   * @param {Object} p
   * @param {number} p.balance
   * @param {number} p.riskPctPerTrade  % du capital risqué par trade
   * @param {number} p.consecutiveLosses  Nb de pertes consécutives à simuler
   */
  function drawdownStreak(p) {
    const balance = num(p.balance, 10000);
    const riskPct = num(p.riskPctPerTrade, 1) / 100;
    const N = Math.max(1, Math.round(num(p.consecutiveLosses, 10)));

    const rows = [];
    let cur = balance;
    let cumulDD = 0;

    for (let i = 1; i <= N; i++) {
      const loss = cur * riskPct;
      cur -= loss;
      cumulDD = (balance - cur) / balance * 100;
      rows.push({
        trade: i,
        loss,
        balanceAfter: cur,
        cumDDPct: cumulDD
      });
    }
    return rows;
  }

  /**
   * Probabilité de ruine simplifiée (modèle de Vince).
   * Ruin = (Win% < breakeven WR) → ruine certaine à long terme.
   * Si Win% > breakeven, calcul d'une probabilité approchée selon edge.
   *
   * @param {Object} p
   * @param {number} p.winRate         %
   * @param {number} p.rrRatio         R/R
   * @param {number} p.riskPctPerTrade %  (1 = 1 %)
   * @param {number} p.numTrades       Horizon (ex: 500 trades)
   */
  function probabilityOfRuin(p) {
    const wr = num(p.winRate, 50) / 100;
    const rr = num(p.rrRatio, 2);
    const risk = num(p.riskPctPerTrade, 1) / 100;
    const N = num(p.numTrades, 500);
    // Seuil "ruine" : −50 % du capital
    const ruinThreshold = 0.5;

    const breakevenWR = 1 / (1 + rr);
    const edge = wr - breakevenWR;

    if (edge <= 0) {
      // Pas d'edge → ruine quasi certaine à long terme
      return { probabilityRuin: 95, edge: edge * 100, breakevenWR: breakevenWR * 100 };
    }

    // Formule Vince approchée : P(ruin) ≈ ((1-edge)/(1+edge))^(target_units/risk_units)
    const targetUnits = ruinThreshold / risk;
    const rawProb = Math.pow((1 - 2 * edge) / 1, targetUnits);
    const pRuin = Math.max(0, Math.min(100, rawProb * 100));

    return {
      probabilityRuin: pRuin,
      edge: edge * 100,
      breakevenWR: breakevenWR * 100,
      ruinDefinition: '−50 % du capital'
    };
  }

  // ─── Helpers ────────────────────────────────────────────
  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  const api = { positionSizing, expectancy, breakevenTable, drawdownStreak, probabilityOfRuin };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.RISK = api;
  }

})(typeof window !== 'undefined' ? window : global);
