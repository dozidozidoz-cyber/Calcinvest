/* ============================================================
   CalcInvest — View Monte Carlo Trading
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (n, dec) => {
    dec = dec == null ? 0 : dec;
    if (!Number.isFinite(n)) return '—';
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  const fmtP = (n, dec) => (n == null || !Number.isFinite(n)) ? '—' : fmt(n, dec || 1) + ' %';

  function readParams() {
    return {
      startBalance: CI.safeNum('mc-balance', 10000),
      winRate:      CI.safeNum('mc-wr', 55),
      rrRatio:      CI.safeNum('mc-rr', 2),
      riskPct:      CI.safeNum('mc-risk', 1),
      numTrades:    parseInt($('mc-n').value)         || 200,
      numSims:      parseInt($('mc-sims').value)      || 2000,
      targetBalance:CI.safeNum('mc-target', 20000),
      feePerTrade:  CI.safeNum('mc-fee', 0),
      taxRate:      window._mcTaxRate != null ? window._mcTaxRate : 30
    };
  }

  function updateParamSummary(p) {
    const sum = $('mc-sum-params');
    if (!sum) return;
    sum.textContent = `${fmt(p.numSims)} sims · WR ${p.winRate}% · R/R 1:${p.rrRatio} · ${p.riskPct}%/trade · ${p.numTrades} trades`;
  }

  let mcResult = null;

  // ─── A1 : Distribution finale ───
  function renderA01(p) {
    const r = mcResult;

    $('mc-stat-final-p50').textContent = fmt(r.finalP50) + ' €';
    $('mc-stat-final-p5').textContent = fmt(r.finalP5) + ' €';
    $('mc-stat-final-p95').textContent = fmt(r.finalP95) + ' €';

    // Médiane nette (frais cumulés moyens + tax moyen sur PV)
    const netEl = $('mc-stat-final-p50-net');
    const fricEl = $('mc-stat-friction');
    if (netEl) {
      netEl.textContent = fmt(r.finalP50Net) + ' €';
      const gap = r.finalP50 - r.finalP50Net;
      netEl.className = 'stat-value ' + (r.finalP50Net >= p.startBalance ? 'pos' : 'neg');
      if (fricEl) {
        fricEl.textContent = gap > 0
          ? `frais ${fmt(r.avgFeesPaid)} € + impôt ${fmt(r.avgTaxPaid)} € (moy.)`
          : 'aucune friction modélisée';
      }
    }

    // Gain median en %
    const medGainPct = ((r.finalP50 - p.startBalance) / p.startBalance) * 100;
    $('mc-stat-median-gain').textContent = (medGainPct >= 0 ? '+' : '') + fmt(medGainPct, 1) + ' %';
    $('mc-stat-median-gain').className = 'stat-value ' + (medGainPct >= 0 ? 'pos' : 'neg');

    // Insight
    let verdict;
    const medianGain = medGainPct;
    if (medianGain < 0) {
      verdict = '<span class="neg">Système non profitable</span> en médiane. La majorité des trajectoires perdent.';
    } else if (medianGain < 20) {
      verdict = '<span class="warn">Gain médian modeste</span>. Vérifiez si le rendement justifie l\'effort et le risque.';
    } else if (medianGain < 100) {
      verdict = '<span class="pos">Système profitable</span> avec une dispersion normale.';
    } else {
      verdict = '<strong class="pos">Système très profitable</strong> — mais attention : médiane élevée peut cacher des trajectoires catastrophiques.';
    }

    ($('mc-insight-a01').querySelector('.insight-text') || $('mc-insight-a01')).innerHTML = `
      Sur ${fmt(p.numSims)} trajectoires de ${p.numTrades} trades :
      la <strong>médiane</strong> finit à ${fmt(r.finalP50)} € (${medGainPct >= 0 ? '+' : ''}${fmt(medGainPct, 1)} %),
      le <strong>pire scénario</strong> (P5) à ${fmt(r.finalP5)} €,
      le <strong>meilleur</strong> (P95) à ${fmt(r.finalP95)} €.
      ${verdict}
    `;
  }

  // ─── A2 : Equity curve avec bandes percentiles ───
  function renderA02() {
    const r = mcResult;
    const cp = r.checkpoints;
    const labels = cp.map(c => '#' + c.trade);

    CI.safeChart('mc-chart-equity', labels, [
      { data: cp.map(c => c.p95), color: 'rgba(5,150,105,0.0)', fill: true, fillColor: 'rgba(5,150,105,0.18)', width: 0, label: 'P95' },
      { data: cp.map(c => c.p5),  color: 'rgba(255,255,255,1.0)', fill: true, fillColor: 'rgba(255,255,255,1.0)', width: 0, label: 'P5' },
      { data: cp.map(c => c.p75), color: 'rgba(5,150,105,0.6)', width: 1.5, dash: [4, 3], label: 'P75' },
      { data: cp.map(c => c.p25), color: 'rgba(220,38,38,0.6)', width: 1.5, dash: [4, 3], label: 'P25' },
      { data: cp.map(c => c.p50), color: '#059669', width: 2.5, label: 'Médiane' }
    ], { xLabel: 'Trade #', yLabel: '€', yFormat: (v) => CI.fmtCompact(v) });
  }

  // ─── A3 : Drawdowns ───
  function renderA03() {
    const r = mcResult;
    $('mc-stat-dd-p50').textContent = fmt(r.maxDDP50, 1) + ' %';
    $('mc-stat-dd-p75').textContent = fmt(r.maxDDP75, 1) + ' %';
    $('mc-stat-dd-p95').textContent = fmt(r.maxDDP95, 1) + ' %';
    $('mc-stat-dd-max').textContent = fmt(r.maxDDMax, 1) + ' %';
    $('mc-stat-streak').textContent = fmt(r.avgMaxConsecLosses, 1);

    ($('mc-insight-a03').querySelector('.insight-text') || $('mc-insight-a03')).innerHTML = `
      <strong>Drawdown médian</strong> : ${fmt(r.maxDDP50, 1)} %. Dans 25 % des trajectoires, vous dépassez ${fmt(r.maxDDP75, 1)} % de DD.
      Le scénario pire (P95) atteint ${fmt(r.maxDDP95, 1)} %. <strong>Streak max de pertes consécutives</strong> (moyenne) : ${fmt(r.avgMaxConsecLosses, 1)} trades.
      Mental check : vous tiendriez la stratégie ?
    `;
  }

  // ─── A4 : Probabilités ───
  function renderA04(p) {
    const r = mcResult;
    $('mc-stat-pruin').textContent = fmtP(r.probRuin);
    $('mc-stat-pruin').className = 'stat-value ' + (r.probRuin < 1 ? 'pos' : r.probRuin < 5 ? 'warn' : 'neg');

    $('mc-stat-ploss').textContent = fmtP(r.probLoss);
    $('mc-stat-pdouble').textContent = fmtP(r.probDouble);
    $('mc-stat-ptriple').textContent = fmtP(r.probTriple);

    $('mc-stat-ptarget').textContent = r.probTarget != null ? fmtP(r.probTarget) : '—';
    $('mc-stat-ptarget').className = 'stat-value ' + (r.probTarget == null ? '' : r.probTarget > 70 ? 'pos' : r.probTarget > 40 ? 'warn' : 'neg');
  }

  // ─── A5 : Heatmap WR × R/R ───
  function renderA05(p) {
    const grid = $('mc-heatmap');
    if (!grid) return;
    grid.textContent = 'Calcul en cours…';

    // Async pour ne pas bloquer
    setTimeout(() => {
      const h = MCTRADE.heatmapWRvsRR({ riskPct: p.riskPct, numTrades: p.numTrades, startBalance: p.startBalance });
      // Construction d'une grille HTML
      let html = '<table class="data-table" style="width:auto;margin:0 auto">';
      html += '<thead><tr><th></th>';
      h.rrValues.forEach(rr => html += `<th>R/R 1:${rr}</th>`);
      html += '</tr></thead><tbody>';
      h.cells.forEach((row, i) => {
        html += `<tr><td><strong>WR ${h.wrValues[i]} %</strong></td>`;
        row.forEach(c => {
          const pct = c.profitable;
          const bg = pct > 80 ? 'rgba(5,150,105,0.32)'
                   : pct > 50 ? 'rgba(5,150,105,0.15)'
                   : pct > 20 ? 'rgba(217,119,6,0.18)'
                   : 'rgba(220,38,38,0.20)';
          const color = pct > 50 ? 'var(--accent-2)' : pct > 20 ? 'var(--yellow)' : 'var(--red)';
          html += `<td style="background:${bg};color:${color};font-weight:700;text-align:center">${fmt(pct, 0)} %</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      grid.innerHTML = html;
    }, 50);
  }

  // ─── RUN ───
  function run() {
    if (typeof MCTRADE === 'undefined') return;
    const p = readParams();
    updateParamSummary(p);

    // Calcul Monte Carlo principal
    mcResult = MCTRADE.monteCarlo(p);

    renderA01(p);
    renderA02();
    renderA03();
    renderA04(p);
    renderA05(p);
  }

  function init() {
    if (CI && CI.initAll) CI.initAll();
    ['mc-balance','mc-wr','mc-rr','mc-risk','mc-n','mc-sims','mc-target','mc-fee'].forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('change', run);
      if (el.tagName === 'INPUT') el.addEventListener('input', () => {
        clearTimeout(el._t); el._t = setTimeout(run, 300);
      });
    });
    // Pills enveloppe fiscale
    document.querySelectorAll('#mc-env-pills .pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mc-env-pills .pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window._mcTaxRate = parseFloat(btn.dataset.val);
        run();
      });
    });
    const btn = $('mc-btn-calc'); if (btn) btn.addEventListener('click', run);

    if (CI && CI.attachSaveButton) {
      CI.attachSaveButton({ btnId: 'mc-btn-save', type: 'mctrading', getParams: readParams, defaultName: 'Système Monte Carlo' });
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
