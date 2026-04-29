/* ============================================================
   CalcInvest — PER VIEW (DOM binding)
   Reads form → calls CalcPER.* → renders 6 analyses
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

    // Active profile
    const activeProfile = document.querySelector('#per-profile-btns .pill.active')?.dataset.profile || 'custom';

    // Exit capital slider (0..100 → 0..1)
    const sliderEl = document.getElementById('per-exit-capital-pct');
    const exitCapitalPct = sliderEl ? parseFloat(sliderEl.value) / 100 : 1;

    // Exit tax method toggle
    const taxMethodEl = document.querySelector('input[name="per-tax-method"]:checked');
    const exitTaxMethod = taxMethodEl ? taxMethodEl.value : 'auto';

    return {
      currentAge:      v('per-age') || 35,
      retirementAge:   v('per-retire-age') || 65,
      currentSavings:  v('per-initial') || 0,
      monthlyContrib:  v('per-monthly') || 0,
      annualReturn:    v('per-return') || 6,
      feesPct:         v('per-fees') || 0,
      inflation:       v('per-inflation') || 0,
      tmiEntree:       parseFloat(document.getElementById('per-tmi-in').value) || 30,
      tmiSortie:       parseFloat(document.getElementById('per-tmi-out').value) || 11,
      // New fields
      revenuPro:       v('per-revenu-pro') || null,
      cumulatedUnused: v('per-cumulated-unused') || 0,
      exitCapitalPct:  exitCapitalPct,
      exitTaxMethod:   exitTaxMethod,
      profileId:       activeProfile
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
    if (p.revenuPro) set('per-revenu-pro', p.revenuPro);
    if (p.cumulatedUnused) set('per-cumulated-unused', p.cumulatedUnused);
    // Exit capital slider
    const slider = document.getElementById('per-exit-capital-pct');
    if (slider) slider.value = Math.round((p.exitCapitalPct ?? 1) * 100);
    updateSliderDisplay();
  }

  /* Slider display update */
  function updateSliderDisplay() {
    const slider = document.getElementById('per-exit-capital-pct');
    const display = document.getElementById('per-exit-mix-display');
    if (!slider || !display) return;
    const capPct = parseInt(slider.value, 10);
    const rentePct = 100 - capPct;
    if (capPct === 100) {
      display.textContent = '100 % capital';
    } else if (capPct === 0) {
      display.textContent = '100 % rente';
    } else {
      display.textContent = capPct + ' % capital · ' + rentePct + ' % rente';
    }
  }

  /* Profile preset handler */
  function applyProfile(profileId) {
    const profiles = PER.PROFILES;
    const profile = profiles[profileId];
    if (!profile) return;

    // Highlight button
    document.querySelectorAll('#per-profile-btns .pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.profile === profileId);
    });

    // Apply return + fees
    const setInput = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event('input'));
    };
    setInput('per-return', profile.annualReturn);
    setInput('per-fees', profile.feesPct);

    // Update profile desc
    const descEl = document.getElementById('per-profile-desc');
    if (descEl) descEl.textContent = profile.desc;
  }

  /* ------------------------------------------------------------
     URL state
     ------------------------------------------------------------ */
  const URL_KEYS = [
    'currentAge', 'retirementAge', 'currentSavings', 'monthlyContrib',
    'annualReturn', 'feesPct', 'inflation', 'tmiEntree', 'tmiSortie',
    'revenuPro', 'cumulatedUnused', 'exitCapitalPct'
  ];
  function syncUrl(p) {
    const out = {};
    URL_KEYS.forEach((k) => { if (p[k] != null) out[k] = p[k]; });
    CI.setUrlParams(out);
  }
  function loadFromUrl() {
    const defaults = {
      currentAge: 35, retirementAge: 65,
      currentSavings: 0, monthlyContrib: 200,
      annualReturn: 6, feesPct: 1, inflation: 2,
      tmiEntree: 30, tmiSortie: 11,
      revenuPro: null, cumulatedUnused: 0, exitCapitalPct: 1
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

    // Profil badge
    const profileBadge = document.getElementById('pa1-profile-badge');
    if (profileBadge) {
      const pInfo = PER.PROFILES[r.profileId];
      profileBadge.textContent = pInfo ? `Profil : ${pInfo.label}` : `Profil personnalisé`;
    }

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
     A03 — Sortie capital/rente (mix)
     ------------------------------------------------------------ */
  function renderA03(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    const capPct = Math.round(r.exitCapitalPct * 100);
    const rentePct = 100 - capPct;

    // Capital part
    set('pa3-cap-pct', `${capPct} %`);
    set('pa3-cap-net', CI.fmtMoney(r.netCapital, 0));
    set('pa3-cap-tax', `Brut ${CI.fmtMoney(r.capitalPart, 0)} − impôts ${CI.fmtMoney(r.taxOnExit, 0)}`);

    // Tax method badge
    const methodBadge = document.getElementById('pa3-tax-method-badge');
    if (methodBadge) {
      if (r.taxMethod === 'baremeIR') {
        methodBadge.textContent = `Barème IR (barème: ${CI.fmtMoney(r.taxBreakdown.baremeIR, 0)} · flat tax: ${CI.fmtMoney(r.taxBreakdown.flatTax, 0)}) — barème retenu`;
      } else {
        methodBadge.textContent = `Flat tax 30 % (barème: ${CI.fmtMoney(r.taxBreakdown.baremeIR, 0)} · flat tax: ${CI.fmtMoney(r.taxBreakdown.flatTax, 0)}) — flat retenu`;
      }
    }

    // Tax breakdown
    set('pa3-cap-tax-total', '−' + CI.fmtMoney(r.taxOnExit, 0));
    set('pa3-cap-tax-detail', `IR sur versés ${CI.fmtMoney(r.taxBreakdown.onDeductible, 0)} · PFU sur PV ${CI.fmtMoney(r.taxBreakdown.onGains, 0)}`);

    // Rente part
    set('pa3-rente-pct', `${rentePct} %`);
    if (r.rente.annualGross > 0) {
      set('pa3-rente-monthly', CI.fmtMoney(r.rente.monthlyNet, 0) + '/mois');
      set('pa3-rente-horizon', `Sur ${r.rente.horizonYears} ans (jusqu'à ~95 ans)`);
      set('pa3-rente-total', CI.fmtMoney(r.rente.totalNetOverHorizon, 0));
      set('pa3-rente-vs-cap', `Rente nette sur ${r.rente.horizonYears} ans`);
    } else {
      set('pa3-rente-monthly', '—');
      set('pa3-rente-horizon', 'Tout en capital (100 %)');
      set('pa3-rente-total', '—');
      set('pa3-rente-vs-cap', 'Sortie 100 % capital sélectionnée');
    }

    // Total net all-in
    set('pa3-total-net', CI.fmtMoney(r.totalNetExit, 0));
    set('pa3-total-net-sub', capPct === 100 ? 'Capital uniquement' : capPct === 0 ? 'Rente uniquement' : `${capPct} % cap. + ${rentePct} % rente (sur ${r.rente.horizonYears} ans)`);

    // Insight A03
    const showRente = r.rente.annualGross > 0;
    const winnerLine = showRente && r.rente.totalNetOverHorizon > r.netCapital
      ? `La <strong>rente</strong> finit gagnante (<span class="pos">+${CI.fmtMoney(r.rente.totalNetOverHorizon - r.netCapital, 0)}</span> sur ${r.rente.horizonYears} ans), mais étalée.`
      : r.netCapital > 0
      ? `Le <strong>capital</strong> est votre poche disponible immédiatement — liberté de réinvestir à votre guise.`
      : `Tout part en rente : ${CI.fmtMoney(r.rente.monthlyNet, 0)}/mois pendant ${r.rente.horizonYears} ans.`;

    const taxMethodLine = r.taxMethod === 'flatTax'
      ? `Flat tax 30 % retenue (plus avantageuse que le barème IR dans votre cas).`
      : `Barème IR retenu (${p.tmiSortie} % sur les versements + PFU 30 % sur les PV).`;

    setInsight('pa-sortie',
      (r.netCapital > 0 ? `Capital net : <em>${CI.fmtMoney(r.netCapital, 0)}</em>. ` : '') +
      (showRente ? `Rente nette : <em>${CI.fmtMoney(r.rente.monthlyNet, 0)}/mois</em> pendant ${r.rente.horizonYears} ans. ` : '') +
      winnerLine + ` ${taxMethodLine} ` +
      `<span class="muted">Utilisez le slider de mix pour trouver votre équilibre liquidité / rente garantie.</span>`
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
     A06 — Plafond & optimisation fiscale
     ------------------------------------------------------------ */
  function renderA06(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = c; };

    if (!r.plafond) {
      // No revenuPro provided: show prompt
      const container = document.getElementById('pa6-content');
      if (container) {
        container.innerHTML = '<p class="text-muted" style="font-size:13px;padding:16px 0">Renseignez votre <strong>revenu professionnel</strong> dans les paramètres pour voir votre plafond de déduction réel et les éventuels reports disponibles.</p>';
      }
      return;
    }

    const pl = r.plafond;
    const annualVers = pl.annualVersement;
    const utilisationPct = Math.round(pl.utilisationRatio * 100);

    set('pa6-plafond', CI.fmtMoney(pl.annualPlafond, 0) + '/an');
    set('pa6-versement', CI.fmtMoney(annualVers, 0) + '/an');
    set('pa6-reportable', CI.fmtMoney(pl.initialReportable, 0));
    set('pa6-utilisation', utilisationPct + ' %');
    set('pa6-deductible-total', CI.fmtMoney(r.cumulatedDeductible, 0));
    set('pa6-excess-total', CI.fmtMoney(r.cumulatedExcess, 0));

    // Alert banner
    const alertEl = document.getElementById('pa6-alert');
    if (alertEl) {
      if (pl.isOverPlafond) {
        alertEl.style.display = '';
        alertEl.className = 'info-box warn';
        alertEl.innerHTML =
          '<strong>⚠ Versement supérieur au plafond disponible</strong><br>' +
          `Votre versement annuel (${CI.fmtMoney(annualVers, 0)}) dépasse votre plafond + reports ` +
          `(${CI.fmtMoney(pl.annualPlafond + pl.initialReportable, 0)}). ` +
          `La part non déductible (${CI.fmtMoney(annualVers - pl.annualPlafond - pl.initialReportable, 0)}) ` +
          `sera tout de même investie mais sans avantage fiscal à l'entrée.`;
      } else {
        const marge = pl.annualPlafond - annualVers;
        if (marge > 500) {
          alertEl.style.display = '';
          alertEl.className = 'info-box';
          alertEl.innerHTML =
            `<strong>💡 Marge disponible</strong> : vous pouvez encore verser <strong>${CI.fmtMoney(marge, 0)}</strong> ` +
            `cette année et déduire à ${p.tmiEntree} % (économie potentielle : ${CI.fmtMoney(marge * p.tmiEntree / 100, 0)}).`;
        } else {
          alertEl.style.display = 'none';
        }
      }
    }

    // Report bar chart (simple HTML bars)
    const barEl = document.getElementById('pa6-utilisation-bar');
    if (barEl) {
      const pct = Math.min(100, utilisationPct);
      const color = pct > 100 ? 'var(--red)' : pct > 85 ? 'var(--yellow)' : 'var(--accent)';
      barEl.innerHTML = `
        <div style="background:var(--border);border-radius:4px;height:8px;margin:6px 0">
          <div style="background:${color};border-radius:4px;height:8px;width:${Math.min(100, pct)}%;transition:width .3s"></div>
        </div>
        <div style="font-size:11px;color:var(--text-3)">
          ${CI.fmtMoney(annualVers, 0)} versé / ${CI.fmtMoney(pl.annualPlafond, 0)} plafond annuel
          ${pl.initialReportable > 0 ? ` · ${CI.fmtMoney(pl.initialReportable, 0)} de reports disponibles` : ''}
        </div>`;
    }

    // Insight A06
    const deductInsight = pl.isOverPlafond
      ? `<span class="warn">Votre versement dépasse le plafond.</span> Sur ${r.years} ans, <strong>${CI.fmtMoney(r.cumulatedDeductible, 0)} seront déductibles</strong> et ${CI.fmtMoney(r.cumulatedExcess, 0)} ne le seront pas.`
      : `Votre versement est <strong>dans le plafond</strong> (${utilisationPct} % utilisé). Sur ${r.years} ans, <strong>100 % de vos versements sont déductibles</strong> — ${CI.fmtMoney(r.cumulatedTaxSaving, 0)} d'économies fiscales.`;
    setInsight('pa-plafond',
      deductInsight + ` ` +
      (pl.initialReportable > 0
        ? `Les reports des 3 dernières années (<strong>${CI.fmtMoney(pl.initialReportable, 0)}</strong>) augmentent votre enveloppe disponible. `
        : '') +
      `<span class="muted">Plafond calculé sur votre revenu pro (10 % du revenu, plancher 10 % PASS = 4 710 €, plafond 8 PASS = 376 800 €).</span>`
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
    renderA06(p, r);
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
  window.exportPERPDF = function () {
    if (!lastResult || !lastParams) { CI.toast('Lance un calcul d\'abord', 'error'); return; }
    const p = lastParams;
    const summary = `${CI.fmtNum(p.monthlyContribution || 0, 0)} €/mois · TMI ${p.tmi || 30} % · ${p.years || 20} ans`;
    CI.exportPDF({
      title:    'CalcInvest — PER',
      summary:  summary,
      sectionIds: ['pa-synthese','pa-trajectoire','pa-sortie','pa-vscto','pa-sensitivity','pa-plafond'],
      fileName: 'calcinvest-per'
    });
  };

  /* Profile button click */
  window.selectPERProfile = function (profileId) {
    applyProfile(profileId);
    run();
  };

  /* Slider live update */
  window.onPERSliderChange = function () {
    updateSliderDisplay();
    run();
  };

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    writeForm(loadFromUrl());
    CI.initAll();

    // Listen on all form inputs
    document.querySelectorAll('#per-params input, #per-params select').forEach((el) => {
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    setTimeout(run, 30);
  });
})();
