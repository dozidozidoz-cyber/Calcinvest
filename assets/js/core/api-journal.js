/* ============================================================
   CalcInvest — API Journal de Trade
   - Si Supabase configuré + user loggé → table `trades` (RLS)
   - Sinon (DEV_MODE / pas loggé) → localStorage (clé ci_trades_v1)
   Le module expose la même interface dans les 2 cas, transparent pour la view.
   ============================================================ */
(function (global) {
  'use strict';

  const LS_KEY = 'ci_trades_v1';

  function lsRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }
  function lsWrite(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
  }
  function lsAdd(trade) {
    const all = lsRead();
    trade.id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    trade.created_at = new Date().toISOString();
    trade.updated_at = trade.created_at;
    all.unshift(trade);
    lsWrite(all);
    return trade;
  }
  function lsUpdate(id, patch) {
    const all = lsRead();
    const i = all.findIndex(t => t.id === id);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch, updated_at: new Date().toISOString() };
    lsWrite(all);
    return all[i];
  }
  function lsDelete(id) {
    const all = lsRead().filter(t => t.id !== id);
    lsWrite(all);
    return true;
  }

  /* ─── Supabase REST helpers ───────────────────────────── */
  function isSupabaseReady() {
    return !!(global.CI && CI.auth && CI.auth.isLoggedIn && CI.auth.isLoggedIn() && CI.auth.getSession);
  }

  async function supaFetch(path, opts) {
    opts = opts || {};
    const session = CI.auth.getSession();
    if (!session || !session.access_token) throw new Error('Not authenticated');
    // We need the SUPABASE_URL — it's set inside auth.js as a closure.
    // Workaround : expose via window.CI.auth._supaUrl after init, OR rebuild it.
    // For now we use the same approach as auth.js : require it to be set on CI.
    const url = (global.CI && CI.SUPABASE_URL) || global.SUPABASE_URL_RUNTIME;
    const anon = (global.CI && CI.SUPABASE_ANON_KEY) || global.SUPABASE_ANON_KEY_RUNTIME;
    if (!url || !anon) throw new Error('Supabase URL/key not exposed on CI namespace');

    const res = await fetch(url + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'apikey': anon,
        'Authorization': 'Bearer ' + session.access_token,
        'Prefer': 'return=representation',
        ...(opts.headers || {})
      }
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('Supabase ' + res.status + ': ' + err);
    }
    if (res.status === 204) return null;
    return await res.json();
  }

  /* ─── API publique ────────────────────────────────────── */

  async function listTrades() {
    if (isSupabaseReady()) {
      try {
        return await supaFetch('/rest/v1/trades?select=*&order=entry_date.desc');
      } catch (e) {
        console.warn('[api-journal] Supabase échec, fallback local:', e.message);
        return lsRead();
      }
    }
    return lsRead();
  }

  async function addTrade(trade) {
    // Calcule P&L si exit_price présent
    if (trade.exit_price != null && trade.entry_price != null && trade.size != null) {
      const dir = trade.side === 'short' ? -1 : 1;
      const grossPnl = (trade.exit_price - trade.entry_price) * trade.size * dir;
      trade.pnl = grossPnl - (trade.fees || 0);
    }
    if (isSupabaseReady()) {
      try {
        const session = CI.auth.getSession();
        const user = CI.auth.getUser();
        if (!user || !user.id) throw new Error('User missing');
        const body = { ...trade, user_id: user.id };
        // Nettoie les valeurs vides
        Object.keys(body).forEach(k => { if (body[k] === '' || body[k] == null) delete body[k]; });
        const res = await supaFetch('/rest/v1/trades', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        return Array.isArray(res) ? res[0] : res;
      } catch (e) {
        console.warn('[api-journal] Supabase add échec, fallback local:', e.message);
        return lsAdd(trade);
      }
    }
    return lsAdd(trade);
  }

  async function updateTrade(id, patch) {
    if (patch.exit_price != null && patch.entry_price != null && patch.size != null) {
      const dir = patch.side === 'short' ? -1 : 1;
      patch.pnl = (patch.exit_price - patch.entry_price) * patch.size * dir - (patch.fees || 0);
    }
    if (isSupabaseReady() && !String(id).startsWith('local_')) {
      try {
        const res = await supaFetch('/rest/v1/trades?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH',
          body: JSON.stringify(patch)
        });
        return Array.isArray(res) ? res[0] : res;
      } catch (e) {
        console.warn('[api-journal] update échec:', e.message);
      }
    }
    return lsUpdate(id, patch);
  }

  async function deleteTrade(id) {
    if (isSupabaseReady() && !String(id).startsWith('local_')) {
      try {
        await supaFetch('/rest/v1/trades?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
        return true;
      } catch (e) {
        console.warn('[api-journal] delete échec:', e.message);
      }
    }
    return lsDelete(id);
  }

  /* Migration : si l'utilisateur se connecte alors qu'il a des trades en local,
     proposer de les uploader. À appeler manuellement depuis la view. */
  async function migrateLocalToSupabase() {
    if (!isSupabaseReady()) return { migrated: 0, kept: 0 };
    const local = lsRead();
    if (local.length === 0) return { migrated: 0, kept: 0 };
    let migrated = 0;
    for (const t of local) {
      try {
        const clean = { ...t };
        delete clean.id;
        delete clean.created_at;
        delete clean.updated_at;
        await addTrade(clean);
        migrated++;
      } catch (e) {
        console.warn('[migrate] échec sur trade:', e.message);
      }
    }
    if (migrated === local.length) {
      lsWrite([]); // tout migré, vider le local
    }
    return { migrated, kept: local.length - migrated };
  }

  const api = { listTrades, addTrade, updateTrade, deleteTrade, migrateLocalToSupabase, isSupabaseReady };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.JOURNAL_API = api;
})(typeof window !== 'undefined' ? window : globalThis);
