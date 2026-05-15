/* ============================================================
   CalcInvest — Core Comparateur Brokers
   Pour un profil donné, classe les brokers par coût total annuel.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  /**
   * Compare les brokers (depuis PIPS.BROKERS) pour un profil de trader.
   *
   * @param {Object} p
   * @param {string} p.pair          Instrument typique (ex: 'EUR/USD')
   * @param {number} p.lotSize       Taille moyenne de position (unités)
   * @param {number} p.tradesPerMonth Nombre de trades / mois
   * @param {number} p.nightsHeld    Nuits moyennes par trade
   * @param {string} p.accountCurr   'EUR' | 'USD'
   * @returns {Array} liste de brokers triés par coût croissant
   */
  function compareBrokers(p) {
    if (!global.PIPS) return [];
    const BROKERS = global.PIPS.BROKERS;
    const PAIRS = global.PIPS.PAIRS;
    const pair = PAIRS[p.pair];
    if (!BROKERS || !pair) return [];

    const lots = num(p.lotSize, 100000);
    const tradesMonth = num(p.tradesPerMonth, 20);
    const nights = num(p.nightsHeld, 1);
    const accountCurr = (p.accountCurr || 'EUR').toUpperCase();

    // Pip value du compte
    const pv = global.PIPS.pipValue({ pair: p.pair, lotSize: lots, accountCurr });

    const results = Object.entries(BROKERS).map(([key, b]) => {
      // Coût par trade
      const spreadCost = b.spreadPips * pv.pipValueAccount;

      let commissionPerTrade;
      if (b.commType === 'fixed') {
        commissionPerTrade = b.commValue;
      } else if (b.commType === 'perlot') {
        commissionPerTrade = b.commValue * (lots / 100000);
      } else {
        commissionPerTrade = 0;
      }

      const swapPerTrade = Math.abs(b.swapPips) * pv.pipValueAccount * nights;

      const costPerTrade = spreadCost + commissionPerTrade + swapPerTrade;
      const monthlyCost = costPerTrade * tradesMonth;
      const yearlyCost = monthlyCost * 12;

      return {
        key,
        name: b.name,
        note: b.note,
        spreadCost,
        commissionPerTrade,
        swapPerTrade,
        costPerTrade,
        monthlyCost,
        yearlyCost,
        spreadPips: b.spreadPips,
        commType: b.commType,
        commValue: b.commValue,
        swapPips: b.swapPips
      };
    });

    // Trie par coût annuel croissant
    results.sort((a, b) => a.yearlyCost - b.yearlyCost);
    return results;
  }

  const api = { compareBrokers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.BROKERCMP = api;

})(typeof window !== 'undefined' ? window : global);
