/* ============================================================
   CalcInvest — Vue Simulateur SCPI (rebuild)
   Hero result panel + analyses fiabilisées
   ============================================================ */
(function () {
  'use strict';

  const $  = (id) => document.getElementById(id);
  const fmtM = (n) => (window.CI && CI.fmtMoney) ? CI.fmtMoney(n, 0) : (Number.isFinite(n) ? Math.round(n).toLocaleString('fr-FR') + ' €' : '—');
  const fmtP = (n) => (window.CI && CI.fmtPctPlain) ? CI.fmtPctPlain(n, 2) : (Number.isFinite(n) ? n.toFixed(2) + ' %' : '—');
  const fmtCompact = (n) => (window.CI && CI.fmtCompact) ? CI.fmtCompact(n) : fmtM(n);

  const REGIME_LABEL = {
    PP: 'Pleine propriété',
    EU: 'SCPI européenne',
    AV: 'Assurance-vie',
    NP: 'Nue-propriété'
  };

  function num(id, fb) {
    const el = $(id);
    if (!el) return fb;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fb;
  }

  function readParams() {
    return {
      K0:           num('sc-k0', 20000),
      monthly:      num('sc-monthly', 0),
      years:        num('sc-years', 20),
      tdvm:         num('sc-tdvm', 5.5),
      reval:        num('sc-reval', 1.0),
      fraisEntree:  num('sc-fees', 10),
      tmi:          num('sc-tmi', 30),
      ps:           17.2,
      regime:       ($('sc-regime') ? $('sc-regime').value : 'PP') || 'PP',
      targetRente:  num('sc-target-rente', 500)
    };
  }

  function safeText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }
  function safeHtml(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  function updateParamSummary(p) {
    safeText('sc-sum-params',
      `${fmtM(p.K0)} initial · ${fmtM(p.monthly)}/mois · ${p.years} ans · ${REGIME_LABEL[p.regime] || p.regime}`);
  }

  // ─── HERO PANEL ────────────────────────────────────────
  function renderHero(p, r) {
    const s = r.summary;
    safeText('sc-hero-monthly', fmtM(s.cashflowMensuelMoyen) + '/mois');
    safeText('sc-hero-monthly-sub', `moyen sur ${p.years} ans · ${REGIME_LABEL[p.regime] || p.regime}`);
    safeText('sc-hero-capital', fmtM(s.capitalFinal));
    safeText('sc-hero-capital-sub', `vs ${fmtM(s.verseTotal)} versés`);
    safeText('sc-hero-tri', fmtP(s.tri));
    safeText('sc-hero-verse', fmtM(s.verseTotal));

    // Message contextuel
    const triNet = s.tri;
    const pvCap  = s.plusValueCapital;
    let msg = `Sur <strong>${p.years} ans</strong>, votre placement génère <strong>${fmtM(s.dividendesNets)}</strong> de dividendes nets cumulés et le capital évolue de ${fmtM(s.verseTotal)} versés à <strong>${fmtM(s.capitalFinal)}</strong>`;
    msg += pvCap >= 0
      ? ` (<span style="color:#059669;font-weight:600">+${fmtM(pvCap)} de plus-value</span>).`
      : ` (<span style="color:var(--red);font-weight:600">${fmtM(pvCap)} après frais d'entrée</span>).`;
    msg += ` TRI net <strong>${fmtP(triNet)}</strong>`;
    if (triNet >= 5) msg += ' — excellent.';
    else if (triNet >= 3) msg += ' — correct.';
    else msg += ' — modeste, voyez les comparaisons fiscales ci-dessous.';
    safeHtml('sc-hero-msg', msg);
  }

  // ─── ANALYSE 01 : Synthèse + chart ─────────────────────
  function renderA01(p, r) {
    const s = r.summary;
    safeText('sc-stat-capital',  fmtM(s.capitalFinal));
    safeText('sc-stat-verse',    fmtM(s.verseTotal));
    safeText('sc-stat-divnet',   fmtM(s.dividendesNets));
    safeText('sc-stat-tri',      fmtP(s.tri));
    safeText('sc-stat-pv',       fmtM(s.plusValueCapital));
    const pvEl = $('sc-stat-pv');
    if (pvEl) pvEl.className = 'stat-value ' + (s.plusValueCapital >= 0 ? 'pos' : 'neg');
    safeText('sc-stat-cf',       fmtM(s.cashflowMensuelMoyen) + '/mois');
    safeText('sc-stat-tax',      fmtM(s.impotsTotaux));
    safeText('sc-stat-yield',    fmtP(s.yieldNet));

    // Chart trois courbes
    const serie = r.serie;
    if (serie && serie.length > 1) {
      const labels    = serie.map(pt => (pt.month / 12).toFixed(1));
      const dataValue = serie.map(pt => pt.value);
      const dataVerse = serie.map(pt => pt.cashOut);
      const dataDivCum = serie.map(pt => pt.cumDivNet);

      if (window.CI && CI.drawChart) {
        CI.drawChart('sc-chart-a01', labels, [
          { data: dataValue,  color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.18)', width: 2,   label: 'Valeur parts' },
          { data: dataVerse,  color: '#9CA3AF', dash: [4, 3], width: 1.5,                       label: 'Versé cumulé' },
          { data: dataDivCum, color: '#2563EB', width: 1.8,                                     label: 'Dividendes nets cum.' }
        ], { xLabel: 'Années', yLabel: '€', yFormat: 'money' });
      }
    }

    const triPos = s.tri >= 0;
    safeHtml('sc-insight-a01', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1"/></svg></div><div class="insight-text">
      Sur <strong>${p.years} ans</strong> en <em>${REGIME_LABEL[p.regime] || p.regime}</em>,
      vous touchez <strong>${fmtM(s.dividendesNets)}</strong> de dividendes nets cumulés (TRI <span class="${triPos ? 'pos' : 'neg'}">${fmtP(s.tri)}</span>).
      Capital final : <strong>${fmtM(s.capitalFinal)}</strong> vs <strong>${fmtM(s.verseTotal)}</strong> investis.
    </div>`);
  }

  // ─── ANALYSE 02 : Cashflow annuel ──────────────────────
  function renderA02(p, r) {
    const serie = r.serie;
    if (!serie || serie.length < 12) return;

    // Agrégation par année
    const yearly = [];
    for (let y = 1; y <= p.years; y++) {
      const start = (y - 1) * 12 + 1;
      const end   = Math.min(y * 12, serie.length - 1);
      let divBrut = 0, divNet = 0, tax = 0;
      for (let m = start; m <= end; m++) {
        divBrut += serie[m].divBrut || 0;
        divNet  += serie[m].divNet  || 0;
        tax     += serie[m].tax     || 0;
      }
      yearly.push({ year: y, divBrut, divNet, tax });
    }

    const labels  = yearly.map(y => 'A' + y.year);
    const dataNet = yearly.map(y => y.divNet);
    const dataTax = yearly.map(y => y.tax);

    if (window.CI && CI.drawChart) {
      CI.drawChart('sc-chart-a02', labels, [
        { data: dataNet, color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.20)', width: 2,   label: 'Net' },
        { data: dataTax, color: '#DC2626', width: 1.5, dash: [3, 3],                       label: 'Impôts' }
      ], { xLabel: 'Année', yLabel: '€', yFormat: 'money' });
    }

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

    const cfMonthly = r.summary.cashflowMensuelMoyen;
    const lastYearNet = yearly[yearly.length - 1]?.divNet || 0;
    safeHtml('sc-insight-a02', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 12l4-4 3 3 5-6"/></svg></div><div class="insight-text">
      Cashflow moyen <strong>${fmtM(cfMonthly)}/mois</strong> net d'impôts.
      Année finale : <strong>${fmtM(lastYearNet / 12)}/mois</strong> net (effet revalorisation + DCA).
      Sur la durée, vous touchez <strong>${fmtM(r.summary.dividendesNets)}</strong> de loyers nets cumulés.
    </div>`);
  }

  // ─── ANALYSE 03 : Comparaison régimes ──────────────────
  function renderA03(p) {
    if (!window.SCPI || !SCPI.compareRegimes) return;
    const data = SCPI.compareRegimes(p);

    const tbody = $('sc-table-a03');
    if (tbody) {
      tbody.innerHTML = data.map(d => `
        <tr ${d.regime === p.regime ? 'style="background:rgba(5,150,105,0.06)"' : ''}>
          <td><strong>${REGIME_LABEL[d.regime] || d.regime}</strong>${d.regime === p.regime ? ' <span style="color:#059669;font-size:11px">(votre choix)</span>' : ''}</td>
          <td>${fmtM(d.capitalFinal)}</td>
          <td>${fmtM(d.dividendesNets)}</td>
          <td class="neg">${fmtM(-d.impotsTotaux)}</td>
          <td><strong>${fmtM(d.totalRetour)}</strong></td>
          <td class="${d.tri >= 0 ? 'pos' : 'neg'}">${fmtP(d.tri)}</td>
        </tr>
      `).join('');
    }

    const labels = data.map(d => REGIME_LABEL[d.regime] || d.regime);
    const dataTotal = data.map(d => d.totalRetour);

    if (window.CI && CI.drawChart) {
      CI.drawChart('sc-chart-a03', labels, [
        { data: dataTotal, color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.25)', width: 2.5, label: 'Total net' }
      ], { xLabel: 'Régime', yLabel: '€', yFormat: 'money' });
    }

    const best = data.reduce((a, b) => b.totalRetour > a.totalRetour ? b : a);
    const yours = data.find(d => d.regime === p.regime) || data[0];
    const ecart = best.totalRetour - yours.totalRetour;
    safeHtml('sc-insight-a03', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 8l3 3 7-7"/></svg></div><div class="insight-text">
      Meilleur régime sur ${p.years} ans : <em>${REGIME_LABEL[best.regime]}</em> avec
      <strong class="pos">${fmtM(best.totalRetour)}</strong> nets cumulés.
      ${ecart > 0
        ? `Votre choix actuel (<em>${REGIME_LABEL[p.regime]}</em>) laisse <strong class="warn">${fmtM(ecart)}</strong> sur la table.`
        : `<span class="pos">Vous êtes déjà sur le meilleur régime fiscal pour ces paramètres.</span>`}
    </div>`);
  }

  // ─── ANALYSE 04 : Stress test ──────────────────────────
  function renderA04(p) {
    if (!window.SCPI || !SCPI.stressTest) return;
    const data = SCPI.stressTest(p);
    const base = data[0];

    const tbody = $('sc-table-a04');
    if (tbody) {
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
    }

    const worst = data[data.length - 1];
    safeHtml('sc-insight-a04', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 14l5-10 4 6 3-4"/></svg></div><div class="insight-text">
      Scénario le plus dur (<em>${worst.name}</em>) : TRI <strong>${fmtP(base.tri)} → <span class="neg">${fmtP(worst.tri)}</span></strong>,
      soit <strong class="neg">${fmtM(worst.totalRetour - base.totalRetour)}</strong> de moins sur ${p.years} ans.
      Le pire scénario garde-t-il un sens vs un Livret A ? Vérifiez l'analyse 05.
    </div>`);
  }

  // ─── ANALYSE 05 : SCPI vs alternatives ─────────────────
  function renderA05(p) {
    if (!window.SCPI || !SCPI.compareAlternatives) return;
    const data = SCPI.compareAlternatives(p);

    const tbody = $('sc-table-a05');
    if (tbody) {
      tbody.innerHTML = data.map(d => `
        <tr>
          <td><strong>${d.name}</strong></td>
          <td>${fmtM(d.verse)}</td>
          <td><strong>${fmtM(d.total)}</strong></td>
          <td class="${d.total >= d.verse ? 'pos' : 'neg'}">${fmtM(d.total - d.verse)}</td>
        </tr>
      `).join('');
    }

    const labels = data.map(d => d.name);
    const dataTotal = data.map(d => d.total);

    if (window.CI && CI.drawChart) {
      CI.drawChart('sc-chart-a05', labels, [
        { data: dataTotal, color: '#2563EB', fill: true, fillColor: 'rgba(37,99,235,0.20)', width: 2 }
      ], { xLabel: 'Placement', yLabel: '€', yFormat: 'money' });
    }

    const scpiTotal = data[0].total;
    const best = data.reduce((a, b) => b.total > a.total ? b : a);
    const bestIsScpi = best.name.startsWith('SCPI');
    safeHtml('sc-insight-a05', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 12l4-4 3 3 5-6"/></svg></div><div class="insight-text">
      ${bestIsScpi
        ? `Votre SCPI bat toutes les alternatives sur cette durée. Capital final <strong class="pos">${fmtM(scpiTotal)}</strong>, soit <strong>${fmtM(scpiTotal - data[1].total)}</strong> de plus que le Livret A.`
        : `Sur ces hypothèses, <em>${best.name}</em> bat la SCPI de <strong class="warn">${fmtM(best.total - scpiTotal)}</strong>. Mais la SCPI distribue du <strong>cashflow récurrent</strong>, contrairement à un ETF capitalisant.`}
    </div>`);
  }

  // ─── ANALYSE 06 : Objectif rentier ─────────────────────
  function renderA06(p) {
    if (!window.SCPI || !SCPI.yearsToTargetRente) return;
    const target = num('sc-target-rente', 500);
    const r = SCPI.yearsToTargetRente(p, target);

    if (r.found) {
      safeText('sc-rentier-years', r.years + ' ans');
      safeText('sc-rentier-years-sub', `(${(r.monthsExact)} mois exacts)`);
    } else {
      safeText('sc-rentier-years', '> 50 ans');
      safeText('sc-rentier-years-sub', 'objectif non atteint');
    }
    safeText('sc-rentier-capital', fmtM(r.capitalAtTarget));
    safeText('sc-rentier-verse', fmtM(r.versePourAtteindre));
    safeText('sc-rentier-actual', fmtM(r.monthlyAtTarget) + '/mois');

    const yrsEl = $('sc-rentier-years');
    if (yrsEl) yrsEl.className = 'stat-value ' + (r.found ? 'pos' : 'neg');

    if (r.found) {
      // suggestions
      const suggestions = [];
      if (p.regime === 'PP') suggestions.push('passer à une SCPI européenne (TMI seul, pas de PS) → −5 à −7 ans');
      if (p.monthly < 200) suggestions.push('augmenter le versement mensuel à 200-500 € → drastique sur la durée');
      if (p.tdvm < 6) suggestions.push('cibler des SCPI plus rémunératrices (6-7 %) — mais vérifier la qualité du parc');
      const sugTxt = suggestions.length ? ` <em>Pour aller plus vite :</em> ${suggestions.join(' · ')}.` : '';
      safeHtml('sc-insight-a06', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 12l4-4 3 3 5-6"/></svg></div><div class="insight-text">
        Pour toucher <strong>${fmtM(target)}/mois</strong> nets, comptez <strong>${r.years} ans</strong>
        de versements (capital initial ${fmtM(p.K0)} + ${fmtM(p.monthly)}/mois).
        Au total <strong>${fmtM(r.versePourAtteindre)}</strong> versés, parts SCPI valorisées <strong>${fmtM(r.capitalAtTarget)}</strong>.${sugTxt}
      </div>`);
    } else {
      safeHtml('sc-insight-a06', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M8 1L1 14h14z"/></svg></div><div class="insight-text">
        <strong class="warn">Objectif ${fmtM(target)}/mois non atteint sur 50 ans</strong> avec ces paramètres.
        Vous plafonnez à ~${fmtM(r.monthlyAtTarget)}/mois.
        Augmentez le capital initial, le versement mensuel, ou cibler des SCPI à 6-7 % de TDVM.
      </div>`);
    }
  }

  // ─── RUN ───────────────────────────────────────────────
  function run() {
    if (!window.SCPI || !SCPI.calcSCPI) {
      console.error('[scpi.view] core SCPI non chargé');
      return;
    }
    const p = readParams();
    let r;
    try { r = SCPI.calcSCPI(p); }
    catch (e) { console.error('[scpi.view] calcSCPI error', e); return; }

    updateParamSummary(p);
    try { renderHero(p, r); } catch (e) { console.error('[hero]', e); }
    try { renderA01(p, r); }  catch (e) { console.error('[a01]', e); }
    try { renderA02(p, r); }  catch (e) { console.error('[a02]', e); }
    try { renderA03(p); }     catch (e) { console.error('[a03]', e); }
    try { renderA04(p); }     catch (e) { console.error('[a04]', e); }
    try { renderA05(p); }     catch (e) { console.error('[a05]', e); }
    try { renderA06(p); }     catch (e) { console.error('[a06]', e); }

    if (window.CI && CI.setUrlParams) {
      CI.setUrlParams({
        k0: p.K0, m: p.monthly, y: p.years,
        td: p.tdvm, rv: p.reval, fe: p.fraisEntree,
        tmi: p.tmi, rg: p.regime, tr: p.targetRente
      });
    }
  }

  // ─── INIT ───────────────────────────────────────────────
  function init() {
    if (window.CI && CI.initAll) CI.initAll();

    // Restore depuis URL
    if (window.CI && CI.getUrlParam) {
      const mapping = { 'sc-k0': 'k0', 'sc-monthly': 'm', 'sc-years': 'y', 'sc-tdvm': 'td',
                        'sc-reval': 'rv', 'sc-fees': 'fe', 'sc-tmi': 'tmi', 'sc-regime': 'rg',
                        'sc-target-rente': 'tr' };
      Object.entries(mapping).forEach(([id, key]) => {
        const v = CI.getUrlParam(key);
        if (v && $(id)) $(id).value = v;
      });
    }

    // Re-run sur tout changement (debounced)
    ['sc-k0','sc-monthly','sc-years','sc-tdvm','sc-reval','sc-fees','sc-tmi','sc-regime','sc-target-rente'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', run);
      if (el.tagName === 'INPUT') {
        el.addEventListener('input', () => {
          clearTimeout(el._t);
          el._t = setTimeout(run, 200);
        });
      }
    });

    // Bouton "Calculer"
    const btn = $('sc-btn-calc');
    if (btn) btn.addEventListener('click', run);

    // Sauvegarde
    const btnSave = $('sc-btn-save');
    if (btnSave && window.CI && CI.promptSave) {
      btnSave.addEventListener('click', () => {
        const p = readParams();
        CI.promptSave('scpi', p, 'Mon investissement SCPI', () => {
          CI.toast && CI.toast('Projet enregistré ✓', 'success');
        });
      });
    }

    // Premier calcul (légèrement différé pour laisser les composants UI s'initialiser)
    setTimeout(run, 30);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
