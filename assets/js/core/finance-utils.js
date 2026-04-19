/* ============================================================
   CalcInvest — Finance Utils (CORE)
   Pure functions. Mirror Excel financial functions.
   Can be copy-pasted as-is into a Node.js API, React Native app,
   or unit-tested with no DOM dependency.
   ============================================================ */

(function (global) {
  'use strict';

  const FIN = {};

  /* ------------------------------------------------------------
     PMT(rate, nper, pv) — periodic payment of a loan
     rate = period rate (monthly rate if monthly payments)
     nper = number of periods
     pv   = present value (principal, positive)
     returns positive payment amount
     ------------------------------------------------------------ */
  FIN.pmt = function (rate, nper, pv) {
    if (rate === 0) return pv / nper;
    return (pv * rate) / (1 - Math.pow(1 + rate, -nper));
  };

  /* IPMT(rate, per, nper, pv) — interest part of nth payment */
  FIN.ipmt = function (rate, per, nper, pv) {
    if (rate === 0) return 0;
    const pmt = FIN.pmt(rate, nper, pv);
    const remaining = pv * Math.pow(1 + rate, per - 1) - pmt * ((Math.pow(1 + rate, per - 1) - 1) / rate);
    return remaining * rate;
  };

  /* PPMT(rate, per, nper, pv) — principal part of nth payment */
  FIN.ppmt = function (rate, per, nper, pv) {
    return FIN.pmt(rate, nper, pv) - FIN.ipmt(rate, per, nper, pv);
  };

  /* ------------------------------------------------------------
     amortization(annualRate, years, principal, {insuranceRate})
     returns {
       pmt: monthly payment (principal+interest only, no insurance),
       insurance: monthly insurance on initial principal,
       total: monthly total (pmt + insurance),
       monthly: [{m, interest, principal, balance, insurance}],
       yearly:  [{year, interest, principal, insurance, balance}]
     }
     ------------------------------------------------------------ */
  FIN.amortization = function (annualRate, years, principal, opts) {
    opts = opts || {};
    const insuranceRate = opts.insuranceRate || 0; // annual, applied on initial principal
    const monthlyRate = annualRate / 12;
    const nper = Math.round(years * 12);
    const pmt = FIN.pmt(monthlyRate, nper, principal);
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
        m,
        interest,
        principal: principalPart,
        balance,
        insurance: monthlyInsurance
      });

      if (m % 12 === 0 || m === nper) {
        yearly.push({
          year: Math.ceil(m / 12),
          interest: yearInterest,
          principal: yearPrincipal,
          insurance: yearInsurance,
          balance
        });
        yearInterest = yearPrincipal = yearInsurance = 0;
      }
    }

    return {
      pmt,
      insurance: monthlyInsurance,
      total: pmt + monthlyInsurance,
      monthly,
      yearly,
      totalInterest: monthly.reduce((s, x) => s + x.interest, 0),
      totalInsurance: monthlyInsurance * nper,
      totalCost: pmt * nper + monthlyInsurance * nper
    };
  };

  /* ------------------------------------------------------------
     NPV(rate, cashflows) — net present value
     cashflows: array, index 0 = now (t=0), index 1 = end of period 1, etc.
     Excel-compatible signature: first cashflow is discounted at t=1.
     We use the "finance textbook" variant where cashflows[0] is at t=0.
     ------------------------------------------------------------ */
  FIN.npv = function (rate, cashflows) {
    return cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
  };

  /* ------------------------------------------------------------
     IRR(cashflows, guess) — internal rate of return
     Uses bounded bisection (robust for DCA / long series).
     Return the period rate (monthly if cashflows are monthly).
     Returns null if no solution in [-0.99, 10] or degenerate inputs.
     ------------------------------------------------------------ */
  FIN.irr = function (cashflows, guess) {
    if (!cashflows || cashflows.length < 2) return null;
    const hasNeg = cashflows.some((c) => c < 0);
    const hasPos = cashflows.some((c) => c > 0);
    if (!hasNeg || !hasPos) return null;

    const npv = (r) => cashflows.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);

    // Try Newton-Raphson first with reasonable guess
    let rate = guess == null ? 0.01 : guess;
    for (let iter = 0; iter < 60; iter++) {
      let f = 0, df = 0;
      for (let t = 0; t < cashflows.length; t++) {
        const denom = Math.pow(1 + rate, t);
        if (!isFinite(denom) || denom === 0) { f = NaN; break; }
        f += cashflows[t] / denom;
        df -= (t * cashflows[t]) / (denom * (1 + rate));
      }
      if (!isFinite(f) || !isFinite(df) || df === 0) break;
      let newRate = rate - f / df;
      // Damping : cap step to avoid wild swings
      const step = newRate - rate;
      if (Math.abs(step) > 0.5) newRate = rate + Math.sign(step) * 0.5;
      if (newRate < -0.99) newRate = -0.99;
      if (Math.abs(newRate - rate) < 1e-9 && Math.abs(f) < 1e-6) return newRate;
      rate = newRate;
    }

    // Bisection fallback on [-0.99, 10]
    let lo = -0.99, hi = 10;
    let flo = npv(lo), fhi = npv(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fm = npv(mid);
      if (!isFinite(fm)) return null;
      if (Math.abs(fm) < 1e-8 || (hi - lo) < 1e-10) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; }
      else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  };

  /* ------------------------------------------------------------
     Future value of an annuity
     FV = pv * (1+r)^n + pmt * [((1+r)^n - 1) / r]
     ------------------------------------------------------------ */
  FIN.fv = function (rate, nper, pmt, pv) {
    pv = pv || 0;
    if (rate === 0) return pv + pmt * nper;
    return pv * Math.pow(1 + rate, nper) + pmt * ((Math.pow(1 + rate, nper) - 1) / rate);
  };

  /* ------------------------------------------------------------
     CAGR — compound annual growth rate
     ------------------------------------------------------------ */
  FIN.cagr = function (start, end, years) {
    if (start <= 0 || years <= 0) return null;
    return Math.pow(end / start, 1 / years) - 1;
  };

  /* ------------------------------------------------------------
     Real rate (Fisher equation)
     ------------------------------------------------------------ */
  FIN.realRate = function (nominal, inflation) {
    return (1 + nominal) / (1 + inflation) - 1;
  };

  /* ------------------------------------------------------------
     Years to reach FV given pmt, pv, rate
     Returns decimal years (e.g. 12.3)
     ------------------------------------------------------------ */
  FIN.yearsToGoal = function (goal, rate, pmt, pv) {
    pv = pv || 0;
    if (rate === 0) {
      if (pmt <= 0) return null;
      return (goal - pv) / pmt;
    }
    // Solve: pv*(1+r)^n + pmt*((1+r)^n -1)/r = goal
    // Let x = (1+r)^n. Then x*(pv + pmt/r) - pmt/r = goal
    // x = (goal + pmt/r) / (pv + pmt/r)
    const k = pmt / rate;
    const x = (goal + k) / (pv + k);
    if (x <= 0) return null;
    return Math.log(x) / Math.log(1 + rate);
  };

  /* ------------------------------------------------------------
     Utility : safe number parse
     ------------------------------------------------------------ */
  FIN.num = function (v, fallback) {
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? (fallback || 0) : n;
  };

  /* ------------------------------------------------------------
     Export (UMD-like)
     ------------------------------------------------------------ */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FIN;
  } else {
    global.FIN = FIN;
  }
})(typeof window !== 'undefined' ? window : this);
