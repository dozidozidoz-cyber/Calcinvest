/* ============================================================
   CalcInvest — View Journal de Trading
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const fmtM = n => (window.CI && CI.fmtMoney) ? CI.fmtMoney(n, 0) : Math.round(n).toLocaleString('fr-FR') + ' €';
  const fmtMd = n => (window.CI && CI.fmtMoney) ? CI.fmtMoney(n, 2) : (Number(n) || 0).toFixed(2) + ' €';
  const fmtP = n => (window.CI && CI.fmtPctPlain) ? CI.fmtPctPlain(n, 1) : (n || 0).toFixed(1) + ' %';
  const fmtN = (n, d) => Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) : '—';

  let allTrades = [];

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
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

  /* ─── Render KPI + equity curve ────────────────────────────── */
  function renderStats() {
    const s = JOURNAL.stats(allTrades);
    $('kpi-total').textContent = (s.totalPnl >= 0 ? '+' : '') + fmtM(s.totalPnl);
    $('kpi-total').style.color = s.totalPnl >= 0 ? '#7C3AED' : 'var(--red)';
    $('kpi-total-sub').textContent = s.nbClosed + ' trades clos · ' + s.nbOpen + ' ouvert' + (s.nbOpen > 1 ? 's' : '');

    $('kpi-wr').textContent = fmtP(s.winrate);
    $('kpi-wr').style.color = s.winrate >= 50 ? '#10B981' : 'var(--text)';
    $('kpi-wr-sub').textContent = s.nbWins + ' gains / ' + s.nbLosses + ' pertes';

    $('kpi-exp').textContent = (s.expectancy >= 0 ? '+' : '') + fmtMd(s.expectancy);
    $('kpi-exp').style.color = s.expectancy >= 0 ? '#10B981' : 'var(--red)';

    $('kpi-pf').textContent = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞';
    $('kpi-pf').style.color = s.profitFactor >= 1.5 ? '#10B981' : s.profitFactor >= 1 ? 'var(--yellow,#FBBF24)' : 'var(--red)';

    $('kpi-dd').textContent = '−' + fmtM(s.maxDrawdown);
    $('kpi-dd-sub').textContent = fmtP(s.maxDrawdownPct) + ' du peak';

    $('kpi-sharpe').textContent = s.sharpe.toFixed(2);
    $('kpi-sharpe').style.color = s.sharpe >= 1 ? '#10B981' : 'var(--text)';

    renderEquityCurve(s.equityCurve);
    renderBreakdown();
  }

  function renderEquityCurve(curve) {
    const svg = $('j-equity-svg');
    if (!svg) return;
    if (!curve || curve.length === 0) {
      svg.innerHTML = '<text x="400" y="120" text-anchor="middle" fill="var(--text-4)" font-size="13">Aucun trade clos à afficher</text>';
      return;
    }
    const W = 800, H = 240, padL = 50, padR = 16, padT = 14, padB = 32;
    const w = W - padL - padR, h = H - padT - padB;
    const equities = curve.map(p => p.equity);
    const drawdowns = curve.map(p => -p.drawdown);
    const yMax = Math.max(0, ...equities);
    const yMin = Math.min(0, ...drawdowns);
    const span = yMax - yMin || 1;
    const n = curve.length;
    const xAt = i => padL + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
    const yAt = v => padT + h - ((v - yMin) / span) * h;

    let s = '';
    // Grid
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (span * i / 4);
      const y = yAt(v);
      s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--border)" stroke-width="0.5"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="var(--text-4)" font-family="var(--font-mono)">' + fmtM(v) + '</text>';
    }
    // Zero line
    const y0 = yAt(0);
    s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + (W - padR) + '" y2="' + y0 + '" stroke="var(--text-4)" stroke-width="1" stroke-dasharray="3 3"/>';

    // Drawdown area (bottom)
    let ddPath = 'M ' + xAt(0) + ' ' + y0;
    curve.forEach((p, i) => { ddPath += ' L ' + xAt(i) + ' ' + yAt(-p.drawdown); });
    ddPath += ' L ' + xAt(n - 1) + ' ' + y0 + ' Z';
    s += '<path d="' + ddPath + '" fill="rgba(248,113,113,0.15)" stroke="none"/>';

    // Equity curve filled
    let eqArea = 'M ' + xAt(0) + ' ' + y0;
    curve.forEach((p, i) => { eqArea += ' L ' + xAt(i) + ' ' + yAt(p.equity); });
    eqArea += ' L ' + xAt(n - 1) + ' ' + y0 + ' Z';
    s += '<path d="' + eqArea + '" fill="rgba(124,58,237,0.18)" stroke="none"/>';

    // Equity curve line
    let eqLine = '';
    curve.forEach((p, i) => { eqLine += (i ? ' L ' : 'M ') + xAt(i) + ' ' + yAt(p.equity); });
    s += '<path d="' + eqLine + '" fill="none" stroke="#7C3AED" stroke-width="2"/>';

    // X axis labels (start, mid, end)
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      if (i >= 0 && i < n) {
        s += '<text x="' + xAt(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--text-4)" font-family="var(--font-mono)">T' + (i + 1) + '</text>';
      }
    });
    svg.innerHTML = s;
  }

  function renderBreakdown() {
    const by = JOURNAL.breakdown(allTrades, 'instrument');
    const tb = $('j-tbody-by-instr');
    if (!tb) return;
    if (by.length === 0) {
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-4);padding:20px">Aucun trade clos</td></tr>';
      return;
    }
    tb.innerHTML = by.slice(0, 12).map(b => `
      <tr>
        <td><strong>${b.key}</strong></td>
        <td>${b.count}</td>
        <td>${fmtP(b.winrate)}</td>
        <td class="${b.pnl >= 0 ? 'pos' : 'neg'}">${(b.pnl >= 0 ? '+' : '') + fmtM(b.pnl)}</td>
        <td>${fmtMd(b.avgPnl)}</td>
      </tr>
    `).join('');
  }

  /* ─── Render table ─────────────────────────────────────────── */
  function renderTable() {
    const tbody = $('j-tbody');
    const filter = ($('j-filter').value || '').toLowerCase().trim();
    const status = $('j-filter-status').value;
    let list = allTrades.slice();
    if (filter) list = list.filter(t => (t.instrument || '').toLowerCase().includes(filter));
    if (status === 'closed') list = list.filter(t => t.exit_price != null);
    else if (status === 'open') list = list.filter(t => t.exit_price == null);
    else if (status === 'win') list = list.filter(t => t.pnl != null && t.pnl > 0);
    else if (status === 'loss') list = list.filter(t => t.pnl != null && t.pnl <= 0);

    $('j-count').textContent = list.length + ' trade' + (list.length > 1 ? 's' : '');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-4);padding:32px">Aucun trade. Ajoutez votre premier ci-dessus.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(t => {
      const isOpen = t.exit_price == null;
      const cls = isOpen ? 'is-open' : (t.pnl > 0 ? 'is-win' : 'is-loss');
      const pnlStr = isOpen ? 'ouvert' : ((t.pnl >= 0 ? '+' : '') + fmtMd(t.pnl));
      return `<tr class="trade-row ${cls}">
        <td>${fmtDate(t.entry_date)}</td>
        <td><strong>${t.instrument || '—'}</strong></td>
        <td>${t.side === 'short' ? '▼ Short' : '▲ Long'}</td>
        <td>${fmtN(t.entry_price, 4)}</td>
        <td>${t.exit_price != null ? fmtN(t.exit_price, 4) : '—'}</td>
        <td>${fmtN(t.size, 0)}</td>
        <td>${pnlStr}</td>
        <td style="font-size:12px;color:var(--text-3)">${t.strategy || '—'}</td>
        <td><button class="btn-ghost" data-del="${t.id}" title="Supprimer" style="padding:4px 8px;color:var(--red);font-size:12px">✕</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Supprimer ce trade ?')) return;
        await JOURNAL_API.deleteTrade(b.dataset.del);
        await refresh();
      });
    });
  }

  /* ─── Form handling ────────────────────────────────────────── */
  function readForm() {
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
      notes: ($('j-notes').value || '').trim() || null,
      entry_date: $('j-entry-date').value ? new Date($('j-entry-date').value).toISOString() : new Date().toISOString(),
      followed_plan: $('j-plan').value === '' ? null : ($('j-plan').value === 'true')
    };
    if (t.exit_price != null) {
      t.exit_date = new Date().toISOString();
    }
    return t;
  }

  function resetForm() {
    ['j-exit', 'j-stop', 'j-tp', 'j-fees', 'j-notes'].forEach(id => $(id).value = id === 'j-fees' ? '0' : '');
    $('j-entry-date').value = '';
  }

  async function addTrade() {
    const t = readForm();
    if (!t.entry_price || !t.size) {
      alert('Prix entrée et taille requis');
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

  async function refresh() {
    allTrades = await JOURNAL_API.listTrades();
    renderStats();
    renderTable();
  }

  function safeInit() {
    showBanner();
    $('j-btn-add').addEventListener('click', addTrade);
    $('j-btn-reset').addEventListener('click', resetForm);
    $('j-filter').addEventListener('input', renderTable);
    $('j-filter-status').addEventListener('change', renderTable);
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
