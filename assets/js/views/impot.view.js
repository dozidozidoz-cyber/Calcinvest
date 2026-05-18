/* ============================================================
   CalcInvest — View Calculateur Impôt Revenu
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (v, d) => CI.fmtNum(v, d == null ? 0 : d);
  const fmtMoney = (v, d) => CI.fmtMoney(v, d == null ? 0 : d);
  const fmtPct = (v, d) => CI.fmtPctPlain(v, d == null ? 1 : d);

  function val(id, fb) {
    const el = $(id);
    if (!el) return fb;
    const n = parseFloat(el.value);
    return Number.isFinite(n) ? n : fb;
  }

  function checked(id, fb) {
    const el = $(id);
    return el ? !!el.checked : !!fb;
  }

  function txt(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function getParams() {
    return {
      salaireNet:     val('ir-salaire', 35000),
      autresRevenus:  val('ir-autres', 0),
      deductions:     val('ir-deductions', 0),
      adultes:        (document.querySelector('input[name="ir-foyer"]:checked')?.value === 'couple') ? 2 : 1,
      enfants:        val('ir-enfants', 0),
      parentIsole:    checked('ir-parent-isole', false),
      applyAbattement10: checked('ir-abat', true)
    };
  }

  function renderA01(p, r) {
    txt('ir-stat-revenu-imposable', fmtMoney(r.revenuNetImposable));
    txt('ir-stat-parts', r.parts.toFixed(1));
    txt('ir-stat-ir-net', fmtMoney(r.irNet));
    txt('ir-stat-ir-mensuel', fmtMoney(r.irMensuel));
    txt('ir-stat-tmi', fmt(r.tmi, 0) + ' %');
    txt('ir-stat-taux-moyen', fmt(r.tauxMoyen, 1) + ' %');
    txt('ir-stat-revenu-apres', fmtMoney(r.revenuNetApresImpot));

    const insight = $('ir-insight-a01');
    if (insight) {
      const decoteMsg = r.decote > 0 ? ` Décote appliquée : <strong class="pos">−${fmtMoney(r.decote)}</strong>.` : '';
      const plafondMsg = r.plafondAtteint ? ` <span class="warn">⚠ Plafond du quotient familial atteint</span> (avantage limité à ${fmtMoney(r.plafondAvantage)}).` : '';
      insight.querySelector('.insight-text').innerHTML = `
        Revenu net imposable : <strong>${fmtMoney(r.revenuNetImposable)}</strong> pour
        <strong>${r.parts.toFixed(1)} part${r.parts > 1 ? 's' : ''}</strong>.
        IR à payer : <strong class="neg">${fmtMoney(r.irNet)}</strong>
        (TMI ${fmt(r.tmi, 0)} %, taux moyen ${fmt(r.tauxMoyen, 1)} %).${decoteMsg}${plafondMsg}
      `;
    }
  }

  function renderA02(p, r) {
    // Décomposition par tranche
    const tbody = $('ir-table-tranches');
    if (!tbody) return;
    tbody.innerHTML = r.decomposition.map(d => `
      <tr>
        <td><strong>${fmtMoney(d.from)} → ${d.to ? fmtMoney(d.to) : '∞'}</strong></td>
        <td><span style="font-weight:600;color:${d.rate >= 30 ? 'var(--red)' : d.rate >= 11 ? 'var(--yellow,#FBBF24)' : 'var(--text-3)'}">${fmt(d.rate, 0)} %</span></td>
        <td>${fmtMoney(d.amountInBracket)}</td>
        <td class="neg"><strong>${fmtMoney(d.irForBracket)}</strong></td>
      </tr>
    `).join('');

    // Diagramme à barres horizontales
    renderBracketChart(r);
  }

  function renderBracketChart(r) {
    const svg = $('ir-chart-tranches');
    if (!svg) return;
    const W = 800, H = 220, padL = 90, padR = 20, padT = 14, padB = 26;
    const brackets = (window.IR && IR.BRACKETS) || [];
    const inner = W - padL - padR;
    const barH = (H - padT - padB) / brackets.length - 6;
    const maxAmount = Math.max(...brackets.map((b, i) => {
      const found = r.decomposition.find(d => d.from === b.from);
      return found ? found.amountInBracket : 0;
    }), 1);

    let svgInner = '';
    brackets.forEach((b, i) => {
      const y = padT + i * (barH + 6);
      const found = r.decomposition.find(d => d.from === b.from);
      const amount = found ? found.amountInBracket : 0;
      const w = (amount / maxAmount) * inner;
      const color = b.rate >= 0.41 ? '#DC2626' : b.rate >= 0.30 ? '#F87171' : b.rate >= 0.11 ? '#FBBF24' : 'var(--accent)';
      // Label
      svgInner += `<text x="${padL - 6}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="11" fill="var(--text-3)" font-weight="600">${(b.rate * 100).toFixed(0)} %</text>`;
      // Bar bg
      svgInner += `<rect x="${padL}" y="${y}" width="${inner}" height="${barH}" fill="var(--bg)" rx="3"/>`;
      // Bar fill
      if (w > 0) svgInner += `<rect x="${padL}" y="${y}" width="${w}" height="${barH}" fill="${color}" rx="3"/>`;
      // Range text
      const rangeTxt = `${(b.from / 1000).toFixed(0)}k → ${b.to === Infinity ? '∞' : (b.to / 1000).toFixed(0) + 'k'}`;
      svgInner += `<text x="${padL + 6}" y="${y + barH / 2 + 4}" font-size="10" fill="var(--text-4)" font-family="var(--font-mono)">${rangeTxt}</text>`;
      // Amount + IR
      if (found && amount > 0) {
        const ir = found.irForBracket;
        svgInner += `<text x="${padL + w + 8}" y="${y + barH / 2 + 4}" font-size="11" fill="var(--text-2)" font-weight="600">${fmtMoney(amount)} → IR ${fmtMoney(ir)}</text>`;
      }
    });
    svg.innerHTML = svgInner;
  }

  function renderA03(p, r) {
    // Coût marginal des prochains euros
    if (!window.IR) return;
    const increments = [1000, 5000, 10000, 20000];
    const rows = increments.map(inc => {
      const m = IR.marginalCost(p, inc);
      return `<tr>
        <td><strong>+${fmtMoney(inc)}</strong></td>
        <td>${fmtMoney(m.irMarginal)}</td>
        <td><strong style="color:${m.effectiveRate >= 30 ? 'var(--red)' : m.effectiveRate >= 11 ? 'var(--yellow,#FBBF24)' : 'var(--accent)'}">${fmt(m.effectiveRate, 1)} %</strong></td>
        <td class="pos">${fmtMoney(inc - m.irMarginal)}</td>
      </tr>`;
    }).join('');
    const tbody = $('ir-table-marginal');
    if (tbody) tbody.innerHTML = rows;

    const insight = $('ir-insight-a03');
    if (insight) {
      const m1k = IR.marginalCost(p, 1000);
      insight.querySelector('.insight-text').innerHTML = `
        Sur les <strong>1 000 € suivants</strong> gagnés, l'État prendra
        <strong class="neg">${fmtMoney(m1k.irMarginal)}</strong> d'IR
        (taux marginal effectif <strong>${fmt(m1k.effectiveRate, 1)} %</strong>).
        Stratégie : si tu peux déduire ce gain (PER, dons, etc.), tu économises ce taux marginal — pas le taux moyen.
      `;
    }
  }

  function run() {
    if (!window.IR) {
      console.warn('[ir-view] IR core not loaded');
      return;
    }
    const p = getParams();
    const r = IR.calcIR(p);
    renderA01(p, r);
    renderA02(p, r);
    renderA03(p, r);
    renderA04(p, r);

    const sum = $('ir-sum-params');
    if (sum) {
      sum.textContent = `${p.adultes === 2 ? 'Couple' : 'Célibataire'} · ${p.enfants} enfant${p.enfants > 1 ? 's' : ''} · ${fmtMoney(p.salaireNet)}/an`;
    }
    if (CI.setUrlParams) {
      CI.setUrlParams({
        s: p.salaireNet, a: p.autresRevenus, d: p.deductions,
        f: p.adultes, e: p.enfants
      });
    }
  }

  function renderA04(p, r) {
    if (!IR.perOptimizer) return;
    const opt = IR.perOptimizer(p);
    if (opt.deja) {
      txt('ir-per-versement', '—');
      txt('ir-per-gain', '—');
      txt('ir-per-cout', '—');
      txt('ir-per-plafond', '—');
      const ins = $('ir-insight-a04');
      if (ins) ins.querySelector('.insight-text').innerHTML = '<strong>' + opt.message + '</strong>';
      return;
    }
    txt('ir-per-versement', fmtMoney(opt.versementPourTrancheInferieure));
    txt('ir-per-gain', '−' + fmtMoney(opt.gainFiscal));
    txt('ir-per-cout', fmtMoney(opt.coutNetReel));
    txt('ir-per-plafond', fmtMoney(opt.plafondPER));

    const ins = $('ir-insight-a04');
    if (ins) {
      const insTxt = ins.querySelector('.insight-text');
      if (opt.depassePlafond) {
        const ratio = (opt.plafondPER / opt.versementPourTrancheInferieure) * 100;
        const gainPossible = opt.plafondPER * (opt.currentTMI / 100);
        insTxt.innerHTML = '<strong class="warn">⚠ Le versement nécessaire (' + fmtMoney(opt.versementPourTrancheInferieure) + ') dépasse votre plafond PER 2025 (' + fmtMoney(opt.plafondPER) + ').</strong> ' +
          'En versant le plafond complet (<strong>' + fmtMoney(opt.plafondPER) + '</strong>), vous économiserez <strong class="pos">' + fmtMoney(gainPossible) + '</strong> d\'IR cette année — sans changer de tranche. ' +
          'Pour passer en tranche ' + (opt.currentTMI - 11) + ' %, il faudrait étaler sur ' + Math.ceil(opt.versementPourTrancheInferieure / opt.plafondPER) + ' ans (en cumulant les plafonds non utilisés).';
      } else {
        insTxt.innerHTML = 'En versant <strong>' + fmtMoney(opt.versementPourTrancheInferieure) + '</strong> sur votre PER cette année, vous passez de la tranche <strong>' + opt.currentTMI + ' %</strong> à <strong class="pos">' + opt.newTMI + ' %</strong>. ' +
          'Économie fiscale directe : <strong class="pos">' + fmtMoney(opt.gainFiscal) + '</strong>. Le versement vous coûte réellement <strong>' + fmtMoney(opt.coutNetReel) + '</strong> net (le reste retourne dans votre PER, capital placé). ' +
          'Sortie : taxée TMI + PS 17.2 % à la retraite (souvent plus bas qu\'aujourd\'hui).';
      }
    }
  }

  function safeInit() {
    try {
      // Restore URL state
      const params = new URLSearchParams(location.search);
      const setIf = (id, key) => {
        const v = params.get(key);
        if (v != null && $(id)) $(id).value = v;
      };
      setIf('ir-salaire', 's');
      setIf('ir-autres', 'a');
      setIf('ir-deductions', 'd');
      setIf('ir-enfants', 'e');
      const f = params.get('f');
      if (f === '2' && $('ir-couple')) $('ir-couple').checked = true;

      const btn = $('ir-btn-calc');
      if (btn) btn.addEventListener('click', run);
      // Auto-run sur changement
      document.querySelectorAll('#page-ir input, #page-ir select').forEach(el => {
        el.addEventListener('change', run);
      });

      CI.initAll && CI.initAll();
      // Save button
      CI.attachSaveButton && CI.attachSaveButton({
        btnId: 'ir-btn-save', type: 'impot-revenu',
        getParams, defaultName: 'Mon foyer fiscal'
      });

      run();
    } catch (e) {
      console.error('[ir-view] init error', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit);
  } else {
    safeInit();
  }
})();
