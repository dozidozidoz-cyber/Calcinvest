/* ============================================================
   CalcInvest Data — returns
   Derive monthly returns series from asset JSON (prices [+ dividends]).
   ============================================================ */
(function (root) {
  'use strict';

  const returns = {};

  /**
   * From a prices array, compute simple monthly returns: r_t = p_t / p_{t-1} - 1
   * Output has length = prices.length - 1.
   */
  returns.fromPrices = function (prices) {
    const n = prices.length;
    if (n < 2) return [];
    const out = new Array(n - 1);
    for (let i = 1; i < n; i++) {
      const p0 = prices[i - 1];
      const p1 = prices[i];
      out[i - 1] = p0 > 0 ? p1 / p0 - 1 : 0;
    }
    return out;
  };

  /**
   * Total return including dividends (monthly). divs[i] is the dividend paid at month i
   * in the same currency / scale as prices. r_t = (p_t + d_t) / p_{t-1} - 1.
   */
  returns.totalReturn = function (prices, divs) {
    const n = prices.length;
    if (n < 2) return [];
    const D = divs || [];
    const out = new Array(n - 1);
    for (let i = 1; i < n; i++) {
      const p0 = prices[i - 1];
      const p1 = prices[i];
      const d = D[i] || 0;
      out[i - 1] = p0 > 0 ? (p1 + d) / p0 - 1 : 0;
    }
    return out;
  };

  /** Align two same-start-date series to the shorter common window. */
  returns.alignPair = function (a, b) {
    const n = Math.min(a.length, b.length);
    return [a.slice(0, n), b.slice(0, n)];
  };

  /** Deflate nominal prices by CPI (both same length). */
  returns.deflate = function (prices, cpi) {
    const n = Math.min(prices.length, cpi.length);
    const base = cpi[n - 1] || 1;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = prices[i] * (base / cpi[i]);
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = returns;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.data = root.ENGINE.data || {};
    root.ENGINE.data.returns = returns;
  }
})(typeof window !== 'undefined' ? window : globalThis);
