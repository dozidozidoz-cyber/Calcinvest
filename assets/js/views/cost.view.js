/* ============================================================
   CalcInvest — View Coûts réels du trade
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (n, dec) => {
    dec = dec == null ? 2 : dec;
    if (!Number.isFinite(n)) return '—';
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  function readParams() {
    return {
      pair:           CI.safeStr('ct-pair', 'EUR/USD'),
      lotSize:        CI.safeNum('ct-lotsize', 100000),
      accountCurr:    CI.safeStr('ct-currency', 'EUR'),
      spreadPips:     CI.safeNum('ct-spread', 1.5),
      commissionType: CI.safeStr('ct-comm-type', 'perlot'),
      commissionValue:CI.safeNum('ct-comm-value', 7),
      swapPipsPerNight: CI.safeNum('ct-swap', -0.5),
      nightsHeld:     CI.safeNum('ct-nights', 1),
      expectedMovePips: CI.safeNum('ct-move', 30),
      // Compound
      startCapital:   CI.safeNum('ct-start', 10000),
      monthlyReturnPct: CI.safeNum('ct-ret', 2),
      months:         CI.safeNum('ct-months', 12),
      monthlyWithdrawal: CI.safeNum('ct-wd', 0),
      taxRate:        CI.safeNum('ct-tax', 30)
    };
  }

  function updateParamSummary(p) {
    const sum = $('ct-sum-params');
    if (!sum) return;
    sum.textContent = `${p.pair} · ${(p.lotSize/100000).toFixed(2)} lot · spread ${p.spreadPips}p · ${p.nightsHeld} nuit(s)`;
  }

  // ─── A1 : Coûts du trade ───
  function renderA01(p) {
    const r = COST.realProfitVsCost(p);
    if (r.error) { ($('ct-insight-a01').querySelector('.insight-text') || $('ct-insight-a01')).innerHTML = `<span class="neg">${r.error}</span>`; return; }

    const cur = r.accountCurrency;
    $('ct-stat-spread').textContent = fmt(r.spreadCost, 2) + ' ' + cur;
    $('ct-stat-commission').textContent = fmt(r.commissionCost, 2) + ' ' + cur;
    $('ct-stat-swap').textContent = fmt(r.swapCost, 2) + ' ' + cur;
    $('ct-stat-swap-meta').textContent = r.swapPaidOrReceived + ' · ' + r.nightsHeld + ' nuit(s)';
    $('ct-stat-total').textContent = fmt(r.totalCost, 2) + ' ' + cur;
    $('ct-stat-breakeven').textContent = fmt(r.breakEvenPips, 1) + ' pips';

    // Section P&L réel
    $('ct-stat-gross').textContent = fmt(r.grossPnl, 2) + ' ' + cur;
    $('ct-stat-net').textContent = fmt(r.netPnl, 2) + ' ' + cur;
    $('ct-stat-net').className = 'stat-value ' + (r.netPnl >= 0 ? 'pos' : 'neg');
    $('ct-stat-cost-pct').textContent = fmt(r.costPctOfGross, 1) + ' %';
    $('ct-stat-cost-pct').className = 'stat-value ' + (r.costPctOfGross < 20 ? 'pos' : r.costPctOfGross < 50 ? 'warn' : 'neg');

    const verdict = r.costPctOfGross < 20 ? '<span class="pos">faible</span>'
                  : r.costPctOfGross < 50 ? '<span class="warn">significatif</span>'
                  : '<span class="neg">prohibitif</span>';

    ($('ct-insight-a01').querySelector('.insight-text') || $('ct-insight-a01')).innerHTML = `
      Coût total du trade : <strong>${fmt(r.totalCost, 2)} ${cur}</strong>
      (${fmt(r.breakEvenPips, 1)} pips de break-even). Pour gagner <strong>${fmt(p.expectedMovePips, 0)} pips</strong>,
      vous obtenez en net <strong class="${r.netPnl >= 0 ? 'pos' : 'neg'}">${r.netPnl >= 0 ? '+' : ''}${fmt(r.netPnl, 2)} ${cur}</strong>
      — les frais représentent ${fmt(r.costPctOfGross, 1)} % du gain brut (${verdict}).
    `;
  }

  // ─── A2 : Tableau coûts selon durée ───
  function renderA02(p) {
    const tbody = $('ct-table-duration');
    if (!tbody) return;
    const durations = [0, 1, 5, 10, 30, 90];
    tbody.innerHTML = durations.map(n => {
      const r = COST.tradeCost({ ...p, nightsHeld: n });
      const ratio = p.spreadPips > 0 ? (r.totalCost / r.spreadCost) : 1;
      return `<tr>
        <td>${n} ${n === 0 ? 'jour (intraday)' : n === 1 ? 'jour' : 'jours'}</td>
        <td>${fmt(r.spreadCost, 2)} ${r.accountCurrency}</td>
        <td>${fmt(r.commissionCost, 2)} ${r.accountCurrency}</td>
        <td>${fmt(r.swapCost, 2)} ${r.accountCurrency}</td>
        <td><strong>${fmt(r.totalCost, 2)} ${r.accountCurrency}</strong></td>
        <td>${fmt(r.breakEvenPips, 1)} pips</td>
      </tr>`;
    }).join('');
  }

  // ─── A3 : Compound trading projection ───
  function renderA03(p) {
    const cp = COST.compoundProjection({
      startCapital: p.startCapital,
      monthlyReturnPct: p.monthlyReturnPct,
      months: p.months,
      monthlyWithdrawal: p.monthlyWithdrawal,
      taxRate: p.taxRate
    });

    $('ct-stat-final').textContent = fmt(cp.finalBalance, 0) + ' €';
    $('ct-stat-withdrawn').textContent = fmt(cp.totalWithdrawn, 0) + ' €';
    $('ct-stat-gross-profit').textContent = (cp.grossProfit >= 0 ? '+' : '') + fmt(cp.grossProfit, 0) + ' €';
    $('ct-stat-net-profit').textContent = (cp.netProfit >= 0 ? '+' : '') + fmt(cp.netProfit, 0) + ' €';
    $('ct-stat-net-profit').className = 'stat-value ' + (cp.netProfit >= 0 ? 'pos' : 'neg');
    $('ct-stat-cagr').textContent = fmt(cp.cagrAnnualized, 1) + ' %';
    $('ct-stat-cagr').className = 'stat-value ' + (cp.cagrAnnualized > 50 ? 'warn' : 'pos');

    // Chart compound
    const labels = cp.series.map(s => 'M' + s.month);
    const dataBalance = cp.series.map(s => s.balance);
    const dataWd = cp.series.map(s => p.startCapital + s.withdrawn);

    if (CI && CI.drawChart) {
      CI.safeChart('ct-chart-compound', labels, [
        { data: dataBalance, color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.18)', width: 2, label: 'Capital' },
        { data: dataWd, color: '#9CA3AF', dash: [4, 3], width: 1.5, label: 'Retraits cumulés + capital initial' }
      ], { xLabel: 'Mois', yLabel: '€', yFormat: (v) => CI.fmtCompact(v) });
    }

    // Reality check
    let realityCheck = '';
    if (p.monthlyReturnPct > 10) {
      realityCheck = `<br/><span class="warn">⚠ 10 %+/mois sur la durée est <strong>extrêmement rare</strong>. Les meilleurs hedge funds font 15-25 %/an. Vérifiez vos hypothèses.</span>`;
    } else if (p.monthlyReturnPct > 5) {
      realityCheck = `<br/><span class="warn">5 %+/mois sur la durée est ambitieux. Réaliste pour les meilleurs traders ; rare en pratique sur 24 mois.</span>`;
    }

    ($('ct-insight-a03').querySelector('.insight-text') || $('ct-insight-a03')).innerHTML = `
      Sur <strong>${p.months} mois</strong> à ${p.monthlyReturnPct} %/mois${p.monthlyWithdrawal > 0 ? ` avec ${fmt(p.monthlyWithdrawal, 0)} €/mois de retraits` : ''} :
      capital final <strong class="pos">${fmt(cp.finalBalance, 0)} €</strong>, gain net après fiscalité
      <strong class="${cp.netProfit >= 0 ? 'pos' : 'neg'}">${cp.netProfit >= 0 ? '+' : ''}${fmt(cp.netProfit, 0)} €</strong>.
      CAGR annualisé : <strong>${fmt(cp.cagrAnnualized, 1)} %</strong>.
      ${realityCheck}
    `;
  }

  // ─── RUN ───
  function run() {
    if (typeof COST === 'undefined' || typeof PIPS === 'undefined') return;
    const p = readParams();
    updateParamSummary(p);
    renderA01(p);
    renderA02(p);
    renderA03(p);
  }

  // ─── Broker profile selector ───
  function populateBrokerSelect() {
    const sel = $('ct-broker-profile');
    if (!sel || sel.dataset.populated) return;
    sel.dataset.populated = '1';
    if (!window.PIPS || !window.PIPS.BROKERS) return;
    const opts = Object.entries(window.PIPS.BROKERS).map(([key, b]) =>
      `<option value="${key}">${b.name}</option>`).join('');
    sel.innerHTML = opts;
    sel.addEventListener('change', () => {
      const b = window.PIPS.BROKERS[sel.value];
      if (!b) return;
      $('ct-spread').value = b.spreadPips;
      $('ct-comm-type').value = b.commType;
      $('ct-comm-value').value = b.commValue;
      $('ct-swap').value = b.swapPips;
      const note = $('ct-broker-note');
      if (note) note.textContent = b.note || '';
      run();
    });
    // Sync note initiale
    const cur = window.PIPS.BROKERS[sel.value];
    if (cur) {
      const note = $('ct-broker-note');
      if (note) note.textContent = cur.note || '';
    }
  }

  function init() {
    if (CI && CI.initAll) CI.initAll();
    populateBrokerSelect();
    ['ct-pair','ct-lotsize','ct-currency','ct-spread','ct-comm-type','ct-comm-value','ct-swap','ct-nights','ct-move','ct-start','ct-ret','ct-months','ct-wd','ct-tax'].forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('change', run);
      if (el.tagName === 'INPUT') el.addEventListener('input', () => {
        clearTimeout(el._t); el._t = setTimeout(run, 200);
      });
    });
    const btn = $('ct-btn-calc'); if (btn) btn.addEventListener('click', run);
    // Save button
    if (CI && CI.attachSaveButton) {
      CI.attachSaveButton({
        btnId: 'ct-btn-save',
        type: 'cost',
        getParams: readParams,
        defaultName: 'Setup coûts trade'
      });
    }
    run();
  }

  function safeInit() {
    try { init(); }
    catch(e) { console.error('[view] init failed:', e.message); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
  else safeInit();
})();
