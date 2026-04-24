/* ============================================================
   CalcInvest Sim — montecarlo
   Generic Monte Carlo runner: (paths × steps) grid of returns →
   uniform output shape consumed by all calculators.

   Output shape:
   {
     terminal: Float64Array(N),          // terminal wealth per path
     paths:    [Float64Array(T+1)],      // optional sample of path trajectories (if keepPaths)
     stats:    { mean, std, percentiles: {p5,p25,p50,p75,p95}, min, max },
     successRate: number,                // fraction of paths ≥ goal (if goal provided)
     cvar05:      number,                // expected shortfall at 5%
     shortfallProb: number,              // fraction of paths terminal < goal (if goal)
     meta: { seed, N, T, method, elapsedMs }
   }
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const stats = isNode ? require('../engine/stats') : root.ENGINE.stats;

  const montecarlo = {};

  /**
   * Run N paths of length T.
   * @param opts {
   *   N: number of paths,
   *   T: number of steps,
   *   returnSampler: (pathIdx, stepIdx, rand) => monthly return (decimal),
   *   initial: initial wealth,
   *   contribution: (stepIdx) => cash added at step (default 0),
   *   withdrawal:   (stepIdx, currentWealth) => cash removed at step (default 0),
   *   goal: optional target terminal wealth,
   *   keepPaths: number of full trajectories to keep for plotting (default 50),
   *   rand: PRNG (required)
   * }
   */
  montecarlo.run = function (opts) {
    const N = opts.N;
    const T = opts.T;
    const sampler = opts.returnSampler;
    const init = opts.initial || 0;
    const contrib = opts.contribution || function () { return 0; };
    const withdraw = opts.withdrawal || function () { return 0; };
    const goal = opts.goal;
    const keep = opts.keepPaths == null ? 50 : opts.keepPaths;
    const rand = opts.rand;
    if (!rand) throw new Error('montecarlo.run requires opts.rand (PRNG)');
    if (!sampler) throw new Error('montecarlo.run requires opts.returnSampler');

    const terminal = new Float64Array(N);
    const kept = [];
    const t0 = Date.now();

    // Pick which path indices to keep (evenly spaced)
    const keepIdx = new Set();
    if (keep > 0) {
      const step = Math.max(1, Math.floor(N / keep));
      for (let i = 0; i < N && keepIdx.size < keep; i += step) keepIdx.add(i);
    }

    for (let p = 0; p < N; p++) {
      let w = init;
      const track = keepIdx.has(p);
      const trajectory = track ? new Float64Array(T + 1) : null;
      if (track) trajectory[0] = w;

      for (let t = 0; t < T; t++) {
        const r = sampler(p, t, rand);
        w = w * (1 + r) + contrib(t) - withdraw(t, w);
        if (w < 0) w = 0;
        if (track) trajectory[t + 1] = w;
      }
      terminal[p] = w;
      if (track) kept.push(trajectory);
    }

    const summary = stats.summary(terminal);
    const successRate = goal != null
      ? terminal.reduce(function (acc, v) { return acc + (v >= goal ? 1 : 0); }, 0) / N
      : null;
    const shortfallProb = goal != null ? 1 - successRate : null;
    const cvar05 = stats.cvar(terminal, 0.05);

    return {
      terminal: terminal,
      paths: kept,
      stats: summary,
      successRate: successRate,
      cvar05: cvar05,
      shortfallProb: shortfallProb,
      meta: {
        seed: opts.seed != null ? opts.seed : null,
        N: N,
        T: T,
        method: opts.method || 'unknown',
        elapsedMs: Date.now() - t0
      }
    };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = montecarlo;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.sim = root.ENGINE.sim || {};
    root.ENGINE.sim.montecarlo = montecarlo;
  }
})(typeof window !== 'undefined' ? window : globalThis);
