/* ============================================================
   CalcInvest — FIRE VIEW (DOM binding)
   Calcul FIRE → 6 analyses
   ============================================================ */

(function () {
  'use strict';

  const CF = window.CalcFIRE;

  /* ------------------------------------------------------------------ */
  /* Helpers DOM                                                           */
  /* ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  const show = (id) => { const e = $(id); if (e) e.style.display = ''; };
  const hide = (id) => { const e = $(id); if (e) e.style.display = 'none'; };

  /* ------------------------------------------------------------------ */
  /* Lecture formulaire                                                    */
  /* ------------------------------------------------------------------ */
  function readForm() {
    const v = (id) => parseFloat($(`fi-${id}`)?.value) || 0;
    return {
      currentAge:     v('age'),
      annualExpenses: v('expenses'),
      currentSavings: v('savings'),
      monthlyContrib: v('monthly'),
      annualReturn:   v('return'),
      withdrawalRate: v('withdrawal'),
      inflation:      v('inflation'),
      safetyMargin:   v('safety')
    };
  }

  /* ------------------------------------------------------------------ */
  /* updateSummary                                                          */
  /* ------------------------------------------------------------------ */
  function updateSummary(p, r) {
    const el = $('fi-sum-params');
    if (!el) return;
    el.textContent =
      p.currentAge + ' ans · ' +
      CI.fmtCompact(p.annualExpenses) + '/an · ' +
      CI.fmtCompact(p.currentSavings) + ' épargnés · ' +
      CI.fmtNum(p.monthlyContrib, 0) + ' €/mois';
  }

  /* ------------------------------------------------------------------ */
  /* renderA01 — Vue d'ensemble                                            */
  /* ------------------------------------------------------------------ */
  function renderA01(p, r) {
    // Badge coast FIRE
    const coastEl = $('fia1-coast');
    if (coastEl) {
      if (r.isCoastFIRE) {
        coastEl.textContent = '✓ Coast FIRE atteint';
        coastEl.className = 'badge badge-success';
      } else {
        coastEl.textContent = 'Coast FIRE non atteint';
        coastEl.className = 'badge badge-warn';
      }
    }

    // Stats principales
    if (r.achieved) {
      set('fia1-age',    r.fireAge.toFixed(1) + ' ans');
      set('fia1-years',  r.yearsToFire.toFixed(1) + ' ans');
      set('fia1-target', CI.fmtCompact(r.fireTarget));
      set('fia1-final',  CI.fmtCompact(r.finalValue));

      const ageEl = $('fia1-age');
      if (ageEl) ageEl.className = 'stat-value pos';
    } else {
      set('fia1-age',    '> 50 ans');
      set('fia1-years',  '> 50 ans');
      set('fia1-target', CI.fmtCompact(r.fireTarget));
      set('fia1-final',  CI.fmtCompact(r.finalValue));
      const ageEl = $('fia1-age');
      if (ageEl) ageEl.className = 'stat-value neg';
    }

    set('fia1-coast-capital', CI.fmtCompact(r.coastCapital));

    // Variantes
    set('fia1-lean-age',       r.leanAge.toFixed(1) + ' ans');
    set('fia1-lean-years',     r.leanYears.toFixed(1));
    set('fia1-barista-age',    r.baristaAge.toFixed(1) + ' ans');
    set('fia1-barista-years',  r.baristaYears.toFixed(1));
    set('fia1-std-age',        r.fireAge.toFixed(1) + ' ans');
    set('fia1-fat-age',        r.fatAge.toFixed(1) + ' ans');
    set('fia1-fat-years',      r.fatYears.toFixed(1));

    // Paramètres exposés
    set('fia1-wr',  r.withdrawalRate.toFixed(1) + ' %');
    set('fia1-ret', r.annualReturn.toFixed(1) + ' %');
    set('fia1-inf', r.inflation.toFixed(1) + ' %');
  }

  /* ------------------------------------------------------------------ */
  /* renderA02 — Trajectoire vers FIRE                                     */
  /* ------------------------------------------------------------------ */
  function renderA02(p, r) {
    const traj = r.trajectory;
    const labels = traj.map((pt) => {
      const yr = p.currentAge + pt.month / 12;
      return yr.toFixed(0) + ' ans';
    });
    const dataPort   = traj.map((pt) => pt.value);
    const dataInvest = traj.map((pt) => pt.invested);
    const dataTarget = traj.map(() => r.fireTarget);
    const dataLean   = traj.map(() => r.leanTarget);

    CI.drawChart('fia2-chart', labels, [
      { data: dataTarget, color: '#F87171',  width: 1.5, dash: [6, 3], label: 'Cible FIRE' },
      { data: dataLean,   color: '#FBBF24',  width: 1,   dash: [4, 4], label: 'Cible Lean' },
      { data: dataPort,   color: '#34D399',  fill: true,  label: 'Capital accumulé' },
      { data: dataInvest, color: '#60A5FA',  fill: true,  label: 'Total versé' }
    ], { yLabel: '€' });

    // Ligne d'indication
    set('fia2-target-label', CI.fmtCompact(r.fireTarget));
    set('fia2-lean-label',   CI.fmtCompact(r.leanTarget));
  }

  /* ------------------------------------------------------------------ */
  /* renderA03 — Variantes FIRE timeline                                   */
  /* ------------------------------------------------------------------ */
  function renderA03(p, r) {
    const variants = [
      { label: 'Lean FIRE',    sublabel: '70 % de vos dépenses',     years: r.leanYears,    age: r.leanAge,    target: r.leanTarget,    color: '#FBBF24' },
      { label: 'Barista FIRE', sublabel: '50 % (mi-temps en retrait)', years: r.baristaYears, age: r.baristaAge, target: r.baristaTarget, color: '#34D399' },
      { label: 'FIRE Standard',sublabel: '100 % de vos dépenses',    years: r.yearsToFire,  age: r.fireAge,    target: r.fireTarget,    color: '#60A5FA' },
      { label: 'Fat FIRE',     sublabel: '150 % de vos dépenses',    years: r.fatYears,     age: r.fatAge,     target: r.fatTarget,     color: '#A78BFA' }
    ];

    const tbody = $('fia3-tbody');
    if (tbody) {
      tbody.innerHTML = variants.map((v) => `
        <tr>
          <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${v.color};margin-right:6px"></span>${v.label}</td>
          <td class="text-muted" style="font-size:12px">${v.sublabel}</td>
          <td>${CI.fmtCompact(v.target)}</td>
          <td class="font-mono">${v.years.toFixed(1)} ans</td>
          <td class="font-mono" style="color:${v.color}">${v.age.toFixed(1)}</td>
        </tr>`).join('');
    }

    // Chart barres horizontales visuelles
    const maxYears = Math.max(...variants.map((v) => v.years), 1);
    const barsEl = $('fia3-bars');
    if (barsEl) {
      barsEl.innerHTML = variants.map((v) => {
        const pct = Math.min(100, (v.years / maxYears) * 100).toFixed(1);
        return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span>${v.label}</span>
            <span style="color:${v.color};font-family:var(--font-mono);font-weight:600">${v.age.toFixed(1)} ans · ${v.years.toFixed(1)} ans de plus</span>
          </div>
          <div style="background:var(--bg-elev);border-radius:3px;height:10px;overflow:hidden">
            <div style="background:${v.color};height:100%;width:${pct}%;border-radius:3px;transition:width .4s"></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  /* ------------------------------------------------------------------ */
  /* renderA04 — Phase de retrait                                          */
  /* ------------------------------------------------------------------ */
  function renderA04(p, r) {
    // Horizon dynamique : du jour FIRE jusqu'à 95 ans (espérance de vie raisonnable),
    // au lieu d'un 50 ans fixe qui peut être trop court ou trop long.
    const retireHorizon = Math.max(20, Math.round(95 - r.fireAge));
    const ws = CF.simulateWithdrawal(
      r.fireTarget, p.annualExpenses, p.annualReturn, p.inflation, retireHorizon
    );

    if (ws.depleted) {
      set('fia4-status', `⚠ Capital épuisé à l'année ${ws.depletedYear} (à ${(r.fireAge + ws.depletedYear).toFixed(0)} ans)`);
      const el = $('fia4-status');
      if (el) el.style.color = 'var(--red)';
    } else {
      set('fia4-status', `✓ Capital non épuisé sur ${retireHorizon} ans (jusqu'à ~${(r.fireAge + retireHorizon).toFixed(0)} ans)`);
      const el = $('fia4-status');
      if (el) el.style.color = 'var(--accent)';
    }

    if (!ws.depleted) {
      set('fia4-final', CI.fmtCompact(ws.finalValue));
    } else {
      set('fia4-final', '0 €');
    }

    // Chart décaissement
    const labels = ws.pts.map((pt) => 'Année ' + pt.year);
    const dataVal = ws.pts.map((pt) => pt.value);
    const dataExp = ws.pts.map((pt) => pt.expenses);

    CI.drawChart('fia4-chart', labels, [
      { data: dataVal, color: '#34D399', fill: true, label: 'Capital restant' },
      { data: dataExp, color: '#F87171', width: 1.5, dash: [4, 3], label: 'Dépenses annuelles (inflation)' }
    ], { yLabel: '€' });

    // Tableau
    const tbody = $('fia4-tbody');
    if (tbody) {
      tbody.innerHTML = ws.pts.filter((_, i) => i % 5 === 0 || ws.pts[i].value === 0).map((pt) => `
        <tr ${pt.value === 0 ? 'class="row-neg"' : ''}>
          <td>Année ${pt.year}</td>
          <td class="font-mono">${CI.fmtCompact(pt.value)}</td>
          <td class="font-mono">${CI.fmtCompact(pt.expenses)}</td>
          <td class="font-mono text-muted">${pt.value > 0 ? '+' + ((pt.value / r.fireTarget - 1) * 100).toFixed(1) + ' %' : '—'}</td>
        </tr>`).join('');
    }
  }

  /* ------------------------------------------------------------------ */
  /* renderA05 — Sensibilité                                               */
  /* ------------------------------------------------------------------ */
  function renderA05(p, r) {
    const sens = CF.calcFireSensitivity(p);

    // Chart by return
    const retLabels = sens.byReturn.map((x) => x.return + ' %');
    CI.drawChart('fia5-chart-return', retLabels, [
      { data: sens.byReturn.map((x) => x.years), color: '#34D399', fill: true, label: 'Années vers FIRE' }
    ], { yLabel: 'années' });

    // Chart by withdrawal rate
    const wrLabels = sens.byWithdrawal.map((x) => x.rate + ' %');
    CI.drawChart('fia5-chart-wr', wrLabels, [
      { data: sens.byWithdrawal.map((x) => x.target / 1e6), color: '#60A5FA', fill: true, label: 'Capital cible (M€)' }
    ], { yLabel: 'M€' });

    // Grille
    const gridEl = $('fia5-grid');
    if (gridEl) {
      const wrs = [3, 3.5, 4, 4.5, 5];
      const rets = [4, 5, 6, 7, 8, 9, 10];
      let html = '<table class="data-table" style="font-size:12px"><thead><tr><th>Rendement ↓ / Retrait →</th>';
      wrs.forEach((wr) => { html += `<th>${wr} %</th>`; });
      html += '</tr></thead><tbody>';
      rets.forEach((ret) => {
        html += `<tr><td>${ret} %</td>`;
        wrs.forEach((wr) => {
          const res = CF.calcFIRE({ ...p, annualReturn: ret, withdrawalRate: wr });
          const yrs = res.yearsToFire;
          const isCurrent = (ret === p.annualReturn && wr === p.withdrawalRate);
          const cls = isCurrent ? 'style="background:var(--accent-dim);font-weight:700"' : '';
          const color = yrs < 15 ? 'var(--accent)' : yrs < 25 ? 'var(--yellow)' : 'var(--red)';
          html += `<td ${cls} style="color:${color};font-family:var(--font-mono)">${yrs.toFixed(0)} ans</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      gridEl.innerHTML = html;
    }
  }

  /* ------------------------------------------------------------------ */
  /* renderA06 — Monte Carlo                                               */
  /* ------------------------------------------------------------------ */
  function renderA06(p, r) {
    // Pool de rendements mensuels synthétiques basé sur le rendement annuel choisi
    // et 15 % de vol (S&P 500 long terme). Génération seedée pour reproductibilité.
    const annualRetPct = p.annualReturn / 100;
    const annualVol    = 0.15;
    const mu_ln    = Math.log(1 + annualRetPct) / 12;
    const sigma_ln = annualVol / Math.sqrt(12);

    const ENGINE = window.ENGINE;
    const rand = ENGINE.rng.mulberry32(42);
    const norm = ENGINE.rng.normal(rand);
    const syntheticMonthly = [];
    for (let i = 0; i < 3600; i++) {
      syntheticMonthly.push(Math.exp(mu_ln + sigma_ln * norm()) - 1);
    }

    // Horizon dynamique : âge actuel → espérance de vie ~95 ans.
    // Si l'utilisateur n'atteint pas FIRE, fallback 30 ans.
    const horizon = r.achieved
      ? Math.max(20, Math.round(95 - r.fireAge))
      : 30;

    const mc = CF.calcMonteCarloFIRE({
      capital: r.fireTarget,
      annualExpenses: p.annualExpenses,
      monthlyReturns: syntheticMonthly,
      years: horizon,
      simulations: 2000,
      seed: 42,
      inflation: (p.inflation || 0) / 100,
      method: 'block-bootstrap',
      blockLen: 12
    });

    // Stats
    set('fia6-success', mc.successRate.toFixed(1) + ' %');
    const succEl = $('fia6-success');
    if (succEl) {
      succEl.className = 'stat-value ' + (mc.successRate >= 90 ? 'pos' : mc.successRate >= 70 ? 'warn' : 'neg');
    }
    set('fia6-runs', mc.runs.toLocaleString('fr-FR') + ' · ' + horizon + ' ans');

    // Chart percentiles
    const labels = mc.percentiles.map((pt) => 'Année ' + pt.year);
    CI.drawChart('fia6-chart', labels, [
      { data: mc.percentiles.map((pt) => pt.p90), color: '#34D399', width: 1.5, label: 'P90 (optimiste)' },
      { data: mc.percentiles.map((pt) => pt.p50), color: '#60A5FA', width: 2,   label: 'P50 (médian)' },
      { data: mc.percentiles.map((pt) => pt.p10), color: '#F87171', width: 1.5, label: 'P10 (pessimiste)' }
    ], { yLabel: '€' });

    // Interprétation
    const interpEl = $('fia6-interp');
    if (interpEl) {
      const rate = mc.successRate;
      let msg, cls;
      if (rate >= 95) {
        msg = `Excellent — ${rate.toFixed(0)} % de chances de ne pas épuiser votre capital sur ${horizon} ans. Votre plan est très robuste.`;
        cls = 'info-box info-box-success';
      } else if (rate >= 85) {
        msg = `Bon — ${rate.toFixed(0)} % de réussite. Plan solide, envisagez une légère marge de sécurité supplémentaire.`;
        cls = 'info-box';
      } else if (rate >= 70) {
        msg = `Passable — ${rate.toFixed(0)} % de réussite. Pensez à augmenter votre capital cible ou réduire vos dépenses.`;
        cls = 'info-box info-box-warn';
      } else {
        msg = `Risqué — seulement ${rate.toFixed(0)} % de réussite. Reconsidérez votre plan : plus d'épargne, moins de dépenses ou un taux de retrait plus faible.`;
        cls = 'info-box info-box-error';
      }
      interpEl.innerHTML = `<div class="${cls}">${msg}</div>`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* run — point d'entrée principal                                        */
  /* ------------------------------------------------------------------ */
  function run() {
    const p = readForm();
    const r = CF.calcFIRE(p);

    updateSummary(p, r);
    renderA01(p, r);
    renderA02(p, r);
    renderA03(p, r);
    renderA04(p, r);
    renderA05(p, r);
    renderA06(p, r);
  }

  /* ------------------------------------------------------------------ */
  /* Sauvegarde / partage / reset                                          */
  /* ------------------------------------------------------------------ */
  window.saveFire = function () {
    const p = readForm();
    CI.promptSave('FIRE', p, 'Mon plan FIRE', (proj) => {
      CI.toast('Projet sauvegardé', 'success');
    });
  };

  window.shareFire = function () { CI.copyShareUrl(); };

  window.resetFire = function () {
    const defaults = {
      'fi-age':        '30',
      'fi-expenses':   '30000',
      'fi-savings':    '50000',
      'fi-monthly':    '1500',
      'fi-return':     '7',
      'fi-withdrawal': '4',
      'fi-inflation':  '2',
      'fi-safety':     '0'
    };
    Object.entries(defaults).forEach(([id, val]) => {
      const el = $(id);
      if (el) el.value = val;
    });
    run();
  };

  /* ------------------------------------------------------------------ */
  /* Init                                                                  */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    CI.initAll();

    // Lier tous les inputs au recalcul
    document.querySelectorAll('[id^="fi-"]').forEach((el) => {
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    // Charger depuis URL si params présents
    const params = ['age', 'expenses', 'savings', 'monthly', 'return', 'withdrawal', 'inflation', 'safety'];
    params.forEach((key) => {
      const val = CI.getUrlParam('fi_' + key);
      if (val) {
        const el = $(`fi-${key}`);
        if (el) el.value = val;
      }
    });

    run();

    // Nav active sur scroll
    const sections = document.querySelectorAll('[id^="fia"]');
    const links    = document.querySelectorAll('.sidebar-link[href^="#fia"]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.remove('active'));
          const active = document.querySelector(`.sidebar-link[href="#${e.target.id}"]`);
          if (active) active.classList.add('active');
        }
      });
    }, { threshold: 0.3 });
    sections.forEach((s) => io.observe(s));
  });

})();
