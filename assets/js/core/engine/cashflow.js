/* ============================================================
   CalcInvest Engine — cashflow
   Excel-compatible financial primitives (PMT/IPMT/PPMT/NPV/IRR/FV).
   Migrated from legacy finance-utils.js with no behavior change.
   ============================================================ */
(function (root) {
  'use strict';

  const cashflow = {};

  /** PMT(rate, nper, pv) — periodic payment (positive). */
  cashflow.pmt = function (rate, nper, pv) {
    if (rate === 0) return pv / nper;
    return (pv * rate) / (1 - Math.pow(1 + rate, -nper));
  };

  /** Interest part of nth payment. */
  cashflow.ipmt = function (rate, per, nper, pv) {
    if (rate === 0) return 0;
    const pmt = cashflow.pmt(rate, nper, pv);
    const remaining = pv * Math.pow(1 + rate, per - 1) - pmt * ((Math.pow(1 + rate, per - 1) - 1) / rate);
    return remaining * rate;
  };

  /** Principal part of nth payment. */
  cashflow.ppmt = function (rate, per, nper, pv) {
    return cashflow.pmt(rate, nper, pv) - cashflow.ipmt(rate, per, nper, pv);
  };

  /** Net present value (cashflows[0] at t=0 convention). */
  cashflow.npv = function (rate, cashflows) {
    return cashflows.reduce(function (sum, cf, t) {
      return sum + cf / Math.pow(1 + rate, t);
    }, 0);
  };

  /** IRR: Newton-Raphson then bisection fallback. Returns per-period rate or null. */
  cashflow.irr = function (cashflows, guess) {
    if (!cashflows || cashflows.length < 2) return null;
    const hasNeg = cashflows.some(function (c) { return c < 0; });
    const hasPos = cashflows.some(function (c) { return c > 0; });
    if (!hasNeg || !hasPos) return null;

    const npv = function (r) {
      return cashflows.reduce(function (s, c, t) {
        return s + c / Math.pow(1 + r, t);
      }, 0);
    };

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
      const step = newRate - rate;
      if (Math.abs(step) > 0.5) newRate = rate + Math.sign(step) * 0.5;
      if (newRate < -0.99) newRate = -0.99;
      if (Math.abs(newRate - rate) < 1e-9 && Math.abs(f) < 1e-6) return newRate;
      rate = newRate;
    }

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

  /** Future value of an annuity. */
  cashflow.fv = function (rate, nper, pmt, pv) {
    pv = pv || 0;
    if (rate === 0) return pv + pmt * nper;
    return pv * Math.pow(1 + rate, nper) + pmt * ((Math.pow(1 + rate, nper) - 1) / rate);
  };

  /** Years to reach goal given pmt, pv, rate (period-consistent). */
  cashflow.yearsToGoal = function (goal, rate, pmt, pv) {
    pv = pv || 0;
    if (rate === 0) {
      if (pmt <= 0) return null;
      return (goal - pv) / pmt;
    }
    const k = pmt / rate;
    const x = (goal + k) / (pv + k);
    if (x <= 0) return null;
    return Math.log(x) / Math.log(1 + rate);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = cashflow;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.cashflow = cashflow;
  }
})(typeof window !== 'undefined' ? window : globalThis);
