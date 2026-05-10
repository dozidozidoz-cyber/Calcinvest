/* ============================================================
   CalcInvest — auth.js
   Supabase auth wrapper + session management
   Expose : CI.auth.*  et CI.isPremium()

   ⚙️  CONFIG — à remplir demain matin avec tes clés Supabase
   ============================================================ */

(function (global) {
  'use strict';

  /* ----------------------------------------------------------
     🔑  PLACEHOLDER — remplacer par tes vraies clés Supabase
     Settings → API → Project URL + anon public key
     ---------------------------------------------------------- */
  const SUPABASE_URL  = 'https://VOTRE_PROJECT_ID.supabase.co';
  const SUPABASE_KEY  = 'VOTRE_ANON_PUBLIC_KEY';

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
