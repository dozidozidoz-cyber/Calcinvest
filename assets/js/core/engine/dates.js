/* ============================================================
   CalcInvest Engine — dates
   Single source of truth for month arithmetic.
   All dates are ISO 'YYYY-MM' strings (or 'YYYY-MM-DD' tolerated).
   ============================================================ */
(function (root) {
  'use strict';

  const dates = {};

  /** Parse 'YYYY-MM' or 'YYYY-MM-DD' into {y, m} (1-indexed month). */
  dates.parse = function (s) {
    if (!s) return null;
    const str = String(s);
    const m = str.match(/^(\d{4})-(\d{1,2})/);
    if (!m) return null;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (!(mo >= 1 && mo <= 12)) return null;
    return { y: y, m: mo };
  };

  /** Format {y, m} back to 'YYYY-MM'. */
  dates.format = function (d) {
    const mm = String(d.m).padStart(2, '0');
    return d.y + '-' + mm;
  };

  /** Number of months from a to b (exclusive end), may be negative. */
  dates.monthDiff = function (a, b) {
    const A = typeof a === 'string' ? dates.parse(a) : a;
    const B = typeof b === 'string' ? dates.parse(b) : b;
    if (!A || !B) return NaN;
    return (B.y - A.y) * 12 + (B.m - A.m);
  };

  /** Add n months (may be negative). */
  dates.addMonths = function (s, n) {
    const A = typeof s === 'string' ? dates.parse(s) : s;
    if (!A) return null;
    const total = A.y * 12 + (A.m - 1) + n;
    const y = Math.floor(total / 12);
    const m = (total % 12 + 12) % 12 + 1;
    return dates.format({ y: y, m: m });
  };

  /** Fraction of year between two dates (months/12). */
  dates.yearFrac = function (a, b) {
    const d = dates.monthDiff(a, b);
    return isNaN(d) ? NaN : d / 12;
  };

  /** True if 'a' <= 'b' (month resolution). */
  dates.lte = function (a, b) {
    return dates.monthDiff(a, b) >= 0;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dates;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.dates = dates;
  }
})(typeof window !== 'undefined' ? window : globalThis);
