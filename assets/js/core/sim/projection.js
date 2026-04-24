/* ============================================================
   CalcInvest Sim — projection
   Thin wrapper that exposes two modes for any calculator:
     - deterministic: single path at constant rate
     - monteCarlo:    N paths via provided sampler
   Unifies output shape across compound / dca / fire.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const montecarlo = isNode ? require('./montecarlo') : root.ENGINE.sim.montecarlo;

  const projection = {};

  /**
   * Deterministic projection: wealth_t = wealth_{t-1}*(1+r) + contrib(t)
   * Returns { path: Float64Array(T+1), terminal: number }
   */
  projection.deterministic = function (opts) {
    const T = opts.T;
    const r = opts.monthlyReturn;
    const init = opts.initial || 0;
    const contrib = opts.contribution || function () { return 0; };
    const withdraw = opts.withdrawal || function () { return 0; };
    const path = new Float64Array(T + 1);
    path[0] = init;
    let w = init;
    for (let t = 0; t < T; t++) {
      w = w * (1 + r) + contrib(t) - withdraw(t, w);
      if (w < 0) w = 0;
      path[t + 1] = w;
    }
    return { path: path, terminal: w };
  };

  /**
   * Monte Carlo projection (delegates to montecarlo.run).
   */
  projection.monteCarlo = function (opts) {
    return montecarlo.run(opts);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = projection;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.sim = root.ENGINE.sim || {};
    root.ENGINE.sim.projection = projection;
  }
})(typeof window !== 'undefined' ? window : globalThis);
