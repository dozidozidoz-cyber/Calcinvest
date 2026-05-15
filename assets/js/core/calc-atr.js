/* ============================================================
   CalcInvest — Core ATR / Volatilité (méthode Wilder)
   ATR = moyenne mobile du True Range sur N périodes
   True Range = max(high-low, |high-prevClose|, |low-prevClose|)

   Sans data temps réel, on utilise des ATR typiques observés
   sur 14 jours pour chaque instrument (en mai 2026).
   L'utilisateur peut saisir un ATR custom.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  // ATR typiques 14 jours en pips (observations mai 2026)
  const ATR14_TYPICAL = {
    // Forex majors
    'EUR/USD':  60,  'GBP/USD':  90,  'USD/JPY':  70,  'USD/CHF':  55,
    'AUD/USD':  65,  'NZD/USD':  60,  'USD/CAD':  60,
    'EUR/GBP':  45,  'EUR/JPY':  85,  'EUR/CHF':  40,  'GBP/JPY':  150,
    // Exotiques
    'USD/MXN':  500, 'USD/TRY':  800, 'USD/ZAR':  600,
    // Métaux
    'XAU/USD':  2200, 'XAG/USD':  60, 'XPT/USD':  1500,
    // Énergie
    'WTI':      150, 'BRENT':    140, 'NATGAS':   20,
    // Indices
    'US30':     280, 'NAS100':   220, 'SPX500':   45,
    'GER40':    180, 'FRA40':    80,  'UK100':    60, 'JPN225':   400,
    // Actions
    'AAPL':     250, 'MSFT':     400, 'TSLA':     800, 'NVDA':     500,
    'AMZN':     350, 'GOOGL':    300,
    // Crypto
    'BTC/USD':  3500, 'ETH/USD':  150, 'SOL/USD': 12, 'BNB/USD': 35,
    'XRP/USD':  20,   'DOGE/USD': 3,   'ADA/USD':  10, 'AVAX/USD': 5
  };

  /**
   * Calcule un stop suggéré selon l'ATR et un multiplicateur Wilder.
   *
   * @param {Object} p
   * @param {string} p.pair
   * @param {number} [p.atrCustom]  Override : valeur ATR en pips
   * @param {number} p.atrMultiplier ex: 1.5 pour stop = 1.5×ATR
   * @returns {Object}
   */
  function atrStop(p) {
    const atrTypical = ATR14_TYPICAL[p.pair] || 50;
    const atr = num(p.atrCustom, atrTypical);
    const mult = num(p.atrMultiplier, 1.5);

    const stopPips = atr * mult;
    const targetPips = stopPips * num(p.rrRatio, 2);  // Target = RR × stop

    return {
      pair: p.pair,
      atr14Pips: atr,
      atrIsTypical: !p.atrCustom,
      multiplier: mult,
      stopSuggested: stopPips,
      targetSuggested: targetPips,
      // Conseils
      reasonShort: mult < 1.5 ? 'Stop serré : risque de wick' : (mult > 3 ? 'Stop large : reduce position size' : 'Standard Wilder'),
      // Volatilité catégorisée
      volatilityCategory: atr < 50 ? 'low' : atr < 150 ? 'moderate' : atr < 500 ? 'high' : 'extreme'
    };
  }

  /**
   * Pour différents multiplicateurs, montre stop + target + win-rate breakeven.
   */
  function atrTable(p) {
    const atr = num(p.atrCustom, ATR14_TYPICAL[p.pair] || 50);
    const multipliers = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
    const rrTargets = [1, 1.5, 2, 3];

    return multipliers.map(m => {
      const stop = atr * m;
      return {
        multiplier: m,
        stopPips: stop,
        targets: rrTargets.map(rr => ({
          rr,
          targetPips: stop * rr,
          breakevenWR: (1 / (1 + rr)) * 100
        }))
      };
    });
  }

  /**
   * Calculateur Kelly Criterion.
   * f* = (winRate × winLossRatio − (1 − winRate)) / winLossRatio
   * = % du capital à risquer pour maximiser la croissance log-géométrique.
   *
   * @param {Object} p
   * @param {number} p.winRate   en % (ex 55)
   * @param {number} p.rrRatio   gain moyen / perte moyenne
   */
  function kelly(p) {
    const wr = num(p.winRate, 50) / 100;
    const b = num(p.rrRatio, 2);

    const f = (wr * b - (1 - wr)) / b;
    const fHalfKelly = f / 2;
    const fQuarterKelly = f / 4;

    return {
      winRate: p.winRate,
      rrRatio: b,
      fullKelly: f * 100,
      halfKelly: fHalfKelly * 100,
      quarterKelly: fQuarterKelly * 100,
      // Recommandation : la plupart utilise demi-Kelly pour réduire la volatilité
      recommended: fHalfKelly * 100,
      isProfitable: f > 0,
      // Si Kelly négatif → ne pas trader ce système
      verdict: f <= 0 ? 'Système non profitable — ne pas trader' :
               f > 0.25 ? 'Kelly très élevé — vérifier les hypothèses' :
               f > 0.05 ? 'Kelly favorable — demi-Kelly recommandé' :
               'Edge faible — risque très réduit recommandé'
    };
  }

  /**
   * Simulation portfolio multi-trades corrélés.
   *
   * @param {Object} p
   * @param {number} p.balance
   * @param {number} p.nbPositions  trades simultanés
   * @param {number} p.riskPctPer   % du capital risqué par trade
   * @param {number} p.correlation  corrélation moyenne entre les trades (-1 à +1)
   */
  function multiTrade(p) {
    const balance = num(p.balance, 10000);
    const n = Math.max(1, Math.round(num(p.nbPositions, 3)));
    const risk = num(p.riskPctPer, 1) / 100;
    const corr = Math.max(-1, Math.min(1, num(p.correlation, 0.5)));

    // Si corrélation = 1 → risque cumulé = n × risk (toutes les positions tombent ensemble)
    // Si corrélation = 0 → risque combiné = sqrt(n) × risk (diversification optimale)
    // Si corrélation = -1 → risque proche de zéro (hedge parfait)
    // Formule : risque combiné = risk × sqrt(n + n(n-1)×corr)
    const combinedRiskFactor = Math.sqrt(n + n * (n - 1) * corr);
    const totalRiskPct = (risk * combinedRiskFactor) * 100;
    const totalRiskAmount = balance * risk * combinedRiskFactor;

    // Loss maximum si toutes les positions tombent ensemble
    const worstCaseLoss = balance * risk * n;

    return {
      nbPositions: n,
      riskPctPer: p.riskPctPer,
      correlation: corr,
      combinedRiskFactor,
      totalRiskPct,
      totalRiskAmount,
      worstCaseLoss,
      worstCaseLossPct: (worstCaseLoss / balance) * 100,
      diversificationRatio: 1 / combinedRiskFactor,  // 1 = pas de diversification, >1 = bénéfice
      verdict: totalRiskPct > 10 ? 'Risque total élevé — réduire nb positions ou risque par trade' :
               totalRiskPct > 5  ? 'Risque modéré' :
               'Risque conservateur'
    };
  }

  const api = { atrStop, atrTable, kelly, multiTrade, ATR14_TYPICAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ATR = api;

})(typeof window !== 'undefined' ? window : global);
