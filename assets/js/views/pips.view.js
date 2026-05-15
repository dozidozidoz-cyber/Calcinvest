/* ============================================================
   CalcInvest — View Calculateur PIPS
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmtM = (n, dec) => {
    dec = dec == null ? 2 : dec;
    if (!Number.isFinite(n)) return '—';
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  function readParams() {
    return {
      pair:       $('pp-pair').value || 'EUR/USD',
      balance:    parseFloat($('pp-balance').value) || 10000,
      riskPct:    parseFloat($('pp-risk').value) || 1,
      stopPips:   parseFloat($('pp-stop').value) || 30,
      targetPips: parseFloat($('pp-target').value) || 60,
      accountCurr: $('pp-currency').value || 'EUR',
      lotSize:    parseFloat($('pp-lotsize').value) || 0,
      entryPrice: parseFloat($('pp-entry').value) || 0,
      direction:  document.querySelector('input[name="pp-dir"]:checked')?.value || 'long'
    };
  }

  function updateParamSummary(p) {
    const sum = $('pp-sum-params');
    if (!sum) return;
    const pairInfo = PIPS.PAIRS[p.pair];
    sum.textContent = `${p.pair} · ${fmtM(p.balance, 0)} ${p.accountCurr} · ${p.riskPct}% / ${p.stopPips} pips`;
  }

  // ─── Update prix indicatif quand on change de paire ────
  function updatePairDefaults() {
    const pair = $('pp-pair').value;
    const info = PIPS.PAIRS[pair];
    if (!info) return;
    // Prix indicatif (n'écrase pas si l'utilisateur a déjà tapé)
    const entry = $('pp-entry');
    if (entry && (!entry.value || entry.dataset.auto === '1')) {
      entry.value = info.price;
      entry.dataset.auto = '1';
    }
    // Update suffix dans le hint
    const hint = $('pp-pair-hint');
    if (hint) {
      const labels = {
        'forex': 'Forex',
        'metal': 'Métal précieux',
        'index': 'Indice CFD',
        'crypto': 'Crypto CFD'
      };
      hint.textContent = `${labels[info.category]} · pip = ${info.pipSize}`;
    }
  }

  // ─── Analyse 01 : Valeur d'un pip ─────────────────────
  function renderA01(p, r) {
    const info = PIPS.PAIRS[p.pair];

    $('pp-stat-pipvalue').textContent = fmtM(r.pipValueAccount, 2) + ' ' + r.accountCurrency;
    $('pp-stat-pipvalue-sub').textContent = `pour 1 lot (100 000 ${info.base})`;

    $('pp-stat-pipvalue-mini').textContent = fmtM(r.pipValueAccount / 10, 2) + ' ' + r.accountCurrency;
    $('pp-stat-pipvalue-micro').textContent = fmtM(r.pipValueAccount / 100, 4) + ' ' + r.accountCurrency;
    $('pp-stat-pipvalue-quote').textContent = fmtM(r.pipValueQuote, 2) + ' ' + r.quoteCurrency;

    // Tableau pour différentes tailles
    const sizes = [1000, 10000, 50000, 100000, 500000, 1000000];
    const tbody = $('pp-table-sizes');
    if (tbody) {
      tbody.innerHTML = sizes.map(s => {
        const v = (r.pipValueAccount / 100000) * s;
        const lotLabel = s === 1000 ? '0.01 (micro)' :
                         s === 10000 ? '0.10 (mini)' :
                         s === 50000 ? '0.50' :
                         s === 100000 ? '1.00 (standard)' :
                         s === 500000 ? '5.00' :
                         '10.00';
        return `<tr><td>${lotLabel}</td><td>${fmtM(s, 0)} ${info.base}</td><td><strong>${fmtM(v, 2)} ${r.accountCurrency}/pip</strong></td></tr>`;
      }).join('');
    }
  }

  // ─── Analyse 02 : Position sizing ─────────────────────
  function renderA02(p) {
    const ps = PIPS.positionSize({
      pair: p.pair,
      balance: p.balance,
      riskPct: p.riskPct,
      stopPips: p.stopPips,
      accountCurr: p.accountCurr
    });

    if (ps.error) {
      $('pp-insight-a02').innerHTML = `<span class="neg">⚠ ${ps.error}</span>`;
      return;
    }

    const info = PIPS.PAIRS[p.pair];

    $('pp-stat-risk-amount').textContent = fmtM(ps.riskAmount, 2) + ' ' + p.accountCurr;
    $('pp-stat-lots').textContent = fmtM(ps.standardLots, 4) + ' lots';
    $('pp-stat-units').textContent = fmtM(ps.units, 0) + ' ' + info.base;
    $('pp-stat-pipvalue-pos').textContent = fmtM(ps.pipValuePerLot * ps.standardLots, 2) + ' ' + p.accountCurr + '/pip';

    // Insight
    $('pp-insight-a02').innerHTML = `
      Pour risquer <strong>${fmtM(ps.riskAmount, 0)} ${p.accountCurr}</strong> (${p.riskPct}% du capital)
      avec un stop à <strong>${p.stopPips} pips</strong> sur <em>${p.pair}</em>,
      prends une position de <strong>${fmtM(ps.miniLots, 2)} mini lots</strong>
      (soit <strong>${fmtM(ps.units, 0)} ${info.base}</strong>).
      Chaque pip vous coûte/rapporte ${fmtM(ps.pipValuePerLot * ps.standardLots, 2)} ${p.accountCurr}.
    `;

    // R/R rapide
    const targetGain = p.targetPips * ps.pipValuePerLot * ps.standardLots;
    const ratio = p.targetPips / p.stopPips;
    $('pp-stat-target').textContent = fmtM(targetGain, 2) + ' ' + p.accountCurr;
    $('pp-stat-ratio').textContent = '1:' + ratio.toFixed(2);
  }

  // ─── Analyse 03 : Calculateur P&L de trade ────────────
  function renderA03(p) {
    if (!p.entryPrice || p.entryPrice <= 0) {
      $('pp-insight-a03').innerHTML = '<span class="muted">Entrez un prix d\'entrée pour voir le P&L</span>';
      return;
    }

    const info = PIPS.PAIRS[p.pair];
    const dir = p.direction === 'short' ? -1 : 1;

    // Calcul du prix de stop et target
    const stopPrice = p.entryPrice + (-dir * p.stopPips * info.pipSize);
    const targetPrice = p.entryPrice + (dir * p.targetPips * info.pipSize);

    // Position sizée pour le risque demandé
    const ps = PIPS.positionSize({
      pair: p.pair, balance: p.balance, riskPct: p.riskPct,
      stopPips: p.stopPips, accountCurr: p.accountCurr
    });
    if (ps.error) return;

    const lotUnits = ps.units;

    // P&L sur stop / target
    const pnlStop   = PIPS.tradePnL({ pair: p.pair, direction: p.direction, lotSize: lotUnits, entryPrice: p.entryPrice, exitPrice: stopPrice,   accountCurr: p.accountCurr });
    const pnlTarget = PIPS.tradePnL({ pair: p.pair, direction: p.direction, lotSize: lotUnits, entryPrice: p.entryPrice, exitPrice: targetPrice, accountCurr: p.accountCurr });

    $('pp-stat-entry').textContent = fmtM(p.entryPrice, info.pipSize < 0.01 ? 4 : 2);
    $('pp-stat-stop').textContent  = fmtM(stopPrice,   info.pipSize < 0.01 ? 4 : 2);
    $('pp-stat-takeprofit').textContent = fmtM(targetPrice, info.pipSize < 0.01 ? 4 : 2);

    $('pp-stat-pnl-stop').textContent = fmtM(pnlStop.profitAccount, 2) + ' ' + p.accountCurr;
    $('pp-stat-pnl-stop').className = 'stat-value neg';
    $('pp-stat-pnl-target').textContent = '+' + fmtM(pnlTarget.profitAccount, 2) + ' ' + p.accountCurr;
    $('pp-stat-pnl-target').className = 'stat-value pos';

    $('pp-insight-a03').innerHTML = `
      Position <strong>${p.direction === 'short' ? 'SHORT' : 'LONG'} ${fmtM(ps.miniLots, 2)} mini lots</strong>
      sur <em>${p.pair}</em> à <strong>${fmtM(p.entryPrice, 4)}</strong>.
      Stop : <strong class="neg">${fmtM(stopPrice, 4)}</strong> (−${p.stopPips} pips, perte ${fmtM(Math.abs(pnlStop.profitAccount), 0)} ${p.accountCurr}).
      Target : <strong class="pos">${fmtM(targetPrice, 4)}</strong> (+${p.targetPips} pips, gain ${fmtM(pnlTarget.profitAccount, 0)} ${p.accountCurr}).
      R/R : <strong>1:${(p.targetPips/p.stopPips).toFixed(2)}</strong>.
    `;
  }

  // ─── RUN ───────────────────────────────────────────────
  function run() {
    if (typeof PIPS === 'undefined') return;
    const p = readParams();
    updateParamSummary(p);

    // Pip value pour 1 lot standard
    const pv = PIPS.pipValue({
      pair: p.pair, lotSize: 100000, accountCurr: p.accountCurr
    });

    renderA01(p, pv);
    renderA02(p);
    renderA03(p);

    // Sauvegarde URL
    if (CI && CI.setUrlParams) {
      CI.setUrlParams({
        pair: encodeURIComponent(p.pair),
        bal: p.balance, risk: p.riskPct,
        stop: p.stopPips, tgt: p.targetPips,
        cur: p.accountCurr, dir: p.direction
      });
    }
  }

  // ─── INIT ──────────────────────────────────────────────
  function init() {
    if (CI && CI.initAll) CI.initAll();

    // Restore from URL
    if (CI && CI.getUrlParam) {
      const pair = CI.getUrlParam('pair');  if (pair) $('pp-pair').value = decodeURIComponent(pair);
      const bal  = CI.getUrlParam('bal');   if (bal)  $('pp-balance').value = bal;
      const risk = CI.getUrlParam('risk');  if (risk) $('pp-risk').value = risk;
      const stop = CI.getUrlParam('stop');  if (stop) $('pp-stop').value = stop;
      const tgt  = CI.getUrlParam('tgt');   if (tgt)  $('pp-target').value = tgt;
      const cur  = CI.getUrlParam('cur');   if (cur)  $('pp-currency').value = cur;
      const dir  = CI.getUrlParam('dir');   if (dir)  document.querySelector(`input[name="pp-dir"][value="${dir}"]`)?.click();
    }

    updatePairDefaults();

    // Listeners
    ['pp-pair','pp-balance','pp-risk','pp-stop','pp-target','pp-currency','pp-entry'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => { if (id === 'pp-pair') updatePairDefaults(); run(); });
      if (el.tagName === 'INPUT') el.addEventListener('input', () => {
        clearTimeout(el._t);
        el._t = setTimeout(() => { if (id === 'pp-pair') updatePairDefaults(); run(); }, 150);
      });
    });
    document.querySelectorAll('input[name="pp-dir"]').forEach(r => r.addEventListener('change', run));

    const btn = $('pp-btn-calc');
    if (btn) btn.addEventListener('click', run);

    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
