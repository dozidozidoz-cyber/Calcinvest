/* ============================================================
   CalcInvest Sim — withdrawal
   Sequence-of-returns-aware withdrawal simulation for FIRE / retirement.
   Each path withdraws a real-inflation-adjusted amount each year; fails
   if the portfolio hits 0 before horizon.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const stats = isNode ? require('../engine/stats') : root.ENGINE.stats;

  const withdrawal = {};

  /**
   * Run N paths of withdrawal phase.
   * @param opts {
   *   N: number of paths,
   *   years: horizon in years,
   *   initial: starting wealth,
   *   annualWithdrawal: first-year withdrawal in today's euros (e.g. 4% × initial),
   *   inflationAnnual: decimal (e.g. 0.02),
   *   returnSampler: (pathIdx, monthIdx, rand) → monthly return,
   *   rand: PRNG
   * }
   * @returns {
   *   survivalRate: fraction of paths that last the full horizon,
   *   terminal: Float64Array of terminal wealth (0 if ruined),
   *   monthsSurvived: Float64Array of months before ruin (= years*12 if survived),
   *   stats: percentiles on terminal
   * }
   */
  withdrawal.run = function (opts) {
    const N = opts.N;
    const months = Math.round(opts.years * 12);
    const init = opts.initial;
    const annualW = opts.annualWithdrawal;
    const infA = opts.inflationAnnual || 0;
    const infM = Math.pow(1 + infA, 1 / 12) - 1;
    const sampler = opts.returnSampler;
    const rand = opts.rand;

    const terminal = new Float64Array(N);
    const survived = new Float64Array(N);
    let survivors = 0;

    for (let p = 0; p < N; p++) {
      let w = init;
      let inflationFactor = 1;
      const monthlyW0 = annualW / 12;
      let ruined = false;
      let lastMonth = months;

      for (let t = 0; t < months; t++) {
        // Apply return
        const r = sampler(p, t, rand);
        w = w * (1 + r);
        // Inflate withdrawal
        inflationFactor *= 1 + infM;
        const withdrawAmount = monthlyW0 * inflationFactor;
        w -= withdrawAmount;
        if (w <= 0) { w = 0; ruined = true; lastMonth = t + 1; break; }
      }
      terminal[p] = w;
      survived[p] = lastMonth;
      if (!ruined) survivors++;
    }

    return {
      survivalRate: survivors / N,
      terminal: terminal,
      monthsSurvived: survived,
      stats: stats.summary(terminal)
    };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = withdrawal;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.sim = root.ENGINE.sim || {};
    root.ENGINE.sim.withdrawal = withdrawal;
  }
})(typeof window !== 'undefined' ? window : globalThis);
