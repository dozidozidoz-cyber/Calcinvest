/* ============================================================
   CalcInvest — PER VIEW (DOM binding)
   Reads form → calls CalcPER.* → renders 5 analyses
   ============================================================ */
(function () {
  'use strict';

  const PER = window.CalcPER;
  const num = window.FIN.num;

  let lastParams = null;
  let lastResult = null;

  /* Insight box helper */
  const INSIGHT_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5l-1.6-4.4L2 7.5l4.4-1.6z" stroke-linejoin="round"/></svg>';
  function setInsight(sectionId, html) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    let box = section.querySelector(':scope > .insight');
    if (!box) {
      box = document.createElement('div');
      box.className = 'insight';
      box.innerHTML = '<div class="insight-icon">' + INSIGHT_ICON + '</div><div class="insight-text"></div>';
      section.appendChild(box);
    }
    const txt = box.querySelector('.insight-text');
    if (txt) txt.innerHTML = html;
  }

  /* ------------------------------------------------------------
     Read form
     ------------------------------------------------------------ */
  function readForm() {
    const v = (id) => num(document.getElementById(id)?.value);
    return {
      currentAge:     v('per-age') || 35,
      retirementAge:  v('per-retire-age') || 65,
      currentSavings: v('per-initial') || 0,
      monthlyContrib: v('per-monthly') || 0,
      annualReturn:   v('per-return') || 6,
      feesPct:        v('per-fees') || 0,
      inflation:      v('per-inflation') || 0,
      tmiEntree:      parseFloat(document.getElementById('per-tmi-in').value) || 30,
      tmiSortie:      parseFloat(document.getElementById('per-tmi-out').value) || 11
    };
  }

  function writeForm(p) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('per-age', p.currentAge);
    set('per-retire-age', p.retirementAge);
    set('per-initial', p.currentSavings);
    set('per-monthly', p.monthlyContrib);
    set('per-return', p.annualReturn);
    set('per-fees', p.feesPct);
    set('per-inflation', p.inflation);
    set('per-tmi-in', p.tmiEntree);
    set('per-tmi-out', p.tmiSortie);
  }

  /* ------------------------------------------------------------
     URL state
     ------------------------------------------------------------ */
  const URL_KEYS = ['currentAge','retirementAge','currentSavings','monthlyContrib','annualReturn','feesPct','inflation','tmiEntree','tmiSortie'];
  function syncUrl(p) {
    const out = {};
    URL_KEYS.forEach((k) => { out[k] = p[k]; });
    CI.setUrlParams(out);
  }
  function loadFromUrl() {
    const defaults = {
      currentAge: 35, retirementAge: 65,
      currentSavings: 0, monthlyContrib: 200,
      annualReturn: 6, feesPct: 1, inflation: 2,
      tmiEntree: 30, tmiSortie: 11
    };
    URL_KEYS.forEach((k) => {
      const v = CI.getUrlParam(k);
      if (v !== null) defaults[k] = parseFloat(v);
    });
    return defaults;
  }

  /* ------------------------------------------------------------
     A01 — Synthèse
     ------------------------------------------------------------ */
  function renderA01(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('pa1-final', CI.fmtMoney(r.finalCapital, 0));
    set('pa1-final-real', p.inflation > 0 ? `Pouvoir d'achat : ${CI.fmtMoney(r.netCapitalReal, 0)} (après impôts, infl.)` : `Brut, avant impôts`);
    set('pa1-contrib', CI.fmtMoney(r.totalContributed, 0));
    set('pa1-contrib-sub', `${CI.fmtNum(p.monthlyContrib, 0)} €/mois × ${r.years} ans + initial`);
    set('pa1-gain', '+' + CI.fmtMoney(r.totalGain, 0));
    set('pa1-gain-pct', r.totalContributed > 0 ? `+${(r.totalGain / r.totalContributed * 100).toFixed(0)} % vs versé` : '—');
    set('pa1-tax-saving', CI.fmtMoney(r.cumulatedTaxSaving, 0));
    set('pa1-tax-saving-sub', `${CI.fmtMoney(r.annualTaxSaving, 0)}/an × ${r.years} ans à TMI ${p.tmiEntree} %`);

    // Insight A01
    const horizonAge = p.currentAge + r.years;
    setInsight('pa-synthese',
      `À <strong>${horizonAge} ans</strong>, votre PER aura accumulé <em>${CI.fmtMoney(r.finalCapital, 0)}</em> ` +
      `(versé ${CI.fmtMoney(r.totalContributed, 0)}, plus-values <span class="pos">${CI.fmtMoney(r.totalGain, 0)}</span>). ` +
      `Côté fiscal entrée : <strong>${CI.fmtMoney(r.cumulatedTaxSaving, 0)} d'impôts économisés</strong> sur ${r.years} ans à TMI ${p.tmiEntree} %. ` +
      `<span class="muted">Cet avantage est à pondérer avec l'imposition à la sortie — voir Analyse 03.</span>`
    );
  }

  /* ------------------------------------------------------------
     A02 — Trajectoire
     ------------------------------------------------------------ */
  function renderA02(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pa2-meta', `${p.currentAge} → ${p.currentAge + r.years} ans · ${p.annualReturn} %/an net ${p.feesPct} % frais`);

    const labels = r.yearly.map((y) => 'An ' + y.year);
    const dataCapital = r.yearly.map((y) => y.value);
    const dataContrib = r.yearly.map((y) => y.contributed);
    const dataTaxSav  = r.yearly.map((y) => y.cumTaxSaving);

    requestAnimationFrame(() => {
      CI.drawChart('pa2-chart', labels, [
        { label: 'Économie fiscale cumulée', data: dataTaxSav, color: '#D97706', width: 1.5, dash: [4, 3] },
        { label: 'Total versé',              data: dataContrib, color: '#2563EB', width: 1.8 },
        { label: 'Capital PER',              data: dataCapital, color: '#059669', fill: true, fillColor: 'rgba(5, 150, 105, 0.10)', width: 2.5 }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Insight A02
    const ratioGain = r.totalContributed > 0 ? r.totalGain / r.totalContributed : 0;
    setInsight('pa-trajectoire',
      `Sur <strong>${r.years} ans</strong>, vos versements (<em>${CI.fmtMoney(r.totalContributed, 0)}</em>) sont multipliés par ` +
      `<strong>×${(r.finalCapital / Math.max(1, r.totalContributed)).toFixed(2)}</strong> grâce aux intérêts composés. ` +
      `Les plus-values (<span class="pos">${CI.fmtMoney(r.totalGain, 0)}</span>) représentent ${(ratioGain * 100).toFixed(0)} % de plus que vos versements. ` +
      `<span class="muted">Plus la durée est longue, plus la part des intérêts pèse — d'où l'intérêt de commencer tôt.</span>`
    );
  }

  /* ------------------------------------------------------------
     A03 — Sortie capital vs rente
     ------------------------------------------------------------ */
  function renderA03(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('pa3-cap-net', CI.fmtMoney(r.netCapital, 0));
    set('pa3-cap-tax', `Brut ${CI.fmtMoney(r.finalCapital, 0)} − impôts ${CI.fmtMoney(r.taxOnExit, 0)}`);

    set('pa3-rente-monthly', CI.fmtMoney(r.rente.monthlyNet, 0) + '/mois');
    set('pa3-rente-horizon', `Sur ${r.rente.horizonYears} ans (jusqu'à ~95 ans)`);

    const renteTotal = r.rente.annualNet * r.rente.horizonYears;
    set('pa3-rente-total', CI.fmtMoney(renteTotal, 0));
    const diffRente = renteTotal - r.netCapital;
    set('pa3-rente-vs-cap', `${diffRente >= 0 ? '+' : ''}${CI.fmtMoney(diffRente, 0)} vs sortie capital`);

    set('pa3-cap-tax-total', '−' + CI.fmtMoney(r.taxOnExit, 0));
    set('pa3-cap-tax-detail', `IR sur versés ${CI.fmtMoney(r.taxBreakdown.onDeductible, 0)} · PFU sur PV ${CI.fmtMoney(r.taxBreakdown.onGains, 0)}`);

    // Insight A03
    const winnerLine = renteTotal > r.netCapital
      ? `La <strong>rente</strong> finit gagnante (<span class="pos">+${CI.fmtMoney(renteTotal - r.netCapital, 0)}</span> sur ${r.rente.horizonYears} ans), mais étalée — pas de capital disponible immédiatement.`
      : `Le <strong>capital</strong> est gagnant (<span class="pos">+${CI.fmtMoney(r.netCapital - renteTotal, 0)}</span>) — vous gardez la liberté de l'investir ou le dépenser à votre rythme.`;
    setInsight('pa-sortie',
      `Sortie capital : <em>${CI.fmtMoney(r.netCapital, 0)}</em> net après impôts. ` +
      `Sortie rente : <em>${CI.fmtMoney(r.rente.monthlyNet, 0)}/mois</em> pendant ${r.rente.horizonYears} ans. ` +
      winnerLine + ` <span class="muted">Choix selon votre besoin de liquidité et votre TMI à la retraite.</span>`
    );
  }

  /* ------------------------------------------------------------
     A04 — PER vs CTO
     ------------------------------------------------------------ */
  function renderA04(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('pa4-per-net', CI.fmtMoney(r.netCapital, 0));
    set('pa4-cto-net', CI.fmtMoney(r.cto.net, 0));
    set('pa4-cto-detail', `Versé net (après TMI) : ${CI.fmtMoney(r.cto.contributed, 0)}`);

    const delta = r.perVsCtoDelta;
    set('pa4-delta', (delta >= 0 ? '+' : '') + CI.fmtMoney(delta, 0));
    cls('pa4-delta', delta > 0 ? 'pos' : 'neg');
    cls('pa4-per-net', delta > 0 ? 'pos' : '');
    cls('pa4-cto-net', delta < 0 ? 'pos' : '');

    if (delta > 0) {
      set('pa4-verdict', `PER avantageux (TMI entrée > TMI sortie)`);
    } else if (delta < 0) {
      set('pa4-verdict', `CTO préférable (TMI sortie ≥ entrée)`);
    } else {
      set('pa4-verdict', 'Équivalent');
    }

    // Insight A04
    const advantageLine = delta > 0
      ? `Le PER vous fait gagner <span class="pos">${CI.fmtMoney(delta, 0)}</span> de plus que le CTO équivalent — l'arbitrage TMI ${p.tmiEntree} % → ${p.tmiSortie} % paie.`
      : delta < 0
      ? `Le CTO classique est <span class="warn">${CI.fmtMoney(Math.abs(delta), 0)} plus avantageux</span>. Avec votre TMI sortie ≥ entrée, le PER perd son intérêt fiscal.`
      : `Match nul : le PER et le CTO produisent le même résultat net.`;
    setInsight('pa-vscto',
      advantageLine + ` <span class="muted">Le PER apporte aussi un blocage des fonds jusqu'à la retraite — un avantage psychologique pour ne pas y toucher.</span>`
    );
  }

  /* ------------------------------------------------------------
     A05 — Sensibilité TMI
     ------------------------------------------------------------ */
  function renderA05(p, r) {
    const m = PER.sensitivityMatrix(p);
    const grid = document.getElementById('pa5-grid');
    if (!grid) return;

    let html = '<div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>TMI entrée ↓ / sortie →</th>';
    m.tmiSortieList.forEach((ts) => { html += `<th>${ts} %</th>`; });
    html += '</tr></thead><tbody>';

    m.rows.forEach((row) => {
      const isCurrentEntree = Math.abs(row.tmiEntree - p.tmiEntree) < 0.01;
      html += `<tr><td style="${isCurrentEntree ? 'font-weight:700;color:var(--accent)' : ''}">${row.tmiEntree} %</td>`;
      row.cells.forEach((cell) => {
        const isCurrent = isCurrentEntree && Math.abs(cell.tmiSortie - p.tmiSortie) < 0.01;
        const color = cell.delta > 0 ? 'var(--accent)' : cell.delta < 0 ? 'var(--red)' : 'var(--text-3)';
        const bg = isCurrent ? 'background:var(--accent-soft);font-weight:700;' : '';
        const sign = cell.delta >= 0 ? '+' : '';
        html += `<td style="${bg}color:${color};font-family:var(--font-mono)">${sign}${CI.fmtCompact(cell.delta)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    grid.innerHTML = html;

    // Insight A05
    const bestCell = m.rows.flatMap((row) => row.cells.map((c) => ({ ...c, tmiEntree: row.tmiEntree })))
      .reduce((best, c) => c.delta > best.delta ? c : best, { delta: -Infinity });
    setInsight('pa-sensitivity',
      `Le PER est <strong>maximalement avantageux</strong> avec TMI entrée ${bestCell.tmiEntree} % → sortie ${bestCell.tmiSortie} % ` +
      `(<span class="pos">+${CI.fmtCompact(bestCell.delta)}</span> vs CTO). ` +
      `<span class="muted">Règle d'or : ouvrir un PER quand on pense que sa TMI baissera à la retraite (haut salaire actif → revenus modestes en retraite).</span>`
    );
  }

  /* ------------------------------------------------------------
     run() — point d'entrée principal
     ------------------------------------------------------------ */
  function run() {
    const p = readForm();
    const r = PER.calcPER(p);
    lastParams = p;
    lastResult = r;

    // Update accordion summary
    const sum = document.getElementById('per-sum-params');
    if (sum) sum.textContent =
      `${p.currentAge} → ${p.retirementAge} ans · ${CI.fmtNum(p.monthlyContrib, 0)} €/mois · ${p.annualReturn} % · TMI ${p.tmiEntree}/${p.tmiSortie} %`;

    // Update topbar badge
    const ageBadge = document.getElementById('per-age-badge');
    if (ageBadge) ageBadge.textContent = p.retirementAge;

    renderA01(p, r);
    renderA02(p, r);
    renderA03(p, r);
    renderA04(p, r);
    renderA05(p, r);
    syncUrl(p);
  }

  /* ------------------------------------------------------------
     Public actions
     ------------------------------------------------------------ */
  window.runPER = run;
  window.savePER = function () {
    if (!lastResult) { CI.toast('Lance un calcul d\'abord', 'error'); return; }
    CI.promptSave('PER', lastParams, 'Mon plan PER', () => {});
  };
  window.sharePER = function () { if (lastParams) syncUrl(lastParams); CI.copyShareUrl(); };
  window.resetPER = function () { window.location.search = ''; };

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    writeForm(loadFromUrl());
    CI.initAll();

    document.querySelectorAll('#per-params input, #per-params select').forEach((el) => {
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    setTimeout(run, 30);
  });
})();
