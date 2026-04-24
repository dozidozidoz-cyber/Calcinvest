/* ============================================================
   CalcInvest — Calc FIRE (legacy shim)
   Real implementation: core/calculators/fire.js.
   Preserves window.CalcFIRE for existing views.
   ============================================================ */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const impl = isNode
    ? require('./calculators/fire')
    : (global.Calculators && global.Calculators.fire) || global.CalcFIRE;

  if (!impl) {
    if (typeof console !== 'undefined') {
      console.error('[calc-fire.js] Missing dependency: load calculators/fire.js first (via engine.bundle.js).');
    }
    return;
  }

  if (isNode) module.exports = impl;
  else global.CalcFIRE = impl;
})(typeof window !== 'undefined' ? window : globalThis);
