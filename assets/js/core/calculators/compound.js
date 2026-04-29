/* ============================================================
   CalcInvest — Calculator : Compound Interest
   Uses the ENGINE primitives (rates, cashflow, units).
   Pure. Zero DOM. Exposed under window.Calculators.compound
   and mirrored on window.CalcCompound for legacy compatibility.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const ENGINE = isNode ? require('../engine') : root.ENGINE;
  const rates = ENGINE.rates;
  const cashflow = ENGINE.cashflow;
  const units = ENGINE.units;

  /** Normalize raw input: all rates decimal, all periods months. */
  function normalize(p) {
    return {
      initial:            Math.max(0, units.num(p.initialAmount, 0)),
      monthly:            Math.max(0, units.num(p.monthlyAmount, 0)),
      annualRate:         units.fromPct(p.annualRate || 0),
      feesPct:            units.fromPct(p.feesPct || 0),
      inflation:          units.fromPct(p.inflation || 0),
      years:              Math.max(1, Math.floor(units.num(p.years, 10))),
      goal:               Math.max(0, units.num(p.goalAmount, 0)),
      contributionGrowth: units.fromPct(p.contributionGrowth || 0)
    };
  }

  /**
   * Compute compound growth with monthly DCA.
   * Convention: versement begin-of-period, then interest.
   */
  function calcCompound(params) {
    const p = normalize(params);
    const netAnnual = p.annualRate - p.feesPct;
    const monthlyRate = rates.monthly(netAnnual);
    const grossMonthly = rates.monthly(p.annualRate);

    let value = p.initial;
    let invested = p.initial;
    let noFees = p.initial;
    const yearly = [];
    let monthlyContrib = p.monthly;

    for (let y = 1; y <= p.years; y++) {
      for (let m = 0; m < 12; m++) {
        value    += monthlyContrib;
        invested += monthlyContrib;
        value    *= 1 + monthlyRate;
        noFees   += monthlyContrib;
        noFees   *= 1 + grossMonthly;
      }
      if (p.contributionGrowth > 0) monthlyContrib *= (1 + p.contributionGrowth);
      const interest  = value - invested;
      const realValue = p.inflation > 0 ? value / Math.pow(1 + p.inflation, y) : value;
      yearly.push({ year: y, value: value, invested: invested, interest: interest, realValue: realValue });
    }

    const finalRow = yearly[yearly.length - 1];
    const multiplier = finalRow.invested > 0 ? finalRow.value / finalRow.invested : 1;
    const doublingYears = netAnnual > 0 ? Math.log(2) / Math.log(1 + netAnnual) : null;
    const interestShare = finalRow.value > 0 ? (finalRow.interest / finalRow.value) * 100 : 0;

    return {
      yearly: yearly,
      finalValue: finalRow.value,
      finalInvested: finalRow.invested,
      finalInterest: finalRow.interest,
      multiplier: multiplier,
      doublingYears: doublingYears,
      interestShare: interestShare,
      netAnnualRate: netAnnual * 100,
      noFeesValue: noFees,
      feesCost: noFees - finalRow.value
    };
  }

  /** Compare the same DCA under multiple annual rates. */
  function calcCompoundMultiRate(params, rateList) {
    const list = rateList || [2, 4, 6, 8, 10, 12];
    return list.map(function (rate) {
      const r = calcCompound(Object.assign({}, params, {
        annualRate: rate, feesPct: 0, inflation: 0
      }));
      return {
        rate: rate,
        finalValue: r.finalValue,
        finalInvested: r.finalInvested,
        multiplier: r.multiplier,
        yearly: r.yearly
      };
    });
  }

  /**
   * Inverse calculator:
   *   goal + years → required monthly contribution (annuité-due)
   *   goal + monthly → years to reach it
   */
  function calcGoal(params) {
    const p = normalize(params);
    const net = p.annualRate - p.feesPct;
    const r = rates.monthly(net);

    if (params.years) {
      const n = Math.round(p.years * 12);
      const fvInitial = p.initial * Math.pow(1 + r, n);
      const remaining = p.goal - fvInitial;
      let required;
      if (r <= 0) {
        required = n > 0 ? remaining / n : 0;
      } else {
        // Annuité-due: FV = pmt * ((1+r)^n - 1)/r * (1+r)
        const factor = ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
        required = remaining / factor;
      }
      const sim = required > 0
        ? calcCompound(Object.assign({}, params, { monthlyAmount: required }))
        : null;
      return { mode: 'monthly', requiredMonthly: Math.max(0, required), sim: sim };
    }

    // years-to-goal mode
    const monthly = p.monthly;
    let yearsToGoal;
    if (r <= 0) {
      yearsToGoal = monthly > 0 ? (p.goal - p.initial) / monthly / 12 : null;
    } else {
      const months = cashflow.yearsToGoal(p.goal, r, monthly, p.initial);
      yearsToGoal = months != null && months > 0 ? months / 12 : null;
    }
    return { mode: 'time', yearsToGoal: yearsToGoal };
  }

  /** "What if I had started N years earlier?" scenarios. */
  function calcEarlyStart(params, extras) {
    const horizons = extras || [5, 10, 15, 20];
    const horizon = params.years || 20;
    const baseline = calcCompound(params);

    return horizons.map(function (extra) {
      const full = calcCompound(Object.assign({}, params, { years: horizon + extra }));
      return {
        extra: extra,
        valueAtHorizon: full.finalValue,
        invested: full.finalInvested,
        interest: full.finalInterest,
        multiplier: full.multiplier,
        yearly: full.yearly
      };
    }).concat([{
      extra: 0,
      valueAtHorizon: baseline.finalValue,
      invested: baseline.finalInvested,
      interest: baseline.finalInterest,
      multiplier: baseline.multiplier,
      yearly: baseline.yearly
    }]).sort(function (a, b) { return a.extra - b.extra; });
  }

  /**
   * Compare the same savings plan under 4 French tax wrappers.
   * Returns envelopes sorted by netValue descending.
   *
   * Fiscal rules FR 2026:
   *   Livret A  — taux réglementé 3 %, totalement exonéré
   *   PEA       — annualRate user, exonéré IR après 5 ans (PS 17.2 % sur gains)
   *   AV        — annualRate user, frais 0.8 %/an, abat. 4 600 € après 8 ans (taux 7.5 % + PS)
   *   CTO       — annualRate user, flat tax PFU 30 % sur plus-values
   */
  function compareEnveloppes(params) {
    var p = normalize(params);
    var PS = 0.172; // prélèvements sociaux
    var AV_FEES_PCT = 0.8; // frais UC AV typiques (%/an)

    function sim(rateOverride, feesOverride) {
      return calcCompound(Object.assign({}, params, {
        annualRate: rateOverride != null ? rateOverride : params.annualRate,
        feesPct:    feesOverride != null ? feesOverride : 0,
        inflation:  0  // comparaison en nominal
      }));
    }

    // Livret A : taux fixe réglementé, exonéré total
    var livR   = sim(3, 0);
    var livNet = livR.finalValue;

    // PEA : rendement user, exonéré IR après 5 ans (PS seulement)
    var peaR    = sim(null, 0);
    var peaGains = Math.max(0, peaR.finalValue - peaR.finalInvested);
    var peaTax   = p.years >= 5 ? peaGains * PS : peaGains * 0.30;
    var peaNet   = peaR.finalValue - peaTax;

    // Assurance-Vie : rendement user, frais 0.8 %/an
    // Après 8 ans : taux 7.5 % + PS, abattement 4 600 €
    var avR     = sim(null, AV_FEES_PCT);
    var avGains  = Math.max(0, avR.finalValue - avR.finalInvested);
    var abat     = 4600;
    var avTaxBase = p.years >= 8 ? Math.max(0, avGains - abat) : avGains;
    var avTaxRate = p.years >= 8 ? (0.075 + PS) : 0.30;
    var avTax    = avTaxBase * avTaxRate;
    var avNet    = avR.finalValue - avTax;

    // CTO : rendement user, PFU 30 % sur plus-values
    var ctoR    = sim(null, 0);
    var ctoGains = Math.max(0, ctoR.finalValue - ctoR.finalInvested);
    var ctoTax   = ctoGains * 0.30;
    var ctoNet   = ctoR.finalValue - ctoTax;

    var envelopes = [
      {
        id: 'livret', label: 'Livret A',
        grossValue: livR.finalValue, taxAmount: 0, netValue: livNet,
        note: 'Taux réglementé 3 % · Exonéré d\'impôt et de PS'
      },
      {
        id: 'pea', label: 'PEA',
        grossValue: peaR.finalValue, taxAmount: peaTax, netValue: peaNet,
        note: p.years >= 5 ? 'PS 17.2 % sur gains · Exonéré IR après 5 ans' : '⚠ < 5 ans — PFU 30 %'
      },
      {
        id: 'av', label: 'Assurance-Vie',
        grossValue: avR.finalValue, taxAmount: avTax, netValue: avNet,
        note: p.years >= 8
          ? 'Taux 7.5 % + PS 17.2 % · abat. ' + abat.toLocaleString('fr-FR') + ' €'
          : '⚠ < 8 ans — PFU 30 %'
      },
      {
        id: 'cto', label: 'CTO',
        grossValue: ctoR.finalValue, taxAmount: ctoTax, netValue: ctoNet,
        note: 'Flat tax 30 % (12.8 % IR + 17.2 % PS) sur plus-values'
      }
    ];

    envelopes.sort(function (a, b) { return b.netValue - a.netValue; });

    return {
      envelopes: envelopes,
      years: p.years,
      invested: peaR.finalInvested
    };
  }

  const mod = {
    calcCompound: calcCompound,
    calcCompoundMultiRate: calcCompoundMultiRate,
    calcGoal: calcGoal,
    calcEarlyStart: calcEarlyStart,
    compareEnveloppes: compareEnveloppes
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.compound = mod;
    // Legacy global — views import this name.
    root.CalcCompound = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
