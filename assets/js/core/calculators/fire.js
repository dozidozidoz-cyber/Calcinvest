/* ============================================================
   CalcInvest — Calculator : FIRE (Financial Independence Retire Early)
   Uses ENGINE (rates, cashflow) + ENGINE.sim.withdrawal for the
   probabilistic decumulation phase (sequence-of-returns aware,
   seeded, block-bootstrap on historical returns).
   Pure, no DOM.
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const ENGINE = isNode ? require('../engine') : root.ENGINE;
  const rates = ENGINE.rates;
  const sampling = ENGINE.sampling;
  const rng = ENGINE.rng;
  const withdrawalSim = isNode
    ? require('../sim/withdrawal')
    : (ENGINE.sim && ENGINE.sim.withdrawal);
  const flags = isNode ? require('../flags') : (ENGINE.flags || null);

  // -- deterministic ---------------------------------------------------------

  function monthsToTarget(initial, monthly, rMonthly, target, cap) {
    let v = initial, m = 0;
    const max = cap || 600;
    while (v < target && m < max) {
      v = (v + monthly) * (1 + rMonthly);
      m++;
    }
    return { months: m, value: v };
  }

  function calcFIRE(p) {
    const annualReturn   = p.annualReturn   != null ? p.annualReturn   : 7;
    const withdrawalRate = (p.withdrawalRate != null ? p.withdrawalRate : 4) / 100;
    const inflation      = p.inflation      != null ? p.inflation      : 2;
    const safetyMargin   = (p.safetyMargin   || 0) / 100;
    const currentAge     = p.currentAge     || 30;
    const annualExpenses = p.annualExpenses || 30000;
    const currentSavings = p.currentSavings || 0;
    const monthlyContrib = p.monthlyContrib || 1000;

    const r = rates.monthly(annualReturn / 100);

    const fireTarget    = (annualExpenses / withdrawalRate) * (1 + safetyMargin);
    const leanTarget    = (annualExpenses * 0.7)  / withdrawalRate;
    const fatTarget     = (annualExpenses * 1.5)  / withdrawalRate;
    const baristaTarget = (annualExpenses * 0.5) / withdrawalRate;

    // Trajectory to main target
    let value = currentSavings, months = 0, totalInvested = currentSavings;
    const trajectory = [{ month: 0, value: currentSavings, invested: currentSavings }];
    while (value < fireTarget && months < 600) {
      value = (value + monthlyContrib) * (1 + r);
      totalInvested += monthlyContrib;
      months++;
      if (months % 12 === 0) trajectory.push({ month: months, value: value, invested: totalInvested });
    }

    const yearsToFire = months / 12;
    const fireAge = currentAge + yearsToFire;

    const lean    = monthsToTarget(currentSavings, monthlyContrib, r, leanTarget);
    const fat     = monthsToTarget(currentSavings, monthlyContrib, r, fatTarget);
    const barista = monthsToTarget(currentSavings, monthlyContrib, r, baristaTarget);

    const coastCapital = fireTarget / Math.pow(1 + annualReturn / 100, yearsToFire || 20);
    const isCoastFIRE = currentSavings >= coastCapital;

    const withdrawalSimulation = simulateWithdrawal(
      fireTarget, annualExpenses, annualReturn, inflation, 50
    );

    return {
      fireTarget: fireTarget, leanTarget: leanTarget, fatTarget: fatTarget,
      baristaTarget: baristaTarget, coastCapital: coastCapital,
      fireAge: fireAge, yearsToFire: yearsToFire,
      finalValue: value, totalContributed: totalInvested,
      achieved: value >= fireTarget, isCoastFIRE: isCoastFIRE,
      leanAge:    currentAge + lean.months    / 12,
      fatAge:     currentAge + fat.months     / 12,
      baristaAge: currentAge + barista.months / 12,
      leanYears:  lean.months    / 12,
      fatYears:   fat.months     / 12,
      baristaYears: barista.months / 12,
      trajectory: trajectory,
      withdrawalSimulation: withdrawalSimulation,
      withdrawalRate: withdrawalRate * 100,
      annualReturn: annualReturn,
      inflation: inflation
    };
  }

  /** Deterministic withdrawal with inflation-indexed expenses. */
  function simulateWithdrawal(capital, annualExpenses, annualReturn, inflation, maxYears) {
    const r = rates.monthly(annualReturn / 100);
    const rInf = (inflation / 100) / 12;
    let v = capital, exp = annualExpenses / 12;
    const pts = [{ year: 0, value: capital, expenses: annualExpenses }];
    for (let y = 1; y <= maxYears; y++) {
      for (let m = 0; m < 12; m++) {
        v = v * (1 + r) - exp;
        exp = exp * (1 + rInf);
        if (v <= 0) { v = 0; break; }
      }
      pts.push({ year: y, value: Math.max(0, v), expenses: exp * 12 });
      if (v <= 0) break;
    }
    const depleted = v <= 0;
    const depletedYear = depleted ? pts.findIndex(function (p) { return p.value === 0; }) : null;
    return { pts: pts, depleted: depleted, depletedYear: depletedYear, finalValue: v };
  }

  function calcFireSensitivity(p) {
    const returns = [4, 5, 6, 7, 8, 9, 10];
    const rates_ = [3, 3.5, 4, 4.5, 5];
    return {
      byReturn: returns.map(function (ret) {
        const r = calcFIRE(Object.assign({}, p, { annualReturn: ret }));
        return { return: ret, years: r.yearsToFire, age: r.fireAge, target: r.fireTarget };
      }),
      byWithdrawal: rates_.map(function (wr) {
        const r = calcFIRE(Object.assign({}, p, { withdrawalRate: wr }));
        return { rate: wr, years: r.yearsToFire, target: r.fireTarget, age: r.fireAge };
      })
    };
  }

  // -- probabilistic ---------------------------------------------------------

  /**
   * Upgraded Monte Carlo FIRE: seeded, block-bootstrap on historical monthly
   * returns, sequence-of-returns aware, inflation-indexed withdrawals.
   *
   * @param {object} opts {
   *   capital, annualExpenses, years, monthlyReturns, simulations, seed,
   *   inflation (decimal, default 0.02), blockLen (default 12),
   *   method ('block-bootstrap' | 'iid'), fatTail (bool, adds Student-t kicker)
   * }
   * Returns: { successRate, runs, percentiles, cvar05, terminal, meta }
   */
  function calcMonteCarloFIRE(opts) {
    // Legacy positional signature support:
    //   calcMonteCarloFIRE(capital, annualExpenses, monthlyReturns, years, runs)
    if (typeof opts === 'number') {
      opts = {
        capital: arguments[0], annualExpenses: arguments[1],
        monthlyReturns: arguments[2], years: arguments[3], simulations: arguments[4]
      };
    }
    const capital = opts.capital;
    const annualExpenses = opts.annualExpenses;
    const hist = opts.monthlyReturns || [];
    const years = opts.years || 30;
    const ctx = opts.ctx || null;
    const maxPaths = flags ? flags.get('mc.maxPaths', ctx) : 50000;
    const N = Math.min(maxPaths, Math.max(100, opts.simulations || 2000));
    const seed = opts.seed != null ? opts.seed : 1337;
    const inflation = opts.inflation != null ? opts.inflation : 0.02;
    const block = opts.blockLen || 12;
    const method = opts.method || 'block-bootstrap';
    const fatTailsAllowed = flags ? flags.isEnabled('mc.fatTails', ctx) : true;
    const fatTail = !!opts.fatTail && fatTailsAllowed;

    if (!hist.length || hist.length < 12) return null;

    const rand = rng.mulberry32(seed);

    // Pre-sample per-path return sequences so each sampler call is O(1).
    const months = years * 12;
    const pathReturns = new Array(N);
    for (let p = 0; p < N; p++) {
      pathReturns[p] = method === 'iid'
        ? sampling.iidBootstrap(hist, months, rand)
        : sampling.stationaryBootstrap(hist, months, block, rand);
    }

    // Optional fat-tail kicker
    let fat = null;
    let mu = 0, sigma = 0;
    if (fatTail) {
      for (let i = 0; i < hist.length; i++) mu += hist[i];
      mu /= hist.length;
      for (let i = 0; i < hist.length; i++) sigma += (hist[i] - mu) * (hist[i] - mu);
      sigma = Math.sqrt(sigma / Math.max(1, hist.length - 1));
      fat = rng.studentT(rand, 4);
    }

    const result = withdrawalSim.run({
      N: N,
      years: years,
      initial: capital,
      annualWithdrawal: annualExpenses,
      inflationAnnual: inflation,
      returnSampler: function (p, t) {
        let r = pathReturns[p][t];
        if (fat && rand() < 0.1) {
          r = mu + sigma * fat();
          if (r < -0.999) r = -0.999;
        }
        return r;
      },
      rand: rand
    });

    // Annual percentile snapshots via second reproducible pass
    const rand2 = rng.mulberry32(seed);
    const path2 = new Array(N);
    for (let p = 0; p < N; p++) {
      path2[p] = method === 'iid'
        ? sampling.iidBootstrap(hist, months, rand2)
        : sampling.stationaryBootstrap(hist, months, block, rand2);
    }
    const fat2 = fatTail ? rng.studentT(rand2, 4) : null;
    const snapshots = [];
    for (let y = 0; y <= years; y++) snapshots.push(new Float64Array(N));
    for (let p = 0; p < N; p++) {
      let w = capital;
      let infFactor = 1;
      const monthlyW0 = annualExpenses / 12;
      const infM = Math.pow(1 + inflation, 1 / 12) - 1;
      snapshots[0][p] = w;
      for (let t = 0; t < months; t++) {
        let r = path2[p][t];
        if (fat2 && rand2() < 0.1) { r = mu + sigma * fat2(); if (r < -0.999) r = -0.999; }
        w = w * (1 + r);
        infFactor *= 1 + infM;
        w -= monthlyW0 * infFactor;
        if (w <= 0) { w = 0; }
        if (((t + 1) % 12) === 0) {
          const yi = (t + 1) / 12;
          if (yi <= years) snapshots[yi][p] = w;
        }
      }
    }

    const quant = ENGINE.stats.quantile;
    const percentiles = snapshots.map(function (snap, y) {
      return {
        year: y,
        p10: quant(snap, 0.10),
        p50: quant(snap, 0.50),
        p90: quant(snap, 0.90)
      };
    });

    return {
      successRate: result.survivalRate * 100,
      runs: N,
      percentiles: percentiles,
      terminal: result.terminal,
      stats: result.stats,
      cvar05: ENGINE.stats.cvar(result.terminal, 0.05),
      meta: { seed: seed, N: N, T: months, method: method, fatTail: fatTail }
    };
  }

  const mod = {
    calcFIRE: calcFIRE,
    simulateWithdrawal: simulateWithdrawal,
    calcFireSensitivity: calcFireSensitivity,
    calcMonteCarloFIRE: calcMonteCarloFIRE
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.fire = mod;
    root.CalcFIRE = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
