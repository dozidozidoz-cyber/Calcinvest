/* ============================================================
   CalcInvest Engine — stats
   Descriptive statistics. All work on plain arrays / typed arrays.
   NaN-safe: input arrays are not filtered; caller must pass clean data.
   ============================================================ */
(function (root) {
  'use strict';

  const stats = {};

  stats.mean = function (xs) {
    const n = xs.length;
    if (n === 0) return NaN;
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[i];
    return s / n;
  };

  /** Sample standard deviation (n-1 denom). */
  stats.std = function (xs, population) {
    const n = xs.length;
    if (n < 2) return 0;
    const m = stats.mean(xs);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = xs[i] - m;
      s += d * d;
    }
    return Math.sqrt(s / (population ? n : (n - 1)));
  };

  stats.variance = function (xs, population) {
    const s = stats.std(xs, population);
    return s * s;
  };

  stats.min = function (xs) {
    let m = Infinity;
    for (let i = 0; i < xs.length; i++) if (xs[i] < m) m = xs[i];
    return m;
  };

  stats.max = function (xs) {
    let m = -Infinity;
    for (let i = 0; i < xs.length; i++) if (xs[i] > m) m = xs[i];
    return m;
  };

  /**
   * Quantile (linear interpolation, "type 7" in R / numpy default).
   * q in [0, 1]. Does NOT mutate the input.
   */
  stats.quantile = function (xs, q) {
    const n = xs.length;
    if (n === 0) return NaN;
    if (n === 1) return xs[0];
    const sorted = Array.prototype.slice.call(xs).sort(function (a, b) { return a - b; });
    const pos = (n - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };

  /** Return an object {p5, p25, p50, p75, p95} (single sort). */
  stats.percentiles = function (xs, ps) {
    const n = xs.length;
    const keys = ps || [0.05, 0.25, 0.5, 0.75, 0.95];
    const out = {};
    if (n === 0) {
      keys.forEach(function (q) { out['p' + Math.round(q * 100)] = NaN; });
      return out;
    }
    const sorted = Array.prototype.slice.call(xs).sort(function (a, b) { return a - b; });
    keys.forEach(function (q) {
      if (n === 1) { out['p' + Math.round(q * 100)] = sorted[0]; return; }
      const pos = (n - 1) * q;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      out['p' + Math.round(q * 100)] = lo === hi
        ? sorted[lo]
        : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    });
    return out;
  };

  /**
   * Conditional Value at Risk (Expected Shortfall) at level alpha (e.g. 0.05).
   * Mean of the worst alpha-fraction of observations.
   * For "terminal wealth" arrays: cvar(wealths, 0.05) = mean of worst 5% outcomes.
   */
  stats.cvar = function (xs, alpha) {
    const n = xs.length;
    if (n === 0) return NaN;
    const sorted = Array.prototype.slice.call(xs).sort(function (a, b) { return a - b; });
    const k = Math.max(1, Math.floor(n * alpha));
    let s = 0;
    for (let i = 0; i < k; i++) s += sorted[i];
    return s / k;
  };

  /** Summary helper used by MC outputs. */
  stats.summary = function (xs) {
    return {
      n: xs.length,
      mean: stats.mean(xs),
      std: stats.std(xs),
      min: stats.min(xs),
      max: stats.max(xs),
      percentiles: stats.percentiles(xs)
    };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = stats;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.stats = stats;
  }
})(typeof window !== 'undefined' ? window : globalThis);
