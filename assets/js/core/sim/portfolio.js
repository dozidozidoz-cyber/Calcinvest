/* ============================================================
   CalcInvest Sim — portfolio
   Multi-asset correlated path generator.
   Given k return series (aligned, equal length), build correlation,
   Cholesky-decompose, then generate correlated synthetic monthly returns
   using per-asset (mu, sigma) fitted from the series (or provided).
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const stats = isNode ? require('../engine/stats') : root.ENGINE.stats;
  const rates = isNode ? require('../engine/rates') : root.ENGINE.rates;
  const correlation = isNode ? require('../engine/correlation') : root.ENGINE.correlation;
  const rng = isNode ? require('../engine/rng') : root.ENGINE.rng;

  const portfolio = {};

  /**
   * Fit per-asset monthly mu/sigma from aligned series.
   * @param returnsSeries  array of arrays (monthly decimal returns)
   */
  portfolio.fit = function (returnsSeries) {
    return returnsSeries.map(function (series) {
      const mu = stats.mean(series);
      const sigma = stats.std(series);
      return {
        muMonthly: mu,
        sigmaMonthly: sigma,
        muAnnual: Math.pow(1 + mu, 12) - 1,
        sigmaAnnual: sigma * Math.sqrt(12)
      };
    });
  };

  /**
   * Build a correlated-return sampler for a k-asset portfolio.
   * @param opts {
   *   returnsSeries: [[r1...],[r2...],...],   // aligned monthly returns
   *   weights: [w1, w2, ...] summing to 1,
   *   rand: PRNG
   * }
   * @returns function(pathIdx, stepIdx, rand) → portfolio monthly return
   */
  portfolio.makeSampler = function (opts) {
    const series = opts.returnsSeries;
    const weights = opts.weights;
    const k = series.length;
    if (weights.length !== k) throw new Error('weights and series length mismatch');

    const fit = portfolio.fit(series);
    const corr = correlation.matrix(series);
    const L = correlation.cholesky(corr);
    const norm = rng.normal(opts.rand);

    return function () {
      const z = new Array(k);
      for (let i = 0; i < k; i++) z[i] = norm();
      const corrZ = correlation.applyL(L, z);
      let r = 0;
      for (let i = 0; i < k; i++) {
        const ri = fit[i].muMonthly + fit[i].sigmaMonthly * corrZ[i];
        r += weights[i] * ri;
      }
      return r;
    };
  };

  /** Convenience: compute empirical correlation matrix only. */
  portfolio.corrMatrix = function (returnsSeries) {
    return correlation.matrix(returnsSeries);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = portfolio;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.sim = root.ENGINE.sim || {};
    root.ENGINE.sim.portfolio = portfolio;
  }
})(typeof window !== 'undefined' ? window : globalThis);
