/* ============================================================
   CalcInvest Engine — rng
   Seeded PRNG (mulberry32) + Box-Muller normal sampler.
   Reproducible: same seed → same sequence.
   ============================================================ */
(function (root) {
  'use strict';

  const rng = {};

  /** Create a seeded PRNG returning uniform [0,1). */
  rng.mulberry32 = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /**
   * Box-Muller: given a uniform PRNG, return a function sampling N(0,1).
   * Caches the second draw for efficiency.
   */
  rng.normal = function (rand) {
    let spare = null;
    return function () {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      const mag = Math.sqrt(-2 * Math.log(u));
      const ang = 2 * Math.PI * v;
      spare = mag * Math.sin(ang);
      return mag * Math.cos(ang);
    };
  };

  /**
   * Student-t sampler (df > 2). Uses ratio-of-normals / chi-squared approx.
   * Fat-tailed alternative to normal for crypto / equity tails.
   * df=4 is a common default (kurtosis ≈ 3 + 6/(df-4) → needs df>4 for defined kurt).
   */
  rng.studentT = function (rand, df) {
    const norm = rng.normal(rand);
    return function () {
      // Sum of df squared normals ≈ chi-squared(df)
      let chi = 0;
      for (let i = 0; i < df; i++) {
        const z = norm();
        chi += z * z;
      }
      const z = norm();
      return z / Math.sqrt(chi / df);
    };
  };

  /** Uniform int in [0, n). */
  rng.intBelow = function (rand, n) {
    return Math.floor(rand() * n);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = rng;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.rng = rng;
  }
})(typeof window !== 'undefined' ? window : globalThis);
