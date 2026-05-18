/* ============================================================
   CalcInvest — Détecteur de régime de marché

   Classifie un marché dans 4 régimes :
   - BULL : tendance haussière (prix > MA200, momentum positif, vol normale)
   - BEAR : tendance baissière (prix < MA200, DD > 15 %)
   - RANGE : sans tendance (prix oscille autour MA200, vol faible)
   - VOLATILE : forte volatilité (ATR élevé, gros swings)

   Méthode : score 0-100 sur 4 dimensions :
     1. Position vs MA200 (mensuelle = MA10 sur monthly data, Faber GTAA)
     2. Momentum 12 mois
     3. Drawdown courant
     4. Volatilité (écart-type returns 12 derniers mois)

   Renvoie aussi un historique : pour chaque mois, le régime à l'époque.
   Permet de tracer une carte historique des régimes (heatmap timeline).
   ============================================================ */
(function (global) {
  'use strict';

  function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }
  function stdev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
  }

  /**
   * Calcule le régime à un instant t donné de la série prices.
   * @param {Array} prices  Série mensuelle complète.
   * @param {number} idx    Index du mois à classifier.
   */
  function classifyAt(prices, idx) {
    const MA_PERIOD = 10;     // 10 mois ≈ MA200 jours
    const MOM_PERIOD = 12;
    const VOL_PERIOD = 12;

    if (idx < Math.max(MA_PERIOD, MOM_PERIOD, VOL_PERIOD)) {
      return { regime: 'unknown', score: null, signals: {} };
    }

    const price = prices[idx];
    const slice = prices.slice(idx - MA_PERIOD + 1, idx + 1);
    const ma = mean(slice);
    const maPct = (price - ma) / ma * 100;

    const momentum = (price - prices[idx - MOM_PERIOD]) / prices[idx - MOM_PERIOD] * 100;

    // Drawdown depuis ATH des 36 derniers mois (3 ans)
    const ddWindow = prices.slice(Math.max(0, idx - 36), idx + 1);
    const localATH = Math.max(...ddWindow);
    const drawdown = (price - localATH) / localATH * 100;

    // Volatilité : écart-type des returns mensuels sur 12 mois × √12
    const returns = [];
    for (let i = idx - VOL_PERIOD + 1; i <= idx; i++) {
      if (i > 0) returns.push(prices[i] / prices[i-1] - 1);
    }
    const annualVol = stdev(returns) * Math.sqrt(12) * 100;

    // Classification
    let regime;
    if (annualVol > 25) {
      regime = 'volatile';
    } else if (maPct > 2 && momentum > 5 && drawdown > -10) {
      regime = 'bull';
    } else if (maPct < -2 && (momentum < -5 || drawdown < -15)) {
      regime = 'bear';
    } else {
      regime = 'range';
    }

    return {
      regime,
      signals: {
        price,
        ma,
        maPct,
        momentum,
        drawdown,
        annualVol
      }
    };
  }

  /**
   * Construit l'historique des régimes mois par mois.
   */
  function buildHistory(prices) {
    const history = [];
    for (let i = 0; i < prices.length; i++) {
      history.push(classifyAt(prices, i));
    }
    return history;
  }

  /**
   * Statistiques agrégées par régime (durée moyenne, % du temps, perf moyenne).
   */
  function aggregateStats(prices, history) {
    const stats = {
      bull:     { months: 0, episodes: 0, totalReturn: 0 },
      bear:     { months: 0, episodes: 0, totalReturn: 0 },
      range:    { months: 0, episodes: 0, totalReturn: 0 },
      volatile: { months: 0, episodes: 0, totalReturn: 0 }
    };
    let lastRegime = null;
    let episodeStartPrice = null;
    let episodeStartRegime = null;

    for (let i = 0; i < history.length; i++) {
      const r = history[i].regime;
      if (r === 'unknown') continue;
      if (!stats[r]) continue;
      stats[r].months++;
      if (r !== lastRegime) {
        // Cloturer l'épisode précédent
        if (episodeStartRegime && episodeStartPrice != null && i > 0) {
          const ret = (prices[i] - episodeStartPrice) / episodeStartPrice * 100;
          stats[episodeStartRegime].totalReturn += ret;
        }
        stats[r].episodes++;
        episodeStartPrice = prices[i];
        episodeStartRegime = r;
        lastRegime = r;
      }
    }
    // Cloturer dernier épisode
    if (episodeStartRegime && episodeStartPrice != null) {
      const lastIdx = history.length - 1;
      const ret = (prices[lastIdx] - episodeStartPrice) / episodeStartPrice * 100;
      stats[episodeStartRegime].totalReturn += ret;
    }

    const totalMonths = Object.values(stats).reduce((s, v) => s + v.months, 0);
    Object.keys(stats).forEach(k => {
      stats[k].pctOfTime = totalMonths > 0 ? (stats[k].months / totalMonths * 100) : 0;
      stats[k].avgDuration = stats[k].episodes > 0 ? stats[k].months / stats[k].episodes : 0;
      stats[k].avgReturn = stats[k].episodes > 0 ? stats[k].totalReturn / stats[k].episodes : 0;
    });

    return { stats, totalMonths };
  }

  /**
   * Détecte les transitions récentes (changements de régime).
   */
  function recentTransitions(history, n) {
    n = n || 5;
    const transitions = [];
    for (let i = 1; i < history.length; i++) {
      if (history[i].regime !== history[i-1].regime &&
          history[i].regime !== 'unknown' &&
          history[i-1].regime !== 'unknown') {
        transitions.push({
          monthIndex: i,
          from: history[i-1].regime,
          to: history[i].regime,
          signals: history[i].signals
        });
      }
    }
    return transitions.slice(-n);
  }

  function analyze(prices) {
    if (!prices || prices.length < 24) {
      return { error: 'Pas assez de données (min 24 mois)' };
    }
    const history = buildHistory(prices);
    const agg = aggregateStats(prices, history);
    const current = history[history.length - 1];
    const transitions = recentTransitions(history, 5);
    return {
      currentRegime: current.regime,
      currentSignals: current.signals,
      history,
      aggregateStats: agg.stats,
      totalMonths: agg.totalMonths,
      recentTransitions: transitions
    };
  }

  const REGIME_META = {
    bull:     { label: 'BULL', color: '#10B981', desc: 'Tendance haussière confirmée. Momentum positif, vol normale.' },
    bear:     { label: 'BEAR', color: '#DC2626', desc: 'Tendance baissière. Prix < MA200, drawdown significatif.' },
    range:    { label: 'RANGE',color: '#FBBF24', desc: 'Marché sans tendance. Oscille autour de la moyenne.' },
    volatile: { label: 'VOLATILE',color: '#A855F7', desc: 'Forte volatilité. Swings importants, prudence.' },
    unknown:  { label: '—',  color: '#64748B', desc: 'Données insuffisantes pour classifier.' }
  };

  const api = { analyze, classifyAt, buildHistory, aggregateStats, recentTransitions, REGIME_META };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.REGIME = api;
})(typeof window !== 'undefined' ? window : globalThis);
