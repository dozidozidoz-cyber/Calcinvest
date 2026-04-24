/* ============================================================
   CalcInvest — Feature Flags / Tier Gates
   Pure resolver. No network, no storage coupling.
   Context is read from window.__CALCINVEST_CTX__ (set later by an
   auth layer) or passed explicitly.
   ============================================================ */
(function (root) {
  'use strict';

  /**
   * Default flag registry.
   * Values can be:
   *   - boolean (simple on/off)
   *   - function(ctx) → any value (resolved at call time)
   */
  const REGISTRY = {
    // Monte Carlo capabilities
    'mc.enabled':             function (ctx) { return true; },
    'mc.maxPaths':            function (ctx) { return ctx.tier === 'pro' ? 50000 : 5000; },
    'mc.correlated':          function (ctx) { return ctx.tier === 'pro'; },
    'mc.fatTails':            function (ctx) { return ctx.tier === 'pro'; },
    'mc.antithetic':          function (ctx) { return true; },

    // Advanced analyses
    'analysis.sensitivity':   function (ctx) { return true; },
    'analysis.monteCarlo':    function (ctx) { return true; },
    'analysis.correlation':   function (ctx) { return ctx.tier === 'pro'; },
    'analysis.sequenceRisk':  function (ctx) { return ctx.tier === 'pro'; },

    // Export / sharing
    'export.csv':             function (ctx) { return ctx.tier === 'pro'; },
    'export.pdf':             function (ctx) { return ctx.tier === 'pro'; },
    'projects.maxCount':      function (ctx) { return ctx.tier === 'pro' ? 100 : 5; }
  };

  function defaultCtx() {
    const global = typeof window !== 'undefined' ? window : root;
    return (global && global.__CALCINVEST_CTX__) || { tier: 'free' };
  }

  const flags = {
    /** Get the value of a flag. Returns undefined if unknown. */
    get: function (key, ctx) {
      const resolver = REGISTRY[key];
      if (resolver === undefined) return undefined;
      const c = ctx || defaultCtx();
      return typeof resolver === 'function' ? resolver(c) : resolver;
    },

    /** Boolean check. */
    isEnabled: function (key, ctx) {
      return !!flags.get(key, ctx);
    },

    /**
     * Throw-if-disabled guard for core code paths.
     * Use sparingly; prefer conditional rendering in views.
     */
    gate: function (key, ctx) {
      if (!flags.isEnabled(key, ctx)) {
        const err = new Error('Feature disabled for current tier: ' + key);
        err.code = 'FEATURE_GATED';
        err.flag = key;
        throw err;
      }
    },

    /** Register or override a flag (useful for tests). */
    register: function (key, resolver) {
      REGISTRY[key] = resolver;
    },

    /** Introspection. */
    list: function () {
      return Object.keys(REGISTRY);
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = flags;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.flags = flags;
  }
})(typeof window !== 'undefined' ? window : globalThis);
