/* ============================================================
   CalcInvest Engine — correlation
   Pearson correlation + Cholesky decomposition for correlated
   multi-asset path simulation.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const stats = isNode ? require('./stats') : root.ENGINE.stats;

  const correlation = {};

  /** Pearson correlation between two equal-length numeric arrays. */
  correlation.pearson = function (x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return NaN;
    const mx = stats.mean(x);
    const my = stats.mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) return NaN;
    return sxy / Math.sqrt(sxx * syy);
  };

  /**
   * Build k×k correlation matrix from an array of k return series.
   * Series must be aligned and equal length; caller responsibility.
   */
  correlation.matrix = function (seriesList) {
    const k = seriesList.length;
    const m = [];
    for (let i = 0; i < k; i++) {
      m.push(new Array(k));
      for (let j = 0; j < k; j++) {
        if (i === j) m[i][j] = 1;
        else if (j < i) m[i][j] = m[j][i];
        else m[i][j] = correlation.pearson(seriesList[i], seriesList[j]);
      }
    }
    return m;
  };

  /**
   * Cholesky decomposition of a symmetric positive-definite matrix.
   * Returns lower-triangular L such that L * L^T = A.
   * Throws if matrix is not positive-definite.
   */
  correlation.cholesky = function (A) {
    const n = A.length;
    const L = [];
    for (let i = 0; i < n; i++) L.push(new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
        if (i === j) {
          const v = A[i][i] - sum;
          if (v <= 0) throw new Error('Matrix not positive definite at [' + i + ',' + i + ']');
          L[i][j] = Math.sqrt(v);
        } else {
          L[i][j] = (A[i][j] - sum) / L[j][j];
        }
      }
    }
    return L;
  };

  /**
   * Multiply L (n×n lower-triangular) by vector z (length n) → correlated shocks.
   * Use after generating n independent N(0,1) draws.
   */
  correlation.applyL = function (L, z) {
    const n = L.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
      out[i] = s;
    }
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = correlation;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.correlation = correlation;
  }
})(typeof window !== 'undefined' ? window : globalThis);
