/* ============================================================
   CalcInvest Engine — rates
   Single source for rate conversions. All rates are decimal.
   ============================================================ */
(function (root) {
  'use strict';

  const rates = {};

  /** Annual decimal rate → monthly compounded decimal rate. */
  rates.monthly = function (annual) {
    if (!isFinite(annual)) return NaN;
    return Math.pow(1 + annual, 1 / 12) - 1;
  };

  /** Monthly decimal rate → annual compounded decimal rate. */
  rates.annualize = function (monthly) {
    if (!isFinite(monthly)) return NaN;
    return Math.pow(1 + monthly, 12) - 1;
  };

  /** Generic compounding: period rate from annual and periods-per-year. */
  rates.perPeriod = function (annual, periodsPerYear) {
    return Math.pow(1 + annual, 1 / periodsPerYear) - 1;
  };

  /** Annual sigma → monthly sigma (sqrt-time scaling). */
  rates.monthlySigma = function (annualSigma) {
    return annualSigma / Math.sqrt(12);
  };

  /** Monthly sigma → annual sigma. */
  rates.annualSigma = function (monthlySigma) {
    return monthlySigma * Math.sqrt(12);
  };

  /** Fisher real rate. */
  rates.real = function (nominal, inflation) {
    return (1 + nominal) / (1 + inflation) - 1;
  };

  /** Compound annual growth rate (CAGR). */
  rates.cagr = function (start, end, years) {
    if (start <= 0 || years <= 0 || !isFinite(start) || !isFinite(end) || !isFinite(years)) return null;
    return Math.pow(end / start, 1 / years) - 1;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = rates;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.rates = rates;
  }
})(typeof window !== 'undefined' ? window : globalThis);
