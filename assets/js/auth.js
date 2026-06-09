/* ============================================================
   CalcInvest — auth.js
   Supabase auth wrapper + session management
   Expose : CI.auth.*  et CI.isPremium()

   ⚙️  CONFIG — à remplir demain matin avec tes clés Supabase
   ============================================================ */

(function (global) {
  'use strict';

  /* ----------------------------------------------------------
     🔑  Config Supabase chargée depuis /api/config (Vercel env vars)
     Fallback : tu peux aussi mettre tes clés ici en dur si tu préfères
     ne pas dépendre d'un appel API au boot (PWA offline).
     ---------------------------------------------------------- */
  let SUPABASE_URL  = 'https://VOTRE_PROJECT_ID.supabase.co';
  let SUPABASE_KEY  = 'VOTRE_ANON_PUBLIC_KEY';

  /* DEV_MODE auto-détecté : true tant que les vraies clés ne sont
     pas chargées (depuis /api/config OU codées en dur).
     → isPremium() retourne true, la paywall ne bloque rien,
       un badge "Mode dev" s'affiche en bas à droite. */
  let DEV_MODE = SUPABASE_URL.includes('VOTRE_PROJECT_ID');

  /* Chargement async des clés publiques depuis /api/config */
  async function loadRemoteConfig() {
    if (!DEV_MODE) return; // déjà configuré en dur, rien à faire
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg && cfg.supabase && cfg.supabase.url && cfg.supabase.anonKey) {
        SUPABASE_URL = cfg.supabase.url;
        SUPABASE_KEY = cfg.supabase.anonKey;
        DEV_MODE = false;
        // Expose sur CI pour les modules externes (api-journal, etc.)
        if (global.CI) {
          global.CI.SUPABASE_URL = SUPABASE_URL;
          global.CI.SUPABASE_ANON_KEY = SUPABASE_KEY;
        }
        console.log('[auth] Config Supabase chargée depuis /api/config (env:', cfg.env, ')');
      }
    } catch (e) {
      // Silencieux : si /api/config indispo (PWA offline, dev local sans Vercel),
      // on reste en DEV_MODE et la paywall est désactivée.
    }
  }

  /* Clé localStorage pour la session */
  const SESSION_KEY   = 'ci_session_v1';
  const USER_KEY      = 'ci_user_v1';

  /* ----------------------------------------------------------
     Client Supabase minimaliste (sans SDK CDN)
     On fait les appels REST directement pour éviter un script 80 KB
     ---------------------------------------------------------- */
  async function supaFetch(path, opts = {}) {
    const url  = SUPABASE_URL + path;
    const res  = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + (getSession()?.access_token || SUPABASE_KEY),
        ...(opts.headers || {})
      }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error_description || json.message || json.msg || 'Erreur Supabase');
    return json;
  }

  /* ----------------------------------------------------------
     Session — stockée en localStorage, auto-refresh via refresh_token
     ---------------------------------------------------------- */
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }
  function setUser(u) {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }

  async function refreshSession() {
    const s = getSession();
    if (!s?.refresh_token) return null;
    try {
      const data = await supaFetch('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      setSession(data);
      setUser(data.user);
      return data;
    } catch {
      setSession(null);
      setUser(null);
      return null;
    }
  }

  /* ----------------------------------------------------------
     Auth methods
     ---------------------------------------------------------- */
  async function signUp(email, password, meta = {}) {
    const data = await supaFetch('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: meta })
    });
    if (data.access_token) { setSession(data); setUser(data.user); }
    return data;
  }

  async function signIn(email, password) {
    const data = await supaFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setSession(data);
    setUser(data.user);
    return data;
  }

  async function signOut() {
    const s = getSession();
    if (s?.access_token) {
      await supaFetch('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    }
    setSession(null);
    setUser(null);
    // Notifier la page
    window.dispatchEvent(new Event('ci:signout'));
  }

  async function resetPassword(email) {
    return supaFetch('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email, redirect_to: window.location.origin + '/connexion.html?reset=1' })
    });
  }

  /* ----------------------------------------------------------
     Premium check via user_metadata (mis à jour par webhook Stripe)
     ---------------------------------------------------------- */
  function isPremium() {
    // 🛠️ Mode dev : tout débloqué
    if (DEV_MODE) return true;

    const u = getUser();
    if (!u) return false;
    const meta = u.user_metadata || {};
    if (meta.plan === 'premium') {
      // Vérifie expiration
      if (meta.premium_until) {
        return new Date(meta.premium_until) > new Date();
      }
      return true;
    }
    return false;
  }

  function isLoggedIn() {
    // 🛠️ Mode dev : faux mais débloqué via isPremium()
    if (DEV_MODE) return false;

    const s = getSession();
    if (!s?.access_token) return false;
    // Vérif expiration du JWT (exp en secondes)
    try {
      const payload = JSON.parse(atob(s.access_token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) return false;
    } catch { return false; }
    return true;
  }

  /* ----------------------------------------------------------
     Mode dev — badge discret + console info
     ---------------------------------------------------------- */
  /* 🚀 PRE-LAUNCH : badge dev + console log masqués. Pour réactiver en
     local pendant le dev, mettre HIDE_DEV_BADGE = false. */
  const HIDE_DEV_BADGE = true;

  function renderDevBadge() {
    if (!DEV_MODE) return;
    if (HIDE_DEV_BADGE) return;
    if (document.getElementById('ci-dev-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'ci-dev-badge';
    badge.style.cssText = `
      position: fixed; bottom: 12px; right: 12px;
      background: rgba(217,119,6,0.92); color: #fff;
      padding: 5px 12px; border-radius: 99px;
      font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
      font-family: 'JetBrains Mono', monospace;
      box-shadow: 0 4px 12px rgba(217,119,6,0.30);
      z-index: 9999; pointer-events: none;
      backdrop-filter: blur(8px);
    `;
    badge.textContent = '🛠 Mode dev · Premium débloqué';
    document.body.appendChild(badge);
    console.info('%c[CalcInvest] Mode dev actif', 'color:#D97706;font-weight:600',
      '— Supabase n\'est pas configuré, toutes les analyses Premium sont débloquées.');
  }

  /* ----------------------------------------------------------
     Auto-refresh toutes les 50 minutes (tokens Supabase = 1h)
     ---------------------------------------------------------- */
  function startAutoRefresh() {
    if (!isLoggedIn()) return;
    setInterval(() => {
      if (isLoggedIn()) refreshSession();
    }, 50 * 60 * 1000);
  }

  /* ----------------------------------------------------------
     Render topbar user zone (appelé depuis chaque page)
     ---------------------------------------------------------- */
  function renderTopbarUser() {
    const container = document.getElementById('ci-user-zone');
    if (!container) return;

    // 🚀 PRE-LAUNCH : auth UI désactivée. On préserve le contenu HTML
    // initial du container (ex: bouton "Projets") + les éléments injectés
    // par d'autres modules (theme-toggle, cmdk-trigger) — sinon ils
    // disparaissent. On ne fait que retirer les éventuels éléments
    // d'auth (connexion, compte, déconnexion) déjà rendus.
    if (true /* HIDE_AUTH_UI */) {
      container.querySelectorAll('[data-auth-ui]').forEach(el => el.remove());
      return;
    }

    // 🛠️ Mode dev : juste un lien tarifs (pas d'auth fonctionnelle)
    if (DEV_MODE) {
      container.innerHTML = `
        <a href="/abonnement" class="btn-ghost" style="font-size:13px">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polygon points="8 1 10 5.5 15 6.3 11.5 9.7 12.4 14.7 8 12.3 3.6 14.7 4.5 9.7 1 6.3 6 5.5"/></svg>
          Tarifs
        </a>`;
      return;
    }

    if (!isLoggedIn()) {
      container.innerHTML = `
        <a href="/connexion" class="btn-ghost" style="font-size:13px">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
            <circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
          </svg>
          Connexion
        </a>
        <a href="/abonnement" class="btn-accent" style="font-size:13px">
          Premium ✦
        </a>`;
      return;
    }

    const u    = getUser();
    const plan = isPremium() ? 'premium' : 'gratuit';
    const email = u?.email || '';
    const initiale = email.charAt(0).toUpperCase();

    container.innerHTML = `
      <div class="user-menu-wrap">
        <button class="user-avatar-btn" id="ci-user-btn" aria-label="Menu compte">
          <div class="user-avatar">${initiale}</div>
          ${isPremium() ? '<span class="user-badge-premium">✦</span>' : ''}
        </button>
        <div class="user-dropdown" id="ci-user-dropdown">
          <div class="user-dropdown-header">
            <div class="user-dropdown-email">${email}</div>
            <div class="user-dropdown-plan ${plan}">${plan === 'premium' ? '✦ Premium' : 'Gratuit'}</div>
          </div>
          <div class="user-dropdown-divider"></div>
          ${plan !== 'premium' ? `<a href="/abonnement" class="user-dropdown-item accent">✦ Passer Premium</a>` : ''}
          <a href="/mes-projets" class="user-dropdown-item">Mes projets</a>
          <a href="/abonnement" class="user-dropdown-item">Mon abonnement</a>
          <div class="user-dropdown-divider"></div>
          <button class="user-dropdown-item danger" id="ci-signout-btn">Se déconnecter</button>
        </div>
      </div>`;

    // Toggle dropdown
    const btn = document.getElementById('ci-user-btn');
    const drop = document.getElementById('ci-user-dropdown');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      drop.classList.toggle('open');
    });
    document.addEventListener('click', () => drop.classList.remove('open'));

    // Sign out
    document.getElementById('ci-signout-btn').addEventListener('click', async () => {
      await signOut();
      window.location.href = '/';
    });
  }

  /* ----------------------------------------------------------
     Init global
     ---------------------------------------------------------- */
  async function init() {
    // Tente de charger la config depuis /api/config (env vars Vercel)
    await loadRemoteConfig();

    // 🛠️ Mode dev : skip Supabase, juste afficher la topbar et le badge
    if (DEV_MODE) {
      renderTopbarUser();
      renderDevBadge();
      return;
    }
    // Si token expiré, tente refresh
    if (getSession() && !isLoggedIn()) {
      await refreshSession();
    }
    startAutoRefresh();
    renderTopbarUser();
  }

  /* ----------------------------------------------------------
     Expose sur CI.auth
     ---------------------------------------------------------- */
  const CI = global.CI || {};

  CI.auth = {
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshSession,
    getUser,
    getSession,
    isLoggedIn,
  };

  CI.isPremium = isPremium;
  CI.isLoggedIn = isLoggedIn;
  CI.authInit = init;

  global.CI = CI;

  /* Auto-init au chargement */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
