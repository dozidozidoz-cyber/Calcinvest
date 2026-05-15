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

  // Helper safe pour lire la valeur d'un élément potentiellement absent
  function val(id, fallback) {
    const el = $(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  }
  function txt(id, fallback) {
    const el = $(id);
    if (!el) return fallback;
    return el.value || fallback;
  }

  function readParams() {
    return {
      pair:       txt('pp-pair', 'EUR/USD'),
      balance:    val('pp-balance', 10000),
      riskPct:    val('pp-risk', 1),
      stopPips:   val('pp-stop', 30),
      targetPips: val('pp-target', 60),
      accountCurr: txt('pp-currency', 'EUR'),
      lotSize:    val('pp-lotsize', 0),   // optionnel, calculé sinon
      entryPrice: val('pp-entry', 0),
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
    // Reset lotSize input à 1 contrat standard de l'instrument courant
    const lot = $('pp-lotsize');
    if (lot && (!lot.value || lot.dataset.auto === '1' || parseFloat(lot.value) === 0)) {
      lot.value = info.contractSize;
      lot.dataset.auto = '1';
    }
    // Update suffix du stepper lotSize avec le label d'unité
    const lotWrap = lot && lot.closest('.stepper');
    if (lotWrap) {
      const unitSpan = lotWrap.querySelector('.stepper-unit');
      if (unitSpan) unitSpan.textContent = info.unitLabel || info.base;
    }
    // Default stopPips intelligent selon la classe (un trader BTC ne met pas 30 pips)
    const stop = $('pp-stop');
    if (stop && (stop.dataset.auto === '1' || !stop.dataset.userTouched)) {
      const stopByCategory = {
        'forex':         30,
        'forex_exotic':  60,
        'metal':         200,
        'commodity':     100,
        'index':         50,
        'stock':         50,
        'crypto':        1000
      };
      const defaultStop = stopByCategory[info.category] || 30;
      stop.value = defaultStop;
      stop.dataset.auto = '1';
      const target = $('pp-target');
      if (target && (target.dataset.auto === '1' || !target.dataset.userTouched)) {
        target.value = defaultStop * 2;
        target.dataset.auto = '1';
      }
    }
    // Update suffix dans le hint
    const hint = $('pp-pair-hint');
    if (hint) {
      const labels = {
        'forex': 'Forex',
        'forex_exotic': 'Forex exotique',
        'metal': 'Métal précieux',
        'commodity': 'Énergie / Commodité',
        'index': 'Indice CFD',
        'stock': 'Action',
        'crypto': 'Crypto CFD'
      };
      hint.textContent = `${labels[info.category] || info.category} · pip = ${info.pipSize} · 1 lot = ${CI.fmtNum(info.contractSize, 0)} ${info.unitLabel || info.base}`;
    }
  }

  // ─── Analyse 01 : Valeur d'un pip ─────────────────────
  function renderA01(p, r) {
    const info = PIPS.PAIRS[p.pair];

    const contractSize = info.contractSize || 100000;
    const unitLabel = info.unitLabel || info.base;
    const isForex = info.category === 'forex' || info.category === 'forex_exotic';

    $('pp-stat-pipvalue').textContent = fmtM(r.pipValueAccount, 2) + ' ' + r.accountCurrency;
    $('pp-stat-pipvalue-sub').textContent = `pour 1 lot (${fmtM(contractSize, 0)} ${unitLabel})`;

    // Pour les non-forex, mini/micro lots n'existent pas → on montre /10 et /100 quand même comme tailles fractionnelles
    $('pp-stat-pipvalue-mini').textContent = fmtM(r.pipValueAccount / 10, 2) + ' ' + r.accountCurrency;
    $('pp-stat-pipvalue-micro').textContent = fmtM(r.pipValueAccount / 100, 4) + ' ' + r.accountCurrency;
    $('pp-stat-pipvalue-quote').textContent = fmtM(r.pipValueQuote, 2) + ' ' + r.quoteCurrency;

    // Tableau de tailles : adapter selon la classe d'actif
    let sizes, lotLabels;
    if (isForex) {
      sizes = [1000, 10000, 50000, 100000, 500000, 1000000];
      lotLabels = ['0.01 (micro)', '0.10 (mini)', '0.50', '1.00 (standard)', '5.00', '10.00'];
    } else if (info.category === 'metal') {
      // ex: XAU contractSize=100 → 10, 50, 100, 500, 1000 oz
      sizes = [contractSize / 10, contractSize / 2, contractSize, contractSize * 5, contractSize * 10];
      lotLabels = ['0.10', '0.50', '1.00 (standard)', '5.00', '10.00'];
    } else if (info.category === 'crypto') {
      // 1 lot = 1 unité → tailles fractionnelles
      sizes = [0.01, 0.1, 0.5, 1, 5, 10];
      lotLabels = ['0.01', '0.10', '0.50', '1.00 (standard)', '5.00', '10.00'];
    } else if (info.category === 'index') {
      sizes = [0.1, 0.5, 1, 5, 10, 50];
      lotLabels = ['0.10', '0.50', '1.00 (standard)', '5.00', '10.00', '50.00'];
    } else if (info.category === 'stock') {
      sizes = [1, 10, 50, 100, 500, 1000];
      lotLabels = ['1 share', '10', '50', '100 (round lot)', '500', '1 000'];
    } else if (info.category === 'commodity') {
      sizes = [contractSize / 10, contractSize / 2, contractSize, contractSize * 5];
      lotLabels = ['0.10', '0.50', '1.00 (standard)', '5.00'];
    } else {
      sizes = [contractSize / 10, contractSize, contractSize * 5];
      lotLabels = ['0.10', '1.00', '5.00'];
    }

    const tbody = $('pp-table-sizes');
    if (tbody) {
      tbody.innerHTML = sizes.map((s, i) => {
        const v = (r.pipValueAccount / contractSize) * s;
        const sLabel = isForex || info.category === 'commodity' || info.category === 'metal'
          ? fmtM(s, 0) + ' ' + unitLabel
          : (info.category === 'stock' ? fmtM(s, 0) + ' ' + unitLabel : fmtM(s, s < 1 ? 2 : 0) + ' ' + unitLabel);
        return `<tr><td>${lotLabels[i]}</td><td>${sLabel}</td><td><strong>${fmtM(v, 2)} ${r.accountCurrency}/pip</strong></td></tr>`;
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
    const unitLabel = ps.unitLabel || info.base;

    // Affichage UNITS d'abord pour non-forex (1 lot = 1 BTC n'a pas de sens didactique)
    // Forex : "0.33 lot" en gros, "33 333 EUR" en sous
    // Non-forex : "3.33 BTC" en gros, "(soit 3.33 lots CFD)" en sous
    const unitDec = ps.isForex ? 0 : (ps.units >= 100 ? 2 : 4);

    $('pp-stat-risk-amount').textContent = fmtM(ps.riskAmount, 2) + ' ' + p.accountCurr;

    if (ps.isForex) {
      $('pp-stat-lots').textContent = fmtM(ps.standardLots, ps.standardLots < 1 ? 3 : 2) + ' lot' + (ps.standardLots >= 2 ? 's' : '');
      $('pp-stat-units').textContent = fmtM(ps.units, 0) + ' ' + unitLabel;
    } else {
      // Non-forex : prioriser units
      $('pp-stat-lots').textContent = fmtM(ps.units, unitDec) + ' ' + unitLabel;
      $('pp-stat-units').textContent = ps.contractSize === 1
        ? `(1 lot CFD = 1 ${unitLabel})`
        : `(${fmtM(ps.standardLots, 3)} lot · 1 lot = ${ps.contractSize} ${unitLabel})`;
    }

    $('pp-stat-pipvalue-pos').textContent = fmtM(ps.pipValuePerLot * ps.standardLots, 2) + ' ' + p.accountCurr + '/pip';

    // Notional + warning si position démesurée
    const entryPrice = (parseFloat($('pp-entry')?.value) || info.price) || 0;
    const notional = ps.units * entryPrice; // en quote currency (proxy USD)
    const leverageImplicit = p.balance > 0 ? notional / p.balance : 0;

    let warning = '';
    if (leverageImplicit > 30) {
      warning = `<div style="margin-top:10px;padding:10px 12px;background:rgba(248,113,113,0.10);border:1px solid rgba(248,113,113,0.30);border-radius:8px;color:var(--text-2);font-size:13px">
        ⚠ <strong>Position notionnelle ${CI.fmtCompact ? CI.fmtCompact(notional) : fmtM(notional, 0)} ${info.quote || p.accountCurr}</strong> — soit <strong>${leverageImplicit.toFixed(0)}× votre capital</strong>.
        Sur ${p.pair}, un stop à <strong>${p.stopPips} pips = ${fmtM(p.stopPips * info.pipSize, info.pipSize < 0.01 ? 4 : 2)} ${info.quote || 'USD'}</strong> est très serré pour cet actif volatil.
        Élargissez le stop ou réduisez le % de risque pour un sizing plus prudent.
      </div>`;
    } else if (leverageImplicit > 10) {
      warning = `<div style="margin-top:10px;padding:10px 12px;background:rgba(251,191,36,0.10);border:1px solid rgba(251,191,36,0.30);border-radius:8px;color:var(--text-2);font-size:13px">
        ℹ Notional <strong>${CI.fmtCompact ? CI.fmtCompact(notional) : fmtM(notional, 0)} ${info.quote || p.accountCurr}</strong> (${leverageImplicit.toFixed(1)}× le capital) — vérifiez que votre broker autorise ce levier.
      </div>`;
    }

    // Insight adapté à la classe d'actif
    let posDesc;
    if (ps.isForex) {
      posDesc = `<strong>${fmtM(ps.standardLots, 3)} lot${ps.standardLots >= 2 ? 's' : ''}</strong> (soit ${fmtM(ps.miniLots, 2)} mini lots, ${fmtM(ps.units, 0)} ${unitLabel})`;
    } else if (info.category === 'crypto') {
      posDesc = `<strong>${fmtM(ps.units, ps.units < 1 ? 4 : 3)} ${unitLabel}</strong>`;
    } else if (info.category === 'metal') {
      posDesc = `<strong>${fmtM(ps.units, 2)} ${unitLabel}</strong> (${fmtM(ps.standardLots, 3)} lot CFD)`;
    } else if (info.category === 'commodity') {
      posDesc = `<strong>${fmtM(ps.units, 2)} ${unitLabel}</strong>`;
    } else if (info.category === 'index') {
      posDesc = `<strong>${fmtM(ps.units, 2)} contrat${ps.units >= 2 ? 's' : ''}</strong>`;
    } else if (info.category === 'stock') {
      posDesc = `<strong>${fmtM(ps.units, 0)} action${ps.units >= 2 ? 's' : ''}</strong>`;
    } else {
      posDesc = `<strong>${fmtM(ps.units, unitDec)} ${unitLabel}</strong>`;
    }

    $('pp-insight-a02').innerHTML = `
      <div>Pour risquer <strong>${fmtM(ps.riskAmount, 0)} ${p.accountCurr}</strong> (${p.riskPct}% du capital)
      avec un stop à <strong>${p.stopPips} pips</strong> sur <em>${p.pair}</em>,
      prends une position de ${posDesc}.
      Chaque pip vous coûte/rapporte ${fmtM(ps.pipValuePerLot * ps.standardLots, 2)} ${p.accountCurr}.</div>
      ${warning}
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

    const unitLabel = ps.unitLabel || info.base;
    const sizeStr = ps.isForex
      ? `${fmtM(ps.standardLots, 3)} lot${ps.standardLots >= 2 ? 's' : ''}`
      : `${fmtM(ps.units, ps.units < 10 ? 4 : 2)} ${unitLabel}`;
    const priceDec = info.pipSize < 0.01 ? 4 : 2;

    $('pp-insight-a03').innerHTML = `
      Position <strong>${p.direction === 'short' ? 'SHORT' : 'LONG'} ${sizeStr}</strong>
      sur <em>${p.pair}</em> à <strong>${fmtM(p.entryPrice, priceDec)}</strong>.
      Stop : <strong class="neg">${fmtM(stopPrice, priceDec)}</strong> (−${p.stopPips} pips, perte ${fmtM(Math.abs(pnlStop.profitAccount), 0)} ${p.accountCurr}).
      Target : <strong class="pos">${fmtM(targetPrice, priceDec)}</strong> (+${p.targetPips} pips, gain ${fmtM(pnlTarget.profitAccount, 0)} ${p.accountCurr}).
      R/R : <strong>1:${(p.targetPips/p.stopPips).toFixed(2)}</strong>.
    `;
  }

  // ─── RUN ───────────────────────────────────────────────
  function run() {
    if (typeof PIPS === 'undefined') return;
    const p = readParams();
    updateParamSummary(p);

    // Pip value pour 1 lot standard (contractSize selon l'actif)
    const info = PIPS.PAIRS[p.pair] || {};
    const pv = PIPS.pipValue({
      pair: p.pair, lotSize: info.contractSize || 100000, accountCurr: p.accountCurr
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
    ['pp-pair','pp-balance','pp-risk','pp-stop','pp-target','pp-currency','pp-entry','pp-lotsize'].forEach(id => {
      const el = $(id);
      if (!el) return;
      // Marquer "touché par l'user" pour ne plus écraser sur changement de paire
      const markTouched = () => {
        if (id !== 'pp-pair' && id !== 'pp-currency') {
          el.dataset.userTouched = '1';
          el.dataset.auto = '0';
        }
      };
      el.addEventListener('change', () => {
        markTouched();
        if (id === 'pp-pair') updatePairDefaults();
        run();
      });
      if (el.tagName === 'INPUT') el.addEventListener('input', () => {
        markTouched();
        clearTimeout(el._t);
        el._t = setTimeout(() => { if (id === 'pp-pair') updatePairDefaults(); run(); }, 150);
      });
    });
    document.querySelectorAll('input[name="pp-dir"]').forEach(r => r.addEventListener('change', run));

    const btn = $('pp-btn-calc');
    if (btn) btn.addEventListener('click', run);


    if (CI && CI.attachSaveButton) {
      CI.attachSaveButton({ btnId: 'pp-btn-save', type: 'pips', getParams: readParams, defaultName: 'Setup PIPS' });
    }
    run();
  }

  function safeInit() {
    try { init(); }
    catch(e) { console.error('[pips.view] init failed:', e.message); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit);
  } else {
    safeInit();
  }
})();
