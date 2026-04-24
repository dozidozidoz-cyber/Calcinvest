/* ============================================================
   CalcInvest — Calculator : DCA (unified stocks + crypto)
   Wraps legacy deterministic functions and adds an upgraded
   probabilistic Monte Carlo on top of ENGINE primitives:
     - seeded PRNG (reproducible)
     - stationary block bootstrap (Politis-Romano)
     - Student-t overlay (optional, for crypto fat tails)
     - uniform MC output shape (terminal/percentiles/cvar05/successRate)

   Public API (browser: window.Calculators.dca, legacy: window.CalcDCA / window.CalcDCACrypto) :
     stocks    : calcDCA, computeAssetStats, computeLumpVsDCA,
                 computeVolatilityCAPE, computeRollingReturns,
                 computeFiscalImpact, computeDecaissement, computeValueAveraging
     crypto    : calcCryptoDCA, computeYearlyReturns, computeDrawdown,
                 computeRollingVolatility, detectCycles, calcLumpSumVsDCA,
                 calcMultiCryptoComp
     unified   : monteCarloAdvanced({prices, dividends?, assetType, seed, …})
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const ENGINE = isNode ? require('../engine') : root.ENGINE;
  const stocks = isNode
    ? require('../calc-dca')
    : (root.CalcDCA || {});
  const crypto = isNode
    ? require('../calc-dca-crypto')
    : (root.CalcDCACrypto || {});

  const rng = ENGINE.rng;
  const sampling = ENGINE.sampling;
  const montecarlo = isNode
    ? require('../sim/montecarlo')
    : (ENGINE.sim && ENGINE.sim.montecarlo);
  const flags = isNode ? require('../flags') : (ENGINE.flags || null);
  const units = ENGINE.units;

  /**
   * Advanced Monte Carlo for DCA.
   *   assetType: 'stocks' | 'crypto' (only changes default sampler flavour)
   *   method:    'block-bootstrap' (default) | 'student-t' | 'iid'
   * Returns the uniform MC output shape from ENGINE.sim.montecarlo.run,
   *   augmented with `years`, `investedLine`, `percentileBands`, `totalInvested`.
   */
  function monteCarloAdvanced(opts) {
    opts = opts || {};
    const prices = opts.prices || [];
    const dividends = opts.dividends || null;
    const horizonMonths = Math.max(1, Math.round((opts.horizonYears || 20) * 12));
    const ctx = opts.ctx || null;
    const maxPaths = flags ? flags.get('mc.maxPaths', ctx) : 50000;
    const N = Math.min(maxPaths, Math.max(100, Math.round(opts.simulations || 5000)));
    const initial = opts.initialAmount || 0;
    const monthly = opts.monthlyAmount || 0;
    const feesMonthly = (opts.feesPct || 0) / 100 / 12;
    const reinvestDivs = opts.dividendsReinvested && dividends && dividends.length === prices.length;
    const assetType = opts.assetType || 'stocks';
    const method = opts.method || 'block-bootstrap';
    const block = opts.blockLen || 12;
    const df = opts.studentDf || 4;
    const seed = opts.seed != null ? opts.seed : 42;
    const goal = opts.goal != null ? opts.goal : null;

    // Build monthly returns from historical prices
    const hist = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > 0 && prices[i - 1] > 0) {
        hist.push(prices[i] / prices[i - 1] - 1);
      }
    }
    if (hist.length < 12) return null;

    // Average monthly dividend yield (Shiller dividends are points/month)
    let avgDivYield = 0;
    if (reinvestDivs) {
      let s = 0, c = 0;
      for (let i = 0; i < dividends.length; i++) {
        if (dividends[i] > 0 && prices[i] > 0) { s += dividends[i] / prices[i]; c++; }
      }
      avgDivYield = c > 0 ? s / c : 0;
    }

    // Empirical moments (used if method='student-t')
    let mu = 0, sigma = 0;
    if (method === 'student-t') {
      for (let i = 0; i < hist.length; i++) mu += hist[i];
      mu /= hist.length;
      for (let i = 0; i < hist.length; i++) sigma += (hist[i] - mu) * (hist[i] - mu);
      sigma = Math.sqrt(sigma / Math.max(1, hist.length - 1));
    }

    const rand = rng.mulberry32(seed);
    const tSampler = method === 'student-t' ? rng.studentT(rand, df) : null;

    // Pre-build per-path sequence to keep the path reproducible path-by-path.
    // We draw one long sample and let montecarlo.run consume it per step.
    // To avoid constructing an NxT matrix, generate on the fly inside returnSampler.
    // That breaks reproducibility if keepPaths reorders draws → it doesn't: run()
    // walks paths sequentially.

    function returnSampler(pathIdx, stepIdx) {
      let r;
      if (method === 'student-t') {
        // Scaled student-t, clipped at -99.9%
        r = mu + sigma * tSampler();
        if (r < -0.999) r = -0.999;
      } else if (method === 'iid') {
        r = sampling.iidBootstrap(hist, 1, rand)[0];
      } else {
        // stationary block bootstrap, one draw at a time: cheaper to pre-sample per path
        // but doing per-step keeps memory O(1). Acceptable for O(1e5) total draws.
        r = hist[(Math.floor(rand() * hist.length))];
        // promote to block: with prob 1/block, restart; otherwise advance.
        // Since montecarlo.run doesn't expose state across steps for the sampler,
        // we pre-generate the full path via closure:
      }
      return r;
    }

    // For true block bootstrap we need per-path state. Re-implement by pre-sampling
    // each path's full sequence of returns via stationaryBootstrap.
    let pathReturns = null;
    if (method === 'block-bootstrap') {
      pathReturns = new Array(N);
      for (let p = 0; p < N; p++) {
        pathReturns[p] = sampling.stationaryBootstrap(hist, horizonMonths, block, rand);
      }
    }

    // Crypto default: add a Student-t kicker if user didn't choose method explicitly
    // and asset is crypto → better fat-tail coverage. Pro tier only.
    const fatTailsAllowed = flags ? flags.isEnabled('mc.fatTails', ctx) : true;
    const cryptoFatTail = (assetType === 'crypto' && !opts.method && fatTailsAllowed);
    let fatSampler = null;
    if (cryptoFatTail) {
      // 20% of draws are from a Student-t(df=4) scaled to empirical moments.
      let mm = 0, ss = 0;
      for (let i = 0; i < hist.length; i++) mm += hist[i];
      mm /= hist.length;
      for (let i = 0; i < hist.length; i++) ss += (hist[i] - mm) * (hist[i] - mm);
      ss = Math.sqrt(ss / Math.max(1, hist.length - 1));
      const fat = rng.studentT(rand, df);
      fatSampler = function () {
        let r = mm + ss * fat();
        if (r < -0.999) r = -0.999;
        return r;
      };
    }

    function sampler(pathIdx, stepIdx) {
      let r;
      if (pathReturns) {
        r = pathReturns[pathIdx][stepIdx];
      } else {
        r = returnSampler(pathIdx, stepIdx);
      }
      if (cryptoFatTail && rand() < 0.2) r = fatSampler();
      // Apply dividend yield + fees inline (compounded on return leg)
      if (reinvestDivs) r = (1 + r) * (1 + avgDivYield) - 1;
      if (feesMonthly > 0) r = (1 + r) * (1 - feesMonthly) - 1;
      return r;
    }

    const result = montecarlo.run({
      N: N,
      T: horizonMonths,
      returnSampler: sampler,
      initial: initial,
      contribution: function () { return monthly; },
      goal: goal,
      keepPaths: opts.keepPaths == null ? 50 : opts.keepPaths,
      rand: rand,
      seed: seed,
      method: cryptoFatTail ? 'block-bootstrap+t-kicker' : method
    });

    // Build yearly percentile bands by replaying each kept path at annual snapshots
    const years = [];
    for (let y = 1; y * 12 <= horizonMonths; y++) years.push(y);
    const investedLine = years.map(function (y) { return initial + monthly * y * 12; });
    const totalInvested = initial + monthly * horizonMonths;

    // For band curves, re-run a lightweight pass collecting snapshots.
    // Rather than double-computing, compute snapshots inline via a second MC pass
    // using the SAME seed → identical sequences, thanks to mulberry32 determinism.
    const rand2 = rng.mulberry32(seed);
    const snap = years.map(function () { return new Float64Array(N); });
    // Regenerate path returns if needed (same seed → same draws only if same consumption).
    // Simpler: do a clean re-run with a fresh PRNG producing identical results.
    const path2 = method === 'block-bootstrap' ? new Array(N) : null;
    if (path2) {
      for (let p = 0; p < N; p++) path2[p] = sampling.stationaryBootstrap(hist, horizonMonths, block, rand2);
    }
    const fat2 = cryptoFatTail ? rng.studentT(rand2, df) : null;
    let mu2 = 0, sigma2 = 0;
    if (method === 'student-t' || cryptoFatTail) {
      for (let i = 0; i < hist.length; i++) mu2 += hist[i];
      mu2 /= hist.length;
      for (let i = 0; i < hist.length; i++) sigma2 += (hist[i] - mu2) * (hist[i] - mu2);
      sigma2 = Math.sqrt(sigma2 / Math.max(1, hist.length - 1));
    }
    const tS2 = method === 'student-t' ? rng.studentT(rand2, df) : null;

    for (let p = 0; p < N; p++) {
      let w = initial;
      for (let t = 0; t < horizonMonths; t++) {
        let r;
        if (path2) r = path2[p][t];
        else if (method === 'student-t') { r = mu2 + sigma2 * tS2(); if (r < -0.999) r = -0.999; }
        else r = hist[Math.floor(rand2() * hist.length)];
        if (cryptoFatTail && rand2() < 0.2) {
          r = mu2 + sigma2 * fat2();
          if (r < -0.999) r = -0.999;
        }
        if (reinvestDivs) r = (1 + r) * (1 + avgDivYield) - 1;
        if (feesMonthly > 0) r = (1 + r) * (1 - feesMonthly) - 1;
        w = w * (1 + r) + monthly;
        if (w < 0) w = 0;
        if (((t + 1) % 12) === 0) {
          const yi = ((t + 1) / 12) - 1;
          if (yi < snap.length) snap[yi][p] = w;
        }
      }
    }

    const bands = { p5: [], p25: [], p50: [], p75: [], p95: [] };
    const quant = ENGINE.stats.quantile;
    for (let i = 0; i < snap.length; i++) {
      bands.p5.push(quant(snap[i], 0.05));
      bands.p25.push(quant(snap[i], 0.25));
      bands.p50.push(quant(snap[i], 0.50));
      bands.p75.push(quant(snap[i], 0.75));
      bands.p95.push(quant(snap[i], 0.95));
    }

    return Object.assign({}, result, {
      years: years,
      investedLine: investedLine,
      totalInvested: totalInvested,
      percentileBands: bands,
      probPositive: result.terminal
        ? Array.from(result.terminal).filter(function (v) { return v > totalInvested; }).length / N * 100
        : 0
    });
  }

  const mod = {
    // Stocks (delegated)
    calcDCA: stocks.calcDCA,
    computeAssetStats: stocks.computeAssetStats,
    computeLumpVsDCA: stocks.computeLumpVsDCA,
    computeVolatilityCAPE: stocks.computeVolatilityCAPE,
    computeMonteCarlo: stocks.computeMonteCarlo, // legacy (non-seeded)
    computeRollingReturns: stocks.computeRollingReturns,
    computeFiscalImpact: stocks.computeFiscalImpact,
    computeDecaissement: stocks.computeDecaissement,
    computeValueAveraging: stocks.computeValueAveraging,

    // Crypto (delegated)
    calcCryptoDCA: crypto.calcCryptoDCA,
    computeYearlyReturnsCrypto: crypto.computeYearlyReturns,
    computeDrawdown: crypto.computeDrawdown,
    computeRollingVolatility: crypto.computeRollingVolatility,
    detectCycles: crypto.detectCycles,
    calcLumpSumVsDCA: crypto.calcLumpSumVsDCA,
    calcMultiCryptoComp: crypto.calcMultiCryptoComp,

    // Unified upgrade
    monteCarloAdvanced: monteCarloAdvanced
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.dca = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
