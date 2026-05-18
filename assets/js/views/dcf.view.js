/* ============================================================
   CalcInvest — Vue Simulateur DCF
   Binding DOM uniquement. Logique métier dans core/calc-dcf.js
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let lastResult = null;
  let lastParams = null;

  // ─── helpers format ─────────────────────────────────────
  function fmtM(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1000) return (v / 1000).toFixed(1) + ' Md€';
    return Math.round(v) + ' M€';
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' %';
  }
  function fmtPctPlain(v) {
    if (v === null || v === undefined) return '—';
    return (v * 100).toFixed(1) + ' %';
  }
  function fmtPrice(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    if (v >= 1000) return (v / 1000).toFixed(2) + ' k€';
    if (v >= 100)  return v.toFixed(0) + ' €';
    return v.toFixed(2) + ' €';
  }

  // ─── lecture / écriture du formulaire ────────────────────
  function readForm() {
    const val = (id) => {
      const el = $(id);
      if (!el) return 0;
      const n = parseFloat(el.value);
      return Number.isFinite(n) ? n : 0;
    };
    const sval = (id) => {
      const el = $(id);
      return el ? (el.value || '').trim() : '';
    };
    return {
      company:        sval('dcf-company'),
      ticker:         sval('dcf-ticker'),
      revenue:        val('dcf-revenue'),
      growthPhase1:   val('dcf-g1'),
      growthPhase2:   val('dcf-g2'),
      fcfMargin:      val('dcf-fcf-margin'),
      wacc:           val('dcf-wacc'),
      terminalGrowth: val('dcf-tg'),
      netDebt:        val('dcf-net-debt'),
      shares:         val('dcf-shares'),
      currentPrice:   val('dcf-price')
    };
  }

  function writeForm(p) {
    const set = (id, v) => {
      const el = $(id);
      if (el && v !== undefined) {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
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

  function updateParamSummary(p) {
    const sum = $('d-sum-params');
    if (!sum) return;
    const co = p.company || (p.ticker || 'Société');
    sum.textContent = `${co} · ${fmtM(p.revenue)} CA · ${p.growthPhase1}%→${p.growthPhase2}% · WACC ${p.wacc}%`;
  }

  // ─── Analyse 01 : Valeur intrinsèque + verdict ──────────
  function renderA01(p, r) {
    $('dcf-kpi-iv').textContent  = fmtPrice(r.intrinsicValue);
    $('dcf-kpi-ev').textContent  = fmtM(r.enterpriseValue);

    const upEl = $('dcf-kpi-upside');
    const upLbl = $('dcf-kpi-upside-lbl');
    if (r.upside !== null) {
      upEl.textContent = fmtPct(r.upside);
      upEl.className   = 'stat-value ' + (r.upside >= 0 ? 'pos' : 'neg');
      upLbl.textContent = r.upside >= 0 ? 'Potentiel haussier' : 'Surévaluation';
    } else {
      upEl.textContent = '—';
      upEl.className   = 'stat-value';
      upLbl.textContent = 'Prix non renseigné';
    }

    const tvEl = $('dcf-kpi-tv');
    tvEl.textContent = fmtPctPlain(r.tvWeight);
    tvEl.className   = 'stat-value ' + (r.tvWeight > 0.80 ? 'warn' : '');
    $('dcf-kpi-tv-note').textContent = r.tvWeight > 0.80
      ? '⚠ Très sensible aux hypothèses terminales'
      : 'part de la TV dans l\'EV';

    // Card meta
    const meta = $('dcf-card-meta');
    if (meta) {
      meta.textContent = p.company || p.ticker
        ? `${p.company || p.ticker} · ${fmtM(p.revenue)} CA`
        : `${fmtM(p.revenue)} CA · ${p.shares} M actions`;
    }

    // Verdict
    const verdEl = $('dcf-verdict');
    if (r.verdict) {
      verdEl.style.display = 'flex';
      verdEl.querySelector('.dcf-verdict-badge').textContent = r.verdict;
      verdEl.querySelector('.dcf-verdict-badge').className   = 'dcf-verdict-badge ' + r.verdictClass;
      verdEl.querySelector('.dcf-verdict-detail').textContent =
        `Prix ${fmtPrice(p.currentPrice)} · IV ${fmtPrice(r.intrinsicValue)} · Écart ${fmtPct(r.upside)}`;
    } else {
      verdEl.style.display = 'none';
    }

    // Insight
    let insight;
    if (r.upside === null) {
      insight = `Valeur intrinsèque : <strong>${fmtPrice(r.intrinsicValue)}/action</strong>. Renseignez un <em>prix actuel</em> pour obtenir le verdict (sous-évalué / juste prix / surévalué).`;
    } else if (r.upside > 0.20) {
      insight = `<span class="pos">Sous-évaluée de ${fmtPct(r.upside)}</span>. La marge de sécurité est confortable, mais vérifiez vos hypothèses de croissance (an 1-5 : ${p.growthPhase1} %/an) — sont-elles soutenables ?`;
    } else if (r.upside > 0.05) {
      insight = `Légèrement sous-évaluée (<span class="pos">${fmtPct(r.upside)}</span>). Marge faible — surveillez les catalyseurs avant d'entrer.`;
    } else if (r.upside > -0.10) {
      insight = `Le marché valorise cette action correctement (écart ${fmtPct(r.upside)}). Pas de marge de sécurité pour un value investor.`;
    } else {
      insight = `<span class="neg">Surévaluée (${fmtPct(r.upside)})</span>. Le prix actuel implique des hypothèses bien plus optimistes que les vôtres. Soit le marché sait quelque chose, soit c'est un signe de bulle.`;
    }
    if (r.tvWeight > 0.80) {
      insight += ` <span class="warn">Attention : ${fmtPctPlain(r.tvWeight)} de la valeur vient de la TV</span> — analyse très sensible aux paramètres terminaux.`;
    }
    $('dcf-insight-a01').querySelector('.insight-text').innerHTML = insight;
  }

  // ─── Analyse 02 : Flux projetés ─────────────────────────
  function renderA02(p, r) {
    // Chart bar (using existing CI.drawChart pattern with custom canvas draw)
    renderBarChart(r);

    // Tableau
    const tbody = $('dcf-table-body');
    let cumul = 0;
    tbody.innerHTML = r.fcfYears.map((fcf, i) => {
      cumul += r.pvFcfYears[i];
      const phase = i < 5 ? 'Phase 1' : 'Phase 2';
      const growth = i < 5 ? p.growthPhase1 : p.growthPhase2;
      return `<tr>
        <td><strong>An ${i + 1}</strong> <span style="color:var(--text-4);font-size:11px">${phase}</span></td>
        <td>${fmtM(r.revenueYears[i])}</td>
        <td>${fmtM(fcf)}</td>
        <td>${growth.toFixed(1)} %</td>
        <td class="pos">${fmtM(r.pvFcfYears[i])}</td>
        <td>${fmtM(cumul)}</td>
      </tr>`;
    }).join('') + `
      <tr style="border-top:2px solid var(--border-strong);font-weight:600;background:var(--accent-soft)">
        <td colspan="4">Valeur terminale actualisée (Gordon Growth)</td>
        <td class="pos"><strong>${fmtM(r.pvTerminal)}</strong></td>
        <td><strong>${fmtM(r.pvFCFTotal + r.pvTerminal)}</strong></td>
      </tr>`;

    // Insight
    const phase1Pct = (r.pvFcfYears.slice(0, 5).reduce((a, b) => a + b, 0) / r.enterpriseValue) * 100;
    const phase2Pct = (r.pvFcfYears.slice(5, 10).reduce((a, b) => a + b, 0) / r.enterpriseValue) * 100;
    const tvPct = (r.pvTerminal / r.enterpriseValue) * 100;
    $('dcf-insight-a02').querySelector('.insight-text').innerHTML = `
      Décomposition de l'EV : <strong>${phase1Pct.toFixed(0)} %</strong> vient des FCF Phase 1 (an 1-5),
      <strong>${phase2Pct.toFixed(0)} %</strong> de la Phase 2 (an 6-10), et
      <strong>${tvPct.toFixed(0)} %</strong> de la valeur terminale.
      ${tvPct > 70 ? '<span class="warn">Une TV qui pèse 70 %+ rend la valorisation très dépendante des hypothèses long terme.</span>' : ''}
    `;
  }

  // Bar chart natif sur canvas (PV FCF par année + TV)
  function renderBarChart(r) {
    const canvas = $('dcf-chart');
    if (!canvas) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W    = Math.floor(rect.width  || 600);
    const H    = Math.floor(canvas.parentElement.offsetHeight || 260);
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const labels = ['1','2','3','4','5','6','7','8','9','10','TV'];
    const data   = [...r.pvFcfYears.map(v => Math.round(v)), Math.round(r.pvTerminal)];
    const colors = [
      ...Array(5).fill('#2563EB'),
      ...Array(5).fill('#60A5FA'),
      '#059669'
    ];

    const padL = 56, padR = 14, padT = 14, padB = 30;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const maxVal = Math.max(...data) * 1.12;

    const barW   = chartW / labels.length;
    const barGap = barW * 0.22;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(26,26,25,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + chartH - (i / 4) * chartH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
      const val = maxVal * i / 4;
      const lbl = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val) + '';
      ctx.fillStyle = '#9CA3AF';
      ctx.font = `10px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(lbl, padL - 8, y + 3.5);
    }

    // Bars
    data.forEach((val, i) => {
      const x = padL + i * barW + barGap / 2;
      const bh = (val / maxVal) * chartH;
      const y = padT + chartH - bh;
      const bw = barW - barGap;

      ctx.fillStyle = colors[i];
      const radius = Math.min(4, bw / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + bw - radius, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
      ctx.lineTo(x + bw, y + bh);
      ctx.lineTo(x, y + bh);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = i === 10 ? '#059669' : '#6B7280';
      ctx.font = `10px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + bw / 2, H - padB + 14);
    });

    // X axis line
    ctx.strokeStyle = 'rgba(26,26,25,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + chartH);
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();
  }

  // ─── Analyse 03 : Matrice de sensibilité (PREMIUM) ──────
  function renderA03(p, r) {
    const cont = $('dcf-sensitivity');
    if (!cont) return;

    const baseWacc = p.wacc;
    const baseTg   = p.terminalGrowth;
    const price    = p.currentPrice;
    const W = window.CalcDCF.WACC_OFFSETS;
    const T = window.CalcDCF.TG_OFFSETS;

    const waccLabels = W.map(o => (baseWacc + o * 100).toFixed(1) + ' %');
    const tgLabels   = T.map(o => (baseTg   + o * 100).toFixed(1) + ' %');

    function cellClass(iv) {
      if (!iv || !price) return '';
      const up = (iv - price) / price;
      if (up > 0.20)  return 'dcf-cell-strong-buy';
      if (up > 0.05)  return 'dcf-cell-buy';
      if (up > -0.10) return 'dcf-cell-hold';
      if (up > -0.25) return 'dcf-cell-sell';
      return 'dcf-cell-strong-sell';
    }

    let html = '<table class="data-table dcf-sensitivity-table">';
    html += '<thead><tr><th style="text-align:left">WACC \\ TG</th>';
    tgLabels.forEach((lbl, ci) => {
      const isBase = ci === 2;
      html += `<th${isBase ? ' style="color:var(--accent)"' : ''}>${lbl}</th>`;
    });
    html += '</tr></thead><tbody>';

    r.sensitivity.forEach((row, ri) => {
      const isBaseRow = ri === 2;
      html += `<tr${isBaseRow ? ' style="background:var(--accent-soft)"' : ''}>`;
      html += `<td style="text-align:left;font-weight:600${isBaseRow ? ';color:var(--accent)' : ''}">${waccLabels[ri]}</td>`;
      row.forEach((iv, ci) => {
        const isBase = ri === 2 && ci === 2;
        const cls = iv !== null ? cellClass(iv) : '';
        const baseCls = isBase ? ' dcf-cell-base' : '';
        html += `<td class="${cls}${baseCls}">${iv !== null ? fmtPrice(iv) : '—'}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    cont.innerHTML = html;
  }

  // ─── Analyse 04 : Profils sectoriels (PREMIUM) ──────────
  function renderA04(p) {
    if (!window.CalcDCF || !window.CalcDCF.compareProfiles) return;
    const data = window.CalcDCF.compareProfiles(p);

    const tbody = $('dcf-table-profiles');
    if (!tbody) return;

    tbody.innerHTML = data.map(d => {
      if (d.error) {
        return `<tr>
          <td><strong>${d.label}</strong></td>
          <td colspan="4" style="color:var(--red)">${d.error}</td>
        </tr>`;
      }
      const prof = window.CalcDCF.PROFILES[d.key];
      const hyp  = `g₁ ${prof.growthPhase1}% · FCF ${prof.fcfMargin}% · WACC ${prof.wacc}%`;
      const ups  = d.upside !== null ? fmtPct(d.upside) : '—';
      const upsCls = d.upside === null ? '' : (d.upside >= 0 ? 'pos' : 'neg');
      const verdHtml = d.verdict
        ? `<span class="dcf-verdict-badge ${d.verdictClass}" style="font-size:10px;padding:3px 8px">${d.verdict}</span>`
        : '<span style="color:var(--text-4)">—</span>';
      return `<tr>
        <td><strong>${d.label}</strong></td>
        <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-3)">${hyp}</td>
        <td>${fmtPrice(d.intrinsicValue)}</td>
        <td class="${upsCls}">${ups}</td>
        <td>${verdHtml}</td>
      </tr>`;
    }).join('');

    // Insight : spread max-min des valorisations
    const valid = data.filter(d => d.intrinsicValue);
    if (valid.length >= 2) {
      const max = Math.max(...valid.map(d => d.intrinsicValue));
      const min = Math.min(...valid.map(d => d.intrinsicValue));
      const spread = ((max / min - 1) * 100).toFixed(0);
      $('dcf-insight-a04').querySelector('.insight-text').innerHTML = `
        La valorisation va du simple au <strong>${(max / min).toFixed(1)}×</strong> selon le profil retenu
        (${fmtPrice(min)} en cyclique vs ${fmtPrice(max)} en growth).
        Spread de <strong>${spread} %</strong> — preuve que le choix d'hypothèses est <em>le</em> facteur déterminant.
      `;
    }
  }

  // ─── Analyse 05 : Bear / Base / Bull (PREMIUM) ──────────
  function renderA05(p) {
    if (!window.CalcDCF || !window.CalcDCF.scenarios) return;
    const data = window.CalcDCF.scenarios(p);

    $('dcf-scn-bear').textContent = fmtPrice(data[0].result.intrinsicValue);
    $('dcf-scn-base').textContent = fmtPrice(data[1].result.intrinsicValue);
    $('dcf-scn-bull').textContent = fmtPrice(data[2].result.intrinsicValue);

    const tbody = $('dcf-table-scenarios');
    if (!tbody) return;

    tbody.innerHTML = data.map(s => {
      const r = s.result;
      const upCls = r.upside === null ? '' : (r.upside >= 0 ? 'pos' : 'neg');
      const nameColor = s.name === 'Bear' ? 'var(--red)' : s.name === 'Bull' ? 'var(--accent)' : 'var(--text)';
      return `<tr>
        <td><strong style="color:${nameColor}">${s.name}</strong></td>
        <td>${s.params.growthPhase1.toFixed(1)} %</td>
        <td>${s.params.fcfMargin.toFixed(0)} %</td>
        <td>${s.params.wacc.toFixed(1)} %</td>
        <td><strong>${fmtPrice(r.intrinsicValue)}</strong></td>
        <td class="${upCls}">${r.upside !== null ? fmtPct(r.upside) : '—'}</td>
      </tr>`;
    }).join('');

    const bearIV = data[0].result.intrinsicValue;
    const bullIV = data[2].result.intrinsicValue;
    const baseIV = data[1].result.intrinsicValue;
    if (bearIV && bullIV && baseIV) {
      const range = ((bullIV / bearIV - 1) * 100).toFixed(0);
      $('dcf-insight-a05').querySelector('.insight-text').innerHTML = `
        Fourchette de valorisation : <span class="neg">${fmtPrice(bearIV)}</span> →
        <strong>${fmtPrice(baseIV)}</strong> →
        <span class="pos">${fmtPrice(bullIV)}</span>.
        Bull case <strong>${range} %</strong> au-dessus du bear case.
        Si le prix actuel est proche du bear case, la marge de sécurité est forte.
      `;
    }
  }

  // ─── RUN ────────────────────────────────────────────────
  function run() {
    if (!window.CalcDCF || !window.CalcDCF.calcDCF) {
      console.error('[dcf.view] core CalcDCF non chargé');
      return;
    }

    const p = readForm();
    lastParams = p;
    const r = window.CalcDCF.calcDCF(p);

    const errBox = $('dcf-error');
    const errMsg = $('dcf-error-msg');
    if (r.error) {
      errBox.style.display = 'block';
      errMsg.textContent = r.error;
      $('dcf-results').style.display = 'none';
      return;
    }
    errBox.style.display = 'none';
    lastResult = r;
    $('dcf-results').style.display = 'block';

    updateParamSummary(p);
    renderA01(p, r);
    renderA02(p, r);
    renderA03(p, r);
    renderA04(p);
    renderA05(p);

    if (window.CI && window.CI.setUrlParams) {
      window.CI.setUrlParams({
        rev: p.revenue, g1: p.growthPhase1, g2: p.growthPhase2,
        fcf: p.fcfMargin, w: p.wacc, tg: p.terminalGrowth,
        nd: p.netDebt, sh: p.shares, px: p.currentPrice,
        co: p.company, ti: p.ticker
      });
    }
  }

  // ─── INIT ───────────────────────────────────────────────
  // ─── AUTO-FILL depuis Yahoo Finance via /api/fundamentals ─────
  async function autoFill() {
    const tickerEl = $('dcf-ticker');
    const statusEl = $('dcf-autofill-status');
    const btn = $('dcf-autofill');
    if (!tickerEl) return;
    const ticker = (tickerEl.value || '').trim().toUpperCase();
    if (!ticker) {
      if (statusEl) { statusEl.textContent = '⚠ Entrez un ticker'; statusEl.style.color = 'var(--red)'; }
      tickerEl.focus();
      return;
    }
    if (statusEl) { statusEl.textContent = '⏳ Récupération…'; statusEl.style.color = 'var(--text-3)'; }
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/api/fundamentals?ticker=' + encodeURIComponent(ticker), {
        headers: { 'Accept': 'application/json' }
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        throw new Error(data.error || 'Erreur ' + r.status);
      }
      applyFundamentals(data);
      if (statusEl) {
        statusEl.style.color = 'var(--accent)';
        const asOf = new Date(data.asOf * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
        statusEl.textContent = '✓ Rempli auto depuis ' + (data.exchange || 'Yahoo') + ' · ' + asOf;
      }
      if (window.CI && window.CI.toast) {
        window.CI.toast('Données récupérées : ' + (data.name || ticker), 'success', 2500);
      }
    } catch (e) {
      console.error('[dcf autofill]', e);
      if (statusEl) {
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = '✗ ' + (e.message || 'Échec');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function applyFundamentals(d) {
    // Conversion : tous les revenus/dette en M€ (la UI attend des millions)
    // Yahoo donne en unités brutes (1B€ = 1e9). On divise par 1e6 → millions.
    const M = 1_000_000;
    const setN = (id, v, decimals) => {
      const el = $(id);
      if (!el || v == null || !Number.isFinite(v)) return;
      el.value = decimals != null ? Number(v).toFixed(decimals) : Math.round(v);
      el.dataset.auto = '1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const setS = (id, v) => {
      const el = $(id);
      if (!el || !v) return;
      el.value = v;
      el.dataset.auto = '1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    // Identité
    setS('dcf-company', d.name);

    // Revenus TTM en M€
    if (d.revenueTTM) setN('dcf-revenue', d.revenueTTM / M, 0);

    // FCF margin %
    if (d.fcfMargin != null) setN('dcf-fcf-margin', d.fcfMargin, 1);

    // Croissance phase 1 : on prend l'estimate à 1-5 ans si dispo, sinon CAGR historique
    const g1 = d.growth5yEstimate != null ? d.growth5yEstimate
              : (d.growth1yEstimate != null ? d.growth1yEstimate
              : (d.cagrRevenue5y != null ? d.cagrRevenue5y : null));
    if (g1 != null) setN('dcf-g1', Math.min(40, Math.max(-20, g1)), 1);

    // Croissance phase 2 : moyenne entre g1 et terminal (2.5%)
    if (g1 != null) setN('dcf-g2', Math.max(3, g1 * 0.5), 1);

    // Net debt en M€
    if (Number.isFinite(d.netDebt)) setN('dcf-net-debt', d.netDebt / M, 0);

    // Shares outstanding en millions
    if (d.sharesOutstanding) setN('dcf-shares', d.sharesOutstanding / M, 0);

    // Prix actuel
    if (d.price) setN('dcf-price', d.price, 2);

    // WACC : on laisse la valeur courante (utilisateur ajustera selon beta)
    // Si beta dispo, on peut suggérer dans le tooltip plus tard

    // Trigger run
    if (typeof run === 'function') run();
  }

  function init() {
    if (window.CI && window.CI.initAll) window.CI.initAll();

    // Profile buttons
    document.querySelectorAll('[data-profile]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.profile;
        if (!window.CalcDCF) return;
        const prof = window.CalcDCF.PROFILES[key];
        if (!prof) return;
        document.querySelectorAll('[data-profile]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        writeForm(prof);
        run();
      });
    });

    // Calculate button
    const btn = $('dcf-calc-btn');
    if (btn) btn.addEventListener('click', run);

    // Share button
    const shareBtn = $('dcf-share-btn');
    if (shareBtn && window.CI && window.CI.copyShareUrl) {
      shareBtn.addEventListener('click', () => {
        if (!lastParams) run();
        window.CI.copyShareUrl();
      });
    }

    // Auto-fill button → fetch /api/fundamentals
    const autoBtn = $('dcf-autofill');
    if (autoBtn) {
      autoBtn.addEventListener('click', autoFill);
      // Aussi sur Enter dans le champ ticker
      const tk = $('dcf-ticker');
      if (tk) tk.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); autoFill(); } });
    }

    // Re-run sur tous les steppers + selects + champs texte (company, ticker)
    ['dcf-company','dcf-ticker','dcf-revenue','dcf-g1','dcf-g2','dcf-fcf-margin','dcf-wacc','dcf-tg',
     'dcf-net-debt','dcf-shares','dcf-price'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', run);
      el.addEventListener('input', () => {
        clearTimeout(el._t);
        el._t = setTimeout(run, 250);
      });
    });

    // Restore depuis URL
    if (window.CI && window.CI.getUrlParam) {
      const g = (k, def) => {
        const v = window.CI.getUrlParam(k);
        return v !== null ? parseFloat(v) : def;
      };
      const rev = window.CI.getUrlParam('rev');
      if (rev !== null) {
        const setV = (id, val) => { const el = $(id); if (el && val !== null && !Number.isNaN(val)) el.value = val; };
        const setS = (id, val) => { const el = $(id); if (el && val) el.value = val; };
        setS('dcf-company',    window.CI.getUrlParam('co'));
        setS('dcf-ticker',     window.CI.getUrlParam('ti'));
        setV('dcf-revenue',    g('rev', 1000));
        setV('dcf-g1',         g('g1',  15));
        setV('dcf-g2',         g('g2',  8));
        setV('dcf-fcf-margin', g('fcf', 20));
        setV('dcf-wacc',       g('w',   9));
        setV('dcf-tg',         g('tg',  2.5));
        setV('dcf-net-debt',   g('nd',  0));
        setV('dcf-shares',     g('sh',  100));
        setV('dcf-price',      g('px',  0));
      }
    }

    // Premier calcul
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
