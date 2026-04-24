/* ============================================================
   CalcInvest Engine — amortization
   Loan schedule builder. Migrated from legacy finance-utils.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const cashflow = isNode ? require('./cashflow') : root.ENGINE.cashflow;

  const amort = {};

  /**
   * Build full amortization schedule.
   * @param annualRate    annual interest rate (decimal, e.g. 0.032)
   * @param years         duration (years, may be fractional)
   * @param principal     loan amount
   * @param opts          { insuranceRate: annual decimal on initial principal }
   */
  amort.build = function (annualRate, years, principal, opts) {
    opts = opts || {};
    const insuranceRate = opts.insuranceRate || 0;
    const monthlyRate = annualRate / 12;
    const nper = Math.round(years * 12);
    const pmt = cashflow.pmt(monthlyRate, nper, principal);
    const monthlyInsurance = (principal * insuranceRate) / 12;

    const monthly = [];
    const yearly = [];
    let balance = principal;
    let yearInterest = 0, yearPrincipal = 0, yearInsurance = 0;

    for (let m = 1; m <= nper; m++) {
      const interest = balance * monthlyRate;
      const principalPart = pmt - interest;
      balance = Math.max(0, balance - principalPart);
      yearInterest += interest;
      yearPrincipal += principalPart;
      yearInsurance += monthlyInsurance;

      monthly.push({
        m: m,
        interest: interest,
        principal: principalPart,
        balance: balance,
        insurance: monthlyInsurance
      });

      if (m % 12 === 0 || m === nper) {
        yearly.push({
          year: Math.ceil(m / 12),
          interest: yearInterest,
          principal: yearPrincipal,
          insurance: yearInsurance,
          balance: balance
        });
        yearInterest = yearPrincipal = yearInsurance = 0;
      }
    }

    const totalInterest = monthly.reduce(function (s, x) { return s + x.interest; }, 0);
    return {
      pmt: pmt,
      insurance: monthlyInsurance,
      total: pmt + monthlyInsurance,
      monthly: monthly,
      yearly: yearly,
      totalInterest: totalInterest,
      totalInsurance: monthlyInsurance * nper,
      totalCost: pmt * nper + monthlyInsurance * nper
    };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = amort;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.amortization = amort;
  }
})(typeof window !== 'undefined' ? window : globalThis);
