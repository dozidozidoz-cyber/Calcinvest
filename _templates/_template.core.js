/* ============================================================
   TEMPLATE CORE — calc-{{TOOL}}.js
   Pure calculation function. NO DOM access.
   Portable : Node.js / RN / API / unit tests.
   ============================================================ */

(function (global) {
  'use strict';

  const FIN = global.FIN || require('./finance-utils.js');

  /**
   * @param {Object} p - inputs
   * @param {number} p.capital   - exemple param
   * @param {number} p.years     - exemple param
   * @param {number} p.rate      - exemple param (%)
   * @returns {Object} résultats + timeline annuelle
   */
  function calc{{TOOL_CAMEL}}(p) {

    // ------- 1. Inputs sanitization / defaults -------
    const capital = p.capital || 0;
    const years   = p.years || 0;
    const rate    = (p.rate || 0) / 100;

    // ------- 2. Core logic (utiliser FIN pour Excel-like funcs) -------
    const fv = FIN.fv(rate, years, 0, capital);

    // Exemple : projection annuelle
    const yearly = [];
    let value = capital;
    for (let y = 1; y <= years; y++) {
      value = value * (1 + rate);
      yearly.push({
        year: y,
        value,
        gain: value - capital,
        // ajouter autres métriques...
      });
    }

    // ------- 3. KPIs synthèse -------
    const totalGain = fv - capital;
    const totalGainPct = capital > 0 ? (totalGain / capital) * 100 : 0;

    // ------- 4. Return -------
    return {
      // KPIs
      finalValue: fv,
      totalGain,
      totalGainPct,
      // Timeline
      yearly
    };
  }

  // ------- Export UMD-like -------
  const mod = { calc{{TOOL_CAMEL}} };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    global.Calc{{TOOL_CAMEL}} = mod;
  }
})(typeof window !== 'undefined' ? window : this);

/*
  ========== CHECKLIST ==========
  - Remplacer {{TOOL}} par le slug (dca, compound, fire…)
  - Remplacer {{TOOL_CAMEL}} par PascalCase (Dca, Compound, Fire)
  - Définir tous les inputs dans la JSDoc en haut
  - Garder ZÉRO accès DOM (pas de document.*, pas de window.*)
  - Utiliser FIN.* pour les fonctions financières (pmt, irr, npv, fv, cagr…)
  - Retourner toujours : { ...KPIs, yearly: [...] }
  - Tester : charger finance-utils.js + ce fichier, puis calc{{TOOL_CAMEL}}({...})
*/
