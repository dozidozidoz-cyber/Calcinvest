/* ============================================================
   CalcInvest — Projects VIEW
   Liste, ouvre, supprime, exporte/importe les projets sauvegardés
   ============================================================ */

(function () {
  'use strict';

  // Map type → URL de l'outil (pour rouvrir un projet avec ses params)
  const TOOL_URLS = {
    'Locatif': '/simulateur-rendement-locatif',
    'DCA': '/simulateur-dca',
    'Compound': '/calculateur-interets-composes',
    'FIRE': '/calculateur-fire'
  };

  // Map type → icône SVG path + couleur
  const TOOL_META = {
    'Locatif': { color: '#34D399', icon: '<path d="M3 20V10l9-6 9 6v10"/><path d="M9 20v-6h6v6"/>' },
    'DCA':     { color: '#60A5FA', icon: '<path d="M3 17l6-6 4 4 8-10"/><path d="M15 5h6v6"/>' },
    'Compound':{ color: '#A78BFA', icon: '<path d="M4 20V8l8-4 8 4v12"/><path d="M4 14l8-4 8 4"/>' },
    'FIRE':    { color: '#FB923C', icon: '<path d="M8 4h8l-2 8h-4z"/><path d="M10 12v8M14 12v8"/>' }
  };

  function render() {
    const list = CI.getProjects();
    const container = document.getElementById('projects-list');
    const empty = document.getElementById('empty-state');

    if (list.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    // Group by type
    const byType = {};
    list.forEach((p) => {
      if (!byType[p.type]) byType[p.type] = [];
      byType[p.type].push(p);
    });

    container.innerHTML = Object.keys(byType).map((type) => {
      const meta = TOOL_META[type] || { color: '#9AA3AE', icon: '<rect x="3" y="3" width="18" height="18"/>' };
      const url = TOOL_URLS[type] || '#';
      return `
        <div style="margin-bottom:28px">
          <div class="page-eyebrow" style="margin-bottom:12px">
            <span class="page-eyebrow-icon" style="background:${meta.color}22;border-color:${meta.color}44;color:${meta.color}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${meta.icon}</svg>
            </span>
            ${type} · ${byType[type].length} projet${byType[type].length > 1 ? 's' : ''}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">
            ${byType[type].map((p) => projectCard(p, url, meta)).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Bind actions
    container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        const p = CI.getProject(id);
        if (!p) return;
        CI.modal({
          title: 'Supprimer ce projet ?',
          body: `<p style="color:var(--text-2);font-size:13px">« <strong style="color:var(--text)">${escapeHtml(p.name)}</strong> » sera définitivement supprimé.</p>`,
          confirmText: 'Supprimer',
          cancelText: 'Annuler',
          onConfirm: () => {
            CI.deleteProject(id);
            CI.toast('Projet supprimé', 'success');
            render();
          }
        });
      });
    });
  }

  function projectCard(p, url, meta) {
    const params = new URLSearchParams();
    if (p.data) {
      Object.keys(p.data).forEach((k) => {
        const v = p.data[k];
        if (v !== null && v !== undefined && v !== '') params.set(k, String(v));
      });
    }
    const openUrl = url + (params.toString() ? '?' + params.toString() : '');

    return `
      <a href="${openUrl}" class="card" style="display:block;margin:0;text-decoration:none;transition:var(--t)">
        <div class="card-body" style="padding:18px 20px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div>
              <div style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${CI.fmtDate(p.updatedAt || p.createdAt)}</div>
            </div>
            <button class="btn-ghost" data-action="delete" data-id="${p.id}" aria-label="Supprimer"
                    style="padding:6px;background:transparent;border-color:transparent">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">
                <path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10"/>
              </svg>
            </button>
          </div>
          ${p.note ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;line-height:1.5">${escapeHtml(p.note)}</div>` : ''}
          <div style="margin-top:12px;font-size:11px;color:${meta.color};font-family:var(--font-mono);font-weight:600;letter-spacing:0.1em;text-transform:uppercase">
            Ouvrir →
          </div>
        </div>
      </a>
    `;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Public actions (bound to buttons) */
  window.exportProjects = function () {
    const list = CI.getProjects();
    if (list.length === 0) {
      CI.toast('Aucun projet à exporter', 'warn');
      return;
    }
    CI.exportProjects();
    CI.toast(list.length + ' projet(s) exporté(s)', 'success');
  };

  document.addEventListener('DOMContentLoaded', () => {
    render();

    // Import file handler
    const input = document.getElementById('import-input');
    if (input) {
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        CI.importProjects(file)
          .then((n) => {
            CI.toast(n + ' projet(s) importé(s)', 'success');
            render();
          })
          .catch(() => CI.toast('Erreur : fichier JSON invalide', 'error'));
        input.value = '';
      });
    }
  });
})();
