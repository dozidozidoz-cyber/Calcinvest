/* ============================================================
   CalcInvest Data — asset loader
   Thin I/O layer. Takes an injectable `fetcher` so Node tests can
   substitute a filesystem-based stub. Browser default: window.fetch.
   ============================================================ */
(function (root) {
  'use strict';

  function defaultFetcher(url) {
    if (typeof fetch === 'function') {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.json();
      });
    }
    return Promise.reject(new Error('No fetcher available; inject one via asset-loader.configure'));
  }

  let _fetch = defaultFetcher;
  let _basePath = '/assets/data/';
  const _cache = {};

  const assetLoader = {
    /** Override I/O (used by Node tests). */
    configure: function (opts) {
      if (opts.fetcher) _fetch = opts.fetcher;
      if (opts.basePath) _basePath = opts.basePath;
      if (opts.clearCache) Object.keys(_cache).forEach(function (k) { delete _cache[k]; });
    },

    /** Load manifest.json. */
    loadManifest: function () {
      if (_cache.__manifest) return Promise.resolve(_cache.__manifest);
      return _fetch(_basePath + 'manifest.json').then(function (j) {
        _cache.__manifest = j;
        return j;
      });
    },

    /** Load a single asset by id (uses id.json under basePath). */
    loadAsset: function (id) {
      if (_cache[id]) return Promise.resolve(_cache[id]);
      return _fetch(_basePath + id + '.json').then(function (j) {
        _cache[id] = j;
        return j;
      });
    },

    /** Load several assets in parallel. */
    loadMany: function (ids) {
      return Promise.all(ids.map(function (id) { return assetLoader.loadAsset(id); }));
    },

    /** For tests only. */
    _cache: _cache
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = assetLoader;
  } else {
    root.ENGINE = root.ENGINE || {};
    root.ENGINE.data = root.ENGINE.data || {};
    root.ENGINE.data.assetLoader = assetLoader;
  }
})(typeof window !== 'undefined' ? window : globalThis);
