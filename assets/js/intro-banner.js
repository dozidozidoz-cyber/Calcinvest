/* ============================================================
   CalcInvest — Bannière d'intro pédagogique dismissable
   Utilisable sur les pages d'outils techniques.
   À chaque page : ajouter une balise <div data-intro-banner data-intro-key="ATR" data-intro-title="..." data-intro-text="..."></div>
   ============================================================ */
(function () {
  'use strict';

  function init() {
    const banners = document.querySelectorAll('[data-intro-banner]');
    banners.forEach(host => {
      const key = host.dataset.introKey || host.id || 'unknown';
      const lsKey = 'ci_intro_seen_' + key;
      let seen = false;
      try { seen = localStorage.getItem(lsKey) === '1'; } catch {}
      if (seen) {
        host.style.display = 'none';
        return;
      }

      const title = host.dataset.introTitle || '💡 Première fois ?';
      const body  = host.dataset.introBody  || host.innerHTML;
      const link  = host.dataset.introLink  || '';
      const linkTxt = host.dataset.introLinkText || 'En savoir plus';

      host.className = 'intro-banner';
      host.innerHTML = `
        <div class="intro-banner-inner">
          <div class="intro-banner-icon" aria-hidden="true">💡</div>
          <div class="intro-banner-content">
            <div class="intro-banner-title">${title}</div>
            <div class="intro-banner-body">${body}</div>
            ${link ? `<a href="${link}" class="intro-banner-link" target="${link.startsWith('http') ? '_blank' : '_self'}" rel="noopener">${linkTxt} →</a>` : ''}
          </div>
          <button class="intro-banner-dismiss" type="button" aria-label="J'ai compris, masquer">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 8l3 3 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            J'ai compris
          </button>
        </div>
      `;

      host.querySelector('.intro-banner-dismiss').addEventListener('click', () => {
        try { localStorage.setItem(lsKey, '1'); } catch {}
        host.style.transition = 'opacity 0.3s, transform 0.3s, max-height 0.4s, margin 0.4s, padding 0.4s';
        host.style.opacity = '0';
        host.style.transform = 'translateY(-8px)';
        setTimeout(() => {
          host.style.maxHeight = '0';
          host.style.margin = '0';
          host.style.padding = '0';
          host.style.overflow = 'hidden';
          setTimeout(() => host.remove(), 400);
        }, 300);
      });
    });
  }

  /* Styles injectés une fois */
  const css = `
.intro-banner {
  background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(96,165,250,0.04));
  border: 1px solid rgba(59,130,246,0.30);
  border-left: 4px solid #3B82F6;
  border-radius: var(--r, 10px);
  margin: 0 0 20px;
  overflow: hidden;
}
.intro-banner-inner {
  display: flex; gap: 14px; align-items: flex-start;
  padding: 16px 20px;
}
.intro-banner-icon {
  font-size: 22px; line-height: 1;
  flex-shrink: 0;
}
.intro-banner-content { flex: 1; min-width: 0 }
.intro-banner-title {
  font-size: 14px; font-weight: 700; color: var(--text);
  margin-bottom: 6px;
}
.intro-banner-body {
  font-size: 13.5px; line-height: 1.55; color: var(--text-2);
}
.intro-banner-body strong { color: var(--text) }
.intro-banner-body code {
  background: rgba(59,130,246,0.10); color: #3B82F6;
  padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono, monospace);
  font-size: 12px;
}
.intro-banner-link {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 8px; font-size: 12px; font-weight: 600;
  color: #3B82F6; text-decoration: none;
}
.intro-banner-link:hover { text-decoration: underline }
.intro-banner-dismiss {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 8px;
  background: rgba(59,130,246,0.10); color: #3B82F6;
  border: 1px solid rgba(59,130,246,0.30);
  font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
  font-family: inherit;
}
.intro-banner-dismiss:hover { background: rgba(59,130,246,0.18) }
@media (max-width: 640px) {
  .intro-banner-inner { flex-wrap: wrap }
  .intro-banner-dismiss { width: 100% }
}
`;
  if (!document.getElementById('intro-banner-css')) {
    const s = document.createElement('style');
    s.id = 'intro-banner-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
