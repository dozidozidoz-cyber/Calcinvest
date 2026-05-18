/* ============================================================
   CalcInvest — common.js
   UI layer : formatting, storage, toast, modal, chart, stepper,
   pills, accordion. ZÉRO logique métier ici.
   ============================================================ */

(function (global) {
  'use strict';

  const CI = {};
  const STORAGE_KEY = 'calcinvest_projects_v1';

  /* ===========================================================
     DEFENSIVE READERS — évitent les TypeError sur ID HTML inexistant
     =========================================================== */
  CI.safeNum = function (id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  };
  CI.safeStr = function (id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    return (el.value || '').trim() || fallback;
  };
  CI.safeChecked = function (id, fallback) {
    const el = document.getElementById(id);
    return el ? !!el.checked : !!fallback;
  };
  /* Wrapper sécurisé pour drawChart : never throws */
  CI.safeChart = function (canvasId, labels, datasets, opts) {
    try {
      if (CI.drawChart) CI.drawChart(canvasId, labels, datasets, opts);
    } catch (e) {
      console.warn('[safeChart ' + canvasId + ']', e.message);
    }
  };

  /* ===========================================================
     FORMAT
     =========================================================== */
  CI.fmtNum = function (n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    dec = dec == null ? 0 : dec;
    return Number(n).toLocaleString('fr-FR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  };

  CI.fmtMoney = function (n, dec) {
    dec = dec == null ? 0 : dec;
    if (n === null || n === undefined || isNaN(n)) return '—';
    return CI.fmtNum(n, dec) + ' €';
  };

  CI.fmtPct = function (n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    dec = dec == null ? 1 : dec;
    return (n >= 0 ? '+' : '') + Number(n).toLocaleString('fr-FR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    }) + ' %';
  };

  CI.fmtPctPlain = function (n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    dec = dec == null ? 1 : dec;
    return Number(n).toLocaleString('fr-FR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    }) + ' %';
  };

  CI.fmtCompact = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' M€';
    if (abs >= 1e3) return (n / 1e3).toFixed(0) + ' k€';
    return CI.fmtMoney(n);
  };

  CI.fmtDate = function (ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  /* ===========================================================
     STORAGE (projets)
     =========================================================== */
  CI.getProjects = function () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  CI.saveProject = function (project) {
    const list = CI.getProjects();
    if (!project.id) {
      project.id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      project.createdAt = Date.now();
    }
    project.updatedAt = Date.now();
    const idx = list.findIndex((p) => p.id === project.id);
    if (idx >= 0) list[idx] = project;
    else list.unshift(project);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return project;
    } catch (e) {
      CI.toast('Erreur de sauvegarde (quota plein ?)', 'error');
      return null;
    }
  };

  CI.getProject = function (id) {
    return CI.getProjects().find((p) => p.id === id) || null;
  };

  CI.deleteProject = function (id) {
    const list = CI.getProjects().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  CI.exportProjects = function () {
    const data = JSON.stringify(CI.getProjects(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calcinvest-projects-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  CI.importProjects = function (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arr = JSON.parse(e.target.result);
          if (!Array.isArray(arr)) throw new Error('Format invalide');
          const existing = CI.getProjects();
          const ids = new Set(existing.map((p) => p.id));
          const merged = existing.concat(arr.filter((p) => !ids.has(p.id)));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          resolve(arr.length);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  };

  /* ===========================================================
     URL params (partage)
     =========================================================== */
  CI.getUrlParam = function (key) {
    return new URLSearchParams(window.location.search).get(key);
  };

  CI.setUrlParams = function (params) {
    const url = new URL(window.location.href);
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === null || v === undefined || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, String(v));
    });
    window.history.replaceState({}, '', url);
  };

  CI.copyShareUrl = function () {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => CI.toast('Lien copié dans le presse-papier', 'success'),
        () => CI.toast('Copie impossible', 'error')
      );
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      CI.toast('Lien copié', 'success');
    }
  };

  /* ===========================================================
     TOAST
     =========================================================== */
  function ensureToastContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  CI.toast = function (msg, type, duration) {
    duration = duration || 2800;
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
    }, duration);
  };

  /* ===========================================================
     MODAL (save prompt)
     =========================================================== */
  CI.modal = function ({ title, body, confirmText, cancelText, onConfirm }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-labelledby="modal-t">
        <div class="modal-header">
          <div id="modal-t" class="modal-title">${title || 'Confirmation'}</div>
          <button class="modal-close" aria-label="Fermer">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M4 4l12 12M16 4L4 16" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">${body || ''}</div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="cancel">${cancelText || 'Annuler'}</button>
          <button class="btn btn-primary" data-action="confirm">${confirmText || 'Confirmer'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = () => {
      backdrop.style.animation = 'fadeIn 150ms reverse';
      setTimeout(() => backdrop.remove(), 140);
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('[data-action="cancel"]').addEventListener('click', close);
    backdrop.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      const input = backdrop.querySelector('input, textarea');
      const value = input ? input.value : true;
      close();
      if (onConfirm) onConfirm(value);
    });

    const firstInput = backdrop.querySelector('input, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
    return backdrop;
  };

  /* ===========================================================
     WIZARD multi-étapes (mode débutant guidé)
     ===========================================================
     Usage:
       CI.wizard({
         title: 'Mode débutant — Intérêts composés',
         steps: [
           { id: 'capital', question: 'Combien tu veux placer au départ ?',
             helpText: 'Capital initial. Ex : 5 000 €',
             inputType: 'number', suffix: '€', defaultValue: 1000, min: 0 },
           // ...
         ],
         onComplete: (answers) => { ... applique answers aux IDs du form ... }
       });
     =========================================================== */
  CI.wizard = function (config) {
    config = config || {};
    const steps = config.steps || [];
    if (steps.length === 0) return;
    let currentIdx = 0;
    const answers = {};

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-labelledby="wizard-title" style="max-width:500px">
        <div class="modal-header">
          <div id="wizard-title" class="modal-title">${config.title || 'Mode débutant'}</div>
          <button class="modal-close" aria-label="Fermer">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M4 4l12 12M16 4L4 16" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div style="padding:0 24px;margin-top:-4px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <div id="wizard-progress" style="flex:1;height:4px;background:var(--border-soft);border-radius:99px;overflow:hidden">
              <div id="wizard-progress-fill" style="height:100%;width:0%;background:var(--accent);transition:width .25s"></div>
            </div>
            <span id="wizard-step-counter" style="font-size:12px;color:var(--text-3);font-family:var(--font-mono);min-width:40px;text-align:right">1/${steps.length}</span>
          </div>
        </div>
        <div class="modal-body" id="wizard-body" style="min-height:160px"></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="prev" style="visibility:hidden">← Précédent</button>
          <button class="btn btn-primary" data-action="next">Suivant →</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const body = backdrop.querySelector('#wizard-body');
    const fill = backdrop.querySelector('#wizard-progress-fill');
    const counter = backdrop.querySelector('#wizard-step-counter');
    const btnPrev = backdrop.querySelector('[data-action="prev"]');
    const btnNext = backdrop.querySelector('[data-action="next"]');
    const close = () => {
      backdrop.style.animation = 'fadeIn 150ms reverse';
      setTimeout(() => backdrop.remove(), 140);
    };
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    function renderStep() {
      const s = steps[currentIdx];
      const val = answers[s.id] != null ? answers[s.id] : (s.defaultValue != null ? s.defaultValue : '');
      let inputHtml = '';
      if (s.inputType === 'select') {
        const opts = (s.options || []).map((o) => `<option value="${o.value}"${String(val) === String(o.value) ? ' selected' : ''}>${o.label}</option>`).join('');
        inputHtml = `<select id="wizard-input" style="width:100%;padding:10px 12px;background:var(--bg-elev);border:1px solid var(--border-soft);border-radius:8px;font-size:14px;color:var(--text)">${opts}</select>`;
      } else {
        const suffix = s.suffix ? `<span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:13px;pointer-events:none">${s.suffix}</span>` : '';
        const minAttr = s.min != null ? `min="${s.min}"` : '';
        const maxAttr = s.max != null ? `max="${s.max}"` : '';
        const stepAttr = s.step != null ? `step="${s.step}"` : '';
        inputHtml = `<div style="position:relative">
          <input type="${s.inputType || 'number'}" id="wizard-input" value="${val}" ${minAttr} ${maxAttr} ${stepAttr}
            style="width:100%;padding:12px 50px 12px 14px;background:var(--bg-elev);border:1px solid var(--border-soft);border-radius:8px;font-size:18px;font-weight:600;color:var(--text);font-family:var(--font-mono)" />
          ${suffix}
        </div>`;
      }
      const presetsHtml = (s.presets || []).length > 0
        ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">` +
          s.presets.map((p) => `<button type="button" class="pill wizard-preset" data-val="${p.value}">${p.label}</button>`).join('') +
          `</div>`
        : '';
      body.innerHTML = `
        <div style="margin-bottom:8px">
          <div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:6px">${s.question}</div>
          ${s.helpText ? `<div style="font-size:13px;color:var(--text-3);line-height:1.5">${s.helpText}</div>` : ''}
        </div>
        <div style="margin-top:18px">${inputHtml}${presetsHtml}</div>
      `;
      counter.textContent = (currentIdx + 1) + '/' + steps.length;
      fill.style.width = ((currentIdx + 1) / steps.length * 100) + '%';
      btnPrev.style.visibility = currentIdx > 0 ? 'visible' : 'hidden';
      btnNext.textContent = (currentIdx === steps.length - 1) ? 'Terminer ✓' : 'Suivant →';

      const inp = body.querySelector('#wizard-input');
      if (inp) {
        setTimeout(() => inp.focus(), 50);
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') btnNext.click();
        });
      }
      body.querySelectorAll('.wizard-preset').forEach((b) => {
        b.addEventListener('click', () => {
          const v = b.dataset.val;
          if (inp) inp.value = v;
        });
      });
    }

    function captureAnswer() {
      const s = steps[currentIdx];
      const inp = body.querySelector('#wizard-input');
      if (!inp) return;
      let v = inp.value;
      if (s.inputType === 'number' || !s.inputType) v = parseFloat(v);
      answers[s.id] = v;
    }

    btnNext.addEventListener('click', () => {
      captureAnswer();
      if (currentIdx === steps.length - 1) {
        close();
        if (typeof config.onComplete === 'function') config.onComplete(answers);
      } else {
        currentIdx++;
        renderStep();
      }
    });
    btnPrev.addEventListener('click', () => {
      captureAnswer();
      if (currentIdx > 0) { currentIdx--; renderStep(); }
    });

    renderStep();
    return backdrop;
  };

  CI.promptSave = function (type, data, defaultName, callback) {
    CI.modal({
      title: 'Sauvegarder le projet',
      body: `
        <div class="field">
          <label class="field-label">NOM DU PROJET</label>
          <input type="text" class="stepper-input" style="background:var(--bg-2);border:1px solid var(--border-soft);border-radius:var(--r);padding:10px 14px;text-align:left"
                 value="${defaultName || 'Projet ' + type}" id="modal-name" />
        </div>
        <div class="field" style="margin-top:12px">
          <label class="field-label">NOTE (facultatif)</label>
          <textarea id="modal-note" rows="3"
                    style="background:var(--bg-2);border:1px solid var(--border-soft);border-radius:var(--r);padding:10px 14px;font-family:var(--font-sans);font-size:13px;color:var(--text);resize:vertical;width:100%"
                    placeholder="Hypothèses, contexte…"></textarea>
        </div>
      `,
      confirmText: 'Sauvegarder',
      onConfirm: () => {
        const name = document.getElementById('modal-name').value.trim() || ('Projet ' + type);
        const note = document.getElementById('modal-note').value.trim();
        const project = CI.saveProject({ type, name, note, data });
        if (project) {
          CI.toast('Projet sauvegardé ✓', 'success');
          if (callback) callback(project);
        }
      }
    });
  };

  /* ===========================================================
     STEPPER component (declarative, auto-init)
     ========================================================
     Usage:
       <div class="stepper" data-step="1000" data-min="0" data-max="10000000">
         <button class="stepper-btn" data-dir="-1">−</button>
         <input class="stepper-input" type="number" value="250000" id="l-price" />
         <span class="stepper-unit">€</span>
         <button class="stepper-btn" data-dir="1">+</button>
       </div>
     =========================================================== */
  CI.initSteppers = function (root) {
    root = root || document;
    root.querySelectorAll('.stepper').forEach((stp) => {
      if (stp.dataset.ciInit) return;
      stp.dataset.ciInit = '1';

      const input = stp.querySelector('.stepper-input');
      if (!input) return;

      const step = parseFloat(stp.dataset.step) || 1;
      const min = stp.dataset.min !== undefined ? parseFloat(stp.dataset.min) : null;
      const max = stp.dataset.max !== undefined ? parseFloat(stp.dataset.max) : null;

      stp.querySelectorAll('.stepper-btn').forEach((btn) => {
        // Supporte les 2 conventions :
        //   data-dir="1" / data-dir="-1"
        //   data-act="plus" / data-act="minus"
        let dir = parseInt(btn.dataset.dir, 10);
        if (!Number.isFinite(dir)) {
          if (btn.dataset.act === 'plus')  dir = 1;
          else if (btn.dataset.act === 'minus') dir = -1;
          else return; // bouton inconnu
        }
        let holdTimer = null;
        let holdInterval = null;

        const bump = () => {
          const cur = parseFloat(input.value) || 0;
          let next = cur + dir * step;
          if (min !== null && next < min) next = min;
          if (max !== null && next > max) next = max;
          // Round to step precision
          const decimals = (String(step).split('.')[1] || '').length;
          next = parseFloat(next.toFixed(decimals));
          input.value = next;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          bump();
        });

        // Press-and-hold
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          holdTimer = setTimeout(() => {
            holdInterval = setInterval(bump, 60);
          }, 380);
        });
        const clearHold = () => {
          clearTimeout(holdTimer);
          clearInterval(holdInterval);
          holdTimer = holdInterval = null;
        };
        btn.addEventListener('mouseup', clearHold);
        btn.addEventListener('mouseleave', clearHold);
        btn.addEventListener('touchend', clearHold);
      });

      // Arrow keys
      input.addEventListener('keydown', (e) => {
        const btnUp   = stp.querySelector('[data-dir="1"], [data-act="plus"]');
        const btnDown = stp.querySelector('[data-dir="-1"], [data-act="minus"]');
        if (e.key === 'ArrowUp' && btnUp) {
          e.preventDefault();
          btnUp.click();
        } else if (e.key === 'ArrowDown' && btnDown) {
          e.preventDefault();
          btnDown.click();
        }
      });

      // Inline math expressions: "1500*12" → 18000 au blur
      input.addEventListener('blur', () => {
        const raw = input.value;
        if (!raw || /^-?\d+(\.\d+)?$/.test(raw.trim())) return;
        const result = CI.evalExpression && CI.evalExpression(raw);
        if (result == null) return;
        let next = result;
        if (min !== null && next < min) next = min;
        if (max !== null && next > max) next = max;
        const decimals = (String(step).split('.')[1] || '').length;
        next = parseFloat(next.toFixed(decimals));
        input.value = next;
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  };

  /* ===========================================================
     PILLS (preset selector)
     ========================================================
     Usage:
       <div class="pills" data-target="l-notary-pct">
         <button class="pill" data-value="2.5">Neuf · 2,5%</button>
         <button class="pill active" data-value="7.5">Ancien</button>
       </div>
     =========================================================== */
  CI.initPills = function (root) {
    root = root || document;
    root.querySelectorAll('.pills[data-target]').forEach((pills) => {
      if (pills.dataset.ciInit) return;
      pills.dataset.ciInit = '1';
      const targetId = pills.dataset.target;
      const target = document.getElementById(targetId);

      // Supporte les 2 conventions : data-value OU data-val
      const getVal = (b) => b.dataset.value != null ? b.dataset.value : b.dataset.val;

      pills.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        pills.querySelectorAll('.pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const v = getVal(btn);
        if (target && v != null) {
          target.value = v;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // Sync pill active state when target changes
      if (target) {
        target.addEventListener('input', () => {
          const v = String(target.value);
          pills.querySelectorAll('.pill').forEach((b) => {
            b.classList.toggle('active', String(getVal(b)) === v);
          });
        });
      }
    });
  };

  /* ===========================================================
     ACCORDION (click header to toggle)
     =========================================================== */
  CI.initAccordions = function (root) {
    root = root || document;
    root.querySelectorAll('.accordion').forEach((acc) => {
      if (acc.dataset.ciInit) return;
      acc.dataset.ciInit = '1';
      const header = acc.querySelector('.accordion-header');
      if (!header) return;
      header.addEventListener('click', () => {
        acc.classList.toggle('open');
      });
    });
  };

  /* ===========================================================
     TABS
     =========================================================== */
  CI.switchTab = function (btn, targetId) {
    const tabs = btn.closest('.tabs');
    if (tabs) tabs.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const parent = btn.closest('.card, .panel, main') || document;
    parent.querySelectorAll('[data-tab-panel]').forEach((p) => {
      p.style.display = p.id === targetId ? '' : 'none';
    });
  };

  /* ===========================================================
     INIT ALL (call on load)
     =========================================================== */
  CI.initAll = function (root) {
    CI.initSteppers(root);
    CI.initPills(root);
    CI.initAccordions(root);
    if (!CI._tooltipsInited) {
      CI.initTooltips();
      CI.initGlossaryObserver();
      CI._tooltipsInited = true;
    }
    if (!CI._scrollInited) {
      CI.initScrollReveal(root);
      CI.initTopbarScroll();
      CI.initFloatingCTA();
      CI.initCountUp(root);
      CI.initParallax(root);
      CI.initSubNav();
      CI.initProgressBar();
      CI.initScrollTop();
      CI.initMegaMenu();
      CI.initInstrumentSelects();
      CI.initLivePrices();
      CI.initRecentTools();
      CI.initCommandPalette();
      CI.initDarkMode();
      CI._scrollInited = true;
    }
  };

  /* ===========================================================
     DARK MODE — toggle bouton, persist localStorage
     =========================================================== */
  const DARK_KEY = 'ci_theme_v1';
  CI.initDarkMode = function () {
    // Applique le thème stocké
    const stored = localStorage.getItem(DARK_KEY);
    if (stored === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

    // Injecte le bouton dans le topbar-right s'il y a un user-zone
    const userZone = document.getElementById('ci-user-zone');
    if (userZone && !document.querySelector('.darkmode-toggle')) {
      const btn = document.createElement('button');
      btn.className = 'darkmode-toggle';
      btn.setAttribute('aria-label', 'Basculer thème');
      btn.title = 'Basculer thème clair/sombre';
      btn.innerHTML = `
        <svg class="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/></svg>
        <svg class="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M13 9.5A6 6 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z"/></svg>
      `;
      btn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem(DARK_KEY, 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem(DARK_KEY, 'dark');
        }
      });
      // Insère en première position de user-zone
      userZone.insertBefore(btn, userZone.firstChild);
    }
  };

  /* ===========================================================
     COMMAND PALETTE (Ctrl+K) — recherche universelle
     =========================================================== */
  CI.initCommandPalette = function () {
    // Build items list: outils + articles + glossaire
    const items = [];

    // Outils depuis TOOL_CATALOG (défini plus haut)
    Object.entries(TOOL_CATALOG).forEach(([url, info]) => {
      items.push({
        url,
        label: info.label,
        cat: info.cat,
        color: info.color,
        keywords: (info.label + ' ' + info.cat).toLowerCase(),
        type: 'tool',
        icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></svg>'
      });
    });

    // Pages utiles
    const pages = [
      { url: '/',                  label: 'Accueil',           cat: 'Page', keywords: 'home accueil' },
      { url: '/methodologie',      label: 'Méthodologie',      cat: 'Page', keywords: 'methodo docs formules sources' },
      { url: '/glossaire',         label: 'Glossaire financier',cat: 'Page', keywords: 'glossaire termes definitions cagr tri pfu drawdown' },
      { url: '/comparer',          label: 'Comparer simulations',cat: 'Page', keywords: 'comparer comparaison projets simulations cote a cote' },
      { url: '/blog',              label: 'Blog',              cat: 'Page', keywords: 'blog articles ressources' },
      { url: '/abonnement',        label: 'Tarifs & Premium',  cat: 'Page', keywords: 'tarifs premium abonnement prix' },
      { url: '/mes-projets',       label: 'Mes Projets',       cat: 'Page', keywords: 'projets sauvegarde' },
      { url: '/mentions-legales',  label: 'Mentions légales',  cat: 'Page', keywords: 'rgpd cookies cgv' }
    ];
    pages.forEach(p => {
      items.push({
        ...p, type: 'page', color: '#6B7280',
        keywords: p.keywords + ' ' + p.label.toLowerCase(),
        icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 2h7l3 3v9H3z"/></svg>'
      });
    });

    // Articles blog
    const articles = [
      { url: '/blog/dca-vs-lump-sum',         label: 'DCA vs Lump Sum',         cat: 'Article' },
      { url: '/blog/scpi-vs-locatif',         label: 'SCPI vs Locatif',         cat: 'Article' },
      { url: '/blog/reforme-retraite-2023',   label: 'Réforme retraite 2023',   cat: 'Article' },
      { url: '/blog/per-cto-assurance-vie',   label: 'PER vs CTO vs AV',        cat: 'Article' },
      { url: '/blog/monte-carlo-fire',        label: 'Monte Carlo + FIRE',      cat: 'Article' }
    ];
    articles.forEach(a => {
      items.push({
        ...a, type: 'article', color: '#A855F7',
        keywords: (a.label + ' article').toLowerCase(),
        icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 7h6M5 10h4"/></svg>'
      });
    });

    // Injecte le bouton trigger dans le topbar
    const userZone = document.getElementById('ci-user-zone');
    if (userZone && !document.querySelector('.cmdk-trigger')) {
      const trigger = document.createElement('button');
      trigger.className = 'cmdk-trigger';
      trigger.setAttribute('aria-label', 'Rechercher');
      trigger.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>
        <span class="cmdk-trigger-text">Rechercher…</span>
        <kbd>Ctrl K</kbd>
      `;
      trigger.addEventListener('click', openPalette);
      userZone.insertBefore(trigger, userZone.firstChild);
    }

    // Crée le modal (caché)
    let backdrop = document.querySelector('.cmdk-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'cmdk-backdrop';
      backdrop.innerHTML = `
        <div class="cmdk-modal" role="dialog" aria-label="Recherche">
          <div class="cmdk-search">
            <span class="cmdk-search-icon">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="7" cy="7" r="5"/><path d="M14 14l-3-3"/></svg>
            </span>
            <input type="text" placeholder="Rechercher un outil, un article, une page…" autocomplete="off" />
            <kbd>Esc</kbd>
          </div>
          <div class="cmdk-results"></div>
        </div>`;
      document.body.appendChild(backdrop);
    }

    const input = backdrop.querySelector('input');
    const results = backdrop.querySelector('.cmdk-results');
    let focused = 0;

    function openPalette() {
      backdrop.classList.add('is-open');
      setTimeout(() => input.focus(), 50);
      render('');
    }
    function closePalette() {
      backdrop.classList.remove('is-open');
      input.value = '';
    }

    function render(query) {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? items.filter(i => i.keywords.includes(q))
        : items;

      if (!filtered.length) {
        results.innerHTML = `<div class="cmdk-empty">Aucun résultat pour "${query}"</div>`;
        return;
      }

      // Group by category
      const groups = {};
      filtered.forEach(i => {
        if (!groups[i.cat]) groups[i.cat] = [];
        groups[i.cat].push(i);
      });

      let html = '';
      Object.entries(groups).forEach(([cat, list]) => {
        html += `<div class="cmdk-group"><div class="cmdk-group-label">${cat}</div>`;
        list.forEach((item, idx) => {
          const globalIdx = filtered.indexOf(item);
          html += `
            <a href="${item.url}" class="cmdk-item ${globalIdx === focused ? 'is-focused' : ''}"
               data-idx="${globalIdx}" style="--item-color:${item.color || 'var(--text-3)'}">
              <span class="cmdk-item-icon">${item.icon}</span>
              <div class="cmdk-item-text">
                <div class="cmdk-item-label">${item.label}</div>
              </div>
              <span class="cmdk-item-cat">${item.cat}</span>
            </a>`;
        });
        html += `</div>`;
      });
      results.innerHTML = html;
      // Update focused index ref
      results.dataset.total = filtered.length;
      results.dataset.list = JSON.stringify(filtered.map(i => i.url));
    }

    function moveFocus(delta) {
      const total = parseInt(results.dataset.total || 0, 10);
      if (!total) return;
      focused = (focused + delta + total) % total;
      render(input.value);
    }

    function activateFocused() {
      const list = JSON.parse(results.dataset.list || '[]');
      const url = list[focused];
      if (url) window.location.href = url;
    }

    input.addEventListener('input', () => { focused = 0; render(input.value); });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePalette();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        backdrop.classList.contains('is-open') ? closePalette() : openPalette();
        return;
      }
      if (!backdrop.classList.contains('is-open')) return;
      if (e.key === 'Escape')        { closePalette(); e.preventDefault(); }
      if (e.key === 'ArrowDown')     { moveFocus(1); e.preventDefault(); }
      if (e.key === 'ArrowUp')       { moveFocus(-1); e.preventDefault(); }
      if (e.key === 'Enter')         { activateFocused(); e.preventDefault(); }
    });
  };

  /* ===========================================================
     INSTRUMENT SELECTS — peuple dynamiquement tous les <select>
     marqués data-instruments depuis window.PIPS.PAIRS
     =========================================================== */
  CI.initInstrumentSelects = function () {
    if (typeof window.PIPS === 'undefined' || !window.PIPS.PAIRS) return;
    document.querySelectorAll('select[data-instruments]').forEach(sel => {
      if (sel.dataset.populated) return;
      sel.dataset.populated = '1';
      const currentValue = sel.value || sel.dataset.default || 'EUR/USD';

      // Groupe par catégorie
      const groups = {};
      Object.entries(window.PIPS.PAIRS).forEach(([symbol, info]) => {
        const cat = info.category;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({ symbol, info });
      });

      const labels = {
        'forex': 'Forex majors & crosses',
        'forex_exotic': 'Forex exotiques',
        'metal': 'Métaux précieux',
        'commodity': 'Énergie & matières premières',
        'index': 'Indices CFD',
        'stock': 'Actions US',
        'crypto': 'Cryptomonnaies'
      };
      const order = ['forex', 'forex_exotic', 'metal', 'commodity', 'index', 'stock', 'crypto'];

      let html = '';
      order.forEach(cat => {
        if (!groups[cat]) return;
        html += `<optgroup label="${labels[cat] || cat}">`;
        groups[cat].forEach(({ symbol }) => {
          html += `<option value="${symbol}">${symbol}</option>`;
        });
        html += `</optgroup>`;
      });
      sel.innerHTML = html;
      sel.value = currentValue;
    });
  };

  /* ===========================================================
     LIVE PRICES — bouton "prix en temps réel" à côté du select
     Usage : sur le HTML, ajouter data-live-price="<inputId>"
     sur le <select data-instruments>. Le module va injecter
     un bouton qui fetch via PRICES.getPrice() et alimente l'input.
     =========================================================== */
  CI.initLivePrices = function () {
    if (typeof window.PRICES === 'undefined') return;
    document.querySelectorAll('select[data-instruments][data-live-price]').forEach(sel => {
      if (sel.dataset.liveBtn) return;
      sel.dataset.liveBtn = '1';
      const targetId = sel.dataset.livePrice;
      const targetInput = document.getElementById(targetId);
      if (!targetInput) return;

      // Crée le bouton (placé après le select dans le DOM)
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-live-price';
      btn.title = 'Charger le prix temps réel';
      btn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
          <path d="M14 8A6 6 0 1 1 8 2"/><polyline points="14 2 14 6 10 6"/>
        </svg>
        <span class="btn-live-price-text">Prix live</span>
      `;
      Object.assign(btn.style, {
        marginTop: '6px', padding: '6px 10px', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
        color: 'var(--text-3)', fontSize: '11px', fontWeight: '600',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        cursor: 'pointer', transition: 'var(--t-fast)'
      });
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text-3)'; });

      // Status badge
      const status = document.createElement('span');
      status.className = 'live-price-status';
      Object.assign(status.style, { marginLeft: '8px', fontSize: '10px', color: 'var(--text-4)' });

      btn.addEventListener('click', async () => {
        const pair = sel.value;
        if (!pair) return;
        btn.disabled = true;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<span style="font-size:11px">⏳ Chargement…</span>';
        try {
          // Sync aussi PIPS.PAIRS[pair].price pour les conversions internes
          const price = window.PRICES.syncPipsBase
            ? await window.PRICES.syncPipsBase(pair)
            : await window.PRICES.getPrice(pair);
          if (price != null && Number.isFinite(price)) {
            targetInput.value = price;
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            const age = window.PRICES.cacheAge();
            status.textContent = `✓ ${price.toFixed(price >= 100 ? 2 : 4)} ${pair.split('/')[1] || ''} · MAJ ${age != null ? 'il y a ' + age + 's' : 'maintenant'}`;
            status.style.color = 'var(--accent)';
            CI.toast && CI.toast('Prix mis à jour : ' + price.toFixed(price >= 100 ? 2 : 4), 'success', 2000);
          } else {
            status.textContent = '✗ Indisponible pour cet instrument';
            status.style.color = 'var(--red, #F87171)';
            CI.toast && CI.toast('Prix indisponible pour ' + pair + ' (action / indice / commodity sans free API)', 'warn', 3500);
          }
        } catch (e) {
          status.textContent = '✗ Erreur réseau';
          status.style.color = 'var(--red, #F87171)';
        } finally {
          btn.disabled = false;
          btn.innerHTML = oldHtml;
        }
      });

      // Insère sous le <select>
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexWrap = 'wrap';
      wrap.style.alignItems = 'center';
      wrap.appendChild(btn);
      wrap.appendChild(status);
      sel.insertAdjacentElement('afterend', wrap);
    });
  };

  /* ===========================================================
     RECENT TOOLS — track les outils visités (localStorage)
     =========================================================== */
  const RECENT_KEY = 'ci_recent_tools_v1';
  const TOOL_CATALOG = {
    '/simulateur-dca':                  { label: 'DCA Bourse',         cat: 'Marchés',  color: '#2563EB' },
    '/simulateur-dca-crypto':           { label: 'DCA Crypto',         cat: 'Marchés',  color: '#F7931A' },
    '/simulateur-dcf':                  { label: 'Valorisation DCF',   cat: 'Marchés',  color: '#D97706' },
    '/simulateur-rendement-locatif':    { label: 'Rendement Locatif',  cat: 'Immobilier', color: '#059669' },
    '/simulateur-scpi':                 { label: 'SCPI',               cat: 'Immobilier', color: '#0E9F6E' },
    '/simulateur-pret':                 { label: 'Simulateur de Prêt', cat: 'Immobilier', color: '#0E9F6E' },
    '/calculateur-pips':                { label: 'Calculateur PIPS',   cat: 'Trading',  color: '#7C3AED' },
    '/calculateur-marge-liquidation':   { label: 'Marge & Liquidation',cat: 'Trading',  color: '#8B5CF6' },
    '/calculateur-couts-trading':       { label: 'Coûts du trade',     cat: 'Trading',  color: '#9333EA' },
    '/calculateur-risk-management':     { label: 'Risk Management',    cat: 'Trading',  color: '#A855F7' },
    '/simulateur-monte-carlo-trading':  { label: 'Monte Carlo Trading',cat: 'Trading',  color: '#A78BFA' },
    '/calculateur-fiscalite-trading':   { label: 'Fiscalité Trading',  cat: 'Trading',  color: '#C026D3' },
    '/calculateur-volatilite':          { label: 'ATR & Kelly',        cat: 'Trading',  color: '#9D174D' },
    '/simulateur-interets-composes':    { label: 'Intérêts Composés',  cat: 'Épargne',  color: '#7C3AED' },
    '/calculateur-fire':                { label: 'FIRE',               cat: 'Épargne',  color: '#EA580C' },
    '/simulateur-per':                  { label: 'PER',                cat: 'Épargne',  color: '#DC2626' },
    '/simulateur-retraite':             { label: 'Retraite',           cat: 'Épargne',  color: '#0891B2' },
    '/calculateur-impot-revenu':        { label: 'Impôt Revenu',       cat: 'Fiscalité',color: '#DC2626' },
    '/calculateur-salaire-brut-net':    { label: 'Salaire Brut/Net',   cat: 'Fiscalité',color: '#3B82F6' },
    '/calculateur-plus-value-immobiliere':{ label: 'Plus-Value Immo',  cat: 'Immobilier',color: '#10B981' },
    '/calculateur-tva-auto-entrepreneur':{ label: 'TVA + Auto-Entrepreneur',cat: 'Fiscalité',color: '#F59E0B' },
    '/convertisseur-devises':           { label: 'Convertisseur Devises',cat: 'Outils',  color: '#0EA5E9' },
    '/simulateur-assurance-vie':        { label: 'Assurance-Vie',      cat: 'Épargne',  color: '#7C3AED' },
    '/simulateur-lmnp':                 { label: 'LMNP',               cat: 'Immobilier',color: '#0E9F6E' },
    '/calculateur-donation-succession': { label: 'Donation / Succession',cat: 'Fiscalité',color: '#D97706' },
    '/journal-trading':                 { label: 'Journal de Trade',   cat: 'Trading',  color: '#7C3AED' },
    '/calculatrices-express':           { label: 'Calculatrices Express',cat: 'Outils', color: '#34D399' },
    '/simulateur-decumulation':         { label: 'Décumulation',       cat: 'Épargne',  color: '#0891B2' },
    '/mon-foyer-fiscal':                { label: 'Foyer fiscal global', cat: 'Fiscalité',color: '#DC2626' },
    '/portefeuille-locatif':            { label: 'Portefeuille Locatif',cat: 'Immobilier',color: '#10B981' },
    '/comparer':                        { label: 'Comparer simulations',cat: 'Outils',  color: '#34D399' },
    '/glossaire':                       { label: 'Glossaire financier',cat: 'Docs',    color: '#94A3B8' }
  };

  CI.initRecentTools = function () {
    const path = window.location.pathname.replace(/\/$/, '').toLowerCase();
    if (TOOL_CATALOG[path]) {
      // Track la visite
      let recent;
      try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { recent = []; }
      recent = recent.filter(p => p !== path);
      recent.unshift(path);
      recent = recent.slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
    }
    // Render dans le container .ci-recent-tools si présent (home)
    const container = document.querySelector('[data-recent-tools]');
    if (!container) return;
    let recent;
    try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { recent = []; }
    if (!recent.length) { container.style.display = 'none'; return; }
    container.innerHTML = recent.slice(0, 3).map(p => {
      const t = TOOL_CATALOG[p];
      if (!t) return '';
      return `
        <a href="${p}" class="recent-tool" style="--cat-color:${t.color}">
          <span class="recent-tool-cat">${t.cat}</span>
          <span class="recent-tool-label">${t.label}</span>
          <svg class="recent-tool-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
        </a>`;
    }).join('');
  };

  /* ===========================================================
     TRADING — helper pour ajouter un bouton "Sauvegarder"
     Utilisé par toutes les views trading
     =========================================================== */
  CI.attachSaveButton = function (opts) {
    // opts = { btnId, type, getParams: () => ({...}), defaultName: 'Mon setup' }
    const btn = document.getElementById(opts.btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const params = opts.getParams();
      CI.promptSave && CI.promptSave(opts.type, params, opts.defaultName || 'Mon setup', () => {
        CI.toast && CI.toast('Setup enregistré ✓', 'success');
      });
    });
  };

  /* ===========================================================
     MEGA MENU — nav contextuelle 4 catégories
     S'injecte dans .topbar-center sur les pages simulateur.
     Hover sur desktop, click-toggle sur touch.
     =========================================================== */
  CI.initMegaMenu = function () {
    const container = document.querySelector('.topbar-center');
    if (!container) return;
    // Skip si pas de .segmented (= pages non-simulateur, ou déjà géré)
    const oldNav = container.querySelector('.segmented');
    if (!oldNav) return;

    const ICONS = {
      // Outils — réutilisés depuis le site
      dca:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
      crypto:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="12 2 2 7 12 12 22 7"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
      dcf:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      locatif:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/><path d="M3 21h18"/></svg>',
      scpi:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="4" width="7" height="16"/><rect x="14" y="4" width="7" height="16"/><path d="M3 10h7M14 10h7M3 16h7M14 16h7"/></svg>',
      pips:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 12h18M7 8l4 4-4 4M17 8l-4 4 4 4"/></svg>',
      margin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 20h18M5 16V10M10 16V6M15 16V8M20 16V4"/></svg>',
      cost:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 4h18M3 9h18M3 14h12"/><path d="M16 19l3-3-3-3"/></svg>',
      risk:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
      mc:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="6" cy="6" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="9" cy="14" r="2"/><circle cx="5" cy="15" r="2"/><circle cx="14" cy="14" r="2"/></svg>',
      fisca:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="M8 11h8M8 15h6"/></svg>',
      compound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 21V5"/><path d="M3 16c3-3 5-1 8-4s5-5 8-5"/></svg>',
      fire:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 2C8 7 7 10 7 14a5 5 0 0 0 10 0c0-4-1-7-5-12z"/><path d="M9 17c0-2.5 1.5-4 3-5"/></svg>',
      per:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
      retraite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      // Catégories
      catMarches:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="2 11 6 6 9 9 14 3"/></svg>',
      catImmo:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M3 7L8 3l5 4v7H3z"/><path d="M6 14V9h4v5"/></svg>',
      catTrading:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M2 8h12M5 5l3 3-3 3M11 5l-3 3 3 3"/></svg>',
      catEpargne:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>',
      catFisca:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M5 5h6M5 8h6M5 11h4"/></svg>',
      impot:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="4" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
      chevron:     '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><polyline points="3 5 6 8 9 5"/></svg>'
    };

    const CATEGORIES = [
      {
        id: 'marches', label: 'Marchés', color: '#2563EB', icon: ICONS.catMarches,
        tools: [
          { url: '/simulateur-dca',        label: 'DCA Bourse',          desc: 'Backtest 1871-2026, 13 actifs',  icon: ICONS.dca },
          { url: '/simulateur-dca-crypto', label: 'DCA Crypto',          desc: 'BTC, ETH, SOL, BNB, XRP',         icon: ICONS.crypto },
          { url: '/simulateur-dcf',        label: 'Valorisation DCF',    desc: 'Valeur intrinsèque d\'une action', icon: ICONS.dcf }
        ]
      },
      {
        id: 'immo', label: 'Immobilier', color: '#059669', icon: ICONS.catImmo,
        tools: [
          { url: '/simulateur-rendement-locatif', label: 'Rendement Locatif',    desc: 'Cashflow, TRI, LMNP, SCI IS',    icon: ICONS.locatif },
          { url: '/simulateur-scpi',              label: 'SCPI · Pierre papier', desc: '4 régimes fiscaux + rentier',     icon: ICONS.scpi },
          { url: '/simulateur-pret',              label: 'Simulateur de Prêt',   desc: 'Capacité, mensualités, notaire',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="6" width="18" height="14" rx="1"/><path d="M3 10h18M7 16h3M14 16h3"/></svg>' },
          { url: '/calculateur-plus-value-immobiliere', label: 'Plus-Value Immobilière', desc: 'Cession, abattements durée, IR + PS', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-7h6v7"/></svg>' },
          { url: '/simulateur-lmnp',              label: 'LMNP · Location Meublée', desc: 'Micro-BIC vs Réel + amortissements', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 21h18"/><path d="M5 21V11l7-5 7 5v10"/><rect x="9" y="14" width="6" height="7"/></svg>' }
        ]
      },
      {
        id: 'trading', label: 'Trading', color: '#7C3AED', icon: ICONS.catTrading,
        tools: [
          { url: '/calculateur-pips',                  label: 'Calculateur PIPS',         desc: 'Position sizing, pip value',     icon: ICONS.pips },
          { url: '/calculateur-marge-liquidation',     label: 'Marge & Liquidation',      desc: 'Marge, prix de liq, SL/TP',      icon: ICONS.margin },
          { url: '/calculateur-couts-trading',         label: 'Coûts du trade',           desc: 'Spread, commission, swap',       icon: ICONS.cost },
          { url: '/calculateur-risk-management',       label: 'Risk Management',          desc: 'Expectancy, R/R, P(ruine)',      icon: ICONS.risk },
          { url: '/simulateur-monte-carlo-trading',    label: 'Monte Carlo Trading',      desc: '2000 trajectoires de votre système', icon: ICONS.mc },
          { url: '/calculateur-fiscalite-trading',     label: 'Fiscalité Trading FR',     desc: 'PFU vs IR, CTO vs PEA',          icon: ICONS.fisca },
          { url: '/calculateur-volatilite',            label: 'ATR & Kelly',              desc: 'Volatilité + sizing optimal',    icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="16" height="16"><path d="M2 10l4-6 4 6 4-3"/></svg>' },
          { url: '/journal-trading',                   label: 'Journal de Trade',         desc: 'Stats, equity curve, persistant',icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="16" height="16"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M5 11h4"/></svg>' }
        ]
      },
      {
        id: 'fisca', label: 'Fiscalité', color: '#DC2626', icon: ICONS.catFisca,
        tools: [
          { url: '/calculateur-impot-revenu', label: 'Calculateur Impôt Revenu', desc: 'Barème 2025, parts, TMI, décote', icon: ICONS.impot },
          { url: '/calculateur-salaire-brut-net', label: 'Salaire Brut / Net', desc: 'Cotisations URSSAF, retraite, CSG', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="9" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>' },
          { url: '/calculateur-tva-auto-entrepreneur', label: 'TVA + Auto-Entrepreneur', desc: 'HT/TTC + URSSAF micro', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>' },
          { url: '/convertisseur-devises', label: 'Convertisseur Devises', desc: 'Taux BCE live, 30+ devises', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 12h18M7 7l-4 5 4 5M17 17l4-5-4-5"/></svg>' },
          { url: '/calculateur-donation-succession', label: 'Donation & Succession', desc: 'Abattements, barème, démembrement', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' }
        ]
      },
      {
        id: 'epargne', label: 'Épargne & Retraite', color: '#0891B2', icon: ICONS.catEpargne,
        tools: [
          { url: '/simulateur-interets-composes', label: 'Intérêts Composés',   desc: 'Croissance épargne 40 ans',         icon: ICONS.compound },
          { url: '/calculateur-fire',             label: 'Calculateur FIRE',     desc: 'Indépendance financière, règle 4 %', icon: ICONS.fire },
          { url: '/simulateur-per',               label: 'Simulateur PER',       desc: 'PER vs CTO, économie fiscale',       icon: ICONS.per },
          { url: '/simulateur-retraite',          label: 'Simulateur Retraite',  desc: 'Régime général + Agirc-Arrco',       icon: ICONS.retraite },
          { url: '/simulateur-assurance-vie',     label: 'Assurance-Vie',         desc: 'Fonds €/UC, fiscalité 8 ans, succession', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>' }
        ]
      }
    ];

    const currentPath = window.location.pathname.replace(/\/$/, '').toLowerCase();

    function isActiveTool(url) { return currentPath === url.toLowerCase(); }
    function isActiveCategory(cat) { return cat.tools.some(t => isActiveTool(t.url)); }

    const html = CATEGORIES.map(cat => {
      const activeCat = isActiveCategory(cat);
      const tools = cat.tools.map(t => {
        const active = isActiveTool(t.url);
        return `
          <a href="${t.url}" class="megamenu-item ${active ? 'is-active' : ''}" style="--cat-color:${cat.color}">
            <div class="megamenu-item-icon">${t.icon}</div>
            <div class="megamenu-item-text">
              <div class="megamenu-item-label">${t.label}</div>
              <div class="megamenu-item-desc">${t.desc}</div>
            </div>
          </a>`;
      }).join('');
      return `
        <div class="megamenu ${activeCat ? 'is-active' : ''}" data-cat="${cat.id}" style="--cat-color:${cat.color}">
          <button class="megamenu-trigger" type="button" aria-expanded="false">
            <span class="megamenu-trigger-icon">${cat.icon}</span>
            ${cat.label}
            <span class="megamenu-chevron">${ICONS.chevron}</span>
          </button>
          <div class="megamenu-panel" role="menu">
            <div class="megamenu-panel-head">
              <span class="megamenu-panel-eyebrow">${cat.tools.length} outils</span>
            </div>
            <div class="megamenu-panel-items">${tools}</div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = '<nav class="megamenu-nav" aria-label="Navigation outils">' + html + '</nav>';

    // Touch device : click pour ouvrir, sinon hover natif via CSS
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) {
      container.querySelectorAll('.megamenu-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const mm = btn.closest('.megamenu');
          const wasOpen = mm.classList.contains('is-open');
          // Ferme tous les autres
          container.querySelectorAll('.megamenu.is-open').forEach(m => m.classList.remove('is-open'));
          if (!wasOpen) mm.classList.add('is-open');
        });
      });
      // Click outside ferme
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.megamenu')) {
          container.querySelectorAll('.megamenu.is-open').forEach(m => m.classList.remove('is-open'));
        }
      });
    }

    // Échap ferme tout
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        container.querySelectorAll('.megamenu.is-open').forEach(m => m.classList.remove('is-open'));
      }
    });
  };

  /* ===========================================================
     READING PROGRESS BAR — barre fine en haut, % de scroll
     Active si <body data-progress> ou auto sur pages "longues"
     =========================================================== */
  CI.initProgressBar = function () {
    // Crée la barre si pas présente
    let bar = document.querySelector('.v3-progress');
    if (!bar) {
      const wantsProgress = document.body.hasAttribute('data-progress')
                         || document.querySelector('.legal-section, .methodo-section, .article-content');
      if (!wantsProgress) return;
      bar = document.createElement('div');
      bar.className = 'v3-progress is-active';
      document.body.appendChild(bar);
    }
    let ticking = false;
    function update() {
      const doc = document.documentElement;
      const scrolled = window.scrollY;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? Math.min(100, (scrolled / max) * 100) : 0;
      bar.style.width = pct + '%';
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  };

  /* ===========================================================
     SCROLL TO TOP — bouton FAB en bas à gauche
     =========================================================== */
  CI.initScrollTop = function () {
    let btn = document.querySelector('.v3-scroll-top');
    if (!btn) {
      // Auto-injecté seulement si la page est "longue"
      const isLong = document.documentElement.scrollHeight > window.innerHeight * 3;
      if (!isLong) return;
      btn = document.createElement('button');
      btn.className = 'v3-scroll-top';
      btn.setAttribute('aria-label', 'Retour en haut');
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M8 12V4M4 8l4-4 4 4"/></svg>';
      btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      document.body.appendChild(btn);
    }
    let ticking = false;
    function update() {
      if (window.scrollY > 1000) btn.classList.add('is-visible');
      else btn.classList.remove('is-visible');
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  };

  /* ===========================================================
     COUNT-UP — anime les chiffres au passage dans le viewport
     Usage : <span data-countup="412580" data-countup-suffix=" €">0</span>
     ou simplement <span data-countup="9">0</span>
     =========================================================== */
  CI.initCountUp = function (root) {
    root = root || document;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        observer.unobserve(el);
        const target  = parseFloat(el.dataset.countup) || 0;
        const dec     = parseInt(el.dataset.countupDec || '0', 10);
        const suffix  = el.dataset.countupSuffix || '';
        const prefix  = el.dataset.countupPrefix || '';
        const dur     = parseInt(el.dataset.countupDuration || '1400', 10);
        const start   = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / dur);
          // easeOutQuart
          const e = 1 - Math.pow(1 - t, 4);
          const val = target * e;
          el.textContent = prefix + val.toLocaleString('fr-FR', {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec
          }) + suffix;
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    root.querySelectorAll('[data-countup]').forEach(el => {
      // Init à 0 visuellement pour éviter le flash
      const dec    = parseInt(el.dataset.countupDec || '0', 10);
      const suffix = el.dataset.countupSuffix || '';
      const prefix = el.dataset.countupPrefix || '';
      el.textContent = prefix + (0).toLocaleString('fr-FR', {
        minimumFractionDigits: dec, maximumFractionDigits: dec
      }) + suffix;
      observer.observe(el);
    });
  };

  /* ===========================================================
     PARALLAX MOUSE — déplace les éléments selon position souris
     Usage : <div data-parallax="20"> où "20" = intensité en px
     =========================================================== */
  CI.initParallax = function (root) {
    root = root || document;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const containers = root.querySelectorAll('[data-parallax-container]');
    containers.forEach(container => {
      const targets = container.querySelectorAll('[data-parallax]');
      if (!targets.length) return;
      let raf = null;
      let mouseX = 0, mouseY = 0;
      container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        mouseX = (e.clientX - rect.left - rect.width / 2)  / rect.width;
        mouseY = (e.clientY - rect.top  - rect.height / 2) / rect.height;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      container.addEventListener('mouseleave', () => {
        mouseX = 0; mouseY = 0;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      function apply() {
        targets.forEach(t => {
          const strength = parseFloat(t.dataset.parallax) || 12;
          const rotate   = t.dataset.parallaxRotate || '0';
          t.style.transform = `translate(${mouseX * strength}px, ${mouseY * strength}px) rotate(${rotate}deg)`;
        });
        raf = null;
      }
    });
  };

  /* ===========================================================
     SUB-NAV STICKY — barre de navigation contextuelle
     qui apparaît au scroll après le hero
     =========================================================== */
  CI.initSubNav = function () {
    const subnav = document.querySelector('[data-subnav]');
    if (!subnav) return;
    // Trigger : déclencher quand le hero est >70% sorti du viewport
    const trigger = document.querySelector('[data-subnav-trigger]');
    if (!trigger) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // Quand le trigger sort par le HAUT (scroll down passé), montrer la subnav
        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
          subnav.classList.add('is-visible');
        } else {
          subnav.classList.remove('is-visible');
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px 0px 0px' });
    observer.observe(trigger);

    // Surligner le lien actif selon section visible
    const links = subnav.querySelectorAll('[data-subnav-link]');
    if (!links.length) return;
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        links.forEach(l => {
          if (l.getAttribute('href') === '#' + id) l.classList.add('is-active');
          else l.classList.remove('is-active');
        });
      });
    }, { threshold: 0.3, rootMargin: '-100px 0px -50% 0px' });
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const target = document.getElementById(href.slice(1));
        if (target) sectionObserver.observe(target);
      }
    });
  };

  /* ===========================================================
     SCROLL REVEAL — fade-up au passage dans le viewport
     =========================================================== */
  CI.initScrollReveal = function (root) {
    root = root || document;
    if (typeof IntersectionObserver === 'undefined') {
      root.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    root.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  };

  /* ===========================================================
     TOPBAR — état compact au scroll
     =========================================================== */
  CI.initTopbarScroll = function () {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    let ticking = false;
    function update() {
      if (window.scrollY > 60) topbar.classList.add('is-scrolled');
      else topbar.classList.remove('is-scrolled');
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  };

  /* ===========================================================
     FLOATING CTA — apparaît entre 800px et fin du scroll
     =========================================================== */
  CI.initFloatingCTA = function () {
    const cta = document.querySelector('.floating-cta');
    if (!cta) return;
    let ticking = false;
    function update() {
      const doc = document.documentElement;
      const scrolled = window.scrollY;
      const max = doc.scrollHeight - doc.clientHeight;
      if (scrolled > 800 && scrolled < max - 200) {
        cta.classList.add('is-visible');
      } else {
        cta.classList.remove('is-visible');
      }
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  };

  /* ===========================================================
     CHART (canvas natif — line + area)
     ========================================================
     Usage:
       CI.drawChart('my-canvas', labels, [
         { label: 'Valeur', data: [...], color: '#34D399', fill: true },
         { label: 'Dette', data: [...], color: '#F87171' }
       ], { yFormat: v => CI.fmtCompact(v) });
     =========================================================== */
  CI.drawChart = function (canvasId, labels, datasets, opts) {
    opts = opts || {};
    const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width));
    const H = Math.max(180, Math.floor(rect.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padL = 56, padR = 16, padT = 14, padB = 30;
    const w = W - padL - padR;
    const h = H - padT - padB;

    // Domain
    let yMin = Infinity, yMax = -Infinity;
    datasets.forEach((ds) => {
      ds.data.forEach((v) => {
        if (v == null || isNaN(v)) return;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      });
    });
    if (yMin === Infinity) { yMin = 0; yMax = 1; }
    if (yMin === yMax) { yMax = yMin + 1; }
    // Nice padding
    const span = yMax - yMin;
    yMin -= span * 0.05;
    yMax += span * 0.08;
    if (yMin > 0 && yMin < span * 0.2) yMin = 0;

    const n = labels.length;
    const xAt = (i) => padL + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
    const yAt = (v) => padT + h - ((v - yMin) / (yMax - yMin)) * h;

    // Grid
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94A3B8';
    const yFmt = opts.yFormat || ((v) => CI.fmtCompact(v));

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + ((yMax - yMin) * i) / yTicks;
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(yFmt(v), padL - 8, y);
    }

    // X labels (every few)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTickStep = Math.max(1, Math.ceil(n / 8));
    for (let i = 0; i < n; i += xTickStep) {
      ctx.fillText(String(labels[i]), xAt(i), padT + h + 8);
    }
    if ((n - 1) % xTickStep !== 0) {
      ctx.fillText(String(labels[n - 1]), xAt(n - 1), padT + h + 8);
    }

    // Datasets
    datasets.forEach((ds) => {
      const color = ds.color || '#34D399';
      const lw = ds.width || 2;

      // Fill area
      if (ds.fill) {
        const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
        // Stop 0 (top, line area) : couleur visible. Stop 1 (bas) : transparent.
        // Supporte hex (#34D399 → '#34D39900' pour transparent) ET rgba(r,g,b,a)
        // (→ rgba(r,g,b,0) pour transparent). L'ancien `+ '00'` cassait sur rgba.
        const top = ds.fillColor || (color + '33');
        let bottom;
        if (ds.fillColor) {
          bottom = /^rgba/i.test(ds.fillColor)
            ? ds.fillColor.replace(/,\s*[\d.]+\s*\)$/, ', 0)')
            : (ds.fillColor.length === 7 ? ds.fillColor + '00' : ds.fillColor); // #RRGGBB → #RRGGBB00
        } else {
          bottom = color + '00';
        }
        grad.addColorStop(0, top);
        grad.addColorStop(1, bottom);
        ctx.beginPath();
        ds.data.forEach((v, i) => {
          const x = xAt(i), y = yAt(v == null ? yMin : v);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineTo(xAt(n - 1), yAt(yMin));
        ctx.lineTo(xAt(0), yAt(yMin));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Line
      ctx.beginPath();
      ds.data.forEach((v, i) => {
        const x = xAt(i), y = yAt(v == null ? yMin : v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (ds.dash) ctx.setLineDash(ds.dash);
      else ctx.setLineDash([]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    });

    /* ----------------------------------------------------------
       Interactivité : curseur + tooltip au hover
       ---------------------------------------------------------- */
    // Snapshot du rendu statique (pixels bruts, ignorés par les transforms)
    const snapshot = ctx.getImageData(0, 0, W * dpr, H * dpr);

    // Tooltip HTML — créé une seule fois par canvas, réutilisé ensuite
    const parent = canvas.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    let tip = canvas._ciTooltip;
    if (!tip) {
      tip = document.createElement('div');
      tip.style.cssText = [
        'position:absolute',
        'background:rgba(255,255,255,0.96)',
        'color:#0F172A',
        'border:1px solid #E5E9EE',
        'border-radius:8px',
        'padding:8px 12px',
        'font-size:12px',
        'font-family:"Inter",sans-serif',
        'pointer-events:none',
        'display:none',
        'z-index:200',
        'min-width:110px',
        'box-shadow:0 4px 12px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.08)',
        'backdrop-filter:blur(8px) saturate(180%)',
        '-webkit-backdrop-filter:blur(8px) saturate(180%)',
        'white-space:nowrap'
      ].join(';');
      if (parent) parent.appendChild(tip);
      canvas._ciTooltip = tip;
    }

    // Dessin du curseur (appelé depuis mousemove)
    function drawCursor(idx) {
      ctx.putImageData(snapshot, 0, 0);
      const cx = xAt(idx);

      // Ligne verticale pointillée
      ctx.save();
      ctx.strokeStyle = 'rgba(15,23,42,0.25)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, padT + h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Points sur chaque série
      datasets.forEach((ds) => {
        const v = ds.data[idx];
        if (v == null || isNaN(v)) return;
        const cy = yAt(v);
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle   = ds.color || '#34D399';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth   = 2;
        ctx.stroke();
      });
      ctx.restore();
    }

    // Mise à jour du tooltip HTML
    function updateTooltip(idx, mouseX, mouseY) {
      const label = labels[idx];
      const rows  = datasets.map((ds) => {
        const v = ds.data[idx];
        if (v == null || isNaN(v)) return '';
        return `<div style="display:flex;align-items:center;gap:7px;margin:3px 0">` +
          `<span style="width:8px;height:8px;border-radius:50%;background:${ds.color || '#34D399'};flex-shrink:0"></span>` +
          (ds.label ? `<span style="color:#64748B">${ds.label}</span>` : '') +
          `<span style="font-weight:700;margin-left:auto;padding-left:10px">${yFmt(v)}</span>` +
          `</div>`;
      }).filter(Boolean).join('');

      tip.innerHTML =
        `<div style="font-weight:600;color:#475569;margin-bottom:4px;font-size:11px">${label}</div>` +
        rows;
      tip.style.display = 'block';

      // Position : à droite du curseur si possible, sinon à gauche
      const tipW = tip.offsetWidth || 140;
      const tipH = tip.offsetHeight || 60;
      let left = mouseX + 14;
      if (left + tipW > W - 8) left = mouseX - tipW - 14;
      let top  = Math.max(4, mouseY - tipH / 2);
      if (top + tipH > H - 4) top = H - tipH - 4;
      tip.style.left = left + 'px';
      tip.style.top  = top  + 'px';
    }

    // Event handlers (réassignés à chaque drawChart pour les nouvelles données)
    canvas.onmousemove = function (e) {
      const rect  = canvas.getBoundingClientRect();
      const mx    = (e.clientX - rect.left) * (canvas.width  / rect.width)  / dpr;
      const my    = (e.clientY - rect.top)  * (canvas.height / rect.height) / dpr;

      // Indice le plus proche sur l'axe X
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(xAt(i) - mx);
        if (d < bestDist) { bestDist = d; best = i; }
      }

      // N'afficher que si le curseur est dans la zone de tracé
      if (mx < padL - 4 || mx > W - padR + 4) {
        ctx.putImageData(snapshot, 0, 0);
        tip.style.display = 'none';
        return;
      }

      drawCursor(best);
      updateTooltip(best, mx, my);
    };

    canvas.onmouseleave = function () {
      ctx.putImageData(snapshot, 0, 0);
      tip.style.display = 'none';
    };
  };

  /* ===========================================================
     GLOSSAIRE — termes financiers + tooltips éducatifs
     ===========================================================
     Wrap automatique des termes connus dans les insights et info-boxes
     via MutationObserver. Hover montre un tooltip avec définition.
     =========================================================== */
  CI.GLOSSARY = {
    'TMI':       { full: 'Tranche Marginale d\'Imposition',          desc: 'Taux d\'IR appliqué à votre dernière tranche (0/11/30/41/45 % en France 2025).' },
    'TRI':       { full: 'Taux de Rentabilité Interne',              desc: 'Rendement annualisé qui prend en compte tous les flux de trésorerie. Permet de comparer des projets aux profils différents.' },
    'CAGR':      { full: 'Compound Annual Growth Rate',              desc: 'Taux de croissance annuel composé : la performance moyenne par an d\'un investissement sur une période donnée.' },
    'CAPE':      { full: 'Cyclically Adjusted P/E (Shiller)',        desc: 'Price/Earnings sur 10 ans ajusté à l\'inflation. Indicateur historique de cherté du marché actions.' },
    'PER':       { full: 'Plan d\'Épargne Retraite',                 desc: 'Enveloppe française : versements déductibles de l\'IR (jusqu\'au plafond), capital bloqué jusqu\'à la retraite.' },
    'PEA':       { full: 'Plan d\'Épargne en Actions',               desc: 'Enveloppe française : exonéré IR sur les gains après 5 ans, plafond 150 000 €. Limité aux actions UE et certains ETF.' },
    'PFU':       { full: 'Prélèvement Forfaitaire Unique (Flat tax)', desc: 'Imposition forfaitaire de 30 % sur les revenus du capital (12.8 % IR + 17.2 % PS). Alternative au barème IR.' },
    'PS':        { full: 'Prélèvements Sociaux',                     desc: 'CSG/CRDS et autres : 17.2 % sur les revenus du capital en France.' },
    'IR':        { full: 'Impôt sur le Revenu',                      desc: 'Imposition progressive par tranches (TMI) sur les revenus annuels.' },
    'LMNP':      { full: 'Loueur Meublé Non Professionnel',          desc: 'Régime fiscal pour la location meublée. En réel : amortissement du bien et du mobilier déductible.' },
    'ETF':       { full: 'Exchange-Traded Fund',                     desc: 'Fonds indiciel coté en bourse, frais de gestion bas (TER 0.05–0.5 %/an).' },
    'TER':       { full: 'Total Expense Ratio',                      desc: 'Frais annuels totaux d\'un fonds, exprimés en % de l\'encours. ETF UCITS : typiquement 0.1–0.3 %.' },
    'DCA':       { full: 'Dollar Cost Averaging',                    desc: 'Investissement régulier d\'un montant fixe : lisse le prix d\'entrée et réduit le risque de timing.' },
    'IRR':       { full: 'Internal Rate of Return',                  desc: 'Équivalent anglais du TRI. Taux qui annule la valeur actualisée nette des flux.' },
    'NPV':       { full: 'Net Present Value',                        desc: 'Valeur actualisée nette : somme des flux futurs ramenés à aujourd\'hui à un taux d\'actualisation donné.' },
    'FIRE':      { full: 'Financial Independence, Retire Early',     desc: 'Mouvement consistant à atteindre l\'indépendance financière en visant 25× ses dépenses annuelles (règle des 4 %).' },
    'HODL':      { full: 'Hold On for Dear Life',                    desc: 'Stratégie crypto consistant à conserver son investissement sans trader, peu importe la volatilité.' },
    'APY':       { full: 'Annual Percentage Yield',                  desc: 'Rendement annuel effectif d\'un placement (en tenant compte de la composition).' },
    'APR':       { full: 'Annual Percentage Rate',                   desc: 'Taux annuel nominal, sans prise en compte de la composition.' },
    'LP':        { full: 'Liquidity Provider',                       desc: 'Fournisseur de liquidité sur un DEX (ex Uniswap) : dépose 2 actifs et touche des frais de trading.' },
    'IL':        { full: 'Impermanent Loss',                         desc: 'Perte impermanente : écart entre HODL et fournir de la liquidité, dû au rééquilibrage du pool.' },
    'USDC':      { full: 'USD Coin',                                 desc: 'Stablecoin émis par Circle, indexé 1:1 sur le dollar US. Utilisé en lending et LP.' },
    'BTC':       { full: 'Bitcoin',                                  desc: 'Première cryptomonnaie, créée en 2009. Plafond de 21 millions d\'unités, halving tous les 4 ans.' },
    'ETH':       { full: 'Ethereum',                                 desc: 'Plateforme blockchain pour smart contracts. Passé en preuve d\'enjeu en 2022 (staking ~3-4 % APY).' },
    'SOL':       { full: 'Solana',                                   desc: 'Blockchain haute performance, staking ~6-7 % APY, célèbre pour ses pannes occasionnelles.' },
    'BNB':       { full: 'Binance Coin',                             desc: 'Token natif de la blockchain BNB Chain, utilisé pour réduire les frais sur Binance.' },
    'XRP':       { full: 'XRP (Ripple)',                             desc: 'Token de la société Ripple, focalisé sur les paiements transfrontaliers.' },
    'CTO':       { full: 'Compte-Titres Ordinaire',                  desc: 'Enveloppe d\'investissement la plus libre (tous actifs mondiaux). Fiscalité : PFU 30 % par défaut.' },
    'AV':        { full: 'Assurance-Vie',                            desc: 'Enveloppe française : fiscalité avantageuse après 8 ans (taux 7.5 % + PS, abattement 4 600 € célibataire).' },
    'DEX':       { full: 'Decentralized Exchange',                   desc: 'Bourse décentralisée (ex Uniswap, SushiSwap) : trading peer-to-peer via smart contracts.' }
  };

  function _escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Build a single regex matching any glossary key as a whole word (case-sensitive)
  let _glossaryRegex = null;
  function _buildGlossaryRegex() {
    if (_glossaryRegex) return _glossaryRegex;
    const keys = Object.keys(CI.GLOSSARY).sort((a, b) => b.length - a.length); // longest first
    const pattern = '\\b(' + keys.map(_escapeRegex).join('|') + ')\\b';
    _glossaryRegex = new RegExp(pattern, 'g');
    return _glossaryRegex;
  }

  /* Walk text nodes inside `root`, wrap glossary terms with <span class="term"> */
  CI.wrapGlossaryTerms = function (root) {
    if (!root) return;
    const re = _buildGlossaryRegex();
    // Skip if already wrapped under this root (idempotent)
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'BUTTON', 'A']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip text nodes inside excluded ancestors or already-wrapped term spans
        let p = node.parentElement;
        while (p && p !== root) {
          if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
          if (p.classList && p.classList.contains('term')) return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return re.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);

    targets.forEach((textNode) => {
      const text = textNode.nodeValue;
      re.lastIndex = 0;
      let lastIdx = 0, m;
      const frag = document.createDocumentFragment();
      while ((m = re.exec(text)) !== null) {
        if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
        const key = m[1];
        const entry = CI.GLOSSARY[key];
        const span = document.createElement('span');
        span.className = 'term';
        span.dataset.term = key;
        span.setAttribute('aria-label', entry.full + ' — ' + entry.desc);
        span.textContent = key;
        frag.appendChild(span);
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      textNode.parentNode.replaceChild(frag, textNode);
    });
  };

  /* Singleton tooltip element + hover handlers (delegated) */
  let _tooltipEl = null;
  function _ensureTooltip() {
    if (_tooltipEl) return _tooltipEl;
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'ci-tooltip';
    _tooltipEl.style.cssText = 'position:fixed;z-index:9999;display:none;max-width:280px;padding:10px 14px;background:var(--bg-2,#1A2025);color:var(--text,#E8ECEF);border:1px solid var(--border-soft,#2A3039);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:12px;line-height:1.5;pointer-events:none;backdrop-filter:blur(6px)';
    document.body.appendChild(_tooltipEl);
    return _tooltipEl;
  }

  function _showTooltip(termEl) {
    const key = termEl.dataset.term;
    const entry = CI.GLOSSARY[key];
    if (!entry) return;
    const tip = _ensureTooltip();
    tip.innerHTML = '<div style="font-weight:700;margin-bottom:4px;color:var(--accent,#34D399)">' + entry.full + '</div><div>' + entry.desc + '</div>';
    tip.style.display = 'block';
    // Position above the term, centered
    const r = termEl.getBoundingClientRect();
    const tipR = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tipR.width / 2;
    let top  = r.top - tipR.height - 8;
    // Keep within viewport
    const margin = 8;
    if (left < margin) left = margin;
    if (left + tipR.width > window.innerWidth - margin) left = window.innerWidth - tipR.width - margin;
    if (top < margin) top = r.bottom + 8; // flip below if no space above
    tip.style.left = left + 'px';
    tip.style.top  = top + 'px';
  }
  function _hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = 'none';
  }

  CI.initTooltips = function () {
    document.body.addEventListener('mouseover', (e) => {
      const t = e.target.closest('.term');
      if (t) _showTooltip(t);
    });
    document.body.addEventListener('mouseout', (e) => {
      const t = e.target.closest('.term');
      if (t) _hideTooltip();
    });
    // Touch : tap to show, tap elsewhere to hide
    document.body.addEventListener('click', (e) => {
      const t = e.target.closest('.term');
      if (t) {
        e.stopPropagation();
        _showTooltip(t);
      } else {
        _hideTooltip();
      }
    });
    // Scroll → hide
    window.addEventListener('scroll', _hideTooltip, { passive: true });
  };

  /* Auto-wrap on dynamic content via MutationObserver */
  CI.initGlossaryObserver = function () {
    // Initial pass on static content (insights, info-boxes already in DOM)
    document.querySelectorAll('.insight-text, .info-box, .stat-label, .text-muted, .page-lede').forEach((el) => CI.wrapGlossaryTerms(el));

    // Observe future mutations
    const watchedSelectors = '.insight-text, .info-box, .stat-label';
    let pending = false;
    const debounced = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        document.querySelectorAll(watchedSelectors).forEach((el) => CI.wrapGlossaryTerms(el));
      });
    };

    const observer = new MutationObserver((mutations) => {
      let needsWrap = false;
      for (const m of mutations) {
        if (m.type !== 'childList' && m.type !== 'characterData') continue;
        // Check if mutation target or addedNodes are within watched selectors
        const target = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!target) continue;
        if (target.closest && target.closest(watchedSelectors)) {
          needsWrap = true;
          break;
        }
        for (const n of (m.addedNodes || [])) {
          if (n.nodeType === 1 && n.querySelector && n.querySelector(watchedSelectors)) {
            needsWrap = true;
            break;
          }
        }
        if (needsWrap) break;
      }
      if (needsWrap) debounced();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  /* ===========================================================
     INLINE MATH EXPRESSIONS dans les steppers
     ===========================================================
     "1500*12" dans un input → évalue à 18000 au blur.
     Whitelist stricte : chiffres, opérateurs, parenthèses, point.
     =========================================================== */
  CI.evalExpression = function (str) {
    if (typeof str !== 'string') return null;
    const s = str.trim();
    if (s === '') return null;
    // Si c'est juste un nombre simple, retourne tel quel
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    // Whitelist stricte
    if (!/^[0-9+\-*/().,\s]+$/.test(s)) return null;
    // Normalise les virgules françaises en points
    const norm = s.replace(/,/g, '.').replace(/\s+/g, '');
    try {
      // Function constructor with no closure access (sandbox-ish)
      const result = (new Function('return (' + norm + ')'))();
      if (typeof result === 'number' && isFinite(result)) return result;
    } catch (e) { /* ignore */ }
    return null;
  };

  /* ===========================================================
     EXPORT PDF (lazy-load jsPDF + html2canvas)
     ===========================================================
     Usage:
       CI.exportPDF({
         title:     'CalcInvest — Rendement Locatif',
         summary:   'Résumé une ligne (params clés)',
         sectionIds: ['synthese', 'cashflow', 'amort', ...],
         fileName:  'calcinvest-locatif'
       });
     =========================================================== */
  let _pdfLibsPromise = null;
  function _loadPdfLibs() {
    if (_pdfLibsPromise) return _pdfLibsPromise;
    _pdfLibsPromise = new Promise((resolve, reject) => {
      function loadScript(src) {
        return new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = src;
          s.onload = () => res();
          s.onerror = () => rej(new Error('CDN load failed: ' + src));
          document.head.appendChild(s);
        });
      }
      // jsPDF UMD + html2canvas — versions stables CDN
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
        .then(() => loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'))
        .then(() => resolve())
        .catch((e) => { _pdfLibsPromise = null; reject(e); });
    });
    return _pdfLibsPromise;
  }

  CI.exportPDF = async function (opts) {
    opts = opts || {};
    const title       = opts.title     || 'CalcInvest';
    const summary     = opts.summary   || '';
    const sectionIds  = opts.sectionIds || [];
    const fileName    = opts.fileName   || 'calcinvest';

    if (sectionIds.length === 0) {
      CI.toast('Aucune section à exporter', 'error');
      return;
    }

    // Visual feedback — bouton + toast
    CI.toast('Génération PDF en cours…', 'info', 8000);

    try {
      await _loadPdfLibs();
    } catch (e) {
      CI.toast('Échec du chargement des librairies PDF (vérifie ta connexion)', 'error');
      console.error(e);
      return;
    }

    const html2canvas = window.html2canvas;
    const jsPDFCtor   = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!html2canvas || !jsPDFCtor) {
      CI.toast('Librairies PDF non disponibles', 'error');
      return;
    }

    // Format A4 portrait, marges 12mm
    const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const PAGE_W  = pdf.internal.pageSize.getWidth();
    const PAGE_H  = pdf.internal.pageSize.getHeight();
    const MARGIN  = 12;
    const CONTENT_W = PAGE_W - 2 * MARGIN;

    // ---- HEADER ----
    function drawHeader(pageNo, totalPagesPlaceholder) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(20, 20, 20);
      pdf.text(title, MARGIN, MARGIN + 5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);
      const today = new Date().toLocaleDateString('fr-FR');
      pdf.text(today + ' · CalcInvest', PAGE_W - MARGIN, MARGIN + 5, { align: 'right' });

      pdf.setDrawColor(220, 220, 220);
      pdf.line(MARGIN, MARGIN + 8, PAGE_W - MARGIN, MARGIN + 8);
    }
    function drawFooter(pageNo) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Page ' + pageNo, PAGE_W / 2, PAGE_H - 6, { align: 'center' });
      pdf.text('calcinvest.com — Simulation à titre informatif', PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
    }

    let pageNo = 1;
    drawHeader(pageNo);

    // Cursor Y starts after header
    const HEADER_Y = MARGIN + 14;
    let cursorY = HEADER_Y;

    // Optional summary line
    if (summary) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      const wrapped = pdf.splitTextToSize(summary, CONTENT_W);
      pdf.text(wrapped, MARGIN, cursorY);
      cursorY += wrapped.length * 5 + 4;
    }

    // ---- ITERATE SECTIONS ----
    for (let i = 0; i < sectionIds.length; i++) {
      const id = sectionIds[i];
      const el = document.getElementById(id);
      if (!el) continue;

      // Skip if section is hidden (display:none)
      const style = window.getComputedStyle(el);
      if (style.display === 'none') continue;

      // Capture element to canvas (scale 2x for retina)
      let canvas;
      try {
        canvas = await html2canvas(el, {
          scale:           2,
          backgroundColor: '#ffffff',
          useCORS:         true,
          logging:         false,
          windowWidth:     el.scrollWidth || 1200
        });
      } catch (e) {
        console.warn('html2canvas failed for', id, e);
        continue;
      }

      const imgData    = canvas.toDataURL('image/jpeg', 0.92);
      const imgRatio   = canvas.height / canvas.width;
      const renderW    = CONTENT_W;
      const renderH    = renderW * imgRatio;

      // Si trop grand pour la page actuelle → nouvelle page
      const remaining = PAGE_H - MARGIN - 10 - cursorY;
      if (renderH > remaining && cursorY > HEADER_Y + 4) {
        drawFooter(pageNo);
        pdf.addPage();
        pageNo++;
        drawHeader(pageNo);
        cursorY = HEADER_Y;
      }

      // Si l'image elle-même dépasse une page entière → on la slice verticalement
      const usableH = PAGE_H - HEADER_Y - MARGIN - 8;
      if (renderH > usableH) {
        // Découpe par tranches : chaque tranche = un canvas partiel
        const sliceH    = usableH;
        const sliceRatio = sliceH / renderW; // ratio mm
        const sliceCanvasH = (sliceH / renderH) * canvas.height;
        let yOffset = 0;
        while (yOffset < canvas.height) {
          const tmp = document.createElement('canvas');
          const tmpH = Math.min(sliceCanvasH, canvas.height - yOffset);
          tmp.width  = canvas.width;
          tmp.height = tmpH;
          tmp.getContext('2d').drawImage(canvas, 0, -yOffset);
          const tmpData = tmp.toDataURL('image/jpeg', 0.92);
          const tmpRender = (tmpH / canvas.height) * renderH;

          if (cursorY + tmpRender > PAGE_H - MARGIN - 8 && cursorY > HEADER_Y + 4) {
            drawFooter(pageNo);
            pdf.addPage();
            pageNo++;
            drawHeader(pageNo);
            cursorY = HEADER_Y;
          }
          pdf.addImage(tmpData, 'JPEG', MARGIN, cursorY, renderW, tmpRender);
          cursorY += tmpRender + 4;
          yOffset += tmpH;
        }
      } else {
        pdf.addImage(imgData, 'JPEG', MARGIN, cursorY, renderW, renderH);
        cursorY += renderH + 4;
      }
    }

    drawFooter(pageNo);

    // Save
    const today = new Date().toISOString().slice(0, 10);
    pdf.save(fileName + '-' + today + '.pdf');
    CI.toast('PDF généré', 'success');
  };

  /* ===========================================================
     THEME TOGGLE (light ⇄ dark)
     ===========================================================
     Stocke le choix dans localStorage. Au load, applique le theme
     stocké (ou system preference). Injecte un bouton dans topbar.
     =========================================================== */
  const THEME_KEY = 'calcinvest-theme';

  CI.getTheme = function () {
    try { return localStorage.getItem(THEME_KEY) || null; } catch (e) { return null; }
  };
  CI.setTheme = function (theme) {
    if (theme === 'dark' || theme === 'light') {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
      document.documentElement.dataset.theme = theme;
    } else {
      try { localStorage.removeItem(THEME_KEY); } catch (e) {}
      delete document.documentElement.dataset.theme;
    }
    _updateThemeButton();
  };
  CI.toggleTheme = function () {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    CI.setTheme(current === 'dark' ? 'light' : 'dark');
  };

  function _updateThemeButton() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    btn.setAttribute('aria-label', isDark ? 'Passer en mode clair' : 'Passer en mode sombre');
    btn.title = isDark ? 'Mode clair' : 'Mode sombre';
    btn.innerHTML = isDark
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-linejoin="round"/></svg>';
  }

  CI.initTheme = function () {
    // Apply stored theme (or system pref) au plus tôt
    const stored = CI.getTheme();
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.dataset.theme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.dataset.theme = 'dark';
    }

    // Inject toggle button into .topbar-right (idempotent)
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight && !topbarRight.querySelector('.theme-toggle')) {
      const btn = document.createElement('button');
      btn.className = 'theme-toggle';
      btn.type = 'button';
      btn.addEventListener('click', CI.toggleTheme);
      topbarRight.insertBefore(btn, topbarRight.firstChild);
      _updateThemeButton();
    }
  };

  /* ===========================================================
     DOM READY + PWA REGISTRATION
     =========================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    CI.initAll();
    CI.initTheme();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        // Quand un nouveau SW prend le contrôle → recharger la page automatiquement
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
        // Forcer la vérification d'une mise à jour dès le chargement
        reg.update().catch(() => {});
      }).catch(() => {});
    });
  }

  global.CI = CI;
})(window);
