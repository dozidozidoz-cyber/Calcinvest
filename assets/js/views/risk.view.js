/* ============================================================
   CalcInvest — View Risk Management
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmtM = (n, dec) => {
    dec = dec == null ? 0 : dec;
    if (!Number.isFinite(n)) return '—';
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  const fmtP = (n, dec) => {
    dec = dec == null ? 1 : dec;
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(dec) + ' %';
  };

  function readParams() {
    return {
      balance:        CI.safeNum('rk-balance', 10000),
      riskPct:        CI.safeNum('rk-risk', 1),
      stopPct:        CI.safeNum('rk-stop', 5),
      winRate:        CI.safeNum('rk-wr', 50),
      rrRatio:        CI.safeNum('rk-rr', 2),
      numTrades:      CI.safeNum('rk-n', 200),
      streakLosses:   parseInt($('rk-streak').value)    || 10
    };
  }

  function updateParamSummary(p) {
    const sum = $('rk-sum-params');
    if (!sum) return;
    sum.textContent = `${fmtM(p.balance, 0)} € · ${p.riskPct}% / trade · WR ${p.winRate}% · R/R 1:${p.rrRatio}`;
  }

  // ─── A1 : Position sizing ─────────────────────────────
  function renderA01(p) {
    const ps = RISK.positionSizing({ balance: p.balance, riskPct: p.riskPct, stopPct: p.stopPct });
    if (ps.error) { $('rk-insight-a01').innerHTML = `<span class="neg">⚠ ${ps.error}</span>`; return; }

    $('rk-stat-risk').textContent = fmtM(ps.riskAmount, 0) + ' €';
    $('rk-stat-position').textContent = fmtM(ps.positionSize, 0) + ' €';
    $('rk-stat-positionpct').textContent = fmtP(ps.positionPct);
    $('rk-stat-leverage').textContent = ps.leverage.toFixed(2) + 'x';

    // Insight
    const isLeveraged = ps.leverage > 1;
    $('rk-insight-a01').innerHTML = `
      Pour risquer <strong>${fmtM(ps.riskAmount, 0)} €</strong> (${p.riskPct}% de ${fmtM(p.balance, 0)} €)
      avec un stop à <strong>${p.stopPct}%</strong>, votre position doit valoir <strong>${fmtM(ps.positionSize, 0)} €</strong>
      ${isLeveraged ? `— soit ${ps.leverage.toFixed(2)}x de levier <span class="warn">(au-delà de votre capital)</span>` : `(${fmtP(ps.positionPct, 0)} de votre capital, sans levier)`}.
      Si le stop est touché, vous perdez exactement <strong>${fmtM(ps.riskAmount, 0)} €</strong>.
    `;
  }

  // ─── A2 : R/R + Expectancy ────────────────────────────
  function renderA02(p) {
    // Avec position sizée, gain et perte se déduisent
    const ps = RISK.positionSizing({ balance: p.balance, riskPct: p.riskPct, stopPct: p.stopPct });
    const avgLoss = ps.riskAmount;
    const avgWin = avgLoss * p.rrRatio;

    const ex = RISK.expectancy({ winRate: p.winRate, avgWin, avgLoss });

    $('rk-stat-wr').textContent = fmtP(p.winRate, 0);
    $('rk-stat-rr').textContent = '1:' + p.rrRatio.toFixed(2);
    $('rk-stat-breakeven').textContent = fmtP(ex.breakevenWinRate);
    $('rk-stat-edge').textContent = fmtP(p.winRate - ex.breakevenWinRate);

    $('rk-stat-expectancy').textContent = (ex.expectancyPerTrade >= 0 ? '+' : '') + fmtM(ex.expectancyPerTrade, 1) + ' €';
    $('rk-stat-expectancy').className = 'stat-value ' + (ex.expectancyPerTrade >= 0 ? 'pos' : 'neg');

    $('rk-stat-expR').textContent = (ex.expectancyR >= 0 ? '+' : '') + ex.expectancyR.toFixed(2) + ' R';

    $('rk-stat-pf').textContent = Number.isFinite(ex.profitFactor) ? ex.profitFactor.toFixed(2) : '∞';
    $('rk-stat-pf').className = 'stat-value ' + (ex.profitFactor >= 1.5 ? 'pos' : (ex.profitFactor < 1 ? 'neg' : 'warn'));

    // Projection sur N trades
    const totalProfit = ex.expectancyPerTrade * p.numTrades;
    $('rk-stat-totalprofit').textContent = (totalProfit >= 0 ? '+' : '') + fmtM(totalProfit, 0) + ' €';
    $('rk-stat-totalprofit').className = 'stat-value ' + (totalProfit >= 0 ? 'pos' : 'neg');

    // Insight selon edge
    const edge = p.winRate - ex.breakevenWinRate;
    let verdict;
    if (edge < 0)         verdict = '<span class="neg">système non profitable</span> à long terme — vous perdez de l\'argent statistiquement';
    else if (edge < 3)    verdict = '<span class="warn">edge marginal</span> — la variance peut effacer le gain';
    else if (edge < 8)    verdict = '<span class="pos">edge correct</span> — système viable avec discipline';
    else                  verdict = '<strong class="pos">edge solide</strong> — paramètres très favorables (vérifiez vos hypothèses)';

    $('rk-insight-a02').innerHTML = `
      Votre système : <strong>${edge.toFixed(1)} pts d'edge</strong> au-dessus du breakeven → ${verdict}.
      Espérance par trade : <strong>${ex.expectancyPerTrade >= 0 ? '+' : ''}${fmtM(ex.expectancyPerTrade, 1)} €</strong>.
      Sur ${p.numTrades} trades, gain attendu : <strong>${totalProfit >= 0 ? '+' : ''}${fmtM(totalProfit, 0)} €</strong>.
    `;
  }

  // ─── A3 : Breakeven Table ─────────────────────────────
  function renderA03(p) {
    const table = RISK.breakevenTable();
    const tbody = $('rk-table-breakeven');
    if (!tbody) return;
    tbody.innerHTML = table.map(r => {
      const isCurrent = Math.abs(r.rr - p.rrRatio) < 0.01;
      const passOK = p.winRate >= r.breakeven;
      return `
        <tr ${isCurrent ? 'style="background:var(--accent-soft);font-weight:600"' : ''}>
          <td>1:${r.rr}</td>
          <td>${r.breakeven.toFixed(1)} %</td>
          <td class="${passOK ? 'pos' : 'neg'}">${passOK ? '✓' : '✗'} votre WR ${p.winRate}%</td>
          <td>${r.target.toFixed(1)} %</td>
        </tr>
      `;
    }).join('');
  }

  // ─── A4 : Drawdown streak ─────────────────────────────
  function renderA04(p) {
    const dd = RISK.drawdownStreak({
      balance: p.balance,
      riskPctPerTrade: p.riskPct,
      consecutiveLosses: p.streakLosses
    });

    const final = dd[dd.length - 1];
    $('rk-stat-streak-loss').textContent = fmtM(p.balance - final.balanceAfter, 0) + ' €';
    $('rk-stat-streak-dd').textContent = fmtP(final.cumDDPct);
    $('rk-stat-streak-balance').textContent = fmtM(final.balanceAfter, 0) + ' €';
    $('rk-stat-streak-recovery').textContent = fmtP((1 / (1 - final.cumDDPct/100) - 1) * 100);

    const tbody = $('rk-table-streak');
    if (tbody) {
      // Affiche les 10 premiers ou tous si moins de 10
      const display = dd.length > 15 ? [...dd.slice(0,5), {...dd[Math.floor(dd.length/2)], _sep: true}, ...dd.slice(-5)] : dd;
      tbody.innerHTML = display.map(r => {
        if (r._sep) return `<tr><td colspan="4" style="text-align:center;color:var(--text-4)">⋯</td></tr>`;
        return `<tr>
          <td>${r.trade}</td>
          <td class="neg">−${fmtM(r.loss, 0)} €</td>
          <td>${fmtM(r.balanceAfter, 0)} €</td>
          <td class="neg">−${fmtP(r.cumDDPct)}</td>
        </tr>`;
      }).join('');
    }

    $('rk-insight-a04').innerHTML = `
      Après <strong>${p.streakLosses} pertes consécutives</strong> à ${p.riskPct}% du capital chaque fois,
      votre compte serait à <strong>${fmtM(final.balanceAfter, 0)} €</strong>
      (<strong class="neg">−${fmtP(final.cumDDPct)}</strong>). Pour récupérer, il faut un gain de
      <strong class="warn">+${fmtP((1 / (1 - final.cumDDPct/100) - 1) * 100)}</strong> sur le capital restant.
      C'est l'asymétrie cruelle des drawdowns : perdre 50 % nécessite +100 % pour récupérer.
    `;
  }

  // ─── A5 : Probability of ruin ─────────────────────────
  function renderA05(p) {
    const pr = RISK.probabilityOfRuin({
      winRate: p.winRate,
      rrRatio: p.rrRatio,
      riskPctPerTrade: p.riskPct,
      numTrades: p.numTrades
    });

    $('rk-stat-pruin').textContent = fmtP(pr.probabilityRuin);
    $('rk-stat-pruin').className = 'stat-value ' + (pr.probabilityRuin < 5 ? 'pos' : (pr.probabilityRuin > 30 ? 'neg' : 'warn'));

    let interpretation;
    if (pr.edge <= 0) {
      interpretation = `<span class="neg">Edge négatif : ${pr.edge.toFixed(1)}%. Votre système perdra de l'argent à long terme</span> — ruine quasi certaine.`;
    } else if (pr.probabilityRuin < 1) {
      interpretation = `<span class="pos">Probabilité quasi nulle</span> de ruine. Vos paramètres sont solides.`;
    } else if (pr.probabilityRuin < 10) {
      interpretation = `<span class="pos">Risque acceptable</span> (${pr.probabilityRuin.toFixed(2)}%). Tenable sur la durée.`;
    } else if (pr.probabilityRuin < 30) {
      interpretation = `<span class="warn">Risque significatif</span> (${pr.probabilityRuin.toFixed(1)}%). Réduisez le risque par trade ou améliorez votre edge.`;
    } else {
      interpretation = `<span class="neg">Risque élevé</span> (${pr.probabilityRuin.toFixed(1)}%). Ce système est dangereux.`;
    }

    $('rk-insight-a05').innerHTML = `
      Avec WR=${p.winRate}%, R/R=1:${p.rrRatio}, risque ${p.riskPct}%/trade sur ${p.numTrades} trades :
      ${interpretation}
      <br/><br/>
      <span class="muted">Ruine = perte de 50 % du capital initial. Edge = écart entre votre WR et le WR de breakeven.</span>
    `;
  }

  // ─── RUN ───────────────────────────────────────────────
  function run() {
    if (typeof RISK === 'undefined') return;
    const p = readParams();
    updateParamSummary(p);
    renderA01(p);
    renderA02(p);
    renderA03(p);
    renderA04(p);
    renderA05(p);

    if (CI && CI.setUrlParams) {
      CI.setUrlParams({
        bal: p.balance, risk: p.riskPct, stop: p.stopPct,
        wr: p.winRate, rr: p.rrRatio, n: p.numTrades, streak: p.streakLosses
      });
    }
  }

  function populateTraderProfile() {
    const sel = $('rk-profile');
    if (!sel || sel.dataset.populated) return;
    sel.dataset.populated = '1';
    if (!window.PIPS || !window.PIPS.TRADER_PROFILES) return;
    sel.innerHTML = '<option value="">Personnalisé</option>' +
      Object.entries(window.PIPS.TRADER_PROFILES).map(([k, p]) =>
        `<option value="${k}">${p.name}</option>`).join('');
    sel.addEventListener('change', () => {
      const p = window.PIPS.TRADER_PROFILES[sel.value];
      if (!p) return;
      $('rk-risk').value = p.riskPct;
      $('rk-rr').value = p.rrRatio;
      $('rk-stop').value = p.stopPct;
      $('rk-n').value = p.numTrades;
      const note = $('rk-profile-note');
      if (note) note.textContent = p.note || '';
      run();
    });
    // Sync note initiale si profil pré-sélectionné
    const cur = window.PIPS.TRADER_PROFILES[sel.value];
    if (cur) {
      const note = $('rk-profile-note');
      if (note) note.textContent = cur.note;
    }
  }

  function init() {
    if (CI && CI.initAll) CI.initAll();
    populateTraderProfile();

    if (CI && CI.getUrlParam) {
      ['bal->rk-balance','risk->rk-risk','stop->rk-stop','wr->rk-wr','rr->rk-rr','n->rk-n','streak->rk-streak']
        .forEach(map => {
          const [k, id] = map.split('->');
          const v = CI.getUrlParam(k);
          if (v && $(id)) $(id).value = v;
        });
    }

    ['rk-balance','rk-risk','rk-stop','rk-wr','rk-rr','rk-n','rk-streak'].forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('change', run);
      if (el.tagName === 'INPUT') el.addEventListener('input', () => {
        clearTimeout(el._t); el._t = setTimeout(run, 200);
      });
    });

    const btn = $('rk-btn-calc'); if (btn) btn.addEventListener('click', run);
    if (CI && CI.attachSaveButton) {
      CI.attachSaveButton({
        btnId: 'rk-btn-save', type: 'risk', getParams: readParams,
        defaultName: 'Profil risk management'
      });
    }
    run();
  }

  function safeInit() {
    try { init(); }
    catch(e) { console.error('[view] init failed:', e.message); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
  else safeInit();
})();
