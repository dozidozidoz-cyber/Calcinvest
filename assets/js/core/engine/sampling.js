/* ============================================================
   CalcInvest Engine — sampling
   Resampling methods for historical return series.
     - iidBootstrap       : classic i.i.d. bootstrap
     - blockBootstrap     : fixed-length moving-block bootstrap
     - stationaryBootstrap: Politis-Romano (geometric block length)
     - antithetic         : generic antithetic pairing helper
   All consume a uniform PRNG (from rng.js) so results are reproducible.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const rng = isNode ? require('./rng') : root.ENGINE.rng;

  const sampling = {};

  /** Draw `length` samples i.i.d. with replacement from series. */
  sampling.iidBootstrap = function (series, length, rand) {
    const n = series.length;
    const out = new Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = series[Math.floor(rand() * n)];
    }
    return out;
  };

  /**
   * Moving-block bootstrap (Kunsch 1989). Fixed block length.
   * Preserves local autocorrelation within blocks.
   */
  sampling.blockBootstrap = function (series, length, blockLen, rand) {
    const n = series.length;
    if (blockLen <= 0 || blockLen > n) throw new Error('blockLen out of range');
    const maxStart = n - blockLen + 1;
    const out = new Array(length);
    let i = 0;
    while (i < length) {
      const start = Math.floor(rand() * maxStart);
      const end = Math.min(start + blockLen, n);
      for (let j = start; j < end && i < length; j++, i++) {
        out[i] = series[j];
      }
    }
    return out;
  };

  /**
   * Stationary bootstrap (Politis & Romano 1994).
   * Block length is geometrically distributed with mean = expectedBlockLen.
   * Wraps around (circular series) to keep stationarity.
   * Preferred default for financial returns.
   */
  sampling.stationaryBootstrap = function (series, length, expectedBlockLen, rand) {
    const n = series.length;
    if (expectedBlockLen <= 0) throw new Error('expectedBlockLen must be > 0');
    const p = 1 / expectedBlockLen; // prob of restart at each step
    const out = new Array(length);
    let idx = Math.floor(rand() * n);
    for (let i = 0; i < length; i++) {
      out[i] = series[idx];
      if (rand() < p) idx = Math.floor(rand() * n);
      else idx = (idx + 1) % n;
    }
    return out;
  };

  /**
   * Antithetic sampling helper for normal-based paths.
   * Returns a pair-generator: each pair is [z, -z] reusing the base normal draw.
   * Halves effective variance for linear functionals.
   * Usage:
   *   const anti = sampling.antitheticNormal(normalSampler);
   *   const [a, b] = [anti(), anti()];  // a and b are antithetic
   */
  sampling.antitheticNormal = function (normalSampler) {
    let pending = null;
    return function () {
      if (pending !== null) { const v = pending; pending = null; return v; }
      const z = normalSampler();
      pending = -z;
      return z;
    };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = sampling;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.sampling = sampling;
  }
})(typeof window !== 'undefined' ? window : globalThis);
