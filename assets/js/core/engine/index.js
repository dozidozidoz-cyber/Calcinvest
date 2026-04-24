/* ============================================================
   CalcInvest Engine — index (aggregator)
   Exposes window.ENGINE in the browser, module.exports in Node.
   In the browser, sub-modules must be loaded BEFORE this file
   (they each attach to window.ENGINE already). This file just
   builds a compatibility shim (window.FIN) over the legacy API.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  const ENGINE = isNode
    ? {
        units: require('./units'),
        dates: require('./dates'),
        rates: require('./rates'),
        stats: require('./stats'),
        rng: require('./rng'),
        sampling: require('./sampling'),
        distributions: require('./distributions'),
        correlation: require('./correlation'),
        cashflow: require('./cashflow'),
        amortization: require('./amortization')
      }
    : root.ENGINE;

  /**
   * Legacy FIN shim — keeps existing calculators working until they are migrated.
   * Mirrors the exact exports of assets/js/core/finance-utils.js.
   */
  const FIN = {
    pmt: ENGINE.cashflow.pmt,
    ipmt: ENGINE.cashflow.ipmt,
    ppmt: ENGINE.cashflow.ppmt,
    amortization: function (annualRate, years, principal, opts) {
      return ENGINE.amortization.build(annualRate, years, principal, opts);
    },
    npv: ENGINE.cashflow.npv,
    irr: ENGINE.cashflow.irr,
    fv: ENGINE.cashflow.fv,
    cagr: ENGINE.rates.cagr,
    realRate: ENGINE.rates.real,
    yearsToGoal: ENGINE.cashflow.yearsToGoal,
    num: ENGINE.units.num
  };

  if (isNode) {
    module.exports = ENGINE;
    module.exports.FIN = FIN;
  } else {
    root.ENGINE = ENGINE;
    // Only install FIN shim if the legacy file has NOT already defined it.
    // The legacy file (finance-utils.js) still ships for now and wins if loaded first.
    if (!root.FIN) root.FIN = FIN;
  }
})(typeof window !== 'undefined' ? window : globalThis);
