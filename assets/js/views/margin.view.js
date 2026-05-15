/* ============================================================
   CalcInvest — View Marge & Liquidation
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
      pair:        $('mg-pair').value || 'EUR/USD',
      direction:   document.querySelector('input[name="mg-dir"]:checked')?.value || 'long',
      lotSize:     parseFloat($('mg-lotsize').value) || 100000,
      entryPrice:  parseFloat($('mg-entry').value)   || 0,
      leverage:    parseFloat($('mg-leverage').value)|| 30,
      balance:     parseFloat($('mg-balance').value) || 10000,
      accountCurr: $('mg-currency').value || 'EUR',
      // SL/TP
      targetGain:  parseFloat($('mg-target-gain').value)|| 500,
      targetLoss:  parseFloat($('mg-target-loss').value)|| 100,
      // Pip converter
      pipsConv:    parseFloat($('mg-pips-conv').value) || 30,
      priceA:      parseFloat($('mg-price-a').value)   || 0,
      priceB:      parseFloat($('mg-price-b').value)   || 0
    };
  }

  function updatePairDefaults() {
    const pair = $('mg-pair').value;
    const info = PIPS.PAIRS[pair];
    if (!info) return;
    ['mg-entry', 'mg-price-a', 'mg-price-b'].forEach(id => {
      const el = $(id);
      if (el && (!el.value || el.dataset.auto === '1')) {
        el.value = info.price;
        el.dataset.auto = '1';
      }
    });
  }

  function updateParamSummary(p) {
    const sum = $('mg-sum-params');
    if (!sum) return;
    sum.textContent = `${p.pair} · ${p.direction === 'short' ? 'SHORT' : 'LONG'} ${(p.lotSize/100000).toFixed(2)} lot · ${p.leverage}× · ${fmt(p.balance, 0)} ${p.accountCurr}`;
  }

  // ─── A1 : Marge & Liquidation ───
  function renderA01(p) {
    const m = MARGIN.marginInfo({
      pair: p.pair, direction: p.direction, lotSize: p.lotSize,
      entryPrice: p.entryPrice, leverage: p.leverage,
      balance: p.balance, accountCurr: p.accountCurr,
      maintenanceMarginPct: 0
    });

    if (m.error) {
      $('mg-insight-a01').innerHTML = `<span class="neg">⚠ ${m.error}</span>`;
      return;
    }

    $('mg-stat-notional').textContent = fmt(m.notionalAccount, 0) + ' ' + m.accountCurrency;
    $('mg-stat-margin').textContent = fmt(m.marginRequired, 0) + ' ' + m.accountCurrency;
    $('mg-stat-freemargin').textContent = fmt(m.freeMargin, 0) + ' ' + m.accountCurrency;
    $('mg-stat-freemargin').className = 'stat-value ' + (m.freeMargin < 0 ? 'neg' : 'pos');
    $('mg-stat-marginlevel').textContent = fmt(m.marginLevel, 0) + ' %';

    $('mg-stat-liqprice').textContent = fmt(m.liqPrice, p.pair.includes('JPY') ? 2 : 4);
    $('mg-stat-liqpips').textContent = fmt(m.liqDistancePips, 0) + ' pips';
    $('mg-stat-liqpct').textContent = fmt(m.liqDistancePct, 2) + ' %';

    // Insight
    const isViable = m.freeMargin > 0;
    const dangerLevel = m.marginLevel < 200 ? 'élevé' : m.marginLevel < 500 ? 'modéré' : 'faible';
    $('mg-insight-a01').innerHTML = `
      Position <strong>${p.direction === 'short' ? 'SHORT' : 'LONG'} ${(p.lotSize/100000).toFixed(2)} lot</strong>
      sur <em>${p.pair}</em> à levier ${p.leverage}×.
      ${isViable
        ? `Marge bloquée : <strong>${fmt(m.marginRequired, 0)} ${m.accountCurrency}</strong> (margin level ${fmt(m.marginLevel, 0)} %, risque ${dangerLevel}).`
        : `<span class="neg">⚠ Marge insuffisante</span> — réduisez la position ou augmentez le capital.`}
      Liquidation à <strong class="neg">${fmt(m.liqPrice, 4)}</strong> (${fmt(m.liqDistancePips, 0)} pips, soit ${fmt(m.liqDistancePct, 1)} % de mouvement).
    `;
  }

  // ─── A2 : Margin Call Levels (Zone de danger) ───
  function renderA02(p) {
    const levels = MARGIN.marginCallLevels({
      pair: p.pair, direction: p.direction, lotSize: p.lotSize,
      entryPrice: p.entryPrice, leverage: p.leverage,
      balance: p.balance, accountCurr: p.accountCurr
    });

    const tbody = $('mg-table-levels');
    if (!tbody) return;
    tbody.innerHTML = levels.map(l => `
      <tr>
        <td><strong>${l.name}</strong></td>
        <td><span style="color:var(--${l.severity === 'warn' ? 'yellow' : 'red'});font-weight:600">@${l.threshold}%</span></td>
        <td class="${l.severity}">${fmt(l.price, p.pair.includes('JPY') ? 2 : 4)}</td>
        <td class="${l.severity}">${fmt(l.pips, 0)} pips</td>
        <td class="${l.severity}">−${fmt(l.pct, 2)} %</td>
      </tr>
    `).join('');
  }

  // ─── A3 : SL/TP par montant cible ───
  function renderA03(p) {
    const accountCurr = p.accountCurr;

    // TP : gain souhaité
    const tp = MARGIN.priceForTarget({
      pair: p.pair, direction: p.direction, lotSize: p.lotSize,
      entryPrice: p.entryPrice, targetAmount: Math.abs(p.targetGain), accountCurr
    });
    if (tp.error) { $('mg-insight-a03').innerHTML = `<span class="neg">${tp.error}</span>`; return; }

    // SL : perte limite (négative)
    const sl = MARGIN.priceForTarget({
      pair: p.pair, direction: p.direction, lotSize: p.lotSize,
      entryPrice: p.entryPrice, targetAmount: -Math.abs(p.targetLoss), accountCurr
    });

    const fmtPrice = (v) => fmt(v, p.pair.includes('JPY') ? 2 : 4);

    $('mg-stat-entry').textContent = fmtPrice(p.entryPrice);
    $('mg-stat-tp-price').textContent = fmtPrice(tp.newPrice);
    $('mg-stat-tp-pips').textContent = '+' + fmt(tp.distancePips, 0) + ' pips';
    $('mg-stat-sl-price').textContent = fmtPrice(sl.newPrice);
    $('mg-stat-sl-pips').textContent = '−' + fmt(sl.distancePips, 0) + ' pips';

    const rr = sl.distancePips > 0 ? (tp.distancePips / sl.distancePips).toFixed(2) : '—';
    $('mg-stat-rr').textContent = '1:' + rr;
    $('mg-stat-rr').className = 'stat-value ' + (parseFloat(rr) >= 2 ? 'pos' : parseFloat(rr) >= 1 ? 'warn' : 'neg');

    $('mg-insight-a03').innerHTML = `
      Pour gagner <strong class="pos">+${fmt(p.targetGain, 0)} ${accountCurr}</strong>, place ton TP à
      <strong>${fmtPrice(tp.newPrice)}</strong> (${fmt(tp.distancePips, 0)} pips depuis l'entrée).
      Pour limiter la perte à <strong class="neg">−${fmt(p.targetLoss, 0)} ${accountCurr}</strong>, place ton SL à
      <strong>${fmtPrice(sl.newPrice)}</strong> (${fmt(sl.distancePips, 0)} pips).
      R/R : <strong>1:${rr}</strong> ${parseFloat(rr) < 1.5 ? '<span class="warn">— peu favorable</span>' : parseFloat(rr) >= 2 ? '<span class="pos">— solide</span>' : ''}.
    `;
  }

  // ─── A4 : Pip ↔ Price converter ───
  function renderA04(p) {
    const info = PIPS.PAIRS[p.pair];
    const fmtPrice = (v) => fmt(v, p.pair.includes('JPY') ? 2 : info.pipSize < 0.01 ? 4 : 2);

    // Convert pips → price
    const baseForConv = p.entryPrice || info.price;
    const ptp = MARGIN.pipsToPrice({
      pair: p.pair, basePrice: baseForConv, pips: p.pipsConv, direction: p.direction
    });
    $('mg-stat-pipsconv-result').textContent = fmtPrice(ptp.priceTarget);
    $('mg-stat-pipsconv-base').textContent = fmtPrice(baseForConv);

    // Convert price A → price B in pips
    if (p.priceA > 0 && p.priceB > 0) {
      const ptpr = MARGIN.priceToPips({ pair: p.pair, priceA: p.priceA, priceB: p.priceB });
      const sign = ptpr.pips >= 0 ? '+' : '';
      $('mg-stat-prtopips-result').textContent = sign + fmt(Math.abs(ptpr.pips), 0) + ' pips';
      $('mg-stat-prtopips-result').className = 'stat-value ' + (ptpr.pips >= 0 ? 'pos' : 'neg');
    } else {
      $('mg-stat-prtopips-result').textContent = '—';
    }
  }

  // ─── RUN ───
  function run() {
    if (typeof MARGIN === 'undefined' || typeof PIPS === 'undefined') return;
    const p = readParams();
    if (!p.entryPrice) {
      p.entryPrice = PIPS.PAIRS[p.pair].price;
      $('mg-entry').value = p.entryPrice;
    }
    updateParamSummary(p);
    renderA01(p);
    renderA02(p);
    renderA03(p);
    renderA04(p);

    if (CI && CI.setUrlParams) {
      CI.setUrlParams({
        pair: encodeURIComponent(p.pair), dir: p.direction,
        lot: p.lotSize, entry: p.entryPrice,
        lev: p.leverage, bal: p.balance, cur: p.accountCurr
      });
    }
  }

  function init() {
    if (CI && CI.initAll) CI.initAll();
    if (CI && CI.getUrlParam) {
      const pair = CI.getUrlParam('pair'); if (pair) $('mg-pair').value = decodeURIComponent(pair);
      const lot  = CI.getUrlParam('lot');  if (lot)  $('mg-lotsize').value = lot;
      const e    = CI.getUrlParam('entry');if (e)    $('mg-entry').value = e;
      const lev  = CI.getUrlParam('lev');  if (lev)  $('mg-leverage').value = lev;
      const bal  = CI.getUrlParam('bal');  if (bal)  $('mg-balance').value = bal;
      const cur  = CI.getUrlParam('cur');  if (cur)  $('mg-currency').value = cur;
      const dir  = CI.getUrlParam('dir');  if (dir)  document.querySelector(`input[name="mg-dir"][value="${dir}"]`)?.click();
    }
    updatePairDefaults();

    ['mg-pair','mg-lotsize','mg-entry','mg-leverage','mg-balance','mg-currency','mg-target-gain','mg-target-loss','mg-pips-conv','mg-price-a','mg-price-b'].forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('change', () => { if (id === 'mg-pair') updatePairDefaults(); run(); });
      if (el.tagName === 'INPUT') el.addEventListener('input', () => {
        clearTimeout(el._t); el._t = setTimeout(() => { if (id === 'mg-pair') updatePairDefaults(); run(); }, 150);
      });
    });
    document.querySelectorAll('input[name="mg-dir"]').forEach(r => r.addEventListener('change', run));

    const btn = $('mg-btn-calc'); if (btn) btn.addEventListener('click', run);
    run();
  }

  function safeInit() {
    try { init(); }
    catch(e) { console.error('[view] init failed:', e.message); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
  else safeInit();
})();
