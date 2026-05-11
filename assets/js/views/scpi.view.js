/* ============================================================
   CalcInvest — Vue Simulateur SCPI
   Binding DOM uniquement. Logique métier dans core/calc-scpi.js
   ============================================================ */
(function () {
  'use strict';

  // ─── helpers ────────────────────────────────────────────
  const $  = (id) => document.getElementById(id);
  const fmtM = (n) => (CI && CI.fmtMoney) ? CI.fmtMoney(n, 0) : Math.round(n).toLocaleString('fr-FR') + ' €';
  const fmtP = (n) => (CI && CI.fmtPctPlain) ? CI.fmtPctPlain(n, 2) : n.toFixed(2) + ' %';

  // Map régime → libellé court
  const REGIME_LABEL = {
    PP: 'Pleine propriété',
    EU: 'SCPI européenne',
    AV: 'Assurance-vie',
    NP: 'Nue-propriété'
  };

  function readParams() {
    return {
      K0:           parseFloat($('sc-k0').value)        || 0,
      monthly:      parseFloat($('sc-monthly').value)   || 0,
      years:        parseFloat($('sc-years').value)     || 20,
      tdvm:         parseFloat($('sc-tdvm').value)      || 5.5,
      reval:        parseFloat($('sc-reval').value)     || 1.0,
      fraisEntree:  parseFloat($('sc-fees').value)      || 10,
      tmi:          parseFloat($('sc-tmi').value)       || 30,
      ps:           17.2,
      regime:       $('sc-regime').value || 'PP'
    };
  }

  function updateParamSummary(p) {
    const sum = $('sc-sum-params');
    if (!sum) return;
    sum.textContent = `${fmtM(p.K0)} initial · ${fmtM(p.monthly)}/mois · ${p.years} ans · ${REGIME_LABEL[p.regime]}`;
  }

  // ─── Analyse 01 : Synthèse ─────────────────────────────
  function renderA01(p, r) {
    const s = r.summary;

    $('sc-stat-capital').textContent  = fmtM(s.capitalFinal);
    $('sc-stat-verse').textContent    = fmtM(s.verseTotal);
    $('sc-stat-divnet').textContent   = fmtM(s.dividendesNets);
    $('sc-stat-tri').textContent      = fmtP(s.tri);

    $('sc-stat-pv').textContent       = fmtM(s.plusValueCapital);
    $('sc-stat-pv').className         = 'stat-value ' + (s.plusValueCapital >= 0 ? 'pos' : 'neg');

    $('sc-stat-cf').textContent       = fmtM(s.cashflowMensuelMoyen) + '/mois';
    $('sc-stat-tax').textContent      = fmtM(s.impotsTotaux);
    $('sc-stat-yield').textContent    = fmtP(s.yieldNet);

    // Chart : valorisation + dividendes cumulés vs versé
    const serie = r.serie;
    const N     = serie.length;
    const labels = serie.map(pt => (pt.month / 12).toFixed(1));

    const dataValue   = serie.map(pt => pt.value);
    const dataVerse   = serie.map(pt => pt.cashOut);
    const dataDivCum  = serie.map(pt => pt.cumDivNet);

    CI.drawChart('sc-chart-a01', labels, [
      { data: dataValue,  color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.18)', width: 2,   label: 'Valeur parts' },
      { data: dataVerse,  color: '#9CA3AF', dash: [4, 3], width: 1.5,                       label: 'Versements cumulés' },
      { data: dataDivCum, color: '#2563EB', width: 1.8,                                     label: 'Dividendes nets cumulés' }
    ], { xLabel: 'Années', yLabel: '€', yFormat: 'money' });

    // Insight
    const triPos = s.tri >= 0;
    $('sc-insight-a01').innerHTML = `
      Sur <strong>${p.years} ans</strong>, votre SCPI en
      <em>${REGIME_LABEL[p.regime]}</em> génère <strong>${fmtM(s.dividendesNets)}</strong>
      de dividendes nets cumulés, pour un TRI annualisé de
      <span class="${triPos ? 'pos' : 'neg'}">${fmtP(s.tri)}</span>.
      Capital final : <strong>${fmtM(s.capitalFinal)}</strong>
      vs <strong>${fmtM(s.verseTotal)}</strong> investis.
    `;
  }

  // ─── Analyse 02 : Cashflow annuel ──────────────────────
  function renderA02(p, r) {
    const serie = r.serie;
    // Agrégation par année
    const years = p.years;
    const yearly = [];
    for (let y = 1; y <= years; y++) {
      const start = (y - 1) * 12 + 1;
      const end   = y * 12;
      let divBrut = 0, divNet = 0, tax = 0;
      for (let m = start; m <= end && m < serie.length; m++) {
        divBrut += serie[m].divBrut;
        divNet  += serie[m].divNet;
        tax     += serie[m].tax;
      }
      yearly.push({ year: y, divBrut, divNet, tax });
    }

    const labels = yearly.map(y => 'A' + y);
    const dataNet = yearly.map(y => y.divNet);
    const dataTax = yearly.map(y => y.tax);

    CI.drawChart('sc-chart-a02', labels, [
      { data: dataNet, color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.20)', width: 2,   label: 'Net' },
      { data: dataTax, color: '#DC2626', width: 1.5, dash: [3, 3],                       label: 'Impôts' }
    ], { xLabel: 'Année', yLabel: '€', yFormat: 'money' });

    // Tableau
    const tbody = $('sc-table-a02');
    if (tbody) {
      tbody.innerHTML = yearly.map(y => `
        <tr>
          <td>A${y.year}</td>
          <td>${fmtM(y.divBrut)}</td>
          <td class="neg">${fmtM(-y.tax)}</td>
          <td class="pos">${fmtM(y.divNet)}</td>
        </tr>
      `).join('');
    }

    // Insight
    const cfMonthly = r.summary.cashflowMensuelMoyen;
    $('sc-insight-a02').innerHTML = `
      Cashflow moyen <strong>${fmtM(cfMonthly)}/mois</strong> net d'impôts.
      Sur la durée, vous touchez <strong>${fmtM(r.summary.dividendesNets)}</strong>
      de loyers nets — soit <em>${(r.summary.dividendesNets / p.years / 12).toFixed(0)} €/mois en moyenne</em>.
    `;
  }

  // ─── Analyse 03 : Comparaison régimes (PREMIUM) ───────
  function renderA03(p) {
    if (typeof SCPI === 'undefined' || !SCPI.compareRegimes) return;
    const data = SCPI.compareRegimes(p);

    const tbody = $('sc-table-a03');
    if (!tbody) return;

    tbody.innerHTML = data.map(d => `
      <tr>
        <td><strong>${REGIME_LABEL[d.regime]}</strong></td>
        <td>${fmtM(d.capitalFinal)}</td>
        <td>${fmtM(d.dividendesNets)}</td>
        <td class="neg">${fmtM(-d.impotsTotaux)}</td>
        <td><strong>${fmtM(d.totalRetour)}</strong></td>
        <td class="${d.tri >= 0 ? 'pos' : 'neg'}">${fmtP(d.tri)}</td>
      </tr>
    `).join('');

    // Chart : barres horizontales par régime (total retour)
    const labels = data.map(d => REGIME_LABEL[d.regime]);
    const dataTotal = data.map(d => d.totalRetour);

    CI.drawChart('sc-chart-a03', labels, [
      { data: dataTotal, color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.25)', width: 2.5, label: 'Total net' }
    ], { xLabel: 'Régime', yLabel: '€', yFormat: 'money' });

    // Trouver le meilleur
    const best = data.reduce((a, b) => b.totalRetour > a.totalRetour ? b : a);
    $('sc-insight-a03').innerHTML = `
      Sur <strong>${p.years} ans</strong>, le meilleur régime fiscal est
      <em>${REGIME_LABEL[best.regime]}</em> avec un total net de
      <strong class="pos">${fmtM(best.totalRetour)}</strong> et un TRI de <strong>${fmtP(best.tri)}</strong>.
      L'écart fiscal peut atteindre <strong>${fmtM(best.totalRetour - data[0].totalRetour)}</strong> par rapport à la pleine propriété.
    `;
  }

  // ─── Analyse 04 : Stress test (PREMIUM) ───────────────
  function renderA04(p) {
    if (typeof SCPI === 'undefined' || !SCPI.stressTest) return;
    const data = SCPI.stressTest(p);

    const tbody = $('sc-table-a04');
    if (!tbody) return;

    const base = data[0];
    tbody.innerHTML = data.map(d => {
      const diff = d.totalRetour - base.totalRetour;
      const pct  = base.totalRetour > 0 ? (diff / base.totalRetour) * 100 : 0;
      return `
        <tr>
          <td><strong>${d.name}</strong></td>
          <td>${fmtM(d.capitalFinal)}</td>
          <td>${fmtM(d.dividendesNets)}</td>
          <td><strong>${fmtM(d.totalRetour)}</strong></td>
          <td class="${pct >= 0 ? 'pos' : 'neg'}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %</td>
        </tr>
      `;
    }).join('');

    const worst = data[data.length - 1];
    $('sc-insight-a04').innerHTML = `
      Dans le scénario le plus défavorable (<em>${worst.name}</em>),
      votre TRI passe de <strong>${fmtP(base.tri)}</strong> à
      <span class="neg">${fmtP(worst.tri)}</span> — soit
      <strong class="neg">${fmtM(worst.totalRetour - base.totalRetour)}</strong> de moins
      sur ${p.years} ans.
    `;
  }

  // ─── Analyse 05 : SCPI vs alternatives (PREMIUM) ──────
  function renderA05(p) {
    if (typeof SCPI === 'undefined' || !SCPI.compareAlternatives) return;
    const data = SCPI.compareAlternatives(p);

    const tbody = $('sc-table-a05');
    if (!tbody) return;

    tbody.innerHTML = data.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td>${fmtM(d.verse)}</td>
        <td><strong>${fmtM(d.total)}</strong></td>
        <td class="${d.total >= d.verse ? 'pos' : 'neg'}">${fmtM(d.total - d.verse)}</td>
      </tr>
    `).join('');

    // Chart
    const labels = data.map(d => d.name);
    const dataTotal = data.map(d => d.total);

    CI.drawChart('sc-chart-a05', labels, [
      { data: dataTotal, color: '#2563EB', fill: true, fillColor: 'rgba(37,99,235,0.20)', width: 2 }
    ], { xLabel: 'Placement', yLabel: '€', yFormat: 'money' });

    const scpiTotal = data[0].total;
    const best = data.reduce((a, b) => b.total > a.total ? b : a);
    const bestIsScpi = best.name.startsWith('SCPI');
    $('sc-insight-a05').innerHTML = bestIsScpi
      ? `Votre SCPI surperforme toutes les alternatives. Capital final <strong class="pos">${fmtM(scpiTotal)}</strong>,
         soit <strong>${fmtM(scpiTotal - data[1].total)}</strong> de plus que le Livret A.`
      : `Sur ces hypothèses, <em>${best.name}</em> bat la SCPI de
         <strong class="warn">${fmtM(best.total - scpiTotal)}</strong>.
         Mais la SCPI offre du <strong>cashflow récurrent</strong>, contrairement à un ETF capitalisant.`;
  }

  // ─── RUN ────────────────────────────────────────────────
  function run() {
    if (typeof SCPI === 'undefined' || !SCPI.calcSCPI) {
      console.error('[scpi.view] core SCPI module non chargé');
      return;
    }

    const p = readParams();
    const r = SCPI.calcSCPI(p);

    updateParamSummary(p);
    renderA01(p, r);
    renderA02(p, r);
    renderA03(p);
    renderA04(p);
    renderA05(p);

    // Update URL
    if (CI && CI.setUrlParams) {
      CI.setUrlParams({
        k0: p.K0, m: p.monthly, y: p.years,
        td: p.tdvm, rv: p.reval, fe: p.fraisEntree,
        tmi: p.tmi, rg: p.regime
      });
    }
  }

  // ─── INIT ───────────────────────────────────────────────
  function init() {
    if (CI && CI.initAll) CI.initAll();

    // Restore depuis URL si présent
    if (CI && CI.getUrlParam) {
      const k0 = CI.getUrlParam('k0');  if (k0)  $('sc-k0').value      = k0;
      const m  = CI.getUrlParam('m');   if (m)   $('sc-monthly').value = m;
      const y  = CI.getUrlParam('y');   if (y)   $('sc-years').value   = y;
      const td = CI.getUrlParam('td');  if (td)  $('sc-tdvm').value    = td;
      const rv = CI.getUrlParam('rv');  if (rv)  $('sc-reval').value   = rv;
      const fe = CI.getUrlParam('fe');  if (fe)  $('sc-fees').value    = fe;
      const tmi = CI.getUrlParam('tmi'); if (tmi) $('sc-tmi').value     = tmi;
      const rg = CI.getUrlParam('rg');  if (rg)  $('sc-regime').value  = rg;
    }

    // Re-run sur changement
    ['sc-k0','sc-monthly','sc-years','sc-tdvm','sc-reval','sc-fees','sc-tmi','sc-regime'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', run);
      if (el && el.tagName === 'INPUT') el.addEventListener('input', () => {
        // debounce léger
        clearTimeout(el._t);
        el._t = setTimeout(run, 200);
      });
    });

    // Bouton "Calculer"
    const btn = $('sc-btn-calc');
    if (btn) btn.addEventListener('click', run);

    // Bouton "Sauvegarder projet"
    const btnSave = $('sc-btn-save');
    if (btnSave && CI && CI.promptSave) {
      btnSave.addEventListener('click', () => {
        const p = readParams();
        CI.promptSave('scpi', p, 'Mon investissement SCPI', () => {
          CI.toast && CI.toast('Projet enregistré ✓', 'success');
        });
      });
    }

    // Premier calcul
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
