/* ============================================================
   CalcInvest — DCF VIEW (DOM binding)
   Reads form → calls CalcDCF.calcDCF(params) → renders results
   ============================================================ */

(function () {
  'use strict';

  const { calcDCF, PROFILES, WACC_OFFSETS, TG_OFFSETS } = window.CalcDCF;
  const num = window.FIN.num;

  let lastResult = null;
  let lastParams = null;

  /* ============================================================
     HELPERS
     ============================================================ */
  const $ = (id) => document.getElementById(id);
  const fmtM  = (v) => {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + ' Md';
    return Math.round(v) + ' M';
  };
  const fmtPct  = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' %';
  const fmtPctPlain = (v) => (v * 100).toFixed(1) + ' %';
  const fmtPrice = (v) => {
    if (v >= 1000) return (v / 1000).toFixed(2) + ' k';
    if (v >= 100)  return v.toFixed(0);
    return v.toFixed(2);
  };

  /* ============================================================
     READ FORM
     ============================================================ */
  function readForm() {
    const v  = (id) => num(($( id) || {}).value);
    const sv = (id) => (($( id) || {}).value || '').trim();
    return {
      company:       sv('dcf-company'),
      ticker:        sv('dcf-ticker'),
      revenue:       v('dcf-revenue'),
      growthPhase1:  v('dcf-g1'),
      growthPhase2:  v('dcf-g2'),
      fcfMargin:     v('dcf-fcf-margin'),
      wacc:          v('dcf-wacc'),
      terminalGrowth: v('dcf-tg'),
      netDebt:       v('dcf-net-debt'),
      shares:        v('dcf-shares'),
      currentPrice:  v('dcf-price')
    };
  }

  /* ============================================================
     WRITE FORM (presets)
     ============================================================ */
  function writeForm(p) {
    const set = (id, val) => { const el = $(id); if (el) { el.value = val; el.dispatchEvent(new Event('input')); } };
    set('dcf-revenue',    p.revenue);
    set('dcf-g1',         p.growthPhase1);
    set('dcf-g2',         p.growthPhase2);
    set('dcf-fcf-margin', p.fcfMargin);
    set('dcf-wacc',       p.wacc);
    set('dcf-tg',         p.terminalGrowth);
    set('dcf-net-debt',   p.netDebt);
    set('dcf-shares',     p.shares);
    set('dcf-price',      p.currentPrice || 0);
  }

  /* ============================================================
     MAIN CALCULATION + RENDER
     ============================================================ */
  function run() {
    const p = readForm();
    lastParams = p;
    const r = calcDCF(p);

    // Error state
    const errEl = $('dcf-error');
    if (r.error) {
      if (errEl) { errEl.textContent = r.error; errEl.style.display = 'block'; }
      $('dcf-results').style.display = 'none';
      return;
    }
    if (errEl) errEl.style.display = 'none';

    lastResult = r;
    $('dcf-results').style.display = 'block';

    renderKPIs(p, r);
    renderVerdict(p, r);
    renderChart(r);
    renderFCFTable(p, r);
    renderSensitivity(p, r);
  }

  /* ============================================================
     RENDER KPIs
     ============================================================ */
  function renderKPIs(p, r) {
    // Valeur intrinsèque
    const ivEl = $('dcf-kpi-iv');
    if (ivEl) {
      ivEl.textContent = fmtPrice(r.intrinsicValue) + ' €';
    }

    // Valeur d'entreprise
    const evEl = $('dcf-kpi-ev');
    if (evEl) evEl.textContent = fmtM(r.enterpriseValue) + '€';

    // Upside / downside
    const upsideEl = $('dcf-kpi-upside');
    const upsideLbl = $('dcf-kpi-upside-lbl');
    if (upsideEl) {
      if (r.upside !== null) {
        upsideEl.textContent = fmtPct(r.upside);
        upsideEl.className = 'stat-value ' + (r.upside >= 0 ? 'pos' : 'neg');
        if (upsideLbl) upsideLbl.textContent = r.upside >= 0 ? 'Potentiel haussier' : 'Surévaluation';
      } else {
        upsideEl.textContent = '—';
        upsideEl.className = 'stat-value';
        if (upsideLbl) upsideLbl.textContent = 'Prix non renseigné';
      }
    }

    // Poids valeur terminale
    const tvEl = $('dcf-kpi-tv');
    if (tvEl) {
      tvEl.textContent = fmtPctPlain(r.tvWeight);
      // > 80% = warning
      tvEl.className = 'stat-value ' + (r.tvWeight > 0.80 ? 'warn' : '');
    }
    const tvNote = $('dcf-kpi-tv-note');
    if (tvNote) {
      tvNote.textContent = r.tvWeight > 0.80
        ? '⚠ Très sensible aux hypothèses terminales'
        : 'Part de la valeur dans la TV';
    }
  }

  /* ============================================================
     RENDER VERDICT
     ============================================================ */
  function renderVerdict(p, r) {
    const el = $('dcf-verdict');
    if (!el) return;
    if (!r.verdict) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    const badge = el.querySelector('.dcf-verdict-badge');
    const detail = el.querySelector('.dcf-verdict-detail');
    if (badge) {
      badge.textContent = r.verdict;
      badge.className = 'dcf-verdict-badge ' + r.verdictClass;
    }
    if (detail) {
      const price = fmtPrice(p.currentPrice) + ' €';
      const iv    = fmtPrice(r.intrinsicValue) + ' €';
      const delta = fmtPct(r.upside);
      detail.textContent = `Prix actuel ${price} · Valeur intrinsèque ${iv} · Écart ${delta}`;
    }
  }

  /* ============================================================
     RENDER CHART — bar chart canvas natif
     Barres bleues = PV FCF an 1-10 | Barre verte = PV valeur terminale
     ============================================================ */
  function renderChart(r) {
    const canvas = $('dcf-chart');
    if (!canvas) return;

    const dpr    = window.devicePixelRatio || 1;
    const rect   = canvas.parentElement.getBoundingClientRect();
    const W      = Math.floor(rect.width  || 600);
    const H      = Math.floor(canvas.parentElement.offsetHeight || 220);
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const labels = ['1','2','3','4','5','6','7','8','9','10','TV'];
    const data   = [...r.pvFcfYears.map(v => Math.round(v)), Math.round(r.pvTerminal)];
    const colors = [
      ...Array(5).fill('rgba(96,165,250,0.8)'),    // Phase 1 : blue
      ...Array(5).fill('rgba(96,165,250,0.5)'),    // Phase 2 : lighter
      'rgba(52,211,153,0.85)'                       // TV : emerald
    ];

    const padL = 54, padR = 16, padT = 12, padB = 32;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const maxVal = Math.max(...data) * 1.12;

    const barW   = chartW / labels.length;
    const barGap = barW * 0.2;

    // Background
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padT + chartH - (i / gridSteps) * chartH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      // Y axis labels
      const val = (maxVal * i / gridSteps);
      const lbl = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val) + '';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `10px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(lbl, padL - 6, y + 3.5);
    }

    // Bars
    data.forEach((val, i) => {
      const x = padL + i * barW + barGap / 2;
      const barHeight = (val / maxVal) * chartH;
      const y = padT + chartH - barHeight;
      const bw = barW - barGap;

      // Bar fill
      ctx.fillStyle = colors[i];
      const radius = Math.min(4, bw / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + bw - radius, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
      ctx.lineTo(x + bw, y + barHeight);
      ctx.lineTo(x, y + barHeight);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      // X label
      ctx.fillStyle = i === 10 ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.4)';
      ctx.font = `10px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + bw / 2, H - padB + 14);
    });

    // X axis line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + chartH);
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();

    // Tooltip on hover
    let hoverIdx = -1;
    const tip = (() => {
      let el = canvas.parentElement.querySelector('.dcf-bar-tip');
      if (!el) {
        el = document.createElement('div');
        el.className = 'dcf-bar-tip';
        el.style.cssText = 'position:absolute;pointer-events:none;display:none;background:var(--bg-card);border:1px solid var(--border-strong);border-radius:6px;padding:6px 10px;font-size:12px;font-family:var(--font-mono);color:var(--text);z-index:10;white-space:nowrap;box-shadow:var(--shadow)';
        canvas.parentElement.style.position = 'relative';
        canvas.parentElement.appendChild(el);
      }
      return el;
    })();

    canvas.onmousemove = function (e) {
      const cr  = canvas.getBoundingClientRect();
      const mx  = e.clientX - cr.left;
      const idx = Math.floor((mx - padL) / barW);
      if (idx >= 0 && idx < data.length) {
        if (idx !== hoverIdx) {
          hoverIdx = idx;
          const val   = data[idx];
          const lbl   = idx === 10 ? 'Valeur terminale' : 'An ' + (idx + 1);
          const phase = idx < 5 ? ' — Phase 1' : idx < 10 ? ' — Phase 2' : '';
          const disp  = val >= 1000 ? (val / 1000).toFixed(1) + ' Md€' : val + ' M€';
          tip.innerHTML = `<strong>${lbl}${phase}</strong><br/>${disp}`;
          tip.style.display = 'block';
        }
        tip.style.left = (e.clientX - cr.left + 10) + 'px';
        tip.style.top  = (e.clientY - cr.top  - 30) + 'px';
      } else {
        hoverIdx = -1;
        tip.style.display = 'none';
      }
    };
    canvas.onmouseleave = () => { tip.style.display = 'none'; hoverIdx = -1; };
  }

  /* ============================================================
     RENDER FCF TABLE
     ============================================================ */
  function renderFCFTable(p, r) {
    const tbody = $('dcf-table-body');
    if (!tbody) return;

    const cumul = [];
    let sum = 0;
    for (let i = 0; i < r.pvFcfYears.length; i++) {
      sum += r.pvFcfYears[i];
      cumul.push(sum);
    }

    tbody.innerHTML = r.fcfYears.map((fcf, i) => {
      const phase = i < 5 ? '1' : '2';
      const growth = i < 5 ? p.growthPhase1 : p.growthPhase2;
      return `<tr>
        <td><strong>An ${i + 1}</strong> <span style="color:var(--text-4);font-size:11px">Ph.${phase}</span></td>
        <td>${fmtM(r.revenueYears[i])}€</td>
        <td>${fmtM(fcf)}€</td>
        <td style="color:var(--text-3)">${fmtPctPlain(growth / 100)}</td>
        <td style="color:var(--accent)">${fmtM(r.pvFcfYears[i])}€</td>
        <td style="color:var(--text-2)">${fmtM(cumul[i])}€</td>
      </tr>`;
    }).join('') + `
      <tr style="border-top:1px solid var(--border-strong);font-weight:600">
        <td colspan="4" style="color:var(--accent)">Valeur terminale actualisée</td>
        <td style="color:var(--accent)">${fmtM(r.pvTerminal)}€</td>
        <td style="color:var(--accent)">${fmtM(r.pvFCFTotal + r.pvTerminal)}€</td>
      </tr>`;
  }

  /* ============================================================
     RENDER SENSITIVITY MATRIX
     Lignes : WACC ± 2%   Colonnes : TG ± 1%
     ============================================================ */
  function renderSensitivity(p, r) {
    const table = $('dcf-sensitivity');
    if (!table) return;

    const baseWacc = p.wacc;
    const baseTg   = p.terminalGrowth;
    const price    = p.currentPrice;

    const waccLabels = WACC_OFFSETS.map(o => (baseWacc + o * 100).toFixed(1) + ' %');
    const tgLabels   = TG_OFFSETS.map(o   => (baseTg   + o * 100).toFixed(1) + ' %');

    const cellClass = (iv) => {
      if (!iv || !price) return '';
      const up = (iv - price) / price;
      if (up > 0.20)  return 'dcf-cell-strong-buy';
      if (up > 0.05)  return 'dcf-cell-buy';
      if (up > -0.10) return 'dcf-cell-hold';
      if (up > -0.25) return 'dcf-cell-sell';
      return 'dcf-cell-strong-sell';
    };

    let html = '<table class="data-table dcf-sensitivity-table"><thead><tr>';
    html += '<th>WACC \\ TG</th>';
    tgLabels.forEach((lbl, ci) => {
      const isBase = ci === 2;
      html += `<th ${isBase ? 'style="color:var(--accent)"' : ''}>${lbl}</th>`;
    });
    html += '</tr></thead><tbody>';

    r.sensitivity.forEach((row, ri) => {
      const isBaseRow = ri === 2;
      html += `<tr ${isBaseRow ? 'style="background:var(--accent-soft)"' : ''}>`;
      html += `<td style="font-family:var(--font-mono);font-size:12px;${isBaseRow ? 'color:var(--accent);font-weight:600' : ''}">${waccLabels[ri]}</td>`;
      row.forEach((iv, ci) => {
        const isBase = ri === 2 && ci === 2;
        const cls = iv !== null ? cellClass(iv) : '';
        html += `<td class="${cls}" ${isBase ? 'style="font-weight:700"' : ''}>`;
        html += iv !== null ? fmtPrice(iv) + ' €' : '—';
        html += '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    table.innerHTML = html;
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    // Profils prédéfinis
    document.querySelectorAll('[data-profile]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.profile;
        const prof = PROFILES[key];
        if (!prof) return;
        document.querySelectorAll('[data-profile]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        writeForm(prof);
        run();
      });
    });

    // Bouton calculer
    const calcBtn = $('dcf-calc-btn');
    if (calcBtn) calcBtn.addEventListener('click', run);

    // Recalcul auto sur Enter
    document.querySelectorAll('#dcf-form input[type=number]').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    });

    // Bouton partager
    const shareBtn = $('dcf-share-btn');
    if (shareBtn && window.CI) {
      shareBtn.addEventListener('click', () => {
        if (!lastParams) return;
        CI.setUrlParams({
          rev: lastParams.revenue,
          g1:  lastParams.growthPhase1,
          g2:  lastParams.growthPhase2,
          fcf: lastParams.fcfMargin,
          w:   lastParams.wacc,
          tg:  lastParams.terminalGrowth,
          nd:  lastParams.netDebt,
          sh:  lastParams.shares,
          px:  lastParams.currentPrice,
          co:  lastParams.company,
          ti:  lastParams.ticker
        });
        CI.copyShareUrl();
      });
    }

    // Restore depuis URL
    if (window.CI) {
      const g = (k, def) => { const v = CI.getUrlParam(k); return v !== null ? parseFloat(v) : def; };
      const gs = (k, def) => { const v = CI.getUrlParam('co'); return v || def; };
      const rev = CI.getUrlParam('rev');
      if (rev) {
        const setV = (id, val) => { const el = $(id); if (el && val !== null) el.value = val; };
        setV('dcf-company',    CI.getUrlParam('co') || '');
        setV('dcf-ticker',     CI.getUrlParam('ti') || '');
        setV('dcf-revenue',    g('rev', 1000));
        setV('dcf-g1',         g('g1',  15));
        setV('dcf-g2',         g('g2',  8));
        setV('dcf-fcf-margin', g('fcf', 20));
        setV('dcf-wacc',       g('w',   9));
        setV('dcf-tg',         g('tg',  2.5));
        setV('dcf-net-debt',   g('nd',  0));
        setV('dcf-shares',     g('sh',  100));
        setV('dcf-price',      g('px',  0));
        run();
      }
    }

    // Init UI components
    if (window.CI) CI.initAll(document.body);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
