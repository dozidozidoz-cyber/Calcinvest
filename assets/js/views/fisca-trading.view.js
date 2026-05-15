/* ============================================================
   CalcInvest — View Fiscalité Trading FR
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (n, dec) => {
    dec = dec == null ? 0 : dec;
    if (!Number.isFinite(n)) return '—';
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  function readParams() {
    return {
      plusValue:    parseFloat($('fs-pv').value)        || 10000,
      otherRevenue: parseFloat($('fs-other').value)     || 40000,
      qf:           parseFloat($('fs-qf').value)        || 1,
      // CTO vs PEA
      yearsHeld:    parseFloat($('fs-years').value)     || 6,
      // Statut
      nbTrades:     parseFloat($('fs-trades').value)    || 50,
      turnover:     parseFloat($('fs-turnover').value)  || 50000,
      profit:       parseFloat($('fs-profit').value)    || 5000,
      isPrincipal:  $('fs-principal').checked,
      // Imputation MV
      loss2025:     parseFloat($('fs-loss-2025').value) || 0,
      loss2024:     parseFloat($('fs-loss-2024').value) || 0,
      loss2023:     parseFloat($('fs-loss-2023').value) || 0,
      currentGain:  parseFloat($('fs-current-gain').value) || 0
    };
  }

  function updateParamSummary(p) {
    const sum = $('fs-sum-params');
    if (!sum) return;
    sum.textContent = `PV ${fmt(p.plusValue)} € · revenus ${fmt(p.otherRevenue)} € · QF ${p.qf}`;
  }

  // ─── A1 : PFU vs IR ───
  function renderA01(p) {
    const r = FISCAT.pfuVsIR(p);
    if (r.error) { $('fs-insight-a01').innerHTML = `<span class="warn">${r.error}</span>`; return; }

    $('fs-stat-pfu').textContent = fmt(r.pfu.total) + ' €';
    $('fs-stat-pfu-rate').textContent = fmt(r.pfu.effectiveRate, 1) + ' %';
    $('fs-stat-pfu-net').textContent = fmt(r.pfu.netGain) + ' €';

    $('fs-stat-ir').textContent = fmt(r.ir.total) + ' €';
    $('fs-stat-ir-rate').textContent = fmt(r.ir.effectiveRate, 1) + ' %';
    $('fs-stat-ir-net').textContent = fmt(r.ir.netGain) + ' €';

    $('fs-stat-winner').textContent = r.winner;
    $('fs-stat-winner').className = 'stat-value pos';
    $('fs-stat-savings').textContent = fmt(r.savings) + ' €';
    $('fs-stat-tmi').textContent = r.tmiBefore + ' % → ' + r.tmiAfter + ' %';

    $('fs-insight-a01').innerHTML = `
      Sur <strong>${fmt(p.plusValue)} €</strong> de plus-value avec <strong>${fmt(p.otherRevenue)} €</strong> d'autres revenus :
      <strong class="pos">${r.winner === 'PFU' ? 'PFU 30 % (flat tax)' : 'option IR au barème'}</strong> est plus avantageux.
      Vous économisez <strong>${fmt(r.savings)} €</strong> par rapport à l'autre option.
      TMI : ${r.tmiBefore} % → ${r.tmiAfter} % avec la PV.
      ${p.plusValue > 0 && r.tmiBefore < 14 ? '<br/><span class="muted">Conseil : à TMI 0 ou 11 %, l\'option IR bat presque toujours le PFU.</span>' : ''}
    `;
  }

  // ─── A2 : CTO vs PEA ───
  function renderA02(p) {
    const r = FISCAT.ctoVsPEA({ plusValue: p.plusValue, yearsHeld: p.yearsHeld });

    $('fs-stat-cto-total').textContent = fmt(r.cto.total) + ' €';
    $('fs-stat-cto-net').textContent = fmt(r.cto.netGain) + ' €';
    $('fs-stat-pea-total').textContent = fmt(r.pea.total) + ' €';
    $('fs-stat-pea-net').textContent = fmt(r.pea.netGain) + ' €';
    $('fs-stat-pea-status').textContent = r.pea.eligible ? '✓ Éligible (≥ 5 ans)' : '✗ Trop tôt (< 5 ans)';
    $('fs-stat-pea-status').className = 'stat-value ' + (r.pea.eligible ? 'pos' : 'warn');

    $('fs-insight-a02').innerHTML = `
      Sur <strong>${fmt(p.plusValue)} €</strong> de plus-value avec <strong>${p.yearsHeld} ans</strong> de détention :
      <strong class="pos">${r.winner}</strong> gagne, économie de <strong>${fmt(r.savings)} €</strong>.
      ${r.pea.eligible
        ? '<br/>Le PEA exonère 12.8 % d\'IR après 5 ans (PS 17.2 % toujours dus). Plafond versements : 150 000 €.'
        : '<br/><span class="warn">Avant 5 ans, retrait = clôture + imposition normale. Tenez si vous le pouvez.</span>'}
      <br/><span class="muted">Limites PEA : actions UE, ETF éligibles uniquement. Pas de crypto, options, US directes.</span>
    `;
  }

  // ─── A3 : Statut ───
  function renderA03(p) {
    const r = FISCAT.statutOccasionnelVsHabituel({
      nbTrades: p.nbTrades, turnover: p.turnover, profit: p.profit,
      isPrincipalActivity: p.isPrincipal
    });

    const cls = r.regime === 'occasionnel' ? 'pos' : r.regime === 'gris' ? 'warn' : 'neg';
    $('fs-stat-regime').textContent = r.regime.toUpperCase();
    $('fs-stat-regime').className = 'stat-value ' + cls;
    $('fs-stat-flags').textContent = r.flags.length;

    const flagsHtml = r.flags.length === 0
      ? '<span class="pos">Aucun critère de requalification atteint — vous êtes dans la zone safe.</span>'
      : '<strong>Critères atteints :</strong><br/>' + r.flags.map(f => '• ' + f).join('<br/>');

    let regimeInfo = '';
    if (r.regime === 'occasionnel') {
      regimeInfo = '<strong class="pos">Régime occasionnel</strong> — PFU 30 % ou option IR au barème, comme un investisseur classique.';
    } else if (r.regime === 'gris') {
      regimeInfo = '<strong class="warn">Zone grise</strong> — le fisc peut requalifier en BIC pro à sa discrétion. Documentez votre activité (caractère non-professionnel) et consultez un fiscaliste.';
    } else {
      regimeInfo = `<strong class="neg">Régime BIC professionnel</strong> probable — bénéfices imposés au barème IR + cotisations URSSAF (~22 % en micro-BIC, jusqu'à 45 % total). Vous devez vous immatriculer (SIRET) et tenir une comptabilité.`;
    }

    $('fs-insight-a03').innerHTML = `
      ${regimeInfo}
      <br/><br/>
      ${flagsHtml}
    `;
  }

  // ─── A4 : Imputation MV ───
  function renderA04(p) {
    const losses = [];
    if (p.loss2025 > 0) losses.push({ year: 2025, loss: p.loss2025 });
    if (p.loss2024 > 0) losses.push({ year: 2024, loss: p.loss2024 });
    if (p.loss2023 > 0) losses.push({ year: 2023, loss: p.loss2023 });

    const r = FISCAT.imputationMV({
      lossesByYear: losses,
      currentGain: p.currentGain,
      currentYear: 2026
    });

    $('fs-stat-total-losses').textContent = fmt(r.totalLossesAvailable) + ' €';
    $('fs-stat-offset').textContent = fmt(r.offsetUsed) + ' €';
    $('fs-stat-taxable').textContent = fmt(r.taxableGain) + ' €';
    $('fs-stat-savings-imp').textContent = fmt(r.taxSavingsApprox) + ' €';

    if (r.totalLossesAvailable === 0 && p.currentGain === 0) {
      $('fs-insight-a04').innerHTML = '<span class="muted">Renseignez vos pertes des années passées et le gain de l\'année en cours pour voir l\'imputation.</span>';
      return;
    }

    $('fs-insight-a04').innerHTML = `
      Avec <strong>${fmt(r.totalLossesAvailable)} €</strong> de moins-values reportables et
      <strong>${fmt(p.currentGain)} €</strong> de gain cette année :
      vous imputez <strong class="pos">${fmt(r.offsetUsed)} €</strong>,
      ne payez l'impôt que sur <strong>${fmt(r.taxableGain)} €</strong>,
      économisant environ <strong class="pos">${fmt(r.taxSavingsApprox)} €</strong> de fiscalité.
      ${r.remainingLossCarried > 0
        ? `<br/>Il reste <strong>${fmt(r.remainingLossCarried)} €</strong> de pertes reportables sur les années suivantes.`
        : ''}
    `;
  }

  function run() {
    if (typeof FISCAT === 'undefined') return;
    const p = readParams();
    updateParamSummary(p);
    renderA01(p);
    renderA02(p);
    renderA03(p);
    renderA04(p);
  }

  function init() {
    if (CI && CI.initAll) CI.initAll();
    ['fs-pv','fs-other','fs-qf','fs-years','fs-trades','fs-turnover','fs-profit','fs-principal','fs-loss-2025','fs-loss-2024','fs-loss-2023','fs-current-gain'].forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('change', run);
      if (el.type !== 'checkbox') el.addEventListener('input', () => {
        clearTimeout(el._t); el._t = setTimeout(run, 200);
      });
    });
    const btn = $('fs-btn-calc'); if (btn) btn.addEventListener('click', run);
    run();
  }

  function safeInit() {
    try { init(); }
    catch(e) { console.error('[view] init failed:', e.message); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
  else safeInit();
})();
