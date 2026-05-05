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

    // Insight A01
    const ageCls = r.achieved ? 'pos' : 'neg';
    const coastLine = r.isCoastFIRE
      ? `<span class="pos">Coast FIRE atteint</span> — tu peux arrêter de cotiser, ton capital actuel suffit.`
      : `Pour <em>Coast FIRE</em>, il faudrait avoir <strong>${CI.fmtCompact(r.coastCapital)}</strong> aujourd'hui (manque ${CI.fmtCompact(Math.max(0, r.coastCapital - p.currentSavings))}).`;
    setInsight('fia1-overview',
      r.achieved
        ? `Tu atteindras la <strong>cible FIRE</strong> de <em>${CI.fmtCompact(r.fireTarget)}</em> à ` +
          `<span class="${ageCls}">${r.fireAge.toFixed(1)} ans</span> ` +
          `(<strong>${r.yearsToFire.toFixed(1)} ans</strong> à partir de maintenant). ${coastLine} ` +
          `<span class="muted">À ${p.annualReturn} %/an avec ${CI.fmtNum(p.monthlyContrib, 0)} €/mois d'apport, c'est tenable mais demande de la discipline.</span>`
        : `À ce rythme (<strong>${CI.fmtNum(p.monthlyContrib, 0)} €/mois</strong> à ${p.annualReturn} %/an), ` +
          `tu n'atteindras pas <em>${CI.fmtCompact(r.fireTarget)}</em> dans les 50 prochaines années. ` +
          `<span class="warn">Augmente le versement, le rendement (ETF agressif) ou réduis la cible (Lean FIRE).</span> ${coastLine}`
    );
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

    // Insight A02
    const totalContributed = p.currentSavings + p.monthlyContrib * (r.yearsToFire * 12);
    const interestPart = r.finalValue - totalContributed;
    setInsight('fia2-trajectory',
      `Sur ta trajectoire, tu versera <strong>${CI.fmtMoney(totalContributed, 0)}</strong> en ${r.yearsToFire.toFixed(1)} ans, ` +
      `et le marché ajoutera <span class="pos">${CI.fmtMoney(interestPart, 0)}</span> de plus-values composées. ` +
      `La <em>cible Lean FIRE</em> (${CI.fmtCompact(r.leanTarget)}) est atteinte à <strong>${r.leanAge.toFixed(1)} ans</strong>. ` +
      `<span class="muted">Le coude exponentiel arrive ~10 ans avant FIRE — c'est là que ton capital travaille plus que toi.</span>`
    );
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

    // Insight A03
    const gap = r.yearsToFire - r.baristaYears;
    setInsight('fia3-variants',
      `<strong>Barista FIRE</strong> (50 % des dépenses) à <em>${r.baristaAge.toFixed(1)} ans</em> = ` +
      `<span class="pos">${gap.toFixed(1)} ans plus tôt</span> que FIRE Standard. ` +
      `<strong>Lean FIRE</strong> (70 %) à <em>${r.leanAge.toFixed(1)} ans</em>, ` +
      `<strong>Fat FIRE</strong> (150 %) à <em>${r.fatAge.toFixed(1)} ans</em>. ` +
      `<span class="muted">Réduire ses dépenses de 30 % réduit le temps à FIRE de plusieurs années — la frugalité est le levier le plus puissant.</span>`
    );
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

    // Insight A04
    if (ws.depleted) {
      setInsight('fia4-withdrawal',
        `<span class="neg">⚠ Le capital de ${CI.fmtCompact(r.fireTarget)} s'épuise à l'an ${ws.depletedYear}</span> ` +
        `(soit à <strong>${(r.fireAge + ws.depletedYear).toFixed(0)} ans</strong>) avec ` +
        `${CI.fmtCompact(p.annualExpenses)}/an de dépenses indexées sur l'inflation. ` +
        `<span class="muted">Pour tenir, il faudrait soit un capital plus élevé, soit moins de dépenses, soit un meilleur rendement.</span>`
      );
    } else {
      setInsight('fia4-withdrawal',
        `Avec <strong>${CI.fmtCompact(r.fireTarget)}</strong> et ${CI.fmtCompact(p.annualExpenses)}/an de dépenses, ` +
        `le capital tient sur <em>${retireHorizon} ans</em> (jusqu'à <strong>${(r.fireAge + retireHorizon).toFixed(0)} ans</strong>) ` +
        `et il reste <span class="pos">${CI.fmtCompact(ws.finalValue)}</span> en fin de période. ` +
        `<span class="muted">La règle du ${r.withdrawalRate.toFixed(1)} % fonctionne ici, mais teste différents scénarios de marché en A06 pour valider la robustesse.</span>`
      );
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

    // Insight A05
    const at5 = sens.byReturn.find((x) => x.return === 5);
    const at10 = sens.byReturn.find((x) => x.return === 10);
    const wr3 = sens.byWithdrawal.find((x) => x.rate === 3);
    const wr5 = sens.byWithdrawal.find((x) => x.rate === 5);
    if (at5 && at10 && wr3 && wr5) {
      setInsight('fia5-sensitivity',
        `À <strong>5 %/an</strong>, FIRE en <em>${at5.years.toFixed(1)} ans</em> ; à <strong>10 %/an</strong>, en ` +
        `<span class="pos">${at10.years.toFixed(1)} ans</span> seulement. ` +
        `Côté retrait : à <strong>3 %</strong> il faut ${CI.fmtCompact(wr3.target)} (sécurité maximale), ` +
        `à <strong>5 %</strong> seulement ${CI.fmtCompact(wr5.target)} (mais risque de manque). ` +
        `<span class="muted">Le couple rendement/retrait est le pivot — vise un mix réaliste ${'(7 %/4 %)'} pour calibrer.</span>`
      );
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

    // Interprétation (legacy info-box, gardée)
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

    // Insight A06 — synthèse percentiles
    const finalP10 = mc.percentiles[mc.percentiles.length - 1].p10;
    const finalP50 = mc.percentiles[mc.percentiles.length - 1].p50;
    const finalP90 = mc.percentiles[mc.percentiles.length - 1].p90;
    const successCls = mc.successRate >= 90 ? 'pos' : mc.successRate >= 70 ? 'warn' : 'neg';
    setInsight('fia6-montecarlo',
      `Sur <strong>${mc.runs.toLocaleString('fr-FR')} simulations</strong> (${horizon} ans, vol 15 %, seedé), ` +
      `<span class="${successCls}">${mc.successRate.toFixed(1)} %</span> de chances que ton capital tienne. ` +
      `Scénario médian (P50) : <em>${CI.fmtCompact(finalP50)}</em> restant. ` +
      `Pessimiste (P10) : <span class="neg">${CI.fmtCompact(finalP10)}</span>. ` +
      `Optimiste (P90) : <span class="pos">${CI.fmtCompact(finalP90)}</span>. ` +
      `<span class="muted">Le sequence-of-returns risk (chocs en début de retraite) est intégré — c'est pour ça que P10 peut être très bas.</span>`
    );
  }

  /* ------------------------------------------------------------------ */
  /* A07 — Geographic Arbitrage                                            */
  /* ------------------------------------------------------------------ */
  function renderA07(p, r) {
    if (!CF.computeGeoArbitrage) return;
    const data = CF.computeGeoArbitrage(p);
    const tbody = document.getElementById('fia7-tbody');
    if (!tbody) return;

    const fr = data.find((c) => c.id === 'fr');
    const baselineYears = fr ? fr.yearsToFire : 0;

    tbody.innerHTML = data.map((c, i) => {
      const isBest    = i === 0;
      const isFrance  = c.id === 'fr';
      const star      = isBest ? ' ⭐' : '';
      const trBg      = isFrance ? 'background:rgba(96,165,250,0.06)' : '';
      const yearsSaved = baselineYears - c.yearsToFire;
      const savedDisplay = isFrance ? '—' : (yearsSaved > 0 ? '<span class="pos">−' + yearsSaved.toFixed(1) + ' ans</span>' : '<span class="warn">+' + Math.abs(yearsSaved).toFixed(1) + ' ans</span>');
      return '<tr style="' + trBg + '">' +
        '<td style="padding:10px 12px;font-weight:600">' + c.flag + ' ' + c.name + star + (isFrance ? ' <span style="font-size:10px;color:var(--text-3);font-weight:400">(référence)</span>' : '') + '</td>' +
        '<td style="padding:10px 12px;font-family:var(--font-mono);font-size:12px">' + c.col + ' %</td>' +
        '<td style="padding:10px 12px">' + CI.fmtMoney(c.adjustedExpenses, 0) + '/an</td>' +
        '<td style="padding:10px 12px;font-weight:600">' + CI.fmtMoney(c.fireNumber, 0) + '</td>' +
        '<td style="padding:10px 12px"><strong>' + c.yearsToFire.toFixed(1) + ' ans</strong></td>' +
        '<td style="padding:10px 12px">' + savedDisplay + '</td>' +
        '<td style="padding:10px 12px;font-size:11px;color:var(--text-3);max-width:280px">' + c.taxNote + '</td>' +
        '</tr>';
    }).join('');

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const best = data[0];
    set('fia7-best-name',   best.flag + ' ' + best.name);
    set('fia7-best-years',  best.yearsToFire.toFixed(1) + ' ans');
    set('fia7-best-saved',  fr ? '−' + (baselineYears - best.yearsToFire).toFixed(1) + ' ans vs France' : '—');
    set('fia7-best-fire',   CI.fmtMoney(best.fireNumber, 0));
    set('fia7-fr-fire',     fr ? CI.fmtMoney(fr.fireNumber, 0) : '—');
    set('fia7-fr-years',    fr ? fr.yearsToFire.toFixed(1) + ' ans' : '—');

    const yearsSaved = fr ? (baselineYears - best.yearsToFire) : 0;
    setInsight('fia7-geo-arb',
      'En délocalisant en <strong>' + best.flag + ' ' + best.name + '</strong> (coût de la vie ' + best.col + ' % de la France), ' +
      'tu atteins le FIRE en <em>' + best.yearsToFire.toFixed(1) + ' ans</em> au lieu de ' + (fr ? fr.yearsToFire.toFixed(1) + ' ans' : '—') + ' — ' +
      '<span class="pos">' + yearsSaved.toFixed(1) + ' ans gagnés</span>. ' +
      'Ton capital cible passe de <strong>' + (fr ? CI.fmtMoney(fr.fireNumber, 0) : '—') + '</strong> à ' +
      '<strong>' + CI.fmtMoney(best.fireNumber, 0) + '</strong>. ' +
      '<span class="muted">L\'arbitrage géographique est un levier sous-estimé : il ne dépend pas du marché, juste de ton choix de vie. Vérifier la résidence fiscale et l\'accès aux soins avant de décider.</span>'
    );
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
    renderA07(p, r);
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

  window.exportFirePDF = function () {
    const p = readForm();
    const summary = `Âge ${p.age || '—'} · dépenses ${CI.fmtMoney(p.annualExpenses || 0, 0)}/an · épargne ${CI.fmtNum(p.monthlySavings || 0, 0)} €/mois · ${p.annualReturn || 7} %/an`;
    CI.exportPDF({
      title:    'CalcInvest — FIRE',
      summary:  summary,
      sectionIds: ['fia1-overview','fia2-trajectory','fia3-variants','fia4-withdrawal','fia5-sensitivity','fia6-montecarlo','fia7-geo-arb'],
      fileName: 'calcinvest-fire'
    });
  };

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
