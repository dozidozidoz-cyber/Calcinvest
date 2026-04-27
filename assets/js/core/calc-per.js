/* ============================================================
   CalcInvest — Calc PER (legacy shim)
   Real implementation: core/calculators/per.js (loaded via engine.bundle.js).
   Preserves window.CalcPER for views.
   ============================================================ */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const impl = isNode
    ? require('./calculators/per')
    : (global.Calculators && global.Calculators.per) || global.CalcPER;

  if (!impl) {
    if (typeof console !== 'undefined') {
      console.error('[calc-per.js] Missing dependency: load calculators/per.js first (via engine.bundle.js).');
    }
    return;
  }

  if (isNode) module.exports = impl;
  else global.CalcPER = impl;
})(typeof window !== 'undefined' ? window : globalThis);
