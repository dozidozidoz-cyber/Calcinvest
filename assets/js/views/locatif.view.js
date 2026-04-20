/* ============================================================
   CalcInvest — Locatif VIEW (DOM binding)
   Reads form → calls CalcLocatif.calcLocatif(params) → renders
   ============================================================ */

(function () {
  'use strict';

  const calc     = window.CalcLocatif.calcLocatif;
  const calcComp = window.CalcLocatif.computeRegimeComparison;
  const calcPV   = window.CalcLocatif.computePlusValue;
  const num      = window.FIN.num;
  let lastParams = null;
  let lastResult = null;
  let la7Indexation = 0;

  /* ------------------------------------------------------------
     Read form inputs → params object
     ------------------------------------------------------------ */
  function readForm() {
    const $ = (id) => document.getElementById(id);
    const v = (id) => num($(id).value);
    return {
      price: v('l-price'),
      notary: v('l-notary'),
      agency: v('l-agency'),
      works: v('l-works'),
      furniture: v('l-furniture'),
      rent: v('l-rent'),
      vacancy: v('l-vacancy'),
      propTax: v('l-proptax'),
      copro: v('l-copro'),
      insurance: v('l-insurance'),
      mgmtPct: v('l-mgmt'),
      maintPct: v('l-maint'),
      loan: v('l-loan'),
      loanRate: v('l-loanrate'),
      loanYears: v('l-loanyears'),
      loanIns: v('l-loanins'),
      regime: $('l-regime').value,
      tmi: num($('l-tmi').value),
      holdYears: v('l-hold'),
      appreciation: v('l-appreciation')
    };
  }

  function writeForm(p) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    set('l-price', p.price);
    set('l-notary', p.notary);
    set('l-agency', p.agency);
    set('l-works', p.works);
    set('l-furniture', p.furniture);
    set('l-rent', p.rent);
    set('l-vacancy', p.vacancy);
    set('l-proptax', p.propTax);
    set('l-copro', p.copro);
    set('l-insurance', p.insurance);
    set('l-mgmt', p.mgmtPct);
    set('l-maint', p.maintPct);
    set('l-loan', p.loan);
    set('l-loanrate', p.loanRate);
    set('l-loanyears', p.loanYears);
    set('l-loanins', p.loanIns);
    set('l-regime', p.regime);
    set('l-tmi', p.tmi);
    set('l-hold', p.holdYears);
    set('l-appreciation', p.appreciation);
  }

  /* ------------------------------------------------------------
     Render
     ------------------------------------------------------------ */
  function renderAccordionSummaries(p) {
    const priceK = (p.price / 1000).toFixed(0);
    document.getElementById('l-sum-params').textContent =
      `${priceK} k€ · ${p.loanYears} ans @ ${p.loanRate.toFixed(2)} % · ${CI.fmtNum(p.rent)} €/mois · Horizon ${p.holdYears} ans`;
  }

  function renderStats(r) {
    const set = (id, val, fmt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = fmt ? fmt(val) : val;
    };
    const color = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('pos', 'neg', 'warn');
      if (v > 0) el.classList.add('pos');
      else if (v < 0) el.classList.add('neg');
    };

    set('s-yield-gross', r.yieldGross, (v) => CI.fmtPctPlain(v, 2));
    set('s-yield-net', r.yieldNet, (v) => CI.fmtPctPlain(v, 2));
    set('s-yield-netnet', r.yieldNetNet, (v) => CI.fmtPctPlain(v, 2));
    set('s-tri', r.tri, (v) => v == null ? '—' : CI.fmtPctPlain(v, 2));

    set('s-cashflow', r.cashflowMonthly, (v) => CI.fmtMoney(v, 0) + '/mois');
    color('s-cashflow', r.cashflowMonthly);
    set('s-enrich', r.enrichmentMonthly, (v) => CI.fmtMoney(v, 0) + '/mois');

    set('s-acq', r.totalAcquisition, (v) => CI.fmtMoney(v, 0));
    set('s-down', r.downPayment, (v) => CI.fmtMoney(v, 0));
    set('s-pmt', r.monthlyPayment, (v) => CI.fmtMoney(v, 0) + '/mois');
    set('s-equity', r.finalEquity, (v) => CI.fmtMoney(v, 0));
    color('s-equity', r.finalEquity);
  }

  function renderChart(r) {
    const labels = r.yearly.map((y) => 'An ' + y.year);
    CI.drawChart('l-chart', labels, [
      {
        label: 'Valeur du bien',
        data: r.yearly.map((y) => y.propertyValue),
        color: '#FBBF24',
        width: 2
      },
      {
        label: 'Patrimoine net',
        data: r.yearly.map((y) => y.equity),
        color: '#34D399',
        fill: true,
        width: 2.5
      },
      {
        label: 'Capital restant dû',
        data: r.yearly.map((y) => y.balance),
        color: '#F87171',
        width: 2,
        dash: [4, 4]
      }
    ], {
      yFormat: (v) => CI.fmtCompact(v)
    });
  }

  function renderTable(r) {
    const tbody = document.getElementById('l-tbody');
    tbody.innerHTML = r.yearly.map((y) => `
      <tr>
        <td>An ${y.year}</td>
        <td>${CI.fmtNum(y.rent, 0)}</td>
        <td>${CI.fmtNum(y.loanPayments, 0)}</td>
        <td>${CI.fmtNum(y.tax, 0)}</td>
        <td class="${y.cashflow >= 0 ? 'pos' : 'neg'}">${CI.fmtNum(y.cashflow, 0)}</td>
        <td class="pos">${CI.fmtNum(y.equity, 0)}</td>
      </tr>
    `).join('');
  }

  /* ------------------------------------------------------------
     A05 — Amortissement du crédit
     ------------------------------------------------------------ */
  function renderAmortCredit(r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (!r.amortSchedule || !r.amortSchedule.length) {
      ['la5-interest','la5-insurance','la5-cost','la5-pct'].forEach(id => set(id, '—'));
      const tb = document.getElementById('la5-tbody');
      if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">Aucun emprunt renseigné</td></tr>';
      return;
    }
    set('la5-interest',  CI.fmtMoney(r.totalInterest, 0));
    set('la5-insurance', CI.fmtMoney(r.totalInsurance, 0));
    set('la5-cost',      CI.fmtMoney(r.totalInterest + r.totalInsurance, 0));
    // Loan initial = balance yr1 + principal yr1
    const yr1 = r.amortSchedule[0];
    const loanInit = yr1 ? yr1.balance + yr1.principal : 0;
    set('la5-pct', loanInit > 0 ? ((r.totalInterest / loanInit) * 100).toFixed(1) + ' %' : '—');

    // Table
    const tbody = document.getElementById('la5-tbody');
    if (tbody) {
      tbody.innerHTML = r.amortSchedule.map(yr => {
        const total = yr.principal + yr.interest + yr.insurance;
        return `<tr>
          <td>An ${yr.year}</td>
          <td class="pos">${CI.fmtNum(yr.principal, 0)}</td>
          <td class="neg">${CI.fmtNum(yr.interest, 0)}</td>
          <td style="color:var(--text-3)">${CI.fmtNum(yr.insurance, 0)}</td>
          <td>${CI.fmtNum(total, 0)}</td>
          <td>${CI.fmtNum(yr.balance, 0)}</td>
        </tr>`;
      }).join('');
    }

    // Chart: cumulative principal / interest / balance
    let cumP = 0, cumI = 0;
    const cumPrincipal = [], cumInterest = [], balances = [];
    r.amortSchedule.forEach(yr => {
      cumP += yr.principal; cumI += yr.interest;
      cumPrincipal.push(cumP); cumInterest.push(cumI); balances.push(yr.balance);
    });
    requestAnimationFrame(() => {
      CI.drawChart('la5-chart', r.amortSchedule.map(yr => 'An ' + yr.year), [
        { data: balances,     color: '#FBBF24', width: 2,   dash: [4, 4] },
        { data: cumPrincipal, color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.1)', width: 2.5 },
        { data: cumInterest,  color: '#F87171', width: 2 }
      ], { yFormat: v => CI.fmtCompact(v) });
    });
  }

  /* ------------------------------------------------------------
     A06 — Comparaison fiscale 4 régimes
     ------------------------------------------------------------ */
  function renderFiscalComp(p) {
    const comp  = calcComp(p);
    const { results, bestId, worstId } = comp;
    const set   = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const best  = results.find(r => r.id === bestId);
    const worst = results.find(r => r.id === worstId);
    const curr  = results.find(r => r.id === p.regime);

    set('la6-best',     best.label);
    set('la6-best-sub', CI.fmtPctPlain(best.yieldNetNet, 2) + ' net-net');
    set('la6-worst',     worst.label);
    set('la6-worst-sub', CI.fmtPctPlain(worst.yieldNetNet, 2) + ' net-net');
    const saving = worst.year1Tax - best.year1Tax;
    set('la6-saving',  saving > 0 ? '+' + CI.fmtNum(Math.round(saving), 0) + ' €/an' : '—');
    set('la6-current', curr ? curr.label : p.regime);

    const cards = document.getElementById('la6-cards');
    if (!cards) return;
    const sorted = results.slice().sort((a, b) => b.yieldNetNet - a.yieldNetNet);
    cards.innerHTML = sorted.map(res => {
      const isBest    = res.id === bestId;
      const isWorst   = res.id === worstId;
      const isCurrent = res.id === p.regime;
      const border    = isBest ? 'var(--accent)' : isWorst ? 'var(--red)' : isCurrent ? 'var(--blue)' : 'var(--border-soft)';
      const badge     = isBest
        ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">OPTIMAL</span>'
        : isWorst
        ? '<span style="font-size:10px;background:var(--red);color:#fff;padding:2px 7px;border-radius:99px;font-weight:700">DÉFAV.</span>'
        : isCurrent
        ? '<span style="font-size:10px;background:var(--blue);color:#fff;padding:2px 7px;border-radius:99px;font-weight:700">ACTUEL</span>'
        : '';
      const amortLine = (res.id === 'lmnp-reel' && res.amortBuilding)
        ? `<div style="font-size:11px;color:var(--text-4);margin-top:4px">Amort. bâti : ${CI.fmtNum(Math.round(res.amortBuilding), 0)} €/an${res.amortFurniture ? ' · Mobilier : ' + CI.fmtNum(Math.round(res.amortFurniture), 0) + ' €/an' : ''}</div>`
        : '';
      return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:${isBest ? 'var(--accent)' : 'var(--text-1)'}">${res.label}</div>${badge}
        </div>
        <div style="font-size:22px;font-weight:700;color:${isBest ? 'var(--accent)' : 'var(--text-1)'}">
          ${CI.fmtPctPlain(res.yieldNetNet, 2)} <span style="font-size:12px;font-weight:400">net-net</span>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px">
          Impôts : ${CI.fmtNum(Math.round(res.year1Tax), 0)} €/an · CF : ${CI.fmtMoney(res.cashflowMonthly, 0)}/mois
        </div>
        <div style="font-size:11px;color:var(--text-4);margin-top:4px">${res.desc}</div>
        ${amortLine}
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------
     A07 — Cashflows projetés avec indexation
     ------------------------------------------------------------ */
  function renderCashflowProj(p) {
    const r   = calc(Object.assign({}, p, { rentIndexation: la7Indexation }));
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    const cf1   = (r.yearly[0]  ? r.yearly[0].cashflow  : 0) / 12;
    const cfn   = (r.yearly[r.yearly.length - 1] ? r.yearly[r.yearly.length - 1].cashflow : 0) / 12;
    const total = r.yearly.reduce((s, yr) => s + yr.cashflow, 0);

    let cumCF = 0, breakevenYear = null;
    const cumulArr = r.yearly.map(yr => { cumCF += yr.cashflow; if (cumCF >= 0 && breakevenYear === null) breakevenYear = yr.year; return cumCF; });

    set('la7-cf1',       CI.fmtMoney(cf1, 0) + '/mois'); cls('la7-cf1', cf1 >= 0 ? 'pos' : 'neg');
    set('la7-cfn',       CI.fmtMoney(cfn, 0) + '/mois'); cls('la7-cfn', cfn >= 0 ? 'pos' : 'neg');
    set('la7-total',     (total >= 0 ? '+' : '') + CI.fmtNum(Math.round(total), 0) + ' €'); cls('la7-total', total >= 0 ? 'pos' : 'neg');
    set('la7-breakeven', breakevenYear ? 'An ' + breakevenYear : 'Jamais'); cls('la7-breakeven', breakevenYear ? 'info' : 'neg');
    const metaEl = document.getElementById('la7-meta');
    if (metaEl) metaEl.textContent = la7Indexation > 0 ? 'Indexation loyers ' + la7Indexation + ' %/an' : 'Loyer fixe';

    requestAnimationFrame(() => {
      CI.drawChart('la7-chart', r.yearly.map(yr => 'An ' + yr.year), [
        { data: r.yearly.map(yr => yr.cashflow / 12), color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.08)', width: 2.5 },
        { data: cumulArr,                              color: '#60A5FA', width: 2 }
      ], { yFormat: v => CI.fmtCompact(v) });
    });
  }

  /* ------------------------------------------------------------
     A08 — Simulation de revente & plus-value
     ------------------------------------------------------------ */
  function renderRevente(p, r) {
    const yearEl  = document.getElementById('la8-year');
    const feesEl  = document.getElementById('la8-fees');
    const sellY   = Math.min(Math.max(1, yearEl ? (parseInt(yearEl.value) || p.holdYears) : p.holdYears), r.yearly.length);
    const agPct   = feesEl ? (parseFloat(feesEl.value) || 4) : 4;
    const yrData  = r.yearly[sellY - 1];
    if (!yrData) return;

    const pv  = calcPV(p.price, yrData.propertyValue, sellY, agPct, yrData.balance);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('la8-sale',    CI.fmtMoney(yrData.propertyValue, 0));
    set('la8-sale-sub', 'Frais agence : −' + CI.fmtNum(Math.round(pv.fees), 0) + ' € · Dette : ' + CI.fmtNum(Math.round(pv.debtBalance), 0) + ' €');
    set('la8-pv',      pv.pv > 0 ? '+' + CI.fmtNum(Math.round(pv.pv), 0) + ' €' : '0 €');
    cls('la8-pv',      pv.pv > 0 ? 'pos' : '');
    set('la8-tax',     pv.totalTax > 0 ? '−' + CI.fmtNum(Math.round(pv.totalTax), 0) + ' €' : '0 €');
    set('la8-tax-sub', 'IR : ' + CI.fmtNum(Math.round(pv.taxIR), 0) + ' € · PS : ' + CI.fmtNum(Math.round(pv.taxPS), 0) + ' €');
    set('la8-net',     CI.fmtMoney(pv.netVendeur, 0)); cls('la8-net', pv.netVendeur >= 0 ? 'pos' : 'neg');
    set('la8-abatt-ir', (pv.abattIR * 100).toFixed(0) + ' %');
    set('la8-abatt-ps', (pv.abattPS * 100).toFixed(1) + ' %');
    set('la8-ir-status', sellY >= 22 ? '✓ Exonéré IR' : sellY >= 6 ? (22 - sellY) + ' ans pour exonération' : (6 - sellY) + ' ans avant premier abattement');
    set('la8-ps-status', sellY >= 30 ? '✓ Exonéré PS' : sellY >= 6 ? (30 - sellY) + ' ans pour exonération' : (6 - sellY) + ' ans avant premier abattement');
    const metaEl = document.getElementById('la8-meta'); if (metaEl) metaEl.textContent = 'Revente an ' + sellY + ' · frais ' + agPct + ' %';

    // Chart: net vendeur + brut equity pour chaque année
    const labels   = r.yearly.map(yr => 'An ' + yr.year);
    const netArr   = r.yearly.map((yr, i) => calcPV(p.price, yr.propertyValue, i + 1, agPct, yr.balance).netVendeur);
    const brutArr  = r.yearly.map(yr => yr.equity);
    requestAnimationFrame(() => {
      CI.drawChart('la8-chart', labels, [
        { data: brutArr, color: '#FBBF24', width: 1.8, dash: [4, 4] },
        { data: netArr,  color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.1)', width: 2.5 }
      ], { yFormat: v => CI.fmtCompact(v) });
    });
  }

  /* ------------------------------------------------------------
     URL state (shareable)
     ------------------------------------------------------------ */
  const URL_KEYS = [
    'price', 'notary', 'agency', 'works', 'furniture',
    'rent', 'vacancy', 'propTax', 'copro', 'insurance', 'mgmtPct', 'maintPct',
    'loan', 'loanRate', 'loanYears', 'loanIns',
    'regime', 'tmi', 'holdYears', 'appreciation'
  ];

  function syncUrl(p) {
    const out = {};
    URL_KEYS.forEach((k) => { out[k] = p[k]; });
    CI.setUrlParams(out);
  }

  function loadFromUrl() {
    const defaults = {
      price: 200000, notary: 15000, agency: 0, works: 10000, furniture: 0,
      rent: 900, vacancy: 5,
      propTax: 1200, copro: 600, insurance: 300, mgmtPct: 0, maintPct: 1,
      loan: 180000, loanRate: 3.8, loanYears: 20, loanIns: 0.36,
      regime: 'reel-foncier', tmi: 30, holdYears: 20, appreciation: 1.5
    };
    URL_KEYS.forEach((k) => {
      const v = CI.getUrlParam(k);
      if (v !== null) {
        defaults[k] = (k === 'regime') ? v : num(v);
      }
    });
    return defaults;
  }

  /* ------------------------------------------------------------
     Actions publiques (bindées aux boutons en HTML)
     ------------------------------------------------------------ */
  function run() {
    const p = readForm();
    const r = calc(p);
    lastParams = p;
    lastResult = r;
    renderAccordionSummaries(p);
    renderStats(r);
    renderTable(r);
    renderAmortCredit(r);
    renderFiscalComp(p);
    renderCashflowProj(p);
    renderRevente(p, r);
    requestAnimationFrame(() => renderChart(r));
    syncUrl(p);
  }

  function share() {
    if (lastParams) syncUrl(lastParams);
    CI.copyShareUrl();
  }

  function print() { window.print(); }

  function reset() {
    // Reset via URL purge
    window.location.search = '';
  }

  function save() {
    if (!lastResult) {
      CI.toast('Lance un calcul d\'abord', 'error');
      return;
    }
    CI.promptSave('Locatif', lastParams, 'Projet Locatif', () => {});
  }

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    // Expose pour les onclick HTML
    window.runLocatif = run;
    window.shareLocatif = share;
    window.printLocatif = print;
    window.resetLocatif = reset;
    window.saveLocatif = save;

    // Load defaults + URL params
    writeForm(loadFromUrl());

    // Init UI components
    CI.initAll();

    // Bind recompute on input change (global params only — pas les contrôles inline des analyses)
    document.querySelectorAll('#params input, #params select').forEach((el) => {
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    // A07 — indexation loyers
    document.querySelectorAll('#la7-indexation-btns button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#la7-indexation-btns button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        la7Indexation = parseFloat(b.dataset.val) || 0;
        if (lastParams && lastResult) renderCashflowProj(lastParams);
      });
    });

    // A08 — année de revente & frais
    ['la8-year', 'la8-fees'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { if (lastParams && lastResult) renderRevente(lastParams, lastResult); });
    });
    // Pills la8-year → déclenchent 'input' via CI.initPills, donc couvert

    // Initial run
    setTimeout(run, 30);
  });

  window.addEventListener('resize', () => {
    if (lastResult) renderChart(lastResult);
  });
})();
