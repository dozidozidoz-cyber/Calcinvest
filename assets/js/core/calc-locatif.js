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

    // -- Fiscalité : calcul annuel (année "stabilisée") --
    function computeTax(year) {
      // Par défaut on prend l'année 1 pour le calcul des intérêts
      const interestsYear = amort.yearly[year - 1] ? amort.yearly[year - 1].interest : 0;
      const insuranceYear = amort.yearly[year - 1] ? amort.yearly[year - 1].insurance : 0;

      let taxableBase = 0;
      const tr = p.tmi / 100;
      const sr = SOCIAL_TAX / 100;

      switch (p.regime) {
        case 'micro-foncier':
          // 30% abattement forfaitaire
          taxableBase = grossRent * 0.7;
          return taxableBase * (tr + sr);

        case 'reel-foncier':
          // charges réelles déductibles (intérêts + assurance + tous frais) sur location nue
          taxableBase = grossRent - (totalCharges + interestsYear + insuranceYear);
          if (taxableBase < 0) taxableBase = 0; // déficit foncier : simplifié ici
          return taxableBase * (tr + sr);

        case 'lmnp-micro':
          // 50% abattement (meublé)
          taxableBase = grossRent * 0.5;
          return taxableBase * (tr + sr);

        case 'lmnp-reel': {
          // Amortissements : bien sur ~25 ans, mobilier sur ~7 ans
          const amortBuilding = (p.price * 0.85) / 25; // 85% du prix amortissable
          const amortFurniture = p.furniture / 7;
          const totalDeductibles = totalCharges + interestsYear + insuranceYear + amortBuilding + amortFurniture;
          taxableBase = grossRent - totalDeductibles;
          if (taxableBase < 0) taxableBase = 0; // LMNP réel : déficit reporté, pas imputé sur revenu global
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
      const yearLoan = amort.yearly[y - 1] || { principal: 0, interest: 0, insurance: 0, balance: 0 };
      const rentYear = effectiveRent; // simplification : pas d'indexation par défaut
      const chargesYear = totalCharges;
      const loanYear = (y <= p.loanYears && p.loan > 0) ? amort.total * 12 : 0;
      const tax = computeTax(y);
      const cashflowYear = rentYear - chargesYear - loanYear - tax;

      propertyValue = propertyValue * (1 + p.appreciation / 100);
      const balance = y <= p.loanYears ? yearLoan.balance : 0;
      const equity = propertyValue - balance;

      yearly.push({
        year: y,
        rent: rentYear,
        charges: chargesYear,
        loanPayments: loanYear,
        loanInterest: yearLoan.interest,
        loanPrincipal: yearLoan.principal,
        tax,
        cashflow: cashflowYear,
        propertyValue,
        balance,
        equity
      });
    }

    // -- Rendement net-net (après impôts) --
    const year1Tax = computeTax(1);
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
      totalAcquisition,
      downPayment,
      // Crédit
      monthlyPayment: amort.total,
      monthlyPaymentPrincipal: amort.pmt,
      monthlyPaymentInsurance: amort.insurance,
      totalInterest: amort.totalInterest,
      // Rendements
      yieldGross,
      yieldNet,
      yieldNetNet,
      // Flux
      grossRent,
      effectiveRent,
      totalCharges,
      netRentBeforeLoan,
      netRentAfterTax,
      year1Tax,
      cashflowMonthly,
      enrichmentMonthly,
      // TRI & patrimoine
      tri: tri == null ? null : tri * 100,
      finalEquity,
      finalPropertyValue: yearly[yearly.length - 1].propertyValue,
      // Timeline
      yearly
    };
  }

  // Export
  const mod = { calcLocatif };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    global.CalcLocatif = mod;
  }
})(typeof window !== 'undefined' ? window : this);
