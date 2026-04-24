/* ============================================================
   CalcInvest — Calc Compound (legacy shim)
   The real implementation lives in core/calculators/compound.js.
   This file remains for pages that still reference the old path.
   It delegates to the new module without reimplementing logic.
   ============================================================ */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const impl = isNode
    ? require('./calculators/compound')
    : (global.Calculators && global.Calculators.compound) || global.CalcCompound;

  if (!impl) {
    // Fail loudly in dev so we catch load-order mistakes.
    if (typeof console !== 'undefined') {
      console.error('[calc-compound.js] Missing dependency: load calculators/compound.js first (via engine.bundle.js).');
    }
    return;
  }

  if (isNode) {
    module.exports = impl;
  } else {
    global.CalcCompound = impl;
  }
})(typeof window !== 'undefined' ? window : globalThis);
