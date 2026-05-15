/* ============================================================
   CalcInvest — paywall.js
   Overlay paywall sur les sections [data-tier="premium"]

   Règles :
   - Si isPremium()  → rien, tout est visible
   - Si loggedIn()   → overlay "Passez Premium" sur chaque section premium
   - Si !loggedIn()  → overlay "Créez un compte" sur chaque section premium
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     Templates overlay
     ---------------------------------------------------------- */
  function overlayLoggedOut() {
    return `
      <div class="paywall-overlay">
        <div class="paywall-card">
          <div class="paywall-icon">✦</div>
          <div class="paywall-title">Analyses avancées</div>
          <div class="paywall-desc">Créez un compte gratuit pour accéder aux analyses détaillées — graphiques, heatmaps, Monte Carlo, insights.</div>
          <div class="paywall-actions">
            <a href="/inscription" class="paywall-btn-primary">Créer un compte gratuit</a>
            <a href="/connexion" class="paywall-btn-ghost">Déjà inscrit ?</a>
          </div>
        </div>
      </div>`;
  }

  function overlayFreeUser() {
    return `
      <div class="paywall-overlay">
        <div class="paywall-card">
          <div class="paywall-icon">✦</div>
          <div class="paywall-title">Fonctionnalité Premium</div>
          <div class="paywall-desc">Cette analyse est réservée aux membres Premium. Accédez à toutes les analyses, sans publicité, pour <strong>4,90 €/mois</strong>.</div>
          <div class="paywall-actions">
            <a href="/abonnement" class="paywall-btn-primary">Passer Premium — 4,90 €/mois</a>
            <div class="paywall-features">
              <span>✓ Toutes les analyses</span>
              <span>✓ Sans pub</span>
              <span>✓ Export PDF</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ----------------------------------------------------------
     Apply paywall to all [data-tier="premium"] sections
     ---------------------------------------------------------- */
  function applyPaywalls() {
    const CI = window.CI;
    if (!CI) return;

    // Si premium → tout débloquer (retire d'éventuels overlays anciens)
    if (CI.isPremium && CI.isPremium()) {
      document.querySelectorAll('.paywall-wrapped').forEach(section => {
        const inner = section.querySelector('.paywall-content-blur');
        const overlay = section.querySelector('.paywall-overlay');
        if (inner) {
          // Restaure les enfants
          while (inner.firstChild) section.insertBefore(inner.firstChild, inner);
          inner.remove();
        }
        if (overlay) overlay.remove();
        section.classList.remove('paywall-wrapped');
        section.style.position = '';
        section.style.overflow = '';
      });
      return;
    }

    const sections = document.querySelectorAll('[data-tier="premium"]');
    if (!sections.length) return;

    const loggedIn  = CI.isLoggedIn && CI.isLoggedIn();
    const html      = loggedIn ? overlayFreeUser() : overlayLoggedOut();

    sections.forEach(section => {
      // Évite double wrap
      if (section.classList.contains('paywall-wrapped')) return;
      section.classList.add('paywall-wrapped');

      // Blur le contenu
      const inner = document.createElement('div');
      inner.className = 'paywall-content-blur';
      // Déplace les enfants dans inner
      while (section.firstChild) inner.appendChild(section.firstChild);
      section.appendChild(inner);

      // Ajoute l'overlay
      section.insertAdjacentHTML('beforeend', html);
      section.style.position = 'relative';
      section.style.overflow  = 'hidden';
    });
  }

  /* ----------------------------------------------------------
     Init — attend que CI.auth soit prêt
     ---------------------------------------------------------- */
  function init() {
    // Petit délai pour laisser auth.js init() se terminer
    setTimeout(applyPaywalls, 80);

    // Re-apply si l'utilisateur se déconnecte en cours de session
    window.addEventListener('ci:signout', () => {
      // Reload propre plutôt que de re-wrapper à la volée
      window.location.reload();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose pour usage manuel
  window.CIPaywall = { apply: applyPaywalls };

})();
