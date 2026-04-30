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

    // -- Crédit (avec refinancement éventuel) --
    const refiYear = Math.floor(p.refinanceYear || 0);
    const refiRate = p.refinanceRate;  // %
    const useRefi  = p.loan > 0 && refiYear > 0 && refiYear < p.loanYears && refiRate != null && refiRate > 0;

    let amort = p.loan > 0
      ? amortization.build(p.loanRate / 100, p.loanYears, p.loan, { insuranceRate: p.loanIns / 100 })
      : { pmt: 0, insurance: 0, total: 0, yearly: [], totalInterest: 0, totalInsurance: 0 };

    let refiAmort = null;     // amortissement post-refi
    let refiTotalCost = 0;    // coût supplémentaire/économie comparé au scénario sans refi
    if (useRefi) {
      // Solde restant à la fin de l'année refiYear
      const balanceAtRefi = amort.yearly[refiYear - 1]
        ? amort.yearly[refiYear - 1].balance
        : 0;
      const remainingYears = p.loanYears - refiYear;
      if (balanceAtRefi > 0 && remainingYears > 0) {
        refiAmort = amortization.build(
          refiRate / 100, remainingYears, balanceAtRefi,
          { insuranceRate: p.loanIns / 100 }
        );
      }
    }

    // Helper : récupère le yearLoan effectif pour l'année y (1-indexed), tenant compte du refi
    function getYearLoan(y) {
      if (useRefi && refiAmort && y > refiYear) {
        const idx = y - refiYear - 1;
        return refiAmort.yearly[idx] || { principal: 0, interest: 0, insurance: 0, balance: 0 };
      }
      return amort.yearly[y - 1] || { principal: 0, interest: 0, insurance: 0, balance: 0 };
    }
    function getMonthlyPayment(y) {
      if (useRefi && refiAmort && y > refiYear) return refiAmort.total;
      return amort.total;
    }

    // -- Loyers / charges année 1 --
    const grossRent = p.rent * 12;
    const effectiveRent = grossRent * (1 - p.vacancy / 100);
    const mgmt = effectiveRent * (p.mgmtPct / 100);
    const maint = p.price * (p.maintPct / 100);
    const recurringWorks = p.price * ((p.recurringWorksRate || 0) / 100);
    const totalCharges = p.propTax + p.copro + p.insurance + mgmt + maint + recurringWorks;
    const netRentBeforeLoan = effectiveRent - totalCharges;

    const yieldGross = (grossRent / p.price) * 100;
    const yieldNet = (netRentBeforeLoan / totalAcquisition) * 100;

    // -- Fiscalité année par année --
    function computeTax(grossRentYear, yearLoan) {
      const interestsYear = yearLoan ? yearLoan.interest : 0;
      const insuranceYear = yearLoan ? yearLoan.insurance : 0;
      const effRentYear = grossRentYear * (1 - p.vacancy / 100);
      const mgmtYear = effRentYear * (p.mgmtPct / 100);
      const chargesYear = p.propTax + p.copro + p.insurance + mgmtYear + p.price * (p.maintPct / 100) + p.price * ((p.recurringWorksRate || 0) / 100);
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
      const yearLoan = getYearLoan(y);
      const rentFactor = Math.pow(1 + (p.rentIndexation || 0) / 100, y - 1);
      const grossRentYear = grossRent * rentFactor;
      const rentYear = grossRentYear * (1 - p.vacancy / 100);
      const mgmtYear = rentYear * (p.mgmtPct / 100);
      const chargesYear = p.propTax + p.copro + p.insurance + mgmtYear + p.price * (p.maintPct / 100) + p.price * ((p.recurringWorksRate || 0) / 100);
      const loanYear = (y <= p.loanYears && p.loan > 0) ? getMonthlyPayment(y) * 12 : 0;
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
      yearly: yearly,
      refinance: useRefi && refiAmort ? {
        year: refiYear,
        rate: refiRate,
        balanceAtRefi: amort.yearly[refiYear - 1].balance,
        oldMonthlyPmt: amort.total,
        newMonthlyPmt: refiAmort.total,
        monthlySaving: amort.total - refiAmort.total,
        oldRemainingInterest: amort.yearly.slice(refiYear).reduce(function (s, r) { return s + r.interest; }, 0),
        newTotalInterest: refiAmort.totalInterest
      } : null
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

  /**
   * Agrège plusieurs résultats calcLocatif en un patrimoine consolidé.
   *
   * @param {Array<{params, result}>} biens — chaque bien avec ses params et son résultat calcLocatif
   * @returns {Object} totaux, moyennes pondérées, série yearly agrégée
   */
  function computeAggregate(biens) {
    if (!biens || biens.length === 0) {
      return null;
    }

    var totalAcquisition  = 0;
    var totalDownPayment  = 0;
    var totalLoan         = 0;
    var totalMonthlyPmt   = 0;
    var totalGrossRent    = 0;     // €/an cumulés
    var totalCashflowMo   = 0;     // €/mois cumulé
    var totalEnrichmentMo = 0;
    var totalFinalEquity  = 0;
    var totalFinalValue   = 0;
    var totalNetRentAfter = 0;     // €/an pondération yieldNetNet
    var maxHorizon        = 0;

    biens.forEach(function (b) {
      if (!b || !b.params || !b.result) return;
      var p = b.params, r = b.result;
      totalAcquisition  += r.totalAcquisition || 0;
      totalDownPayment  += r.downPayment || 0;
      totalLoan         += p.loan || 0;
      totalMonthlyPmt   += r.monthlyPayment || 0;
      totalGrossRent    += r.grossRent || 0;
      totalCashflowMo   += r.cashflowMonthly || 0;
      totalEnrichmentMo += r.enrichmentMonthly || 0;
      totalFinalEquity  += r.finalEquity || 0;
      totalFinalValue   += r.finalPropertyValue || 0;
      totalNetRentAfter += r.netRentAfterTax || 0;
      if (p.holdYears && p.holdYears > maxHorizon) maxHorizon = p.holdYears;
    });

    // Rendements pondérés par valeur d'acquisition
    var weightedYieldGross = totalAcquisition > 0 ? (totalGrossRent / totalAcquisition) * 100 : 0;
    var weightedYieldNetNet = totalAcquisition > 0 ? (totalNetRentAfter / totalAcquisition) * 100 : 0;

    // Yearly agrégé : pour chaque année 1..maxHorizon, somme par champ
    var yearly = [];
    for (var y = 1; y <= maxHorizon; y++) {
      var row = {
        year: y,
        rent: 0, charges: 0, loanPayments: 0, loanInterest: 0, loanPrincipal: 0,
        tax: 0, cashflow: 0, propertyValue: 0, balance: 0, equity: 0
      };
      biens.forEach(function (b) {
        if (!b || !b.result || !b.result.yearly) return;
        var yr = b.result.yearly[y - 1];
        if (!yr) return;
        row.rent          += yr.rent || 0;
        row.charges       += yr.charges || 0;
        row.loanPayments  += yr.loanPayments || 0;
        row.loanInterest  += yr.loanInterest || 0;
        row.loanPrincipal += yr.loanPrincipal || 0;
        row.tax           += yr.tax || 0;
        row.cashflow      += yr.cashflow || 0;
        row.propertyValue += yr.propertyValue || 0;
        row.balance       += yr.balance || 0;
        row.equity        += yr.equity || 0;
      });
      yearly.push(row);
    }

    return {
      count: biens.length,
      totalAcquisition: totalAcquisition,
      totalDownPayment: totalDownPayment,
      totalLoan: totalLoan,
      totalMonthlyPmt: totalMonthlyPmt,
      totalGrossRent: totalGrossRent,
      totalCashflowMonthly: totalCashflowMo,
      totalEnrichmentMonthly: totalEnrichmentMo,
      totalFinalEquity: totalFinalEquity,
      totalFinalValue: totalFinalValue,
      weightedYieldGross: weightedYieldGross,
      weightedYieldNetNet: weightedYieldNetNet,
      maxHorizon: maxHorizon,
      yearly: yearly
    };
  }

  /**
   * Compare l'achat immobilier à un placement bourse (S&P 500) avec le même apport.
   *
   * Hypothèse : le downPayment (apport + frais bloqués) aurait pu être investi en bourse
   * à un rendement annuel constant, frais ETF, fiscalité PFU 30 %.
   *
   * @param {Object} p — params calcLocatif
   * @param {Object} r — résultat calcLocatif
   * @param {Object} [opts] — { stockRate=7, feesPct=0.2, taxRate=30 }
   * @returns {Object|null} données comparaison
   */
  function compareWithStocks(p, r, opts) {
    opts = opts || {};
    var stockRate = opts.stockRate != null ? opts.stockRate : 7;
    var feesPct   = opts.feesPct   != null ? opts.feesPct   : 0.2;
    var taxRate   = opts.taxRate   != null ? opts.taxRate   : 30;

    // Récupérer calcCompound : Node = require, browser = root.Calculators.compound
    var compound = isNode
      ? require('./compound')
      : (root.Calculators && root.Calculators.compound);
    if (!compound || !compound.calcCompound) return null;

    var compoundResult = compound.calcCompound({
      initialAmount: r.downPayment,
      monthlyAmount: 0,
      annualRate:    stockRate,
      feesPct:       feesPct,
      years:         p.holdYears
    });

    var stocksGross = compoundResult.finalValue;
    var stocksGains = Math.max(0, stocksGross - r.downPayment);
    var stocksTax   = stocksGains * (taxRate / 100);
    var stocksNet   = stocksGross - stocksTax;

    // Net vendeur immobilier (revente fin d'horizon, frais 4 %, abattements PV)
    var lastYr = r.yearly[r.yearly.length - 1];
    var pv = computePlusValue(p.price, lastYr.propertyValue, p.holdYears, 4, lastYr.balance);
    var realEstateNet = pv.netVendeur;

    return {
      stocksGross:      stocksGross,
      stocksGains:      stocksGains,
      stocksTax:        stocksTax,
      stocksNet:        stocksNet,
      stocksYearly:     compoundResult.yearly,
      realEstateNet:    realEstateNet,
      realEstateValue:  lastYr.propertyValue,
      realEstateEquity: lastYr.equity,
      delta:            realEstateNet - stocksNet,
      stockRate:        stockRate,
      taxRate:          taxRate,
      feesPct:          feesPct,
      yearsCompared:    p.holdYears,
      apport:           r.downPayment
    };
  }

  /**
   * Monte Carlo de la vacance locative : Bernoulli mensuelle.
   *
   * Pour chaque simulation : pour chaque mois sur l'horizon, tire un Bernoulli
   * de proba `vacancyRate / 12` (mensuel équivalent au taux annuel). Le mois
   * vacant ne génère pas de loyer.
   *
   * @param {Object} p — params calcLocatif (utilise vacancy comme moyenne)
   * @param {Object} [opts] — { simulations=1000, seed=42 }
   * @returns {Object|null} { p5, p25, p50, p75, p95, mean, stdDev, distribution }
   */
  function computeVacancyMC(p, opts) {
    opts = opts || {};
    const N = opts.simulations || 1000;
    const seed = opts.seed != null ? opts.seed : 42;

    const ENGINE_RNG = ENGINE.rng || (typeof require !== 'undefined' ? require('../engine/rng') : null);
    if (!ENGINE_RNG || !ENGINE_RNG.mulberry32) return null;

    const rand = ENGINE_RNG.mulberry32(seed);
    const monthlyVacancyP = (p.vacancy || 0) / 100; // proba mensuelle d'être vacant
    const months = (p.holdYears || 1) * 12;

    // Charges fixes annuelles, indépendantes du loyer
    const charges = p.propTax + p.copro + p.insurance + p.price * (p.maintPct / 100) + p.price * ((p.recurringWorksRate || 0) / 100);
    const grossRentMonthly = (p.rent || 0);
    const mgmtPct = (p.mgmtPct || 0) / 100;

    // Mensualité crédit (utilise calcLocatif pour avoir l'amort + refi correct)
    const baseResult = calcLocatif(p);
    if (!baseResult) return null;

    // Approximation : on suppose tax annuelle = baseResult.year1Tax (constant)
    const annualTax = baseResult.year1Tax || 0;

    // Pré-calcul des mensualités crédit par mois
    const monthlyLoanPmts = new Array(months).fill(0);
    if (p.loan > 0) {
      for (let m = 0; m < months; m++) {
        const y = Math.floor(m / 12) + 1;
        if (y > p.loanYears) break;
        // Si refi : check via baseResult.refinance
        if (baseResult.refinance && y > baseResult.refinance.year) {
          monthlyLoanPmts[m] = baseResult.refinance.newMonthlyPmt;
        } else {
          monthlyLoanPmts[m] = baseResult.monthlyPayment;
        }
      }
    }

    const totalCashflows = new Array(N);
    for (let s = 0; s < N; s++) {
      let totalCF = 0;
      for (let m = 0; m < months; m++) {
        // Bernoulli : 1 si vacant, 0 sinon
        const vacant = rand() < monthlyVacancyP;
        const rentThisMonth = vacant ? 0 : grossRentMonthly;
        const rentIndexFactor = Math.pow(1 + (p.rentIndexation || 0) / 100, Math.floor(m / 12));
        const effectiveRent = rentThisMonth * rentIndexFactor;
        const mgmtCost = effectiveRent * mgmtPct;
        const monthlyCharges = charges / 12;
        const monthlyTax = annualTax / 12;
        totalCF += effectiveRent - mgmtCost - monthlyCharges - monthlyLoanPmts[m] - monthlyTax;
      }
      totalCashflows[s] = totalCF;
    }

    // Stats
    totalCashflows.sort(function (a, b) { return a - b; });
    function pct(arr, q) { const idx = Math.min(arr.length - 1, Math.floor(q * arr.length)); return arr[idx]; }
    const mean = totalCashflows.reduce(function (s, v) { return s + v; }, 0) / N;
    const variance = totalCashflows.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / N;
    const stdDev = Math.sqrt(variance);

    // Baseline déterministe : cashflow total sur l'horizon avec vacance moyenne
    const baselineTotal = baseResult.yearly.reduce(function (s, yr) { return s + yr.cashflow; }, 0);

    return {
      simulations: N,
      seed: seed,
      months: months,
      vacancyRate: p.vacancy,
      mean: mean,
      median: pct(totalCashflows, 0.50),
      p5:    pct(totalCashflows, 0.05),
      p25:   pct(totalCashflows, 0.25),
      p75:   pct(totalCashflows, 0.75),
      p95:   pct(totalCashflows, 0.95),
      stdDev: stdDev,
      baseline: baselineTotal,
      // Histogramme : 20 bins pour visualisation
      histogram: buildHistogram(totalCashflows, 20)
    };
  }

  function buildHistogram(sorted, nBins) {
    if (!sorted.length) return { bins: [], counts: [] };
    const min = sorted[0], max = sorted[sorted.length - 1];
    const range = max - min;
    if (range === 0) return { bins: [min], counts: [sorted.length] };
    const w = range / nBins;
    const counts = new Array(nBins).fill(0);
    const bins = [];
    for (let i = 0; i < nBins; i++) bins.push(min + i * w);
    for (let i = 0; i < sorted.length; i++) {
      let idx = Math.floor((sorted[i] - min) / w);
      if (idx >= nBins) idx = nBins - 1;
      counts[idx]++;
    }
    return { bins: bins, counts: counts, binWidth: w };
  }

  const mod = {
    calcLocatif: calcLocatif,
    computeRegimeComparison: computeRegimeComparison,
    computePlusValue: computePlusValue,
    computeAggregate: computeAggregate,
    compareWithStocks: compareWithStocks,
    computeVacancyMC: computeVacancyMC
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.locatif = mod;
    root.CalcLocatif = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
