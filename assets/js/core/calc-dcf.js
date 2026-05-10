/* ============================================================
   CalcInvest — Calc DCF (CORE, pure)
   Discounted Cash Flow à 2 phases + valeur terminale (Gordon Growth)
   Zero DOM dependency. Testable via Node.js.
   ============================================================ */

(function (global) {
  'use strict';

  const CalcDCF = {};

  /* ------------------------------------------------------------
     calcDCF(p) — Valorisation DCF à 2 phases
     p = {
       revenue        : number  — Revenus TTM (M€/$)
       growthPhase1   : number  — Croissance an 1-5 (%)
       growthPhase2   : number  — Croissance an 6-10 (%)
       fcfMargin      : number  — Marge FCF (%)
       wacc           : number  — Taux d'actualisation (%)
       terminalGrowth : number  — Croissance terminale (%)
       netDebt        : number  — Dette nette (M€, négatif = trésorerie nette)
       shares         : number  — Actions en circulation (M)
       currentPrice   : number  — Prix actuel (€, 0 = non renseigné)
     }
     ------------------------------------------------------------ */
  CalcDCF.calcDCF = function (p) {
    const wacc = p.wacc / 100;
    const tg   = p.terminalGrowth / 100;
    const g1   = p.growthPhase1 / 100;
    const g2   = p.growthPhase2 / 100;
    const fcfM = p.fcfMargin / 100;

    // Validation
    if (wacc <= tg)     return { error: 'Le WACC doit être supérieur au taux de croissance terminal.' };
    if (p.revenue <= 0) return { error: 'Les revenus doivent être positifs.' };
    if (p.shares  <= 0) return { error: 'Le nombre d\'actions doit être positif.' };
    if (fcfM < 0)       return { error: 'La marge FCF ne peut pas être négative.' };
    if (wacc <= 0)      return { error: 'Le WACC doit être positif.' };

    const fcfYears     = [];   // FCF brut par an (M€)
    const pvFcfYears   = [];   // PV de chaque FCF (M€)
    const revenueYears = [];   // Revenus projetés par an (M€)
    let   revenue      = p.revenue;

    // Phase 1 : années 1-5
    for (let y = 1; y <= 5; y++) {
      revenue = revenue * (1 + g1);
      revenueYears.push(revenue);
      const fcf = revenue * fcfM;
      fcfYears.push(fcf);
      pvFcfYears.push(fcf / Math.pow(1 + wacc, y));
    }

    // Phase 2 : années 6-10
    for (let y = 6; y <= 10; y++) {
      revenue = revenue * (1 + g2);
      revenueYears.push(revenue);
      const fcf = revenue * fcfM;
      fcfYears.push(fcf);
      pvFcfYears.push(fcf / Math.pow(1 + wacc, y));
    }

    // Valeur terminale (Gordon Growth Model)
    const lastFCF       = fcfYears[9];
    const terminalFCF   = lastFCF * (1 + tg);
    const terminalValue = terminalFCF / (wacc - tg);
    const pvTerminal    = terminalValue / Math.pow(1 + wacc, 10);

    const pvFCFTotal      = pvFcfYears.reduce((s, v) => s + v, 0);
    const enterpriseValue = pvFCFTotal + pvTerminal;
    const netDebt         = p.netDebt || 0;
    const equityValue     = enterpriseValue - netDebt;

    if (equityValue <= 0) {
      return {
        error: 'Valeur des fonds propres négative — la dette dépasse la valeur d\'entreprise. Vérifiez la dette nette ou augmentez les marges/la croissance.',
        enterpriseValue: Math.round(enterpriseValue),
        equityValue:     Math.round(equityValue)
      };
    }

    const intrinsicValue = equityValue / p.shares;
    const currentPrice   = p.currentPrice || 0;
    const upside         = currentPrice > 0 ? (intrinsicValue - currentPrice) / currentPrice : null;

    let verdict = null, verdictClass = null;
    if (upside !== null) {
      if      (upside >  0.20)  { verdict = 'SOUS-ÉVALUÉ';  verdictClass = 'pos'; }
      else if (upside >  0.05)  { verdict = 'LÉGÈREMENT SOUS-ÉVALUÉ'; verdictClass = 'pos'; }
      else if (upside > -0.10)  { verdict = 'JUSTE PRIX';   verdictClass = 'warn'; }
      else if (upside > -0.25)  { verdict = 'LÉGÈREMENT SURÉVALUÉ'; verdictClass = 'warn'; }
      else                      { verdict = 'SURÉVALUÉ';    verdictClass = 'neg'; }
    }

    const tvWeight = pvTerminal / enterpriseValue;

    // Matrice de sensibilité : WACC ± 2% × Croissance terminale ± 1%
    const sensitivity = CalcDCF.buildSensitivityMatrix(fcfYears, pvFcfYears, p);

    return {
      revenueYears,
      fcfYears,
      pvFcfYears,
      terminalValue:    Math.round(terminalValue),
      pvTerminal:       Math.round(pvTerminal),
      pvFCFTotal:       Math.round(pvFCFTotal),
      enterpriseValue:  Math.round(enterpriseValue),
      equityValue:      Math.round(equityValue),
      intrinsicValue:   Math.round(intrinsicValue * 100) / 100,
      currentPrice,
      upside,
      verdict,
      verdictClass,
      tvWeight,
      sensitivity
    };
  };

  /* ------------------------------------------------------------
     buildSensitivityMatrix(fcfYears, pvFcfYears, p)
     Retourne un tableau 5×5 de valeurs intrinsèques (€/action)
     Lignes   : WACC   -2%, -1%, base, +1%, +2%
     Colonnes : TG     -1%, -0.5%, base, +0.5%, +1%
     ------------------------------------------------------------ */
  CalcDCF.buildSensitivityMatrix = function (fcfYears, pvFcfYears, p) {
    const baseWacc = p.wacc / 100;
    const baseTg   = p.terminalGrowth / 100;
    const shares   = p.shares;
    const netDebt  = p.netDebt || 0;

    const waccOffsets = [-0.02, -0.01, 0, 0.01, 0.02];
    const tgOffsets   = [-0.01, -0.005, 0, 0.005, 0.01];

    return waccOffsets.map(wOff => {
      const wacc = baseWacc + wOff;
      return tgOffsets.map(tOff => {
        const tg = baseTg + tOff;
        if (wacc <= tg || wacc <= 0 || tg < 0) return null;

        // Recalcul PV FCFs avec nouveau WACC
        let pvFCF = 0;
        for (let y = 0; y < fcfYears.length; y++) {
          pvFCF += fcfYears[y] / Math.pow(1 + wacc, y + 1);
        }

        // Valeur terminale avec nouveau WACC et TG
        const lastFCF     = fcfYears[fcfYears.length - 1];
        const tv          = (lastFCF * (1 + tg)) / (wacc - tg);
        const pvTV        = tv / Math.pow(1 + wacc, 10);
        const ev          = pvFCF + pvTV;
        const equity      = ev - netDebt;
        if (equity <= 0) return null;
        return Math.round((equity / shares) * 100) / 100;
      });
    });
  };

  /* ------------------------------------------------------------
     Helpers publics
     ------------------------------------------------------------ */
  CalcDCF.WACC_OFFSETS = [-0.02, -0.01, 0, 0.01, 0.02];
  CalcDCF.TG_OFFSETS   = [-0.01, -0.005, 0, 0.005, 0.01];

  // Profils prédéfinis (illustratifs)
  CalcDCF.PROFILES = {
    growth: {
      label: 'Tech growth',
      revenue: 2000, growthPhase1: 25, growthPhase2: 15,
      fcfMargin: 18, wacc: 11, terminalGrowth: 3,
      netDebt: -500, shares: 150, currentPrice: 0
    },
    garp: {
      label: 'GARP / Qualité',
      revenue: 5000, growthPhase1: 15, growthPhase2: 10,
      fcfMargin: 25, wacc: 9, terminalGrowth: 2.5,
      netDebt: 1000, shares: 300, currentPrice: 0
    },
    quality: {
      label: 'Blue chip défensif',
      revenue: 20000, growthPhase1: 8, growthPhase2: 5,
      fcfMargin: 22, wacc: 8, terminalGrowth: 2,
      netDebt: 5000, shares: 800, currentPrice: 0
    },
    cyclical: {
      label: 'Cyclique / Value',
      revenue: 8000, growthPhase1: 6, growthPhase2: 3,
      fcfMargin: 12, wacc: 10, terminalGrowth: 1.5,
      netDebt: 3000, shares: 400, currentPrice: 0
    }
  };

  /* Export UMD */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalcDCF;
  } else {
    global.CalcDCF = CalcDCF;
  }

})(typeof window !== 'undefined' ? window : this);
