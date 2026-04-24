/* ============================================================
   CalcInvest Data — manifest parser
   Reads assets/data/manifest.json and exposes typed accessors.
   features[] array is now consumed (was dead field previously).
   ============================================================ */
(function (root) {
  'use strict';

  const manifest = {};

  /**
   * Parse a manifest JSON (already fetched) into a normalized shape.
   * Expected input:
   *   { assets: [ { id, name, category, currency, pea, file, features?, status? }, ... ] }
   * Returns:
   *   {
   *     all: [...],
   *     byId: { id: asset },
   *     live: [...], soon: [...],
   *     byCategory: { equity: [...], commodity: [...], crypto: [...] },
   *     hasFeature(id, feature) → boolean
   *   }
   */
  manifest.parse = function (raw) {
    const assets = (raw && raw.assets) || [];
    const byId = {};
    const byCategory = {};
    const live = [];
    const soon = [];

    assets.forEach(function (a) {
      byId[a.id] = a;
      const cat = a.category || 'other';
      (byCategory[cat] = byCategory[cat] || []).push(a);
      if (a.status === 'soon') soon.push(a); else live.push(a);
    });

    return {
      all: assets,
      byId: byId,
      live: live,
      soon: soon,
      byCategory: byCategory,
      hasFeature: function (id, feature) {
        const a = byId[id];
        return !!(a && Array.isArray(a.features) && a.features.indexOf(feature) >= 0);
      },
      get: function (id) { return byId[id] || null; }
    };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = manifest;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.data = root.ENGINE.data || {};
    root.ENGINE.data.manifest = manifest;
  }
})(typeof window !== 'undefined' ? window : globalThis);
