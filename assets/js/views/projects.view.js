/* ============================================================
   CalcInvest — Projects VIEW
   Liste, ouvre, supprime, exporte/importe les projets sauvegardés
   ============================================================ */

(function () {
  'use strict';

  // Map type → URL de l'outil (pour rouvrir un projet avec ses params)
  const TOOL_URLS = {
    'Locatif':    '/simulateur-rendement-locatif',
    'DCA':        '/simulateur-dca',
    'Compound':   '/simulateur-interets-composes',
    'CryptoDCA':  '/simulateur-dca-crypto',
    'FIRE':       '/calculateur-fire',
    'PER':        '/simulateur-per'
  };

  // Map type → icône SVG path + couleur
  const TOOL_META = {
    'Locatif':   { color: '#34D399', icon: '<path d="M3 20V10l9-6 9 6v10"/><path d="M9 20v-6h6v6"/>' },
    'DCA':       { color: '#60A5FA', icon: '<path d="M3 17l6-6 4 4 8-10"/><path d="M15 5h6v6"/>' },
    'Compound':  { color: '#A78BFA', icon: '<path d="M4 20V8l8-4 8 4v12"/><path d="M4 14l8-4 8 4"/>' },
    'CryptoDCA': { color: '#F7931A', icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>' },
    'FIRE':      { color: '#FB923C', icon: '<path d="M8 4h8l-2 8h-4z"/><path d="M10 12v8M14 12v8"/>' },
    'PER':       { color: '#F472B6', icon: '<path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="4"/>' }
  };

  // Compare state
  let compareMode  = false;
  let selectedIds  = new Set();
  let selectedType = null;  // enforce same-type selection

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
            selectedIds.delete(id);
            updateCompareBar();
            render();
          }
        });
      });
    });

    // Bind checkbox interactions in compare mode
    if (compareMode) {
      container.querySelectorAll('[data-compare-card]').forEach((card) => {
        card.addEventListener('click', (e) => {
          // ignore clicks on the delete button
          if (e.target.closest('[data-action="delete"]')) return;
          e.preventDefault();
          const id   = card.dataset.id;
          const type = card.dataset.type;

          if (selectedIds.has(id)) {
            selectedIds.delete(id);
          } else {
            // Si nouveau type différent → reset
            if (selectedIds.size === 0) {
              selectedType = type;
            } else if (selectedType !== type) {
              CI.toast('Compare uniquement des projets du même type', 'warn');
              return;
            }
            if (selectedIds.size >= 4) {
              CI.toast('Maximum 4 projets à comparer', 'warn');
              return;
            }
            selectedIds.add(id);
          }
          if (selectedIds.size === 0) selectedType = null;
          updateCompareBar();
          render();
        });
      });
    }
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

    if (compareMode) {
      // Mode comparaison : div clickable avec checkbox
      const isSelected = selectedIds.has(p.id);
      const isDisabled = selectedType && selectedType !== p.type;
      const opacity    = isDisabled ? '0.4' : '1';
      const border     = isSelected ? `2px solid ${meta.color}` : '1px solid var(--border-soft)';
      const bg         = isSelected ? `${meta.color}11` : 'var(--bg-elev)';
      const cursor     = isDisabled ? 'not-allowed' : 'pointer';
      const checkmark  = isSelected
        ? `<div style="width:22px;height:22px;border-radius:50%;background:${meta.color};color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">✓</div>`
        : `<div style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border-soft)"></div>`;
      return `
        <div class="card" data-compare-card data-id="${p.id}" data-type="${p.type}" style="margin:0;cursor:${cursor};opacity:${opacity};background:${bg};border:${border};transition:var(--t)">
          <div class="card-body" style="padding:18px 20px;display:flex;align-items:flex-start;gap:12px">
            ${checkmark}
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div>
              <div style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${CI.fmtDate(p.updatedAt || p.createdAt)}</div>
              ${p.note ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;line-height:1.5">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // Mode normal : lien
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

  /* ------------------------------------------------------------
     COMPARE MODE — toggle, bar, recompute, render
     ------------------------------------------------------------ */
  function toggleCompareMode() {
    compareMode = !compareMode;
    selectedIds.clear();
    selectedType = null;
    document.getElementById('btn-compare-label').textContent = compareMode ? 'Annuler' : 'Comparer';
    const btn = document.getElementById('btn-compare-toggle');
    if (btn) btn.classList.toggle('btn-primary', compareMode);
    // Hide comparison panel when leaving compare mode
    if (!compareMode) {
      const panel = document.getElementById('comparison-panel');
      if (panel) panel.style.display = 'none';
    }
    updateCompareBar();
    render();
  }

  function clearSelection() {
    selectedIds.clear();
    selectedType = null;
    updateCompareBar();
    render();
  }

  function updateCompareBar() {
    const bar  = document.getElementById('compare-bar');
    const cnt  = document.getElementById('compare-bar-count');
    if (!bar || !cnt) return;
    const n = selectedIds.size;
    if (n >= 2) {
      bar.style.display = 'flex';
      cnt.textContent = n + ' projets · ' + selectedType;
    } else {
      bar.style.display = 'none';
    }
  }

  // KPIs configurables par type
  const COMPARE_CONFIG = {
    'Locatif': {
      paramRows: [
        { label: 'Prix d\'achat',    key: 'price',         fmt: 'money' },
        { label: 'Loyer',            key: 'rent',          fmt: 'money', suffix: ' €/mois' },
        { label: 'Crédit',           key: 'loan',          fmt: 'money' },
        { label: 'Taux',             key: 'loanRate',      fmt: 'pct' },
        { label: 'Durée crédit',     key: 'loanYears',     fmt: 'years' },
        { label: 'Régime fiscal',    key: 'regime',        fmt: 'raw' },
        { label: 'Horizon',          key: 'holdYears',     fmt: 'years' }
      ],
      kpiRows: [
        { label: 'Apport requis',    src: 'downPayment',          fmt: 'money' },
        { label: 'Mensualité',       src: 'monthlyPayment',       fmt: 'money',  suffix: ' €/mois' },
        { label: 'Rendement net',    src: 'yieldNet',             fmt: 'pct' },
        { label: 'Rendement net-net',src: 'yieldNetNet',          fmt: 'pct' },
        { label: 'TRI',              src: 'tri',                  fmt: 'pct' },
        { label: 'Cashflow/mois',    src: 'cashflowMonthly',      fmt: 'money',  signed: true, suffix: ' €/mois' },
        { label: 'Équité finale',    src: 'finalEquity',          fmt: 'money' }
      ],
      chart: { ySource: 'yearly', yField: 'equity', label: 'Équité' }
    },
    'Compound': {
      paramRows: [
        { label: 'Capital initial',  key: 'initialAmount',  fmt: 'money' },
        { label: 'Versement mensuel',key: 'monthlyAmount',  fmt: 'money', suffix: ' €/mois' },
        { label: 'Croissance verst.',key: 'contributionGrowth', fmt: 'pct' },
        { label: 'Rendement',        key: 'annualRate',     fmt: 'pct' },
        { label: 'Frais (TER)',      key: 'feesPct',        fmt: 'pct' },
        { label: 'Inflation',        key: 'inflation',      fmt: 'pct' },
        { label: 'Durée',            key: 'years',          fmt: 'years' }
      ],
      kpiRows: [
        { label: 'Valeur finale',    src: 'finalValue',     fmt: 'money' },
        { label: 'Total versé',      src: 'finalInvested',  fmt: 'money' },
        { label: 'Intérêts générés', src: 'finalInterest',  fmt: 'money' },
        { label: 'Multiplicateur',   src: 'multiplier',     fmt: 'mult' },
        { label: 'Doublement (ans)', src: 'doublingYears',  fmt: 'years' }
      ],
      chart: { ySource: 'yearly', yField: 'value', label: 'Valeur' }
    },
    'PER': {
      paramRows: [
        { label: 'Versement mensuel',key: 'monthlyContribution', fmt: 'money', suffix: ' €/mois' },
        { label: 'TMI',              key: 'tmi',                 fmt: 'pct' },
        { label: 'Rendement',        key: 'annualReturn',        fmt: 'pct' },
        { label: 'Durée',            key: 'years',               fmt: 'years' }
      ],
      kpiRows: [
        { label: 'Capital final',    src: 'finalCapital',        fmt: 'money' },
        { label: 'Économie IR',      src: 'totalTaxSaving',      fmt: 'money' },
        { label: 'Rente mensuelle',  src: 'monthlyRente',        fmt: 'money', suffix: ' €/mois' }
      ],
      chart: null
    },
    'FIRE': {
      paramRows: [
        { label: 'Âge',              key: 'age',                 fmt: 'years' },
        { label: 'Dépenses/an',      key: 'annualExpenses',      fmt: 'money' },
        { label: 'Épargne actuelle', key: 'currentSavings',      fmt: 'money' },
        { label: 'Épargne mensuelle',key: 'monthlySavings',      fmt: 'money', suffix: ' €/mois' },
        { label: 'Rendement',        key: 'annualReturn',        fmt: 'pct' },
        { label: 'Taux retrait',     key: 'withdrawalRate',      fmt: 'pct' }
      ],
      kpiRows: [
        { label: 'Objectif FIRE',    src: 'fireNumber',          fmt: 'money' },
        { label: 'Âge FIRE',         src: 'fireAge',             fmt: 'years' },
        { label: 'Années à attendre',src: 'yearsToFire',         fmt: 'years' }
      ],
      chart: null
    },
    'DCA': {
      paramRows: [
        { label: 'Actif',            key: 'assetId',         fmt: 'raw' },
        { label: 'Versement mensuel',key: 'monthlyAmount',   fmt: 'money', suffix: ' €/mois' },
        { label: 'Capital initial',  key: 'initialAmount',   fmt: 'money' },
        { label: 'Date début',       key: 'startDate',       fmt: 'raw' },
        { label: 'Durée (mois)',     key: 'durationMonths',  fmt: 'raw' },
        { label: 'Frais',            key: 'feesPct',         fmt: 'pct' }
      ],
      kpiRows: [],  // recompute async-only — skip
      chart: null
    },
    'CryptoDCA': {
      paramRows: [
        { label: 'Crypto',           key: 'cryptoId',        fmt: 'raw' },
        { label: 'Versement mensuel',key: 'monthlyAmount',   fmt: 'money', suffix: ' €/mois' },
        { label: 'Capital initial',  key: 'initialAmount',   fmt: 'money' },
        { label: 'Date début',       key: 'startDate',       fmt: 'raw' },
        { label: 'Frais',            key: 'feesPct',         fmt: 'pct' },
        { label: 'Flat tax',         key: 'taxRate',         fmt: 'pct' }
      ],
      kpiRows: [],
      chart: null
    }
  };

  function recompute(project) {
    const t = project.type;
    try {
      if (t === 'Locatif'  && window.CalcLocatif)  return window.CalcLocatif.calcLocatif(project.data);
      if (t === 'Compound' && window.CalcCompound) return window.CalcCompound.calcCompound(project.data);
      if (t === 'PER'      && window.CalcPER)      return window.CalcPER.calcPER(project.data);
      if (t === 'FIRE'     && window.CalcFIRE)     return window.CalcFIRE.calcFIRE(project.data);
    } catch (e) { console.error('recompute error', t, e); }
    return null;
  }

  function fmtVal(v, fmt, opts) {
    opts = opts || {};
    if (v == null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '—';
    switch (fmt) {
      case 'money': {
        const sign = opts.signed && v >= 0 ? '+' : '';
        return sign + CI.fmtMoney(v, 0) + (opts.suffix || '');
      }
      case 'pct':   return (typeof v === 'number' ? v.toFixed(2) : v) + ' %';
      case 'years': return v + ' ans';
      case 'mult':  return '×' + (typeof v === 'number' ? v.toFixed(2) : v);
      case 'raw':   return String(v);
      default:      return String(v);
    }
  }

  function runComparison() {
    const projects = Array.from(selectedIds).map((id) => CI.getProject(id)).filter(Boolean);
    if (projects.length < 2) {
      CI.toast('Sélectionne au moins 2 projets', 'warn');
      return;
    }
    const type = projects[0].type;
    const cfg  = COMPARE_CONFIG[type];
    if (!cfg) {
      CI.toast('Comparaison non supportée pour ' + type, 'error');
      return;
    }
    const meta = TOOL_META[type] || { color: '#9AA3AE' };

    // Recompute results (sync types only)
    const results = projects.map((p) => recompute(p));
    const hasResults = results.some((r) => r != null);

    // Render comparison panel
    const panel = document.getElementById('comparison-panel');
    if (!panel) return;

    const colHeaders = projects.map((p) =>
      `<th style="padding:10px 12px;text-align:left;font-size:13px;color:${meta.color};border-bottom:2px solid ${meta.color}33;background:${meta.color}11;font-weight:700">${escapeHtml(p.name)}<br><span style="font-size:11px;color:var(--text-3);font-family:var(--font-mono);font-weight:400">${CI.fmtDate(p.updatedAt || p.createdAt)}</span></th>`
    ).join('');

    const paramRowsHTML = cfg.paramRows.map((row) => {
      const cells = projects.map((p) => {
        const v = p.data ? p.data[row.key] : null;
        return `<td style="padding:8px 12px;border-bottom:1px solid var(--border-soft)">${fmtVal(v, row.fmt, { suffix: row.suffix })}</td>`;
      }).join('');
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid var(--border-soft);font-weight:600;color:var(--text-2);font-size:12px">${row.label}</td>${cells}</tr>`;
    }).join('');

    const kpiRowsHTML = (hasResults && cfg.kpiRows.length > 0) ? cfg.kpiRows.map((row) => {
      // Identifier le best/worst pour highlight
      const vals = results.map((r) => r ? r[row.src] : null);
      const numericVals = vals.filter((v) => v != null && typeof v === 'number' && isFinite(v));
      const max = numericVals.length > 0 ? Math.max.apply(null, numericVals) : null;
      const cells = vals.map((v) => {
        const isBest = (v != null && v === max && numericVals.length > 1);
        const bg = isBest ? `background:${meta.color}22;` : '';
        const star = isBest ? ' ⭐' : '';
        return `<td style="padding:8px 12px;border-bottom:1px solid var(--border-soft);font-weight:600;${bg}">${fmtVal(v, row.fmt, { signed: row.signed, suffix: row.suffix })}${star}</td>`;
      }).join('');
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid var(--border-soft);font-weight:600;color:var(--text-2);font-size:12px">${row.label}</td>${cells}</tr>`;
    }).join('') : '';

    const chartHTML = (cfg.chart && hasResults && results.every((r) => r != null)) ? `
      <div class="card" style="margin-top:18px">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 13l3-4 3 2 3-5 3 2"/></svg>
            </div>
            Évolution comparée — ${cfg.chart.label}
          </div>
        </div>
        <div class="card-body no-pad">
          <div class="chart-wrap"><canvas id="cmp-chart"></canvas></div>
        </div>
      </div>` : '';

    panel.innerHTML = `
      <div class="page-eyebrow" style="margin-bottom:14px">
        <span class="page-eyebrow-icon" style="background:${meta.color}22;border-color:${meta.color}44;color:${meta.color}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4h5M2 8h5M2 12h5"/><path d="M9 4h5M9 8h5M9 12h5"/></svg>
        </span>
        Comparaison · ${type} · ${projects.length} projets
      </div>

      <div class="card">
        <div class="card-body no-pad">
          <table class="data-table" style="width:100%;border-collapse:collapse">
            <thead>
              <tr>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-3);font-weight:600;background:var(--bg-elev);border-bottom:2px solid var(--border-soft)">Critère</th>
                ${colHeaders}
              </tr>
            </thead>
            <tbody>
              ${paramRowsHTML}
              ${kpiRowsHTML ? '<tr><td colspan="' + (projects.length + 1) + '" style="padding:14px 12px 8px;font-weight:700;color:var(--text-1);font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Résultats calculés</td></tr>' + kpiRowsHTML : ''}
            </tbody>
          </table>
        </div>
      </div>
      ${chartHTML}
      ${!hasResults && cfg.kpiRows.length === 0 ? '<div class="info-box" style="margin-top:14px"><div class="info-box-title">Note</div>Pour ' + type + ', seuls les paramètres sont comparés ici (les calculs nécessitent les données historiques de l\'actif). Ouvre chaque projet pour voir les résultats détaillés.</div>' : ''}
    `;

    panel.style.display = '';

    // Draw chart if applicable
    if (cfg.chart && results.every((r) => r != null)) {
      requestAnimationFrame(() => {
        const colors = [meta.color, '#60A5FA', '#FBBF24', '#F87171'];
        const series = results.map((r, i) => {
          const data = r[cfg.chart.ySource].map((y) => y[cfg.chart.yField]);
          return { label: projects[i].name, data: data, color: colors[i % colors.length], width: 2 };
        });
        const maxLen  = Math.max.apply(null, series.map((s) => s.data.length));
        const labels  = Array.from({ length: maxLen }, (_, i) => 'An ' + (i + 1));
        // Pad shorter series with last value
        series.forEach((s) => {
          while (s.data.length < maxLen) s.data.push(s.data[s.data.length - 1]);
        });
        CI.drawChart('cmp-chart', labels, series, { yFormat: (v) => CI.fmtCompact(v) });
      });
    }

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  window.toggleCompareMode = toggleCompareMode;
  window.clearSelection    = clearSelection;
  window.runComparison     = runComparison;

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
