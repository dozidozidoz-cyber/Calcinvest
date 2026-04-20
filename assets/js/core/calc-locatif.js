/* ============================================================
   CalcInvest — Calc Locatif (CORE, pure)
   Input: params object
   Output: result object (stats + yearly timeline)
   ZÉRO accès au DOM. Portable Node.js / RN / API.
   ============================================================ */

(function (global) {
  'use strict';

  const FIN = global.FIN || require('./finance-utils.js');

  /**
   * @param {Object} p - all inputs
   * @param {number} p.price            prix d'achat (€)
   * @param {number} p.notary           frais notaire (€)
   * @param {number} p.agency           frais agence (€)
   * @param {number} p.works            travaux (€)
   * @param {number} p.furniture        mobilier LMNP (€)
   * @param {number} p.rent             loyer mensuel (€)
   * @param {number} p.vacancy          taux vacance (%)
   * @param {number} p.propTax          taxe foncière (€/an)
   * @param {number} p.copro            copro (€/an)
   * @param {number} p.insurance        PNO (€/an)
   * @param {number} p.mgmtPct          frais gestion (% loyer)
   * @param {number} p.maintPct         entretien (% prix/an)
   * @param {number} p.loan             emprunt (€)
   * @param {number} p.loanRate         taux (%, annuel)
   * @param {number} p.loanYears        durée (ans)
   * @param {number} p.loanIns          assurance emprunteur (%/an sur capital)
   * @param {string} p.regime           'micro-foncier' | 'reel-foncier' | 'lmnp-micro' | 'lmnp-reel'
   * @param {number} p.tmi              TMI (%) — ex: 30
   * @param {number} p.holdYears        durée détention / projection (ans)
   * @param {number} p.appreciation     valorisation annuelle (%)
   */
  function calcLocatif(p) {
    const SOCIAL_TAX = 17.2; // prélèvements sociaux (%)

    // -- Coûts d'acquisition --
    const totalAcquisition = p.price + p.notary + p.agency + p.works + p.furniture;
    const downPayment = Math.max(0, totalAcquisition - p.loan);

    // -- Crédit --
    const amort = p.loan > 0
      ? FIN.amortization(p.loanRate / 100, p.loanYears, p.loan, { insuranceRate: p.loanIns / 100 })
      : { pmt: 0, insurance: 0, total: 0, yearly: [], totalInterest: 0, totalInsurance: 0 };

    // -- Loyers et charges annuelles --
    const grossRent = p.rent * 12;
    const effectiveRent = grossRent * (1 - p.vacancy / 100);
    const mgmt = effectiveRent * (p.mgmtPct / 100);
    const maint = p.price * (p.maintPct / 100);
    const totalCharges = p.propTax + p.copro + p.insurance + mgmt + maint;
    const netRentBeforeLoan = effectiveRent - totalCharges;

    // -- Rendements bruts / nets --
    const yieldGross = (grossRent / p.price) * 100;
    const yieldNet = (netRentBeforeLoan / totalAcquisition) * 100;

    // -- Fiscalité : calcul par année avec loyer indexé --
    // grossRentYear = loyer brut annuel (peut être indexé)
    // yearLoan      = ligne d'amortissement de l'année { interest, insurance }
    function computeTax(grossRentYear, yearLoan) {
      const interestsYear  = yearLoan ? yearLoan.interest  : 0;
      const insuranceYear  = yearLoan ? yearLoan.insurance : 0;
      const effRentYear    = grossRentYear * (1 - p.vacancy / 100);
      const mgmtYear       = effRentYear * (p.mgmtPct / 100);
      const chargesYear    = p.propTax + p.copro + p.insurance + mgmtYear + p.price * (p.maintPct / 100);
      const tr = p.tmi / 100;
      const sr = SOCIAL_TAX / 100;
      let taxableBase = 0;

      switch (p.regime) {
        case 'micro-foncier':
          taxableBase = grossRentYear * 0.7;
          return taxableBase * (tr + sr);

        case 'reel-foncier':
          taxableBase = grossRentYear - (chargesYear + interestsYear + insuranceYear);
          if (taxableBase < 0) taxableBase = 0;
          return taxableBase * (tr + sr);

        case 'lmnp-micro':
          taxableBase = grossRentYear * 0.5;
          return taxableBase * (tr + sr);

        case 'lmnp-reel': {
          const amortBuilding  = (p.price * 0.85) / 25;
          const amortFurniture = p.furniture / 7;
          taxableBase = grossRentYear - (chargesYear + interestsYear + insuranceYear + amortBuilding + amortFurniture);
          if (taxableBase < 0) taxableBase = 0;
          return taxableBase * (tr + sr);
        }
        default:
          return 0;
      }
    }

    // -- Projection annuelle --
    const yearly = [];
    let propertyValue = p.price;
    const years = Math.max(1, p.holdYears);

    for (let y = 1; y <= years; y++) {
      const yearLoan     = amort.yearly[y - 1] || { principal: 0, interest: 0, insurance: 0, balance: 0 };
      const rentFactor   = Math.pow(1 + (p.rentIndexation || 0) / 100, y - 1);
      const grossRentYear = grossRent * rentFactor;
      const rentYear     = grossRentYear * (1 - p.vacancy / 100);
      const mgmtYear     = rentYear * (p.mgmtPct / 100);
      const chargesYear  = p.propTax + p.copro + p.insurance + mgmtYear + p.price * (p.maintPct / 100);
      const loanYear     = (y <= p.loanYears && p.loan > 0) ? amort.total * 12 : 0;
      const tax          = computeTax(grossRentYear, yearLoan);
      const cashflowYear = rentYear - chargesYear - loanYear - tax;

      propertyValue = propertyValue * (1 + p.appreciation / 100);
      const balance = y <= p.loanYears ? yearLoan.balance : 0;
      const equity  = propertyValue - balance;

      yearly.push({
        year: y, rent: rentYear, charges: chargesYear,
        loanPayments: loanYear, loanInterest: yearLoan.interest, loanPrincipal: yearLoan.principal,
        tax, cashflow: cashflowYear, propertyValue, balance, equity
      });
    }

    // -- Rendement net-net (après impôts, année 1) --
    const year1Tax = computeTax(grossRent, amort.yearly[0] || { interest: 0, insurance: 0 });
    const netRentAfterTax = netRentBeforeLoan - year1Tax;
    const yieldNetNet = (netRentAfterTax / totalAcquisition) * 100;

    // -- Cashflow mensuel (année 1) --
    const y1 = yearly[0];
    const cashflowMonthly = y1.cashflow / 12;
    const enrichmentMonthly = (amort.yearly[0] ? amort.yearly[0].principal : 0) / 12;

    // -- TRI (IRR) sur période de détention --
    // t=0 : -apport, flux annuels = cashflow, dernière année : + vente nette
    const cashflows = [-downPayment];
    yearly.forEach((yr, i) => {
      let cf = yr.cashflow;
      if (i === yearly.length - 1) {
        // Revente : valeur bien - capital restant dû - frais vente estimés (~7% simplifié pour frais de mainlevée etc → 0 pour MVP)
        cf += yr.equity;
      }
      cashflows.push(cf);
    });
    const tri = FIN.irr(cashflows);

    // -- Patrimoine final --
    const finalEquity = yearly[yearly.length - 1].equity;

    return {
      // Acquisition
      totalAcquisition, downPayment,
      // Crédit
      monthlyPayment: amort.total, monthlyPaymentPrincipal: amort.pmt,
      monthlyPaymentInsurance: amort.insurance,
      totalInterest: amort.totalInterest, totalInsurance: amort.totalInsurance,
      amortSchedule: amort.yearly,       // [{year,interest,principal,insurance,balance}]
      // Rendements
      yieldGross, yieldNet, yieldNetNet,
      // Flux
      grossRent, effectiveRent, totalCharges,
      netRentBeforeLoan, netRentAfterTax, year1Tax,
      cashflowMonthly, enrichmentMonthly,
      // TRI & patrimoine
      tri: tri == null ? null : tri * 100,
      finalEquity,
      finalPropertyValue: yearly[yearly.length - 1].propertyValue,
      // Timeline
      yearly
    };
  }

  /* ============================================================
     computeRegimeComparison(p)
     Runs calcLocatif with all 4 regimes → comparison data
     ============================================================ */
  function computeRegimeComparison(p) {
    const regimes = [
      { id: 'micro-foncier', label: 'Micro-foncier',  desc: 'Location nue · abattement 30 %' },
      { id: 'reel-foncier',  label: 'Réel foncier',   desc: 'Location nue · charges réelles' },
      { id: 'lmnp-micro',    label: 'LMNP Micro-BIC', desc: 'Location meublée · abattement 50 %' },
      { id: 'lmnp-reel',     label: 'LMNP Réel',      desc: 'Location meublée · amortissements' }
    ];
    const results = regimes.map(function (reg) {
      const r = calcLocatif(Object.assign({}, p, { regime: reg.id }));
      const amortBuilding  = reg.id === 'lmnp-reel' ? (p.price * 0.85) / 25 : 0;
      const amortFurniture = reg.id === 'lmnp-reel' ? (p.furniture || 0) / 7 : 0;
      return {
        id: reg.id, label: reg.label, desc: reg.desc,
        yieldNetNet: r.yieldNetNet, year1Tax: r.year1Tax,
        netRentAfterTax: r.netRentAfterTax, cashflowMonthly: r.cashflowMonthly,
        tri: r.tri, amortBuilding, amortFurniture
      };
    });
    const sorted = results.slice().sort(function (a, b) { return b.yieldNetNet - a.yieldNetNet; });
    return { results: results, bestId: sorted[0].id, worstId: sorted[sorted.length - 1].id };
  }

  /* ============================================================
     computePlusValue(price, saleValue, holdYears, agencyPct, debtBalance)
     Plus-value immobilière avec abattements progressifs — France 2025
     Résidences secondaires / investissement locatif (hors RP)
     ============================================================ */
  function computePlusValue(price, saleValue, holdYears, agencyPct, debtBalance) {
    agencyPct   = agencyPct   || 4;
    debtBalance = debtBalance || 0;
    const fees    = saleValue * (agencyPct / 100);
    const netSale = saleValue - fees;
    const pv      = Math.max(0, saleValue - price);

    // Abattement IR (19%) : 6 %/an de l'an 6 à 21, +4 % an 22 → 100 % à 22 ans
    var abattIR = 0;
    if (holdYears >= 22) {
      abattIR = 1;
    } else if (holdYears >= 6) {
      abattIR = Math.min(1, (holdYears - 5) * 0.06);
    }

    // Abattement PS (17,2%) : 1,65 %/an an 6-21, +9 % an 22, 1,60 %/an an 23-30 → 100 % à 30 ans
    var abattPS = 0;
    if (holdYears >= 30) {
      abattPS = 1;
    } else if (holdYears >= 23) {
      abattPS = Math.min(1, 16 * 0.0165 + 0.09 + (holdYears - 22) * 0.016);
    } else if (holdYears >= 22) {
      abattPS = 16 * 0.0165 + 0.09; // 35.4 %
    } else if (holdYears >= 6) {
      abattPS = (holdYears - 5) * 0.0165;
    }

    const taxIR    = pv * (1 - abattIR) * 0.19;
    const taxPS    = pv * (1 - abattPS) * 0.172;
    const totalTax = taxIR + taxPS;
    const netVendeur = netSale - debtBalance - totalTax;

    return { saleValue, fees, netSale, pv, abattIR, abattPS, taxIR, taxPS, totalTax, debtBalance, netVendeur };
  }

  // Export
  const mod = { calcLocatif, computeRegimeComparison, computePlusValue };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    global.CalcLocatif = mod;
  }
})(typeof window !== 'undefined' ? window : this);
