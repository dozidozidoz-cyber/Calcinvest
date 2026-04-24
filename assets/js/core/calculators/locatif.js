/* ============================================================
   CalcInvest — Calculator : Rendement Locatif
   Uses ENGINE (cashflow, amortization). Pure, no DOM.
   Public API identical to legacy CalcLocatif.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const ENGINE = isNode ? require('../engine') : root.ENGINE;
  const cashflow = ENGINE.cashflow;
  const amortization = ENGINE.amortization;

  const SOCIAL_TAX = 0.172; // prélèvements sociaux France

  function calcLocatif(p) {
    // -- Acquisition --
    const totalAcquisition = p.price + p.notary + p.agency + p.works + p.furniture;
    const downPayment = Math.max(0, totalAcquisition - p.loan);

    // -- Crédit --
    const amort = p.loan > 0
      ? amortization.build(p.loanRate / 100, p.loanYears, p.loan, { insuranceRate: p.loanIns / 100 })
      : { pmt: 0, insurance: 0, total: 0, yearly: [], totalInterest: 0, totalInsurance: 0 };

    // -- Loyers / charges année 1 --
    const grossRent = p.rent * 12;
    const effectiveRent = grossRent * (1 - p.vacancy / 100);
    const mgmt = effectiveRent * (p.mgmtPct / 100);
    const maint = p.price * (p.maintPct / 100);
    const totalCharges = p.propTax + p.copro + p.insurance + mgmt + maint;
    const netRentBeforeLoan = effectiveRent - totalCharges;

    const yieldGross = (grossRent / p.price) * 100;
    const yieldNet = (netRentBeforeLoan / totalAcquisition) * 100;

    // -- Fiscalité année par année --
    function computeTax(grossRentYear, yearLoan) {
      const interestsYear = yearLoan ? yearLoan.interest : 0;
      const insuranceYear = yearLoan ? yearLoan.insurance : 0;
      const effRentYear = grossRentYear * (1 - p.vacancy / 100);
      const mgmtYear = effRentYear * (p.mgmtPct / 100);
      const chargesYear = p.propTax + p.copro + p.insurance + mgmtYear + p.price * (p.maintPct / 100);
      const tr = p.tmi / 100;
      const sr = SOCIAL_TAX;
      let taxableBase = 0;

      switch (p.regime) {
        case 'micro-foncier':
          taxableBase = grossRentYear * 0.7;
          return taxableBase * (tr + sr);
        case 'reel-foncier':
          taxableBase = Math.max(0, grossRentYear - (chargesYear + interestsYear + insuranceYear));
          return taxableBase * (tr + sr);
        case 'lmnp-micro':
          taxableBase = grossRentYear * 0.5;
          return taxableBase * (tr + sr);
        case 'lmnp-reel': {
          const amortBuilding = (p.price * 0.85) / 25;
          const amortFurniture = p.furniture / 7;
          taxableBase = Math.max(0, grossRentYear - (chargesYear + interestsYear + insuranceYear + amortBuilding + amortFurniture));
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
      const rentFactor = Math.pow(1 + (p.rentIndexation || 0) / 100, y - 1);
      const grossRentYear = grossRent * rentFactor;
      const rentYear = grossRentYear * (1 - p.vacancy / 100);
      const mgmtYear = rentYear * (p.mgmtPct / 100);
      const chargesYear = p.propTax + p.copro + p.insurance + mgmtYear + p.price * (p.maintPct / 100);
      const loanYear = (y <= p.loanYears && p.loan > 0) ? amort.total * 12 : 0;
      const tax = computeTax(grossRentYear, yearLoan);
      const cashflowYear = rentYear - chargesYear - loanYear - tax;

      propertyValue = propertyValue * (1 + p.appreciation / 100);
      const balance = y <= p.loanYears ? yearLoan.balance : 0;
      const equity = propertyValue - balance;

      yearly.push({
        year: y, rent: rentYear, charges: chargesYear,
        loanPayments: loanYear, loanInterest: yearLoan.interest, loanPrincipal: yearLoan.principal,
        tax: tax, cashflow: cashflowYear, propertyValue: propertyValue, balance: balance, equity: equity
      });
    }

    // -- Rendement net-net année 1 --
    const year1Tax = computeTax(grossRent, amort.yearly[0] || { interest: 0, insurance: 0 });
    const netRentAfterTax = netRentBeforeLoan - year1Tax;
    const yieldNetNet = (netRentAfterTax / totalAcquisition) * 100;

    const y1 = yearly[0];
    const cashflowMonthly = y1.cashflow / 12;
    const enrichmentMonthly = (amort.yearly[0] ? amort.yearly[0].principal : 0) / 12;

    // -- TRI (IRR) --
    const cashflows = [-downPayment];
    yearly.forEach(function (yr, i) {
      let cf = yr.cashflow;
      if (i === yearly.length - 1) cf += yr.equity;
      cashflows.push(cf);
    });
    const tri = cashflow.irr(cashflows);

    const finalEquity = yearly[yearly.length - 1].equity;

    return {
      totalAcquisition: totalAcquisition, downPayment: downPayment,
      monthlyPayment: amort.total, monthlyPaymentPrincipal: amort.pmt,
      monthlyPaymentInsurance: amort.insurance,
      totalInterest: amort.totalInterest, totalInsurance: amort.totalInsurance,
      amortSchedule: amort.yearly,
      yieldGross: yieldGross, yieldNet: yieldNet, yieldNetNet: yieldNetNet,
      grossRent: grossRent, effectiveRent: effectiveRent, totalCharges: totalCharges,
      netRentBeforeLoan: netRentBeforeLoan, netRentAfterTax: netRentAfterTax, year1Tax: year1Tax,
      cashflowMonthly: cashflowMonthly, enrichmentMonthly: enrichmentMonthly,
      tri: tri == null ? null : tri * 100,
      finalEquity: finalEquity,
      finalPropertyValue: yearly[yearly.length - 1].propertyValue,
      yearly: yearly
    };
  }

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
        tri: r.tri, amortBuilding: amortBuilding, amortFurniture: amortFurniture
      };
    });
    const sorted = results.slice().sort(function (a, b) { return b.yieldNetNet - a.yieldNetNet; });
    return { results: results, bestId: sorted[0].id, worstId: sorted[sorted.length - 1].id };
  }

  function computePlusValue(price, saleValue, holdYears, agencyPct, debtBalance) {
    agencyPct = agencyPct || 4;
    debtBalance = debtBalance || 0;
    const fees = saleValue * (agencyPct / 100);
    const netSale = saleValue - fees;
    const pv = Math.max(0, saleValue - price);

    let abattIR = 0;
    if (holdYears >= 22) abattIR = 1;
    else if (holdYears >= 6) abattIR = Math.min(1, (holdYears - 5) * 0.06);

    let abattPS = 0;
    if (holdYears >= 30) abattPS = 1;
    else if (holdYears >= 23) abattPS = Math.min(1, 16 * 0.0165 + 0.09 + (holdYears - 22) * 0.016);
    else if (holdYears >= 22) abattPS = 16 * 0.0165 + 0.09;
    else if (holdYears >= 6) abattPS = (holdYears - 5) * 0.0165;

    const taxIR = pv * (1 - abattIR) * 0.19;
    const taxPS = pv * (1 - abattPS) * 0.172;
    const totalTax = taxIR + taxPS;
    const netVendeur = netSale - debtBalance - totalTax;

    return {
      saleValue: saleValue, fees: fees, netSale: netSale, pv: pv,
      abattIR: abattIR, abattPS: abattPS, taxIR: taxIR, taxPS: taxPS,
      totalTax: totalTax, debtBalance: debtBalance, netVendeur: netVendeur
    };
  }

  const mod = {
    calcLocatif: calcLocatif,
    computeRegimeComparison: computeRegimeComparison,
    computePlusValue: computePlusValue
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.locatif = mod;
    root.CalcLocatif = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
