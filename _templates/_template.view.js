/* ============================================================
   TEMPLATE VIEW — {{TOOL}}.view.js
   DOM binding. Reads form → calls core → renders UI.
   ============================================================ */

(function () {
  'use strict';

  const calc = window.Calc{{TOOL_CAMEL}}.calc{{TOOL_CAMEL}};
  const num = window.FIN.num;
  let lastParams = null;
  let lastResult = null;

  /* --------- Form IDs ---------
     Préfixer TOUS les IDs par 'x-' (remplacer par le préfixe de l'outil)
     ------------------------------------------------------------ */
  const URL_KEYS = ['capital', 'years', 'rate', 'option'];

  function readForm() {
    const $ = (id) => document.getElementById(id);
    const v = (id) => num($(id).value);
    return {
      capital: v('x-field1'),
      years:   v('x-field2'),
      option:  $('x-option').value
      // ajouter tous les inputs ici
    };
  }

  function writeForm(p) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el != null) el.value = val;
    };
    set('x-field1', p.capital);
    set('x-field2', p.years);
    set('x-option', p.option);
  }

  /* --------- Render ---------- */
  function renderSummary(p) {
    const el = document.getElementById('x-sum-params');
    if (el) el.textContent = `${CI.fmtNum(p.capital)} € · ${p.years} ans`;
  }

  function renderStats(r) {
    const set = (id, val, fmt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = fmt ? fmt(val) : val;
    };
    set('x-kpi1', r.finalValue,   (v) => CI.fmtMoney(v, 0));
    set('x-kpi2', r.totalGain,    (v) => CI.fmtMoney(v, 0));
    set('x-kpi3', r.totalGainPct, (v) => CI.fmtPctPlain(v, 1));
    // set('x-kpi4', r.xxx, fmt)
  }

  function renderChart(r) {
    const labels = r.yearly.map((y) => 'An ' + y.year);
    CI.drawChart('x-chart', labels, [
      {
        label: 'Valeur',
        data: r.yearly.map((y) => y.value),
        color: '#34D399',
        fill: true,
        width: 2.5
      }
      // Ajouter d'autres datasets si besoin
    ], {
      yFormat: (v) => CI.fmtCompact(v)
    });
  }

  /* --------- URL state ---------- */
  function syncUrl(p) {
    const out = {};
    URL_KEYS.forEach((k) => { out[k] = p[k]; });
    CI.setUrlParams(out);
  }

  function loadFromUrl() {
    const defaults = {
      capital: 10000,
      years: 20,
      rate: 7,
      option: 'b'
      // mettre les defaults de TOUS les champs
    };
    URL_KEYS.forEach((k) => {
      const v = CI.getUrlParam(k);
      if (v !== null) {
        defaults[k] = (typeof defaults[k] === 'string') ? v : num(v);
      }
    });
    return defaults;
  }

  /* --------- Actions publiques ---------- */
  function run() {
    const p = readForm();
    const r = calc(p);
    lastParams = p;
    lastResult = r;
    renderSummary(p);
    renderStats(r);
    requestAnimationFrame(() => renderChart(r));
    syncUrl(p);
  }

  function share() {
    if (lastParams) syncUrl(lastParams);
    CI.copyShareUrl();
  }

  function reset() {
    window.location.search = '';
  }

  function save() {
    if (!lastResult) {
      CI.toast("Lance un calcul d'abord", 'error');
      return;
    }
    CI.promptSave('{{TOOL_CAMEL}}', lastParams, 'Projet {{TOOL_CAMEL}}', () => {});
  }

  /* --------- Init ---------- */
  window.addEventListener('DOMContentLoaded', () => {
    // Expose pour onclick HTML
    window['run{{TOOL_CAMEL}}'] = run;
    window['share{{TOOL_CAMEL}}'] = share;
    window['reset{{TOOL_CAMEL}}'] = reset;
    window['save{{TOOL_CAMEL}}'] = save;

    writeForm(loadFromUrl());
    CI.initAll();

    // Recompute on any input change
    document.querySelectorAll('#page-{{TOOL}} input, #page-{{TOOL}} select').forEach((el) => {
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    setTimeout(run, 30);
  });

  window.addEventListener('resize', () => {
    if (lastResult) renderChart(lastResult);
  });
})();

/*
  ========== CHECKLIST ==========
  - Remplacer {{TOOL}} et {{TOOL_CAMEL}} (cf. _template.html)
  - Mettre à jour URL_KEYS avec tous les paramètres à partager dans l'URL
  - readForm : lister TOUS les IDs de la page
  - writeForm : mettre les valeurs sur TOUS les IDs
  - loadFromUrl : défauts pour TOUS les paramètres
  - renderStats : un set(…) par KPI dans le HTML
  - renderChart : adapter les datasets selon la nature des données
*/
