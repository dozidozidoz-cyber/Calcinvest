/* ============================================================
   CalcInvest Engine — units
   Unit conventions and safe conversions.
   Canonical: rates as decimal (0.05), periods in months, amounts raw.
   ============================================================ */
(function (root) {
  'use strict';

  const units = {};

  /** Parse user-typed number tolerant to comma / spaces. */
  units.num = function (v, fallback) {
    if (v === null || v === undefined || v === '') return fallback == null ? 0 : fallback;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? (fallback == null ? 0 : fallback) : n;
  };

  /** User input 5 (percent) → 0.05 (decimal). */
  units.fromPct = function (pct) {
    return units.num(pct, 0) / 100;
  };

  /** 0.05 (decimal) → 5 (percent, for display). */
  units.toPct = function (dec, digits) {
    if (!isFinite(dec)) return NaN;
    const p = dec * 100;
    return digits == null ? p : Number(p.toFixed(digits));
  };

  /** Clamp. */
  units.clamp = function (x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  };

  /** Safe divide: returns fallback if denom is 0/NaN. */
  units.safeDiv = function (a, b, fallback) {
    if (!b || !isFinite(b)) return fallback == null ? 0 : fallback;
    return a / b;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = units;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.units = units;
  }
})(typeof window !== 'undefined' ? window : globalThis);
