/* ============================================================
   CalcInvest — Calc Locatif (legacy shim)
   Real implementation: core/calculators/locatif.js.
   Delegates to it; preserves window.CalcLocatif for existing views.
   ============================================================ */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const impl = isNode
    ? require('./calculators/locatif')
    : (global.Calculators && global.Calculators.locatif) || global.CalcLocatif;

  if (!impl) {
    if (typeof console !== 'undefined') {
      console.error('[calc-locatif.js] Missing dependency: load calculators/locatif.js first (via engine.bundle.js).');
    }
    return;
  }

  if (isNode) module.exports = impl;
  else global.CalcLocatif = impl;
})(typeof window !== 'undefined' ? window : globalThis);
