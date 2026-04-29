/* ============================================================
   CalcInvest — Compound VIEW (DOM binding)
   Reads form → calls CalcCompound.* → renders
   ============================================================ */

(function () {
  'use strict';

  const { calcCompound, calcCompoundMultiRate, calcGoal, calcEarlyStart, compareEnveloppes } = window.CalcCompound;
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

  const RATE_COLORS = {
    2:  '#60A5FA',
    4:  '#34D399',
    6:  '#FBBF24',
    8:  '#F97316',
    10: '#F87171',
    12: '#A78BFA'
  };

  /* ------------------------------------------------------------
     Read form
     ------------------------------------------------------------ */
  function readForm() {
    const v = (id) => num(document.getElementById(id)?.value);
    return {
      initialAmount:      v('c-initial'),
      monthlyAmount:      v('c-monthly'),
      contributionGrowth: v('c-growth'),
      annualRate:         v('c-rate'),
      years:              v('c-years'),
      inflation:          v('c-inflation'),
      feesPct:            v('c-fees')
    };
  }

  function writeForm(p) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('c-initial',   p.initialAmount);
    set('c-monthly',   p.monthlyAmount);
    set('c-growth',    p.contributionGrowth ?? 0);
    set('c-rate',      p.annualRate);
    set('c-years',     p.years);
    set('c-inflation', p.inflation);
    set('c-fees',      p.feesPct);
  }

  /* ------------------------------------------------------------
     URL state
     ------------------------------------------------------------ */
  const URL_KEYS = ['initialAmount', 'monthlyAmount', 'contributionGrowth', 'annualRate', 'years', 'inflation', 'feesPct'];

  function syncUrl(p) {
    const out = {};
    URL_KEYS.forEach((k) => { out[k] = p[k]; });
    CI.setUrlParams(out);
  }

  function loadFromUrl() {
    const defaults = {
      initialAmount: 10000, monthlyAmount: 200, contributionGrowth: 0,
      annualRate: 7, years: 20, inflation: 2, feesPct: 0.2
    };
    URL_KEYS.forEach((k) => {
      const v = CI.getUrlParam(k);
      if (v !== null) defaults[k] = num(v);
    });
    return defaults;
  }

  /* ------------------------------------------------------------
     A01 — Synthèse
     ------------------------------------------------------------ */
  function renderA01(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('cs-final',        CI.fmtMoney(r.finalValue, 0));
    set('cs-invested',     CI.fmtMoney(r.finalInvested, 0));
    set('cs-interest',     CI.fmtMoney(r.finalInterest, 0));
    set('cs-mult',         'x' + r.multiplier.toFixed(2));
    set('cs-interest-pct', (r.interestShare).toFixed(0) + ' % du capital final');
    set('cs-doubling',     r.doublingYears != null ? r.doublingYears.toFixed(1) + ' ans' : '—');
    set('cs-net-rate',     CI.fmtPctPlain(r.netAnnualRate, 2) + '/an net');

    cls('cs-final', 'pos');
    cls('cs-interest', 'pos');

    // Coût des frais
    if (p.feesPct > 0) {
      set('cs-fees-cost', '−' + CI.fmtMoney(r.feesCost, 0) + ' sur ' + p.years + ' ans');
      const feesEl = document.getElementById('cs-fees-row');
      if (feesEl) feesEl.style.display = '';
    } else {
      const feesEl = document.getElementById('cs-fees-row');
      if (feesEl) feesEl.style.display = 'none';
    }

    // Summary accordion
    const sum = document.getElementById('c-sum-params');
    if (sum) sum.textContent =
      CI.fmtCompact(p.initialAmount) + ' initial · ' +
      CI.fmtNum(p.monthlyAmount, 0) + ' €/mois · ' +
      CI.fmtPctPlain(p.annualRate, 1) + ' · ' + p.years + ' ans';

    // Table
    const tbody = document.getElementById('ca1-tbody');
    if (tbody) {
      tbody.innerHTML = r.yearly.map((yr) => {
        const interestShare = yr.value > 0 ? (yr.interest / yr.value * 100).toFixed(0) : 0;
        return `<tr>
          <td>An ${yr.year}</td>
          <td>${CI.fmtNum(yr.value, 0)}</td>
          <td>${CI.fmtNum(yr.invested, 0)}</td>
          <td class="pos">${CI.fmtNum(yr.interest, 0)}</td>
          <td>${interestShare} %</td>
          <td>${p.inflation > 0 ? CI.fmtNum(yr.realValue, 0) : '—'}</td>
        </tr>`;
      }).join('');
    }

    // Chart
    requestAnimationFrame(() => {
      const labels = r.yearly.map((y) => 'An ' + y.year);
      CI.drawChart('ca1-chart', labels, [
        { label: 'Versé',  data: r.yearly.map((y) => y.invested), color: '#60A5FA', fill: true, width: 1.5 },
        { label: 'Valeur', data: r.yearly.map((y) => y.value),    color: '#34D399', fill: true, width: 2.5 }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Insight A01
    const interestShare = (r.finalInterest / r.finalValue * 100).toFixed(0);
    const doublingLine = r.doublingYears != null
      ? ` Le capital double tous les <strong>${r.doublingYears.toFixed(1)} ans</strong> à ce rythme.`
      : '';
    const growthLine = p.contributionGrowth > 0
      ? ` Avec une hausse des versements de <strong>${p.contributionGrowth} %/an</strong>, l'effet boule de neige est amplifié — le versement final est ×${(Math.pow(1 + p.contributionGrowth / 100, p.years - 1)).toFixed(2)} celui de départ.`
      : '';
    setInsight('ca-synthese',
      `À <strong>${p.annualRate} %/an</strong> sur <strong>${p.years} ans</strong>, ` +
      `<em>${CI.fmtMoney(r.finalInvested, 0)}</em> versés deviennent <em>${CI.fmtMoney(r.finalValue, 0)}</em> ` +
      `(×${r.multiplier.toFixed(2)}). Les intérêts représentent <span class="pos">${CI.fmtMoney(r.finalInterest, 0)}</span>, ` +
      `soit <strong>${interestShare} %</strong> du capital final.${doublingLine}${growthLine}` +
      ` <span class="muted">C'est ça la magie des intérêts composés : plus longtemps tu laisses tourner, plus la part des intérêts explose.</span>`
    );
  }

  /* ------------------------------------------------------------
     A02 — Comparaison taux
     ------------------------------------------------------------ */
  function renderA02(p) {
    const rates  = [2, 4, 6, 8, 10, 12];
    const comps  = calcCompoundMultiRate(p, rates);
    const labels = comps[0].yearly.map((y) => 'An ' + y.year);
    const curr   = p.annualRate;

    // Cards
    const cards = document.getElementById('ca2-cards');
    if (cards) {
      cards.innerHTML = comps.map((c) => {
        const isCurr = Math.abs(c.rate - curr) < 0.01;
        const border = isCurr ? 'var(--accent)' : 'var(--border-soft)';
        const badge  = isCurr ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">ACTUEL</span>' : '';
        return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:13px;font-weight:600;color:${RATE_COLORS[c.rate] || 'var(--text-1)'}">${c.rate} %/an</div>${badge}
          </div>
          <div style="font-size:20px;font-weight:700">${CI.fmtCompact(c.finalValue)}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:3px">×${c.multiplier.toFixed(1)} · intérêts : ${CI.fmtCompact(c.finalValue - c.finalInvested)}</div>
        </div>`;
      }).join('');
    }

    // Chart
    requestAnimationFrame(() => {
      CI.drawChart('ca2-chart', labels,
        comps.map((c) => ({
          data:  c.yearly.map((y) => y.value),
          color: RATE_COLORS[c.rate] || '#888',
          width: Math.abs(c.rate - curr) < 0.01 ? 3 : 1.5,
          dash:  Math.abs(c.rate - curr) < 0.01 ? [] : undefined
        })),
        { yFormat: (v) => CI.fmtCompact(v) }
      );
    });

    // Meta
    const meta = document.getElementById('ca2-meta');
    if (meta) meta.textContent = CI.fmtCompact(p.initialAmount) + ' initial · ' + CI.fmtNum(p.monthlyAmount, 0) + ' €/mois · ' + p.years + ' ans';

    // Insight A02
    const at4 = comps.find((c) => c.rate === 4);
    const at8 = comps.find((c) => c.rate === 8);
    const at12 = comps.find((c) => c.rate === 12);
    if (at4 && at8 && at12) {
      setInsight('ca-taux',
        `À <strong>${p.years} ans</strong>, passer de <strong>4 %</strong> à <strong>8 %/an</strong> ` +
        `transforme <em>${CI.fmtCompact(at4.finalValue)}</em> en <em>${CI.fmtCompact(at8.finalValue)}</em> ` +
        `(<span class="pos">×${(at8.finalValue / at4.finalValue).toFixed(2)}</span>). ` +
        `À 12 % : <span class="pos">${CI.fmtCompact(at12.finalValue)}</span>. ` +
        `<span class="muted">Chaque point de rendement supplémentaire compose exponentiellement — le choix du véhicule (livret, ETF, actions) compte plus que le montant initial.</span>`
      );
    }
  }

  /* ------------------------------------------------------------
     A03 — Calculateur d'objectif
     ------------------------------------------------------------ */
  function renderA03(p) {
    const modeEl = document.getElementById('ca3-mode');
    const mode   = modeEl ? modeEl.value : 'monthly'; // 'monthly' | 'time'
    const goalEl = document.getElementById('ca3-goal');
    const goal   = goalEl ? (num(goalEl.value) || 100000) : 100000;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

    // Fill info spans
    set('ca3-row-years',   p.years);
    set('ca3-row-monthly', CI.fmtNum(p.monthlyAmount, 0));

    if (mode === 'monthly') {
      // Combien épargner chaque mois pour atteindre goal en p.years ans ?
      const g = calcGoal({ ...p, goalAmount: goal });
      const monthly = g.requiredMonthly;
      set('ca3-result-main',  CI.fmtMoney(Math.ceil(monthly), 0) + '/mois');
      set('ca3-result-sub',   'pour atteindre ' + CI.fmtCompact(goal) + ' en ' + p.years + ' ans');
      set('ca3-result-extra', 'Total versé : ' + CI.fmtMoney(p.initialAmount + Math.ceil(monthly) * p.years * 12, 0) +
        ' · Intérêts : ' + CI.fmtMoney(goal - (p.initialAmount + Math.ceil(monthly) * p.years * 12), 0));
      show('ca3-row-years', true);
      show('ca3-row-monthly', false);
    } else {
      // Dans combien de temps avec p.monthlyAmount ?
      const g = calcGoal({ ...p, goalAmount: goal, years: null, monthlyAmount: p.monthlyAmount });
      const yrs = g.yearsToGoal;
      if (yrs == null || yrs < 0) {
        set('ca3-result-main',  'Jamais');
        set('ca3-result-sub',   'Le versement mensuel est insuffisant');
        set('ca3-result-extra', 'Augmentez le versement ou le taux.');
      } else {
        const y = Math.floor(yrs);
        const m = Math.round((yrs - y) * 12);
        set('ca3-result-main',  y + ' ans' + (m > 0 ? ' ' + m + ' mois' : ''));
        set('ca3-result-sub',   'pour atteindre ' + CI.fmtCompact(goal) + ' à ' + CI.fmtNum(p.monthlyAmount, 0) + ' €/mois');
        set('ca3-result-extra', 'Total versé ≈ ' + CI.fmtMoney(p.initialAmount + p.monthlyAmount * yrs * 12, 0));
      }
      show('ca3-row-years', false);
      show('ca3-row-monthly', true);
    }

    // Insight A03
    if (mode === 'monthly') {
      const g = calcGoal({ ...p, goalAmount: goal });
      const monthly = g.requiredMonthly;
      const total = p.initialAmount + Math.ceil(monthly) * p.years * 12;
      const interestPart = goal - total;
      setInsight('ca-objectif',
        `Pour atteindre <strong>${CI.fmtCompact(goal)}</strong> en <strong>${p.years} ans</strong> à ${p.annualRate} %/an, ` +
        `il faut épargner <em>${CI.fmtMoney(Math.ceil(monthly), 0)}/mois</em>. ` +
        `Au total, tu versera <strong>${CI.fmtMoney(total, 0)}</strong>, et les intérêts apporteront ` +
        `<span class="pos">${CI.fmtMoney(interestPart, 0)}</span> de plus. ` +
        `<span class="muted">Plus le taux est élevé et l'horizon long, plus la part des intérêts dépasse celle des versements.</span>`
      );
    } else {
      const g = calcGoal({ ...p, goalAmount: goal, years: null, monthlyAmount: p.monthlyAmount });
      const yrs = g.yearsToGoal;
      if (yrs == null || yrs < 0) {
        setInsight('ca-objectif',
          `<span class="warn">Avec ${CI.fmtNum(p.monthlyAmount, 0)} €/mois et ${p.annualRate} %/an, ` +
          `tu n'atteindras jamais ${CI.fmtCompact(goal)}.</span> ` +
          `Augmente le versement ou le taux de rendement.`
        );
      } else {
        const total = p.initialAmount + p.monthlyAmount * yrs * 12;
        setInsight('ca-objectif',
          `Avec <strong>${CI.fmtNum(p.monthlyAmount, 0)} €/mois</strong> à ${p.annualRate} %/an, ` +
          `tu atteindra <strong>${CI.fmtCompact(goal)}</strong> en <em>${yrs.toFixed(1)} ans</em>. ` +
          `Total versé : ${CI.fmtMoney(total, 0)}, soit <span class="pos">${CI.fmtMoney(goal - total, 0)}</span> d'intérêts générés. ` +
          `<span class="muted">Augmenter le versement de 50 % réduit le temps d'environ 25 %.</span>`
        );
      }
    }
  }

  /* ------------------------------------------------------------
     A04 — Effet de commencer tôt
     ------------------------------------------------------------ */
  function renderA04(p) {
    const scenarios = calcEarlyStart(p, [5, 10, 15, 20]);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    // Stats principale : valeur avec 10 ans d'avance vs maintenant
    const base   = scenarios.find((s) => s.extra === 0);
    const plus10 = scenarios.find((s) => s.extra === 10);
    if (base && plus10) {
      set('ca4-gain10', CI.fmtMoney(plus10.valueAtHorizon - base.valueAtHorizon, 0));
      set('ca4-mult10', '×' + (plus10.valueAtHorizon / base.valueAtHorizon).toFixed(2));
    }

    // Cards
    const cards = document.getElementById('ca4-cards');
    if (cards) {
      cards.innerHTML = scenarios.map((s) => {
        const isBase  = s.extra === 0;
        const border  = isBase ? 'var(--border-soft)' : 'var(--accent)';
        const label   = isBase ? 'Commencer aujourd\'hui' : '+' + s.extra + ' ans d\'avance';
        const badge   = isBase ? '<span style="font-size:10px;background:var(--blue);color:#fff;padding:2px 7px;border-radius:99px;font-weight:700">MAINTENANT</span>' : '';
        const diff    = !isBase ? (' <span style="color:var(--accent);font-size:12px">+' + CI.fmtCompact(s.valueAtHorizon - base.valueAtHorizon) + '</span>') : '';
        return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:12px;font-weight:600;color:var(--text-2)">${label}</div>${badge}
          </div>
          <div style="font-size:20px;font-weight:700">${CI.fmtCompact(s.valueAtHorizon)}${diff}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:3px">×${s.multiplier.toFixed(1)} · versé : ${CI.fmtCompact(s.invested)}</div>
        </div>`;
      }).join('');
    }

    // Chart : courbes pour chaque scénario (jusqu'à horizon commun = p.years)
    // On aligne toutes les courbes sur l'horizon de la simulation actuelle
    const maxYears = p.years;
    const labels   = Array.from({ length: maxYears }, (_, i) => 'An ' + (i + 1));
    requestAnimationFrame(() => {
      const colors = ['#888', '#60A5FA', '#FBBF24', '#F97316', '#34D399'];
      CI.drawChart('ca4-chart', labels,
        scenarios.map((s, idx) => ({
          data:  s.yearly.slice(0, maxYears).map((y) => y.value),
          color: s.extra === 0 ? '#60A5FA' : colors[idx] || '#888',
          width: s.extra === 0 ? 1.5 : s.extra === 20 ? 3 : 2
        })),
        { yFormat: (v) => CI.fmtCompact(v) }
      );
    });

    // Insight A04
    if (base && plus10) {
      const plus20 = scenarios.find((s) => s.extra === 20);
      const gain10 = plus10.valueAtHorizon - base.valueAtHorizon;
      const ratio10 = plus10.valueAtHorizon / base.valueAtHorizon;
      const line20 = plus20
        ? ` Avec <strong>20 ans d'avance</strong>, le capital final est multiplié par <span class="pos">×${(plus20.valueAtHorizon / base.valueAtHorizon).toFixed(2)}</span>.`
        : '';
      setInsight('ca-early',
        `Commencer <strong>10 ans plus tôt</strong> à ${p.annualRate} %/an = ` +
        `<span class="pos">+${CI.fmtMoney(gain10, 0)}</span> en plus à l'horizon, ` +
        `soit un capital final ×<em>${ratio10.toFixed(2)}</em>.${line20} ` +
        `<span class="muted">Le temps est l'allié n°1 de l'épargnant — chaque année gagnée vaut plus que la précédente.</span>`
      );
    }
  }

  /* ------------------------------------------------------------
     A05 — Impact inflation
     ------------------------------------------------------------ */
  function renderA05(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    // Valeur réelle finale
    const real    = r.yearly[r.yearly.length - 1].realValue;
    const nominal = r.finalValue;
    const erosion = nominal - real;

    set('ca5-nominal',  CI.fmtMoney(nominal, 0));
    set('ca5-real',     CI.fmtMoney(real, 0));
    set('ca5-erosion',  '−' + CI.fmtMoney(erosion, 0));
    set('ca5-inf-rate', CI.fmtPctPlain(p.inflation, 1) + '/an');
    set('ca5-inf-years', p.years + ' ans');

    // Pouvoir d'achat : combien vaut 1 € aujourd'hui dans X ans ?
    const ppa = Math.pow(1 + (p.inflation || 0) / 100, p.years);
    set('ca5-ppa', CI.fmtMoney(1000 / ppa, 0));

    // Comparaison 3 scénarios d'inflation : 0%, p.inflation%, 4%
    const infRates = [0, p.inflation || 2, 4].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    const infColors = { 0: '#34D399', 2: '#FBBF24', 3: '#FBBF24', 4: '#F87171' };

    const labels   = r.yearly.map((y) => 'An ' + y.year);
    const datasets = [];

    // Ligne nominale
    datasets.push({ data: r.yearly.map((y) => y.value), color: '#60A5FA', width: 2, dash: [4, 3] });

    // Lignes réelles pour chaque scénario d'inflation
    infRates.forEach((inf) => {
      const rInf = calcCompound(Object.assign({}, p, { inflation: inf }));
      datasets.push({
        data:  rInf.yearly.map((y) => y.realValue),
        color: infColors[inf] || '#888',
        fill:  inf === (p.inflation || 2),
        width: inf === (p.inflation || 2) ? 2.5 : 1.5
      });
    });

    // Scénario inflation cards
    const infCards = document.getElementById('ca5-inf-cards');
    if (infCards) {
      infCards.innerHTML = infRates.map((inf) => {
        const rInf    = calcCompound(Object.assign({}, p, { inflation: inf }));
        const rv      = rInf.yearly[rInf.yearly.length - 1].realValue;
        const isCurr  = Math.abs(inf - (p.inflation || 2)) < 0.01;
        const border  = isCurr ? 'var(--accent)' : 'var(--border-soft)';
        const badge   = isCurr ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">ACTUEL</span>' : '';
        return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:12px;font-weight:600">Inflation ${inf} %/an</div>${badge}
          </div>
          <div style="font-size:18px;font-weight:700">${CI.fmtCompact(rv)}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:3px">Valeur réelle · Nominale : ${CI.fmtCompact(rInf.finalValue)}</div>
        </div>`;
      }).join('');
    }

    requestAnimationFrame(() => {
      CI.drawChart('ca5-chart', labels, datasets, { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Insight A05
    const erosionPct = (erosion / nominal * 100).toFixed(0);
    const ppaValue = 1000 / ppa;
    setInsight('ca-inflation',
      `À <strong>${(p.inflation || 2).toFixed(1)} %/an</strong> d'inflation sur ${p.years} ans, ` +
      `<em>${CI.fmtMoney(nominal, 0)}</em> nominal valent en réalité <em>${CI.fmtMoney(real, 0)}</em> en pouvoir d'achat ` +
      `(<span class="neg">−${erosionPct} %</span>). ` +
      `1 000 € d'aujourd'hui équivaudront à <strong>${CI.fmtMoney(ppaValue, 0)}</strong> dans ${p.years} ans. ` +
      `<span class="muted">Le rendement nominal trompe : seul le rendement réel (rendement − inflation) construit le pouvoir d'achat.</span>`
    );
  }

  /* ------------------------------------------------------------
     A06 — Comparaison enveloppes fiscales
     ------------------------------------------------------------ */
  const ENVELOPE_COLORS = {
    livret: '#34D399',
    pea:    '#60A5FA',
    av:     '#FBBF24',
    cto:    '#F87171'
  };

  function renderA06(p) {
    const res = compareEnveloppes(p);
    const envelopes = res.envelopes;
    const best = envelopes[0];

    // Cards
    const cards = document.getElementById('ca6-cards');
    if (cards) {
      cards.innerHTML = envelopes.map((e, i) => {
        const isBest   = i === 0;
        const border   = isBest ? 'var(--accent)' : 'var(--border-soft)';
        const badge    = isBest ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">MEILLEUR</span>' : '';
        const taxLine  = e.taxAmount > 0
          ? '<div style="font-size:11px;color:var(--red);margin-top:2px">Impôts : −' + CI.fmtMoney(e.taxAmount, 0) + '</div>'
          : '<div style="font-size:11px;color:var(--accent);margin-top:2px">Exonéré</div>';
        return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:13px;font-weight:700;color:${ENVELOPE_COLORS[e.id] || 'var(--text-1)'}">${e.label}</div>${badge}
          </div>
          <div style="font-size:20px;font-weight:700">${CI.fmtCompact(e.netValue)}<span style="font-size:11px;font-weight:400;color:var(--text-3);margin-left:4px">net</span></div>
          ${taxLine}
          <div style="font-size:11px;color:var(--text-3);margin-top:4px">${e.note}</div>
        </div>`;
      }).join('');
    }

    // Tableau comparatif
    const tbody = document.getElementById('ca6-tbody');
    if (tbody) {
      tbody.innerHTML = envelopes.map((e) => {
        const isBest = e.id === best.id;
        const diff   = e.netValue - envelopes[envelopes.length - 1].netValue;
        return `<tr${isBest ? ' style="background:rgba(52,211,153,.06)"' : ''}>
          <td style="font-weight:600;color:${ENVELOPE_COLORS[e.id] || 'var(--text-1)'}">${e.label}</td>
          <td>${CI.fmtMoney(e.grossValue, 0)}</td>
          <td class="neg">${e.taxAmount > 0 ? '−' + CI.fmtMoney(e.taxAmount, 0) : '—'}</td>
          <td class="pos" style="font-weight:700">${CI.fmtMoney(e.netValue, 0)}</td>
          <td>${diff > 0 ? '<span class="pos">+' + CI.fmtMoney(diff, 0) + '</span>' : '—'}</td>
        </tr>`;
      }).join('');
    }

    // Chart barres horizontales (barres verticales ici via CI.drawChart)
    requestAnimationFrame(() => {
      const labels = envelopes.map((e) => e.label);
      CI.drawChart('ca6-chart', labels, [
        {
          data:  envelopes.map((e) => e.netValue),
          color: envelopes.map((e) => ENVELOPE_COLORS[e.id] || '#888')
        }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Insight A06
    const worst  = envelopes[envelopes.length - 1];
    const gain   = best.netValue - worst.netValue;
    const gainPct = worst.netValue > 0 ? (gain / worst.netValue * 100).toFixed(0) : 0;
    const aveLine = envelopes.find((e) => e.id === 'av');
    const avNote  = aveLine && p.years < 8
      ? ' <span class="warn">L\'Assurance-Vie n\'a pas encore atteint 8 ans — sa fiscalité avantageuse (7.5 %) ne s\'applique pas encore.</span>'
      : '';
    const peaLine = envelopes.find((e) => e.id === 'pea');
    const peaNote = peaLine && p.years < 5
      ? ' <span class="warn">Le PEA est taxé à 30 % car < 5 ans — attends le seuil pour bénéficier de l\'exonération IR.</span>'
      : '';
    setInsight('ca-enveloppes',
      `Sur <strong>${p.years} ans</strong> à <strong>${p.annualRate} %/an</strong>, ` +
      `<span style="color:${ENVELOPE_COLORS[best.id]}">${best.label}</span> ressort à ` +
      `<em>${CI.fmtMoney(best.netValue, 0)}</em> net — ` +
      `<span class="pos">+${CI.fmtMoney(gain, 0)} (+${gainPct} %)</span> vs ` +
      `<span style="color:${ENVELOPE_COLORS[worst.id]}">${worst.label}</span>. ` +
      `Le choix de l'enveloppe peut peser autant que plusieurs points de rendement.` +
      avNote + peaNote
    );
  }

  /* ------------------------------------------------------------
     run()
     ------------------------------------------------------------ */
  function run() {
    const p = readForm();
    const r = calcCompound(p);
    lastParams = p;
    lastResult = r;

    renderA01(p, r);
    renderA02(p);
    renderA03(p);
    renderA04(p);
    renderA05(p, r);
    renderA06(p);
    syncUrl(p);
  }

  /* ------------------------------------------------------------
     Actions publiques
     ------------------------------------------------------------ */
  function share()  { if (lastParams) syncUrl(lastParams); CI.copyShareUrl(); }
  function print()  { window.print(); }
  function reset()  { window.location.search = ''; }
  function save()   {
    if (!lastResult) { CI.toast('Lance un calcul d\'abord', 'error'); return; }
    CI.promptSave('Compound', lastParams, 'Simulation intérêts composés', () => {});
  }

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    window.runCompound   = run;
    window.shareCompound = share;
    window.printCompound = print;
    window.resetCompound = reset;
    window.saveCompound  = save;

    writeForm(loadFromUrl());
    CI.initAll();

    // Recompute on any param change
    document.querySelectorAll('#c-params input, #c-params select').forEach((el) => {
      el.addEventListener('input',  run);
      el.addEventListener('change', run);
    });

    // A03 — objectif inline
    ['ca3-goal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { if (lastParams) renderA03(lastParams); });
    });
    const modeEl = document.getElementById('ca3-mode');
    if (modeEl) modeEl.addEventListener('change', () => { if (lastParams) renderA03(lastParams); });

    setTimeout(run, 30);
  });

  window.addEventListener('resize', () => {
    if (lastResult && lastParams) {
      requestAnimationFrame(() => {
        renderA01(lastParams, lastResult);
        renderA02(lastParams);
        renderA04(lastParams);
        renderA05(lastParams, lastResult);
        renderA06(lastParams);
      });
    }
  });
})();
