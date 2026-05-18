/* ============================================================
   CalcInvest — View Journal de Trading (v2)
   Stats avancées + charts canvas (CI.drawChart) + heatmap mensuelle
   + édition de trade + Import/Export CSV
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const fmtM = n => (window.CI && CI.fmtMoney) ? CI.fmtMoney(n, 0) : Math.round(n).toLocaleString('fr-FR') + ' €';
  const fmtMd = n => (window.CI && CI.fmtMoney) ? CI.fmtMoney(n, 2) : (Number(n) || 0).toFixed(2) + ' €';
  const fmtP = n => (window.CI && CI.fmtPctPlain) ? CI.fmtPctPlain(n, 1) : (n || 0).toFixed(1) + ' %';
  const fmtN = (n, d) => Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) : '—';

  let allTrades = [];
  let editingId = null; // trade en cours d'édition

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
  }
  function fmtHold(hours) {
    if (hours == null) return '—';
    if (hours < 1) return Math.round(hours * 60) + ' min';
    if (hours < 24) return hours.toFixed(1) + ' h';
    return (hours / 24).toFixed(1) + ' j';
  }

  function showBanner() {
    const b = $('j-status-banner');
    if (window.JOURNAL_API && JOURNAL_API.isSupabaseReady()) {
      b.className = 'j-banner j-banner-sync';
      b.innerHTML = '✓ Synchronisé via votre compte CalcInvest — accessible sur tous vos appareils';
    } else {
      const isLogged = window.CI && CI.auth && CI.auth.isLoggedIn && CI.auth.isLoggedIn();
      if (isLogged) {
        b.className = 'j-banner j-banner-local';
        b.innerHTML = '⚠ Schema Supabase non configuré — vos trades sont en localStorage uniquement (pas de sync). Exécutez <code>scripts/supabase_migrations/001_trades.sql</code> dans Supabase.';
      } else {
        b.className = 'j-banner j-banner-local';
        b.innerHTML = '💾 <strong>Mode local</strong> — vos trades sont stockés dans ce navigateur. <a href="/inscription" style="color:var(--accent);font-weight:600">Créez un compte gratuit</a> pour synchroniser entre vos appareils.';
      }
    }
  }

  /* ─── Render KPI + stats avancées ────────────────────────── */
  function renderStats() {
    const s = JOURNAL.stats(allTrades);

    // KPI principaux
    $('kpi-total').textContent = (s.totalPnl >= 0 ? '+' : '') + fmtM(s.totalPnl);
    $('kpi-total').style.color = s.totalPnl >= 0 ? '#7C3AED' : 'var(--red)';
    $('kpi-total-sub').textContent = s.nbClosed + ' trades clos · ' + s.nbOpen + ' ouvert' + (s.nbOpen > 1 ? 's' : '');

    $('kpi-wr').textContent = fmtP(s.winrate);
    $('kpi-wr').style.color = s.winrate >= 50 ? '#10B981' : 'var(--text)';
    $('kpi-wr-sub').textContent = s.nbWins + ' gains / ' + s.nbLosses + ' pertes';

    $('kpi-exp').textContent = (s.expectancy >= 0 ? '+' : '') + fmtMd(s.expectancy);
    $('kpi-exp').style.color = s.expectancy >= 0 ? '#10B981' : 'var(--red)';

    $('kpi-pf').textContent = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞';
    $('kpi-pf').style.color = s.profitFactor >= 1.5 ? '#10B981' : s.profitFactor >= 1 ? '#FBBF24' : 'var(--red)';

    $('kpi-dd').textContent = '−' + fmtM(s.maxDrawdown);
    $('kpi-dd-sub').textContent = fmtP(s.maxDrawdownPct) + ' du peak';

    $('kpi-sharpe').textContent = s.sharpe.toFixed(2);
    $('kpi-sharpe').style.color = s.sharpe >= 1 ? '#10B981' : 'var(--text)';

    // Stats avancées
    if (s.avgRMultiple != null) {
      $('kpi-avgr').textContent = (s.avgRMultiple >= 0 ? '+' : '') + s.avgRMultiple.toFixed(2) + 'R';
      $('kpi-avgr').style.color = s.avgRMultiple > 0.3 ? '#10B981' : s.avgRMultiple > 0 ? '#FBBF24' : 'var(--red)';
    } else {
      $('kpi-avgr').textContent = '—';
    }
    $('kpi-avgr-sub').textContent = s.nbWithR + ' trades avec SL';

    $('kpi-payoff').textContent = Number.isFinite(s.payoffRatio) ? s.payoffRatio.toFixed(2) : '∞';
    $('kpi-payoff').style.color = s.payoffRatio >= 1.5 ? '#10B981' : s.payoffRatio >= 1 ? '#FBBF24' : 'var(--red)';

    $('kpi-recovery').textContent = Number.isFinite(s.recoveryFactor) ? s.recoveryFactor.toFixed(2) : '∞';
    $('kpi-recovery').style.color = s.recoveryFactor >= 2 ? '#10B981' : s.recoveryFactor >= 1 ? '#FBBF24' : 'var(--red)';

    $('kpi-ulcer').textContent = s.ulcerIndex.toFixed(2);
    $('kpi-ulcer').style.color = s.ulcerIndex < 5 ? '#10B981' : s.ulcerIndex < 15 ? '#FBBF24' : 'var(--red)';

    $('kpi-streak').textContent = s.consecutiveWins + ' / ' + s.consecutiveLosses;

    $('kpi-hold').textContent = fmtHold(s.avgHoldTime);

    // Insight pédagogique automatique
    const insights = [];
    if (s.byPlan.yes.count > 2 && s.byPlan.no.count > 2) {
      const diff = s.byPlan.yes.winrate - s.byPlan.no.winrate;
      if (Math.abs(diff) > 10) {
        const direction = diff > 0 ? 'meilleur' : 'pire';
        insights.push(`Vous tradez ${Math.abs(diff).toFixed(0)} points de winrate ${direction} quand vous respectez votre plan (${s.byPlan.yes.winrate.toFixed(0)}% vs ${s.byPlan.no.winrate.toFixed(0)}%).`);
      }
    }
    if (s.bySide.long.count > 3 && s.bySide.short.count > 3) {
      const longER = s.bySide.long.avgPnl, shortER = s.bySide.short.avgPnl;
      if (longER > 0 && shortER < 0) insights.push(`Vos longs gagnent (avg ${fmtMd(longER)}), vos shorts perdent (avg ${fmtMd(shortER)}). À creuser.`);
      else if (longER < 0 && shortER > 0) insights.push(`Vos shorts gagnent (avg ${fmtMd(shortER)}), vos longs perdent (avg ${fmtMd(longER)}). À creuser.`);
    }
    if (insights.length > 0) {
      $('kpi-insight').innerHTML = '💡 <strong>Insights</strong> · ' + insights.join(' &nbsp;·&nbsp; ');
      $('kpi-insight').style.display = 'block';
    } else {
      $('kpi-insight').style.display = 'none';
    }

    renderEquityChart(s.equityCurve);
    renderHistoChart();
    renderRCurve(s.rCurve);
    renderHeatmap();
    renderBreakdowns(s);
    renderInstrumentTable();
    renderStrategyTable();
  }

  /* ─── Charts (CI.drawChart canvas) ───────────────────────── */
  function renderEquityChart(curve) {
    if (!curve || curve.length === 0) {
      const c = $('j-equity-canvas');
      const ctx = c.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr; c.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#94A3B8'; ctx.font = '13px Inter'; ctx.textAlign = 'center';
      ctx.fillText('Aucun trade clos à afficher', rect.width / 2, rect.height / 2);
      return;
    }
    const labels = curve.map((p, i) => 'T' + (i + 1));
    const equity = curve.map(p => p.equity);
    const ddNeg = curve.map(p => -p.drawdown); // afficher DD en négatif
    CI.drawChart('j-equity-canvas', labels, [
      { label: 'Equity', data: equity, color: '#7C3AED', fill: true, fillColor: 'rgba(124,58,237,0.18)', width: 2 },
      { label: 'Drawdown', data: ddNeg, color: '#F87171', width: 1.4, dash: [4, 3] }
    ], { yFormat: v => CI.fmtCompact(v) });
  }

  function renderHistoChart() {
    const bins = JOURNAL.pnlDistribution(allTrades, 14);
    if (!bins.length) {
      const c = $('j-histo-canvas'); if (!c) return;
      const ctx = c.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr; c.height = rect.height * dpr;
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#94A3B8'; ctx.font = '13px Inter'; ctx.textAlign = 'center';
      ctx.fillText('Pas de trade pour la distribution', rect.width / 2, rect.height / 2);
      return;
    }
    // Render barres custom (canvas)
    const canvas = $('j-histo-canvas');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, rect.width), H = Math.max(180, rect.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);

    const padL = 50, padR = 16, padT = 14, padB = 36;
    const w = W - padL - padR, h = H - padT - padB;
    const maxCount = Math.max(...bins.map(b => b.count));
    if (maxCount === 0) return;

    // Grid lignes count
    ctx.strokeStyle = 'rgba(15,23,42,0.06)';
    ctx.font = '10px JetBrains Mono'; ctx.fillStyle = '#94A3B8';
    for (let i = 0; i <= 4; i++) {
      const c = Math.round(maxCount * i / 4);
      const y = padT + h - (h * i / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(c, padL - 6, y);
    }

    // Barres
    const barW = w / bins.length - 2;
    bins.forEach((b, i) => {
      const x = padL + (w / bins.length) * i + 1;
      const bh = (b.count / maxCount) * h;
      const y = padT + h - bh;
      const isGain = (b.from + b.to) / 2 >= 0;
      ctx.fillStyle = isGain ? '#10B981' : '#F87171';
      ctx.fillRect(x, y, barW, bh);
    });

    // Zero line
    let zeroIdx = -1;
    bins.forEach((b, i) => { if (b.from <= 0 && b.to > 0) zeroIdx = i; });
    if (zeroIdx >= 0) {
      const zx = padL + (w / bins.length) * (zeroIdx + 0.5);
      ctx.strokeStyle = 'rgba(15,23,42,0.4)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(zx, padT); ctx.lineTo(zx, padT + h); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Labels axe X (mid bin)
    ctx.fillStyle = '#94A3B8'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, Math.floor(bins.length/2), bins.length-1].forEach(i => {
      const b = bins[i];
      const mid = (b.from + b.to) / 2;
      const x = padL + (w / bins.length) * (i + 0.5);
      ctx.fillText(CI.fmtCompact ? CI.fmtCompact(mid) : Math.round(mid), x, padT + h + 6);
    });

    // Légende
    ctx.textAlign = 'left'; ctx.fillStyle = '#10B981';
    ctx.fillRect(padL, padT - 10, 8, 8);
    ctx.fillStyle = '#475569'; ctx.fillText('Gains', padL + 14, padT - 8);
    ctx.fillStyle = '#F87171';
    ctx.fillRect(padL + 70, padT - 10, 8, 8);
    ctx.fillStyle = '#475569'; ctx.fillText('Pertes', padL + 84, padT - 8);
  }

  function renderRCurve(rCurve) {
    const c = $('j-rcurve-canvas');
    const meta = $('j-rcurve-meta');
    const filtered = rCurve ? rCurve.filter(p => p.r != null) : [];
    if (filtered.length === 0) {
      if (meta) meta.textContent = 'Aucun trade avec stop loss';
      const ctx = c.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr; c.height = rect.height * dpr;
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#94A3B8'; ctx.font = '13px Inter'; ctx.textAlign = 'center';
      ctx.fillText('Renseignez un stop loss sur vos trades', rect.width / 2, rect.height / 2);
      return;
    }
    if (meta) meta.textContent = filtered.length + ' trades avec SL · cumul ' + (filtered[filtered.length-1].cumulative).toFixed(2) + 'R';
    const labels = filtered.map((p, i) => 'T' + (i + 1));
    const data = filtered.map(p => p.cumulative);
    CI.drawChart('j-rcurve-canvas', labels, [
      { label: 'R cumulés', data: data, color: '#D97706', fill: true, fillColor: 'rgba(217,119,6,0.18)', width: 2 }
    ], { yFormat: v => v.toFixed(2) + 'R' });
  }

  /* ─── Heatmap mensuelle ──────────────────────────────────── */
  function renderHeatmap() {
    const hm = JOURNAL.monthlyHeatmap(allTrades);
    const wrap = $('j-heatmap-wrap');
    const meta = $('j-heatmap-meta');
    const tip = $('j-heatmap-tip');
    if (!hm.years.length) {
      wrap.innerHTML = '<div style="color:var(--text-4);text-align:center;padding:30px;font-size:13px">Aucune donnée mensuelle</div>';
      meta.textContent = '—';
      return;
    }
    meta.textContent = hm.totalMonths + ' mois actifs · ' + hm.years.length + ' année' + (hm.years.length > 1 ? 's' : '');

    // Couleur cell : vert si pnl > 0, rouge si < 0, gris si 0/null
    const monthsShort = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    // Trouve les pnl min/max pour calibrer l'intensité
    const pnls = Object.values(hm.cells).map(c => c.pnl);
    const absMax = pnls.length ? Math.max(...pnls.map(Math.abs)) : 1;
    function cellColor(pnl) {
      if (pnl === 0 || pnl == null) return 'rgba(148,163,184,0.10)';
      const intensity = Math.min(1, Math.abs(pnl) / absMax);
      if (pnl > 0) return `rgba(16,185,129,${0.15 + intensity * 0.55})`;
      return `rgba(248,113,113,${0.15 + intensity * 0.55})`;
    }

    let html = '<div class="heatmap-month-axis">' + monthsShort.map(m => '<span>' + m + '</span>').join('') + '</div>';
    hm.years.forEach(y => {
      html += '<div class="heatmap-row"><span class="heatmap-label">' + y + '</span>';
      for (let m = 0; m < 12; m++) {
        const key = y + '-' + String(m+1).padStart(2,'0');
        const cell = hm.cells[key];
        if (cell) {
          const txt = cell.pnl >= 0 ? '+' + Math.round(cell.pnl/1000) : Math.round(cell.pnl/1000);
          const wr = (cell.wins / cell.count * 100).toFixed(0);
          const label = `${monthsShort[m]} ${y}: ${fmtM(cell.pnl)} sur ${cell.count} trade${cell.count>1?'s':''} (WR ${wr}%)`;
          html += `<div class="heatmap-cell" data-tip="${label}" style="background:${cellColor(cell.pnl)};color:${Math.abs(cell.pnl)>absMax*0.4?'#fff':'var(--text)'}">${Math.abs(cell.pnl)>=1000?txt+'k':Math.round(cell.pnl)}</div>`;
        } else {
          html += '<div class="heatmap-cell" style="background:rgba(148,163,184,0.06);color:var(--text-4)">·</div>';
        }
      }
      html += '</div>';
    });
    wrap.innerHTML = html;

    // Hover tooltip
    wrap.onmousemove = function(e) {
      const target = e.target.closest('[data-tip]');
      if (!target) { tip.style.display = 'none'; return; }
      tip.innerHTML = '<strong>' + target.dataset.tip.split(':')[0] + '</strong><br/>' + target.dataset.tip.split(':').slice(1).join(':').trim();
      tip.style.display = 'block';
      const wrapRect = wrap.parentElement.getBoundingClientRect();
      const x = e.clientX - wrapRect.left;
      const y = e.clientY - wrapRect.top;
      const tipW = tip.offsetWidth;
      let left = x + 14;
      if (left + tipW > wrapRect.width - 8) left = x - tipW - 14;
      tip.style.left = Math.max(4, left) + 'px';
      tip.style.top = (y - tip.offsetHeight - 10) + 'px';
    };
    wrap.onmouseleave = function() { tip.style.display = 'none'; };
  }

  /* ─── Breakdowns ─────────────────────────────────────────── */
  function renderBreakdowns(s) {
    // Long vs Short
    const sd = $('bd-side');
    sd.innerHTML = ['long','short'].map(k => {
      const g = s.bySide[k];
      if (g.count === 0) return `<div class="breakdown-row"><span style="color:var(--text-4)">${k === 'long' ? '▲ Long' : '▼ Short'}</span><span style="color:var(--text-4)">—</span></div>`;
      const pnlColor = g.pnl >= 0 ? '#10B981' : 'var(--red)';
      return `<div class="breakdown-row">
        <span style="color:var(--text-2)">${k === 'long' ? '▲ Long' : '▼ Short'} <span style="color:var(--text-4);font-size:11px">(${g.count})</span></span>
        <span><strong style="color:${pnlColor}">${(g.pnl >= 0 ? '+' : '') + fmtM(g.pnl)}</strong> <span style="color:var(--text-4);font-size:11px">WR ${g.winrate.toFixed(0)}%</span></span>
      </div>`;
    }).join('');

    // Plan
    const bp = $('bd-plan');
    const planRows = [
      { key: 'yes', label: '✓ Suivi' },
      { key: 'no',  label: '✕ Non suivi' },
      { key: 'unknown', label: '— Non renseigné' }
    ];
    bp.innerHTML = planRows.map(r => {
      const g = s.byPlan[r.key];
      if (g.count === 0) return '';
      const pnlColor = g.pnl >= 0 ? '#10B981' : 'var(--red)';
      return `<div class="breakdown-row">
        <span style="color:var(--text-2)">${r.label} <span style="color:var(--text-4);font-size:11px">(${g.count})</span></span>
        <span><strong style="color:${pnlColor}">${(g.pnl >= 0 ? '+' : '') + fmtM(g.pnl)}</strong> <span style="color:var(--text-4);font-size:11px">WR ${g.winrate.toFixed(0)}%</span></span>
      </div>`;
    }).filter(Boolean).join('') || '<div style="color:var(--text-4);font-size:12px">Pas de données plan respecté</div>';

    // Jour de la semaine
    const dow = JOURNAL.byDayOfWeek(allTrades);
    const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const dowEl = $('bd-dow');
    const maxAbs = Math.max(1, ...dow.map(d => Math.abs(d.pnl)));
    dowEl.innerHTML = dow.map((g, i) => {
      if (g.count === 0) return '';
      const pnlColor = g.pnl >= 0 ? '#10B981' : 'var(--red)';
      const barPct = Math.abs(g.pnl) / maxAbs * 100;
      return `<div style="margin:4px 0">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span style="color:var(--text-2)">${days[i]} <span style="color:var(--text-4);font-size:11px">(${g.count})</span></span><strong style="color:${pnlColor}">${(g.pnl >= 0 ? '+' : '') + fmtM(g.pnl)}</strong></div>
        <div style="height:4px;background:rgba(148,163,184,0.15);border-radius:2px;overflow:hidden"><div style="height:100%;width:${barPct}%;background:${pnlColor}"></div></div>
      </div>`;
    }).filter(Boolean).join('') || '<div style="color:var(--text-4);font-size:12px">Aucune donnée</div>';
  }

  function renderInstrumentTable() {
    const by = JOURNAL.breakdown(allTrades, 'instrument');
    const tb = $('j-tbody-by-instr');
    if (!tb) return;
    if (by.length === 0) {
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-4);padding:20px">Aucun trade clos</td></tr>';
      return;
    }
    tb.innerHTML = by.slice(0, 15).map(b => `
      <tr>
        <td><strong>${b.key}</strong></td>
        <td>${b.count}</td>
        <td>${fmtP(b.winrate)}</td>
        <td class="${b.pnl >= 0 ? 'pos' : 'neg'}" style="font-weight:600">${(b.pnl >= 0 ? '+' : '') + fmtM(b.pnl)}</td>
        <td>${fmtMd(b.avgPnl)}</td>
      </tr>
    `).join('');
  }

  function renderStrategyTable() {
    const by = JOURNAL.breakdown(allTrades, 'strategy');
    const tb = $('j-tbody-by-strat');
    if (!tb) return;
    const filtered = by.filter(b => b.key && b.key !== '—');
    if (filtered.length === 0) {
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-4);padding:20px">Renseignez la stratégie dans vos trades</td></tr>';
      return;
    }
    tb.innerHTML = filtered.slice(0, 15).map(b => `
      <tr>
        <td><strong>${b.key}</strong></td>
        <td>${b.count}</td>
        <td>${fmtP(b.winrate)}</td>
        <td class="${b.pnl >= 0 ? 'pos' : 'neg'}" style="font-weight:600">${(b.pnl >= 0 ? '+' : '') + fmtM(b.pnl)}</td>
        <td>${fmtMd(b.avgPnl)}</td>
      </tr>
    `).join('');
  }

  /* ─── Table trades + filtres ─────────────────────────────── */
  function renderTable() {
    const tbody = $('j-tbody');
    const filter = ($('j-filter').value || '').toLowerCase().trim();
    const status = $('j-filter-status').value;
    const monthFilter = $('j-filter-month').value; // YYYY-MM
    let list = allTrades.slice();
    if (filter) list = list.filter(t =>
      (t.instrument || '').toLowerCase().includes(filter) ||
      (t.strategy || '').toLowerCase().includes(filter) ||
      (t.tags || '').toLowerCase().includes(filter) ||
      (t.notes || '').toLowerCase().includes(filter)
    );
    if (status === 'closed') list = list.filter(t => t.exit_price != null);
    else if (status === 'open') list = list.filter(t => t.exit_price == null);
    else if (status === 'win') list = list.filter(t => t.pnl != null && t.pnl > 0);
    else if (status === 'loss') list = list.filter(t => t.pnl != null && t.pnl <= 0);
    if (monthFilter) {
      list = list.filter(t => {
        const d = t.exit_date || t.entry_date;
        return d && d.startsWith(monthFilter);
      });
    }

    $('j-count').textContent = list.length + ' trade' + (list.length > 1 ? 's' : '');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-4);padding:32px">Aucun trade. Ajoutez votre premier ci-dessus.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(t => {
      const isOpen = t.exit_price == null;
      const cls = isOpen ? 'is-open' : (t.pnl > 0 ? 'is-win' : 'is-loss');
      const pnlStr = isOpen ? 'ouvert' : ((t.pnl >= 0 ? '+' : '') + fmtMd(t.pnl));
      const r = JOURNAL.rMultipleOf(t);
      const rStr = r != null && Number.isFinite(r) ? (r >= 0 ? '+' : '') + r.toFixed(2) + 'R' : '—';
      return `<tr class="trade-row ${cls}" data-edit="${t.id}">
        <td>${fmtDate(t.entry_date)}</td>
        <td><strong>${t.instrument || '—'}</strong></td>
        <td>${t.side === 'short' ? '▼ Short' : '▲ Long'}</td>
        <td>${fmtN(t.entry_price, 4)}</td>
        <td>${t.exit_price != null ? fmtN(t.exit_price, 4) : '—'}</td>
        <td>${fmtN(t.size, 0)}</td>
        <td style="font-family:var(--font-mono);font-size:12px;color:${r > 0 ? '#10B981' : r < 0 ? 'var(--red)' : 'var(--text-4)'}">${rStr}</td>
        <td class="pnl-cell">${pnlStr}</td>
        <td style="font-size:12px;color:var(--text-3)">${t.strategy || '—'}</td>
        <td><button class="btn-ghost" data-del="${t.id}" title="Supprimer" style="padding:4px 8px;color:var(--red);font-size:12px">✕</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Supprimer ce trade ?')) return;
        await JOURNAL_API.deleteTrade(b.dataset.del);
        await refresh();
      });
    });
    tbody.querySelectorAll('[data-edit]').forEach(row => {
      row.addEventListener('click', () => startEdit(row.dataset.edit));
    });
  }

  /* ─── Form handling ──────────────────────────────────────── */
  function readForm() {
    const planVal = $('j-plan').value;
    const t = {
      instrument: ($('j-instrument').value || '').trim() || 'EUR/USD',
      side: $('j-side').value || 'long',
      entry_price: parseFloat($('j-entry').value) || 0,
      exit_price: $('j-exit').value !== '' ? parseFloat($('j-exit').value) : null,
      size: parseFloat($('j-size').value) || 0,
      stop_loss: $('j-stop').value !== '' ? parseFloat($('j-stop').value) : null,
      take_profit: $('j-tp').value !== '' ? parseFloat($('j-tp').value) : null,
      fees: parseFloat($('j-fees').value) || 0,
      strategy: ($('j-strategy').value || '').trim() || null,
      tags: ($('j-tags').value || '').trim() || null,
      notes: ($('j-notes').value || '').trim() || null,
      entry_date: $('j-entry-date').value ? new Date($('j-entry-date').value).toISOString() : new Date().toISOString(),
      followed_plan: planVal === '' ? null : (planVal === 'true')
    };
    if (t.exit_price != null) {
      t.exit_date = $('j-exit-date').value ? new Date($('j-exit-date').value).toISOString() : new Date().toISOString();
    }
    return t;
  }

  function resetForm() {
    ['j-exit', 'j-stop', 'j-tp', 'j-notes', 'j-tags', 'j-exit-date'].forEach(id => $(id).value = '');
    $('j-fees').value = '0';
    $('j-entry-date').value = '';
    // Reset pills
    document.querySelectorAll('#j-side-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.value === 'long'));
    $('j-side').value = 'long';
    document.querySelectorAll('#j-plan-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.value === ''));
    $('j-plan').value = '';
  }

  function startEdit(id) {
    const t = allTrades.find(x => String(x.id) === String(id));
    if (!t) return;
    editingId = id;
    $('j-instrument').value = t.instrument || '';
    $('j-side').value = t.side || 'long';
    document.querySelectorAll('#j-side-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.value === (t.side || 'long')));
    $('j-entry').value = t.entry_price ?? '';
    $('j-exit').value = t.exit_price ?? '';
    $('j-size').value = t.size ?? '';
    $('j-stop').value = t.stop_loss ?? '';
    $('j-tp').value = t.take_profit ?? '';
    $('j-fees').value = t.fees ?? 0;
    $('j-strategy').value = t.strategy || '';
    $('j-tags').value = t.tags || '';
    $('j-notes').value = t.notes || '';
    $('j-entry-date').value = t.entry_date ? new Date(t.entry_date).toISOString().slice(0, 16) : '';
    $('j-exit-date').value = t.exit_date ? new Date(t.exit_date).toISOString().slice(0, 16) : '';
    const planVal = t.followed_plan === true ? 'true' : t.followed_plan === false ? 'false' : '';
    $('j-plan').value = planVal;
    document.querySelectorAll('#j-plan-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.value === planVal));
    // Toggle btns
    $('j-btn-add').style.display = 'none';
    $('j-btn-save').style.display = 'inline-flex';
    $('j-btn-cancel').style.display = 'inline-flex';
    // Scroll to form
    document.getElementById('form-trade').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    editingId = null;
    resetForm();
    $('j-btn-add').style.display = 'inline-flex';
    $('j-btn-save').style.display = 'none';
    $('j-btn-cancel').style.display = 'none';
  }

  async function addTrade() {
    const t = readForm();
    if (!t.entry_price || !t.size) {
      if (window.CI && CI.toast) CI.toast('Prix entrée et taille requis', 'error');
      else alert('Prix entrée et taille requis');
      return;
    }
    const btn = $('j-btn-add');
    btn.disabled = true; const txt = btn.innerHTML; btn.innerHTML = 'Ajout…';
    try {
      await JOURNAL_API.addTrade(t);
      await refresh();
      resetForm();
      if (window.CI && CI.toast) CI.toast('Trade ajouté ✓', 'success');
    } catch (e) {
      console.error(e);
      alert('Erreur : ' + e.message);
    } finally {
      btn.disabled = false; btn.innerHTML = txt;
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    const patch = readForm();
    const btn = $('j-btn-save');
    btn.disabled = true; const txt = btn.innerHTML; btn.innerHTML = 'Sauvegarde…';
    try {
      await JOURNAL_API.updateTrade(editingId, patch);
      await refresh();
      cancelEdit();
      if (window.CI && CI.toast) CI.toast('Trade mis à jour ✓', 'success');
    } catch (e) {
      console.error(e);
      alert('Erreur : ' + e.message);
    } finally {
      btn.disabled = false; btn.innerHTML = txt;
    }
  }

  /* ─── Import / Export CSV ────────────────────────────────── */
  const CSV_COLS = ['instrument','side','entry_price','exit_price','size','stop_loss','take_profit','fees','strategy','tags','notes','entry_date','exit_date','followed_plan','pnl'];

  function escapeCsv(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCsv() {
    if (!allTrades.length) { alert('Aucun trade à exporter'); return; }
    const header = CSV_COLS.join(',');
    const rows = allTrades.map(t => CSV_COLS.map(c => escapeCsv(t[c])).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'calcinvest-trades-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    if (window.CI && CI.toast) CI.toast(allTrades.length + ' trades exportés', 'success');
  }

  function parseCsv(text) {
    // Parse CSV simple (RFC 4180 minimal)
    const rows = [];
    let cur = [], cell = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cell += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { cur.push(cell); cell = ''; }
        else if (c === '\n' || c === '\r') {
          if (cell !== '' || cur.length > 0) { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
          if (c === '\r' && text[i+1] === '\n') i++;
        }
        else cell += c;
      }
    }
    if (cell !== '' || cur.length > 0) { cur.push(cell); rows.push(cur); }
    return rows;
  }

  async function importCsv(file) {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { alert('CSV vide ou invalide'); return; }
      const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const numCols = ['entry_price','exit_price','size','stop_loss','take_profit','fees','pnl'];
      const boolCols = ['followed_plan'];

      let added = 0, skipped = 0;
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.length < 3 || (row.length === 1 && row[0] === '')) { skipped++; continue; }
        const t = {};
        header.forEach((h, i) => {
          const v = row[i];
          if (v == null || v === '') return;
          if (numCols.includes(h)) {
            const n = parseFloat(v.replace(',', '.'));
            if (Number.isFinite(n)) t[h] = n;
          } else if (boolCols.includes(h)) {
            t[h] = v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'oui';
          } else if (h === 'side') {
            t[h] = v.toLowerCase().includes('short') || v.toLowerCase().includes('sell') ? 'short' : 'long';
          } else {
            t[h] = v;
          }
        });
        if (!t.entry_price || !t.size) { skipped++; continue; }
        if (!t.entry_date) t.entry_date = new Date().toISOString();
        try {
          await JOURNAL_API.addTrade(t);
          added++;
        } catch (e) {
          console.warn('skip row', r, e);
          skipped++;
        }
      }
      await refresh();
      if (window.CI && CI.toast) CI.toast(`Import : ${added} ajoutés, ${skipped} ignorés`, added > 0 ? 'success' : 'warn');
      else alert(`Import : ${added} ajoutés, ${skipped} ignorés`);
    } catch (e) {
      console.error(e);
      alert('Erreur import CSV : ' + e.message);
    }
  }

  /* ─── Init ────────────────────────────────────────────────── */
  async function refresh() {
    allTrades = await JOURNAL_API.listTrades();
    renderStats();
    renderTable();
  }

  function bindPills(containerId, hiddenInputId, onChange) {
    document.querySelectorAll('#' + containerId + ' .pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#' + containerId + ' .pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $(hiddenInputId).value = btn.dataset.value;
        if (onChange) onChange();
      });
    });
  }

  function safeInit() {
    showBanner();
    bindPills('j-side-pills', 'j-side');
    bindPills('j-plan-pills', 'j-plan');
    $('j-btn-add').addEventListener('click', addTrade);
    $('j-btn-save').addEventListener('click', saveEdit);
    $('j-btn-reset').addEventListener('click', resetForm);
    $('j-btn-cancel').addEventListener('click', cancelEdit);
    $('j-filter').addEventListener('input', renderTable);
    $('j-filter-status').addEventListener('change', renderTable);
    $('j-filter-month').addEventListener('change', renderTable);
    $('j-btn-export').addEventListener('click', exportCsv);
    $('j-btn-import').addEventListener('click', () => $('j-import-file').click());
    $('j-import-file').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) importCsv(e.target.files[0]);
      e.target.value = '';
    });
    if (window.CI && CI.initAll) CI.initAll();
    // Petite latence pour laisser auth.js charger la config Supabase
    setTimeout(async () => {
      showBanner();
      await refresh();
    }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
  else safeInit();
})();
