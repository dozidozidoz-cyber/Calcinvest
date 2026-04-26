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
        const dir = parseInt(btn.dataset.dir, 10);
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
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          stp.querySelector('[data-dir="1"]').click();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          stp.querySelector('[data-dir="-1"]').click();
        }
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

      pills.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        pills.querySelectorAll('.pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (target && btn.dataset.value != null) {
          target.value = btn.dataset.value;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // Sync pill active state when target changes
      if (target) {
        target.addEventListener('input', () => {
          const v = String(target.value);
          pills.querySelectorAll('.pill').forEach((b) => {
            b.classList.toggle('active', String(b.dataset.value) === v);
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
     DOM READY + PWA REGISTRATION
     =========================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    CI.initAll();
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
