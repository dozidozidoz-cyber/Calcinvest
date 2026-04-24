/* ============================================================
   CalcInvest Engine — distributions
   Parametric return generators.
     - lognormalReturn(mu, sigma): monthly return ~ lognormal-in-1+r
     - studentReturn(mu, sigma, df): scaled Student-t (fat tails)
   All accept a normal sampler from rng.js.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const rng = isNode ? require('./rng') : root.ENGINE.rng;

  const distributions = {};

  /**
   * Monthly return generator with lognormal (1+r).
   * @param muAnnual  annual expected return, decimal (e.g. 0.07)
   * @param sigmaAnnual  annual volatility, decimal (e.g. 0.16)
   * @param normalSampler  N(0,1) generator
   * @returns function() → monthly return (decimal, e.g. 0.005 = +0.5%)
   *
   * Uses the Ito-corrected drift so E[(1+r_m)^12] ≈ 1 + muAnnual.
   *   mu_ln_monthly = ln(1+muAnnual)/12 - 0.5 * sigma_m^2
   *   sigma_m = sigmaAnnual / sqrt(12)
   *   1+r_m = exp(mu_ln_monthly + sigma_m * Z)
   */
  distributions.lognormalMonthly = function (muAnnual, sigmaAnnual, normalSampler) {
    const sigmaM = sigmaAnnual / Math.sqrt(12);
    const muLnM = Math.log(1 + muAnnual) / 12 - 0.5 * sigmaM * sigmaM;
    return function () {
      const z = normalSampler();
      return Math.exp(muLnM + sigmaM * z) - 1;
    };
  };

  /**
   * Monthly return ~ Student-t with df degrees of freedom, location muAnnual/12, scale sigmaAnnual/sqrt(12).
   * Warning: Student-t is symmetric and can produce returns < -100%. We clip at -0.999.
   * Use for crypto / emerging-markets fat-tail modeling.
   */
  distributions.studentMonthly = function (muAnnual, sigmaAnnual, df, rand) {
    if (df <= 2) throw new Error('Student-t requires df > 2 for finite variance');
    const sigmaM = sigmaAnnual / Math.sqrt(12) * Math.sqrt((df - 2) / df); // normalize to unit variance first
    const muM = muAnnual / 12;
    const t = rng.studentT(rand, df);
    return function () {
      const r = muM + sigmaM * t();
      return r < -0.999 ? -0.999 : r;
    };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = distributions;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.distributions = distributions;
  }
})(typeof window !== 'undefined' ? window : globalThis);
