/* ============================================================
   CalcInvest — Locatif VIEW (DOM binding)
   Reads form → calls CalcLocatif.calcLocatif(params) → renders
   ============================================================ */

(function () {
  'use strict';

  const calc = window.CalcLocatif.calcLocatif;
  const num = window.FIN.num;
  let lastParams = null;
  let lastResult = null;

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
    // Chart après le prochain tick pour que le canvas soit layouté
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

    // Bind recompute on input change
    document.querySelectorAll('#page-locatif input, #page-locatif select').forEach((el) => {
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    // Initial run
    setTimeout(run, 30);
  });

  window.addEventListener('resize', () => {
    if (lastResult) renderChart(lastResult);
  });
})();
