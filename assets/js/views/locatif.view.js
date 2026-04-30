/* ============================================================
   CalcInvest — Locatif VIEW (DOM binding)
   Reads form → calls CalcLocatif.calcLocatif(params) → renders
   ============================================================ */

(function () {
  'use strict';

  const calc       = window.CalcLocatif.calcLocatif;
  const calcComp   = window.CalcLocatif.computeRegimeComparison;
  const calcPV     = window.CalcLocatif.computePlusValue;
  const calcAggr   = window.CalcLocatif.computeAggregate;
  const calcStocks = window.CalcLocatif.compareWithStocks;
  const calcMC     = window.CalcLocatif.computeVacancyMC;
  const num        = window.FIN.num;

  // Multi-biens state
  let biens          = [];   // [{ id, name, params, result }]
  let currentIdx     = 0;
  let switchingBien  = false; // true when programmatically writing form (skip run)

  // Aliases pour backward compat avec le reste du code
  let lastParams = null;
  let lastResult = null;
  let la7Indexation = 0;

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
     Read form inputs → params object
     ------------------------------------------------------------ */
  function readForm() {
    const $ = (id) => document.getElementById(id);
    const v = (id) => { const el = $(id); return el ? num(el.value) : 0; };
    const sv = (id, def) => { const el = $(id); return el ? el.value : def; };
    return {
      price: v('l-price'),
      notary: v('l-notary'),
      agency: v('l-agency'),
      works: v('l-works'),
      furniture: v('l-furniture'),
      rent: v('l-rent'),
      vacancy: v('l-vacancy'),
      propTax: v('l-proptax'),
      copro: v('l-copro'),
      insurance: v('l-insurance'),
      mgmtPct: v('l-mgmt'),
      maintPct: v('l-maint'),
      recurringWorksRate: v('l-recurring'),
      loan: v('l-loan'),
      loanRate: v('l-loanrate'),
      loanYears: v('l-loanyears'),
      loanIns: v('l-loanins'),
      refinanceYear: v('l-refi-year'),
      refinanceRate: v('l-refi-rate'),
      regime: sv('l-regime', 'reel-foncier'),
      tmi: v('l-tmi'),
      holdYears: v('l-hold'),
      appreciation: v('l-appreciation')
    };
  }

  function writeForm(p) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    set('l-price', p.price);
    set('l-notary', p.notary);
    set('l-agency', p.agency);
    set('l-works', p.works);
    set('l-furniture', p.furniture);
    set('l-rent', p.rent);
    set('l-vacancy', p.vacancy);
    set('l-proptax', p.propTax);
    set('l-copro', p.copro);
    set('l-insurance', p.insurance);
    set('l-mgmt', p.mgmtPct);
    set('l-maint', p.maintPct);
    set('l-recurring', p.recurringWorksRate ?? 0);
    set('l-loan', p.loan);
    set('l-loanrate', p.loanRate);
    set('l-loanyears', p.loanYears);
    set('l-loanins', p.loanIns);
    set('l-refi-year', p.refinanceYear ?? 0);
    set('l-refi-rate', p.refinanceRate ?? 0);
    set('l-regime', p.regime);
    set('l-tmi', p.tmi);
    set('l-hold', p.holdYears);
    set('l-appreciation', p.appreciation);
  }

  /* ------------------------------------------------------------
     Render
     ------------------------------------------------------------ */
  function renderAccordionSummaries(p) {
    const priceK = (p.price / 1000).toFixed(0);
    document.getElementById('l-sum-params').textContent =
      `${priceK} k€ · ${p.loanYears} ans @ ${p.loanRate.toFixed(2)} % · ${CI.fmtNum(p.rent)} €/mois · Horizon ${p.holdYears} ans`;
  }

  function renderStats(r) {
    const set = (id, val, fmt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = fmt ? fmt(val) : val;
    };
    const color = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('pos', 'neg', 'warn');
      if (v > 0) el.classList.add('pos');
      else if (v < 0) el.classList.add('neg');
    };

    set('s-yield-gross', r.yieldGross, (v) => CI.fmtPctPlain(v, 2));
    set('s-yield-net', r.yieldNet, (v) => CI.fmtPctPlain(v, 2));
    set('s-yield-netnet', r.yieldNetNet, (v) => CI.fmtPctPlain(v, 2));
    set('s-tri', r.tri, (v) => v == null ? '—' : CI.fmtPctPlain(v, 2));

    set('s-cashflow', r.cashflowMonthly, (v) => CI.fmtMoney(v, 0) + '/mois');
    color('s-cashflow', r.cashflowMonthly);
    set('s-enrich', r.enrichmentMonthly, (v) => CI.fmtMoney(v, 0) + '/mois');

    set('s-acq', r.totalAcquisition, (v) => CI.fmtMoney(v, 0));
    set('s-down', r.downPayment, (v) => CI.fmtMoney(v, 0));
    set('s-pmt', r.monthlyPayment, (v) => CI.fmtMoney(v, 0) + '/mois');
    set('s-equity', r.finalEquity, (v) => CI.fmtMoney(v, 0));
    color('s-equity', r.finalEquity);
  }

  function renderChart(r) {
    const labels = r.yearly.map((y) => 'An ' + y.year);
    CI.drawChart('l-chart', labels, [
      {
        label: 'Valeur du bien',
        data: r.yearly.map((y) => y.propertyValue),
        color: '#FBBF24',
        width: 2
      },
      {
        label: 'Patrimoine net',
        data: r.yearly.map((y) => y.equity),
        color: '#34D399',
        fill: true,
        width: 2.5
      },
      {
        label: 'Capital restant dû',
        data: r.yearly.map((y) => y.balance),
        color: '#F87171',
        width: 2,
        dash: [4, 4]
      }
    ], {
      yFormat: (v) => CI.fmtCompact(v)
    });
  }

  function renderTable(r) {
    const tbody = document.getElementById('l-tbody');
    tbody.innerHTML = r.yearly.map((y) => `
      <tr>
        <td>An ${y.year}</td>
        <td>${CI.fmtNum(y.rent, 0)}</td>
        <td>${CI.fmtNum(y.loanPayments, 0)}</td>
        <td>${CI.fmtNum(y.tax, 0)}</td>
        <td class="${y.cashflow >= 0 ? 'pos' : 'neg'}">${CI.fmtNum(y.cashflow, 0)}</td>
        <td class="pos">${CI.fmtNum(y.equity, 0)}</td>
      </tr>
    `).join('');
  }

  /* ------------------------------------------------------------
     A05 — Amortissement du crédit
     ------------------------------------------------------------ */
  function renderAmortCredit(r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (!r.amortSchedule || !r.amortSchedule.length) {
      ['la5-interest','la5-insurance','la5-cost','la5-pct'].forEach(id => set(id, '—'));
      const tb = document.getElementById('la5-tbody');
      if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">Aucun emprunt renseigné</td></tr>';
      return;
    }
    set('la5-interest',  CI.fmtMoney(r.totalInterest, 0));
    set('la5-insurance', CI.fmtMoney(r.totalInsurance, 0));
    set('la5-cost',      CI.fmtMoney(r.totalInterest + r.totalInsurance, 0));
    // Loan initial = balance yr1 + principal yr1
    const yr1 = r.amortSchedule[0];
    const loanInit = yr1 ? yr1.balance + yr1.principal : 0;
    set('la5-pct', loanInit > 0 ? ((r.totalInterest / loanInit) * 100).toFixed(1) + ' %' : '—');

    // Table
    const tbody = document.getElementById('la5-tbody');
    if (tbody) {
      tbody.innerHTML = r.amortSchedule.map(yr => {
        const total = yr.principal + yr.interest + yr.insurance;
        return `<tr>
          <td>An ${yr.year}</td>
          <td class="pos">${CI.fmtNum(yr.principal, 0)}</td>
          <td class="neg">${CI.fmtNum(yr.interest, 0)}</td>
          <td style="color:var(--text-3)">${CI.fmtNum(yr.insurance, 0)}</td>
          <td>${CI.fmtNum(total, 0)}</td>
          <td>${CI.fmtNum(yr.balance, 0)}</td>
        </tr>`;
      }).join('');
    }

    // Chart: cumulative principal / interest / balance
    let cumP = 0, cumI = 0;
    const cumPrincipal = [], cumInterest = [], balances = [];
    r.amortSchedule.forEach(yr => {
      cumP += yr.principal; cumI += yr.interest;
      cumPrincipal.push(cumP); cumInterest.push(cumI); balances.push(yr.balance);
    });
    requestAnimationFrame(() => {
      CI.drawChart('la5-chart', r.amortSchedule.map(yr => 'An ' + yr.year), [
        { data: balances,     color: '#FBBF24', width: 2,   dash: [4, 4] },
        { data: cumPrincipal, color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.1)', width: 2.5 },
        { data: cumInterest,  color: '#F87171', width: 2 }
      ], { yFormat: v => CI.fmtCompact(v) });
    });
  }

  /* ------------------------------------------------------------
     A06 — Comparaison fiscale 4 régimes
     ------------------------------------------------------------ */
  function renderFiscalComp(p) {
    const comp  = calcComp(p);
    const { results, bestId, worstId } = comp;
    const set   = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const best  = results.find(r => r.id === bestId);
    const worst = results.find(r => r.id === worstId);
    const curr  = results.find(r => r.id === p.regime);

    set('la6-best',     best.label);
    set('la6-best-sub', CI.fmtPctPlain(best.yieldNetNet, 2) + ' net-net');
    set('la6-worst',     worst.label);
    set('la6-worst-sub', CI.fmtPctPlain(worst.yieldNetNet, 2) + ' net-net');
    const saving = worst.year1Tax - best.year1Tax;
    set('la6-saving',  saving > 0 ? '+' + CI.fmtNum(Math.round(saving), 0) + ' €/an' : '—');
    set('la6-current', curr ? curr.label : p.regime);

    const cards = document.getElementById('la6-cards');
    if (!cards) return;
    const sorted = results.slice().sort((a, b) => b.yieldNetNet - a.yieldNetNet);
    cards.innerHTML = sorted.map(res => {
      const isBest    = res.id === bestId;
      const isWorst   = res.id === worstId;
      const isCurrent = res.id === p.regime;
      const border    = isBest ? 'var(--accent)' : isWorst ? 'var(--red)' : isCurrent ? 'var(--blue)' : 'var(--border-soft)';
      const badge     = isBest
        ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">OPTIMAL</span>'
        : isWorst
        ? '<span style="font-size:10px;background:var(--red);color:#fff;padding:2px 7px;border-radius:99px;font-weight:700">DÉFAV.</span>'
        : isCurrent
        ? '<span style="font-size:10px;background:var(--blue);color:#fff;padding:2px 7px;border-radius:99px;font-weight:700">ACTUEL</span>'
        : '';
      const amortLine = (res.id === 'lmnp-reel' && res.amortBuilding)
        ? `<div style="font-size:11px;color:var(--text-4);margin-top:4px">Amort. bâti : ${CI.fmtNum(Math.round(res.amortBuilding), 0)} €/an${res.amortFurniture ? ' · Mobilier : ' + CI.fmtNum(Math.round(res.amortFurniture), 0) + ' €/an' : ''}</div>`
        : '';
      return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:600;color:${isBest ? 'var(--accent)' : 'var(--text-1)'}">${res.label}</div>${badge}
        </div>
        <div style="font-size:22px;font-weight:700;color:${isBest ? 'var(--accent)' : 'var(--text-1)'}">
          ${CI.fmtPctPlain(res.yieldNetNet, 2)} <span style="font-size:12px;font-weight:400">net-net</span>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px">
          Impôts : ${CI.fmtNum(Math.round(res.year1Tax), 0)} €/an · CF : ${CI.fmtMoney(res.cashflowMonthly, 0)}/mois
        </div>
        <div style="font-size:11px;color:var(--text-4);margin-top:4px">${res.desc}</div>
        ${amortLine}
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------
     A07 — Cashflows projetés avec indexation
     ------------------------------------------------------------ */
  function renderCashflowProj(p) {
    const r   = calc(Object.assign({}, p, { rentIndexation: la7Indexation }));
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    const cf1   = (r.yearly[0]  ? r.yearly[0].cashflow  : 0) / 12;
    const cfn   = (r.yearly[r.yearly.length - 1] ? r.yearly[r.yearly.length - 1].cashflow : 0) / 12;
    const total = r.yearly.reduce((s, yr) => s + yr.cashflow, 0);

    let cumCF = 0, breakevenYear = null;
    const cumulArr = r.yearly.map(yr => { cumCF += yr.cashflow; if (cumCF >= 0 && breakevenYear === null) breakevenYear = yr.year; return cumCF; });

    set('la7-cf1',       CI.fmtMoney(cf1, 0) + '/mois'); cls('la7-cf1', cf1 >= 0 ? 'pos' : 'neg');
    set('la7-cfn',       CI.fmtMoney(cfn, 0) + '/mois'); cls('la7-cfn', cfn >= 0 ? 'pos' : 'neg');
    set('la7-total',     (total >= 0 ? '+' : '') + CI.fmtNum(Math.round(total), 0) + ' €'); cls('la7-total', total >= 0 ? 'pos' : 'neg');
    set('la7-breakeven', breakevenYear ? 'An ' + breakevenYear : 'Jamais'); cls('la7-breakeven', breakevenYear ? 'info' : 'neg');
    const metaEl = document.getElementById('la7-meta');
    if (metaEl) metaEl.textContent = la7Indexation > 0 ? 'Indexation loyers ' + la7Indexation + ' %/an' : 'Loyer fixe';

    requestAnimationFrame(() => {
      CI.drawChart('la7-chart', r.yearly.map(yr => 'An ' + yr.year), [
        { data: r.yearly.map(yr => yr.cashflow / 12), color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.08)', width: 2.5 },
        { data: cumulArr,                              color: '#60A5FA', width: 2 }
      ], { yFormat: v => CI.fmtCompact(v) });
    });
  }

  /* ------------------------------------------------------------
     A08 — Simulation de revente & plus-value
     ------------------------------------------------------------ */
  function renderRevente(p, r) {
    const yearEl  = document.getElementById('la8-year');
    const feesEl  = document.getElementById('la8-fees');
    const sellY   = Math.min(Math.max(1, yearEl ? (parseInt(yearEl.value) || p.holdYears) : p.holdYears), r.yearly.length);
    const agPct   = feesEl ? (parseFloat(feesEl.value) || 4) : 4;
    const yrData  = r.yearly[sellY - 1];
    if (!yrData) return;

    const pv  = calcPV(p.price, yrData.propertyValue, sellY, agPct, yrData.balance);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('la8-sale',    CI.fmtMoney(yrData.propertyValue, 0));
    set('la8-sale-sub', 'Frais agence : −' + CI.fmtNum(Math.round(pv.fees), 0) + ' € · Dette : ' + CI.fmtNum(Math.round(pv.debtBalance), 0) + ' €');
    set('la8-pv',      pv.pv > 0 ? '+' + CI.fmtNum(Math.round(pv.pv), 0) + ' €' : '0 €');
    cls('la8-pv',      pv.pv > 0 ? 'pos' : '');
    set('la8-tax',     pv.totalTax > 0 ? '−' + CI.fmtNum(Math.round(pv.totalTax), 0) + ' €' : '0 €');
    set('la8-tax-sub', 'IR : ' + CI.fmtNum(Math.round(pv.taxIR), 0) + ' € · PS : ' + CI.fmtNum(Math.round(pv.taxPS), 0) + ' €');
    set('la8-net',     CI.fmtMoney(pv.netVendeur, 0)); cls('la8-net', pv.netVendeur >= 0 ? 'pos' : 'neg');
    set('la8-abatt-ir', (pv.abattIR * 100).toFixed(0) + ' %');
    set('la8-abatt-ps', (pv.abattPS * 100).toFixed(1) + ' %');
    set('la8-ir-status', sellY >= 22 ? '✓ Exonéré IR' : sellY >= 6 ? (22 - sellY) + ' ans pour exonération' : (6 - sellY) + ' ans avant premier abattement');
    set('la8-ps-status', sellY >= 30 ? '✓ Exonéré PS' : sellY >= 6 ? (30 - sellY) + ' ans pour exonération' : (6 - sellY) + ' ans avant premier abattement');
    const metaEl = document.getElementById('la8-meta'); if (metaEl) metaEl.textContent = 'Revente an ' + sellY + ' · frais ' + agPct + ' %';

    // Chart: net vendeur + brut equity pour chaque année
    const labels   = r.yearly.map(yr => 'An ' + yr.year);
    const netArr   = r.yearly.map((yr, i) => calcPV(p.price, yr.propertyValue, i + 1, agPct, yr.balance).netVendeur);
    const brutArr  = r.yearly.map(yr => yr.equity);
    requestAnimationFrame(() => {
      CI.drawChart('la8-chart', labels, [
        { data: brutArr, color: '#FBBF24', width: 1.8, dash: [4, 4] },
        { data: netArr,  color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.1)', width: 2.5 }
      ], { yFormat: v => CI.fmtCompact(v) });
    });
  }

  /* ------------------------------------------------------------
     URL state (shareable)
     ------------------------------------------------------------ */
  const URL_KEYS = [
    'price', 'notary', 'agency', 'works', 'furniture',
    'rent', 'vacancy', 'propTax', 'copro', 'insurance', 'mgmtPct', 'maintPct', 'recurringWorksRate',
    'loan', 'loanRate', 'loanYears', 'loanIns', 'refinanceYear', 'refinanceRate',
    'regime', 'tmi', 'holdYears', 'appreciation'
  ];

  function syncUrl(p) {
    const out = {};
    URL_KEYS.forEach((k) => { out[k] = p[k]; });
    CI.setUrlParams(out);
  }

  function loadFromUrl() {
    const defaults = {
      price: 200000, notary: 15000, agency: 0, works: 10000, furniture: 0,
      rent: 900, vacancy: 5,
      propTax: 1200, copro: 600, insurance: 300, mgmtPct: 0, maintPct: 1, recurringWorksRate: 0,
      loan: 180000, loanRate: 3.8, loanYears: 20, loanIns: 0.36, refinanceYear: 0, refinanceRate: 0,
      regime: 'reel-foncier', tmi: 30, holdYears: 20, appreciation: 1.5
    };
    URL_KEYS.forEach((k) => {
      const v = CI.getUrlParam(k);
      if (v !== null) {
        defaults[k] = (k === 'regime') ? v : num(v);
      }
    });
    return defaults;
  }

  /* ------------------------------------------------------------
     Actions publiques (bindées aux boutons en HTML)
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     A09 — Achat immobilier vs DCA bourse
     ------------------------------------------------------------ */
  let la9StockRate = 7;

  function renderA09(p, r) {
    if (!calcStocks) return;
    const cmp = calcStocks(p, r, { stockRate: la9StockRate });
    if (!cmp) return;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('la9-real-net',  CI.fmtMoney(cmp.realEstateNet, 0));
    set('la9-real-sub',  'Net vendeur après crédit + plus-value');
    set('la9-stocks-net', CI.fmtMoney(cmp.stocksNet, 0));
    set('la9-stocks-sub', `Apport ${CI.fmtCompact(cmp.apport)} placé à ${cmp.stockRate} %/an, PFU ${cmp.taxRate} %`);

    const winner = cmp.delta >= 0 ? 'real' : 'stocks';
    set('la9-delta',     (cmp.delta >= 0 ? '+' : '') + CI.fmtMoney(cmp.delta, 0));
    set('la9-delta-sub', cmp.delta >= 0 ? 'L\'immobilier l\'emporte' : 'La bourse l\'emporte');
    cls('la9-delta',     winner === 'real' ? 'pos' : 'neg');

    cls('la9-real-net',   winner === 'real'   ? 'pos' : 'info');
    cls('la9-stocks-net', winner === 'stocks' ? 'pos' : 'info');

    set('la9-horizon', cmp.yearsCompared + ' ans');

    // Chart : équité immo vs valeur stocks par année
    requestAnimationFrame(() => {
      const labels   = r.yearly.map((y) => 'An ' + y.year);
      const realData = r.yearly.map((y) => y.equity);
      // Stocks yearly : on a cmp.stocksYearly avec value par année
      const stocksData = cmp.stocksYearly ? cmp.stocksYearly.map((y) => y.value) : [];
      CI.drawChart('la9-chart', labels, [
        { label: 'Équité immo',   data: realData,   color: '#34D399', fill: true,  width: 2.5 },
        { label: 'Bourse (brut)', data: stocksData, color: '#60A5FA', fill: false, width: 2, dash: [4, 3] }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Insight
    const verb     = cmp.delta >= 0 ? 'l\'immobilier rapporte' : 'la bourse rapporte';
    const ratio    = cmp.stocksNet > 0 ? (cmp.realEstateNet / cmp.stocksNet).toFixed(2) : '—';
    const peaNote  = cmp.taxRate === 30
      ? ' <span class="muted">Note : en PEA après 5 ans, l\'imposition tomberait à 17.2 %, augmentant le score bourse.</span>'
      : '';
    setInsight('l-vs-bourse',
      `Sur <strong>${cmp.yearsCompared} ans</strong>, en plaçant ton apport de <em>${CI.fmtMoney(cmp.apport, 0)}</em> ` +
      `à <strong>${cmp.stockRate} %/an</strong> (S&P 500 historique) au lieu d'acheter, tu aurais ` +
      `<em>${CI.fmtMoney(cmp.stocksNet, 0)}</em> nets après PFU. ` +
      `Ton bien immobilier rapporte <em>${CI.fmtMoney(cmp.realEstateNet, 0)}</em> nets — ` +
      `<span class="${cmp.delta >= 0 ? 'pos' : 'neg'}">${verb} ${CI.fmtMoney(Math.abs(cmp.delta), 0)} de plus</span> ` +
      `(ratio ×${ratio}). <span class="muted">L'immobilier gagne quand le levier crédit + plus-value compensent l'illiquidité et les frais.</span>${peaNote}`
    );
  }

  /* ------------------------------------------------------------
     A10 — Monte Carlo vacance locative (lazy, on-demand)
     ------------------------------------------------------------ */
  let la10Result = null;

  function renderA10Refresh(p) {
    if (!calcMC) return;
    const btnEl = document.getElementById('la10-run');
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Calcul…'; }

    // Run async (non bloquant UI) via setTimeout
    setTimeout(() => {
      const seed = parseInt((document.getElementById('la10-seed')||{}).value, 10) || 42;
      const sims = parseInt((document.getElementById('la10-sims')||{}).value, 10) || 1000;
      la10Result = calcMC(p, { simulations: sims, seed: seed });
      renderA10Display();
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Lancer la simulation'; }
    }, 30);
  }

  function renderA10Display() {
    const r = la10Result;
    if (!r) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('la10-baseline',  CI.fmtMoney(r.baseline, 0));
    set('la10-mean',      CI.fmtMoney(r.mean, 0));
    set('la10-median',    CI.fmtMoney(r.median, 0));
    set('la10-p5',        CI.fmtMoney(r.p5, 0));
    set('la10-p95',       CI.fmtMoney(r.p95, 0));
    set('la10-stddev',    CI.fmtMoney(r.stdDev, 0));
    set('la10-sims-info', r.simulations + ' simulations · ' + r.months + ' mois · vacance ' + r.vacancyRate + ' %/an');

    // Histogramme : line chart fill (CI.drawChart ne supporte pas bar natif)
    requestAnimationFrame(() => {
      const labels = r.histogram.bins.map((b) => CI.fmtCompact(b));
      CI.drawChart('la10-chart', labels, [
        { label: 'Fréquence', data: r.histogram.counts, color: '#34D399', fill: true, width: 2 }
      ], { yFormat: (v) => v + ' sims' });
    });

    // Insight
    const interval = r.p95 - r.p5;
    const baselineVsMedian = r.median - r.baseline;
    setInsight('l-mc-vacance',
      `Sur <strong>${r.simulations} simulations</strong> de ${(r.months / 12).toFixed(0)} ans avec vacance ${r.vacancyRate} %/an : ` +
      `cashflow médian <em>${CI.fmtMoney(r.median, 0)}</em>, écart 90 % entre <span class="warn">${CI.fmtMoney(r.p5, 0)}</span> et <span class="pos">${CI.fmtMoney(r.p95, 0)}</span> ` +
      `(intervalle de <strong>${CI.fmtMoney(interval, 0)}</strong>). ` +
      `<span class="muted">La vacance variable Bernoulli reproduit la réalité d'un bien parfois loué, parfois vacant — utile pour évaluer la robustesse de ton plan.</span>`
    );
  }

  function run() {
    if (switchingBien) return; // ignore form events pendant un swap programmatique
    const p = readForm();
    const r = calc(p);
    lastParams = p;
    lastResult = r;

    // Sync current bien dans le state multi
    if (biens[currentIdx]) {
      biens[currentIdx].params = p;
      biens[currentIdx].result = r;
    }

    renderAccordionSummaries(p);
    renderStats(r);
    renderTable(r);
    renderAmortCredit(r);
    renderFiscalComp(p);
    renderCashflowProj(p);
    renderRevente(p, r);
    requestAnimationFrame(() => renderChart(r));
    renderInsights(p, r);
    renderA09(p, r);
    renderBiensTabs();
    renderAggregate();
    renderComparison();
    syncUrl(p);
  }

  /* ------------------------------------------------------------
     Multi-biens — helpers + renders
     ------------------------------------------------------------ */
  function defaultBienName(idx) { return 'Bien ' + (idx + 1); }

  function addBien() {
    if (biens.length >= 5) {
      CI.toast('Maximum 5 biens', 'warn');
      return;
    }
    // Dupliquer les params du bien courant comme base
    const baseParams = lastParams ? Object.assign({}, lastParams) : readForm();
    const newBien = {
      id:     'bien-' + Date.now(),
      name:   defaultBienName(biens.length),
      params: baseParams,
      result: calc(baseParams)
    };
    biens.push(newBien);
    currentIdx = biens.length - 1;
    switchToBien(currentIdx);
  }

  function removeBien(idx) {
    if (biens.length <= 1) return;
    biens.splice(idx, 1);
    if (currentIdx >= biens.length) currentIdx = biens.length - 1;
    switchToBien(currentIdx);
  }

  function switchToBien(idx) {
    if (idx < 0 || idx >= biens.length) return;
    currentIdx = idx;
    const b = biens[idx];
    switchingBien = true;
    writeForm(b.params);
    switchingBien = false;
    // Recalc au cas où la version stockée n'est pas à jour
    b.result = calc(b.params);
    lastParams = b.params;
    lastResult = b.result;
    renderAccordionSummaries(b.params);
    renderStats(b.result);
    renderTable(b.result);
    renderAmortCredit(b.result);
    renderFiscalComp(b.params);
    renderCashflowProj(b.params);
    renderRevente(b.params, b.result);
    requestAnimationFrame(() => renderChart(b.result));
    renderInsights(b.params, b.result);
    renderA09(b.params, b.result);
    renderBiensTabs();
    renderAggregate();
    renderComparison();
    syncUrl(b.params);
  }

  function renderBiensTabs() {
    const list = document.getElementById('l-biens-list');
    if (!list) return;
    list.innerHTML = biens.map((b, i) => {
      const active   = i === currentIdx;
      const bg       = active ? 'var(--accent)' : 'var(--bg-2)';
      const fg       = active ? '#000'          : 'var(--text-1)';
      const border   = active ? 'var(--accent)' : 'var(--border-soft)';
      const closeBtn = biens.length > 1
        ? `<span class="bien-close" data-idx="${i}" style="margin-left:6px;opacity:.6;cursor:pointer;font-weight:700">×</span>`
        : '';
      return `<button class="bien-tab" data-idx="${i}" type="button" style="background:${bg};color:${fg};border:1px solid ${border};border-radius:99px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center">${b.name}${closeBtn}</button>`;
    }).join('');

    // Bind clicks
    list.querySelectorAll('.bien-tab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('bien-close')) {
          e.stopPropagation();
          removeBien(parseInt(e.target.dataset.idx, 10));
          return;
        }
        switchToBien(parseInt(btn.dataset.idx, 10));
      });
    });
  }

  function renderAggregate() {
    const sec = document.getElementById('l-patrimoine');
    const link = document.getElementById('link-patrimoine');
    if (!sec || !link) return;

    if (biens.length < 2) {
      sec.style.display  = 'none';
      link.style.display = 'none';
      return;
    }
    sec.style.display  = '';
    link.style.display = '';

    const agg = calcAggr(biens);
    if (!agg) return;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('lp-count',           agg.count);
    set('lp-acquisition',     CI.fmtMoney(agg.totalAcquisition, 0));
    set('lp-down',            'Apport : ' + CI.fmtMoney(agg.totalDownPayment, 0));
    set('lp-monthly',         CI.fmtMoney(agg.totalMonthlyPmt, 0) + '/mois');
    set('lp-loan',            'Total emprunté : ' + CI.fmtMoney(agg.totalLoan, 0));
    set('lp-cashflow',        (agg.totalCashflowMonthly >= 0 ? '+' : '') + CI.fmtMoney(agg.totalCashflowMonthly, 0) + '/mois');
    set('lp-rent',            'Loyers bruts : ' + CI.fmtMoney(agg.totalGrossRent, 0) + '/an');
    set('lp-equity',          CI.fmtMoney(agg.totalFinalEquity, 0));
    set('lp-value',           'Valeur biens : ' + CI.fmtMoney(agg.totalFinalValue, 0));
    set('lp-yield-gross',     agg.weightedYieldGross.toFixed(2) + ' %');
    set('lp-yield-netnet',    agg.weightedYieldNetNet.toFixed(2) + ' %');
    set('lp-horizon',         agg.maxHorizon + ' ans');

    // Couleur cashflow
    const cfEl = document.getElementById('lp-cashflow');
    if (cfEl) cfEl.className = 'stat-value ' + (agg.totalCashflowMonthly >= 0 ? 'pos' : 'neg');

    // Chart consolidé
    requestAnimationFrame(() => {
      const labels = agg.yearly.map((y) => 'An ' + y.year);
      CI.drawChart('lp-chart', labels, [
        { label: 'Équité',  data: agg.yearly.map((y) => y.equity),        color: '#34D399', fill: true,  width: 2.5 },
        { label: 'Valeur',  data: agg.yearly.map((y) => y.propertyValue), color: '#60A5FA', fill: false, width: 2 },
        { label: 'Dette',   data: agg.yearly.map((y) => y.balance),       color: '#F87171', fill: false, width: 1.5, dash: [4, 3] }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });
  }

  function renderComparison() {
    const sec  = document.getElementById('l-comparaison');
    const link = document.getElementById('link-comparaison');
    if (!sec || !link) return;

    if (biens.length < 2) {
      sec.style.display  = 'none';
      link.style.display = 'none';
      return;
    }
    sec.style.display  = '';
    link.style.display = '';

    // Ranking pour les badges (best yield, best cashflow, best TRI)
    const yieldsNN = biens.map((b) => b.result.yieldNetNet || 0);
    const cfs      = biens.map((b) => b.result.cashflowMonthly || 0);
    const tris     = biens.map((b) => (b.result.tri != null ? b.result.tri : -Infinity));
    const bestYieldIdx = yieldsNN.indexOf(Math.max.apply(null, yieldsNN));
    const bestCfIdx    = cfs.indexOf(Math.max.apply(null, cfs));
    const bestTriIdx   = tris.indexOf(Math.max.apply(null, tris));

    const tbody = document.getElementById('lc-tbody');
    if (!tbody) return;
    tbody.innerHTML = biens.map((b, i) => {
      const r  = b.result, p = b.params;
      const cf = r.cashflowMonthly;
      const triStr = r.tri != null ? r.tri.toFixed(2) + ' %' : '—';
      const isCurr = i === currentIdx;
      const trBg   = isCurr ? 'background:rgba(52,211,153,.06)' : '';
      const star   = (cond) => cond ? ' ⭐' : '';
      return `<tr style="${trBg}">
        <td style="font-weight:600">${b.name}${isCurr ? ' <span style="font-size:10px;color:var(--accent)">(actif)</span>' : ''}</td>
        <td>${CI.fmtMoney(p.price, 0)}</td>
        <td>${CI.fmtMoney(p.rent, 0)}</td>
        <td>${r.yieldNet.toFixed(2)} %</td>
        <td>${r.yieldNetNet.toFixed(2) + ' %' + star(i === bestYieldIdx)}</td>
        <td>${triStr + star(i === bestTriIdx)}</td>
        <td class="${cf >= 0 ? 'pos' : 'neg'}">${(cf >= 0 ? '+' : '') + CI.fmtMoney(cf, 0)}${star(i === bestCfIdx)}</td>
        <td>${CI.fmtMoney(r.finalEquity, 0)}</td>
      </tr>`;
    }).join('');
  }

  /* ------------------------------------------------------------
     Insights — encarts dynamiques sous chaque analyse
     ------------------------------------------------------------ */
  function renderInsights(p, r) {
    if (!r) return;
    const cf = r.cashflowMonthly;
    const cfCls = cf >= 0 ? 'pos' : 'neg';
    const cfSign = cf >= 0 ? '+' : '';
    const yieldNetCls = r.yieldNet > 4 ? 'pos' : r.yieldNet > 2 ? 'warn' : 'neg';
    const triCls = r.tri != null && r.tri > 0 ? 'pos' : 'neg';
    const triLine = r.tri != null
      ? `, TRI <span class="${triCls}">${r.tri.toFixed(2)} %/an</span>`
      : '';

    // A01 Synthèse (section #synthese)
    setInsight('synthese',
      `Bien à <strong>${CI.fmtMoney(p.price, 0)}</strong>, loyer ${CI.fmtMoney(p.rent, 0)}/mois → ` +
      `rendement net <span class="${yieldNetCls}">${r.yieldNet.toFixed(2)} %</span> ` +
      `(brut ${r.yieldGross.toFixed(2)} %, net-net ${r.yieldNetNet.toFixed(2)} %)${triLine}. ` +
      `Cashflow mensuel : <span class="${cfCls}">${cfSign}${CI.fmtMoney(cf, 0)}</span>, ` +
      `patrimoine après ${p.holdYears} ans : <em>${CI.fmtMoney(r.finalEquity, 0)}</em>. ` +
      `<span class="muted">Un rendement net &gt; 4 % avec cashflow positif est rare et excellent.</span>`
    );

    // A05 Amortissement crédit
    if (p.loan > 0) {
      const interestPct = (r.totalInterest / p.loan * 100).toFixed(0);
      let refiLine = '';
      if (r.refinance) {
        const ri = r.refinance;
        const annualSaving = ri.monthlySaving * 12;
        const interestEcon = ri.oldRemainingInterest - ri.newTotalInterest;
        const cls = ri.monthlySaving >= 0 ? 'pos' : 'neg';
        const verb = ri.monthlySaving >= 0 ? 'économies' : 'surcoût';
        refiLine = ` <strong>Refinancement an ${ri.year}</strong> à ${ri.rate} % : mensualité ${CI.fmtMoney(ri.oldMonthlyPmt, 0)} → ${CI.fmtMoney(ri.newMonthlyPmt, 0)} ` +
          `(<span class="${cls}">${ri.monthlySaving >= 0 ? '+' : ''}${CI.fmtMoney(annualSaving, 0)}/an</span> de ${verb}, ` +
          `intérêts restants <span class="${cls}">${CI.fmtMoney(interestEcon, 0)} d'écart</span>).`;
      }
      setInsight('l-amort-credit',
        `Sur <strong>${p.loanYears} ans</strong> à ${p.loanRate.toFixed(2)} %, l'emprunt de ` +
        `<strong>${CI.fmtMoney(p.loan, 0)}</strong> coûte <span class="neg">${CI.fmtMoney(r.totalInterest, 0)}</span> ` +
        `d'intérêts (<em>${interestPct} %</em> du capital emprunté). Mensualité : ` +
        `<strong>${CI.fmtMoney(r.monthlyPayment, 0)}/mois</strong>.${refiLine}` +
        `<span class="muted"> Le poids des intérêts diminue avec la durée — un crédit court coûte moins, mais réduit l'effet de levier.</span>`
      );
    }

    // A06 Fiscalité comparée
    const comp = calcComp(p);
    if (comp && comp.results && comp.bestId) {
      const best = comp.results.find((x) => x.id === comp.bestId);
      const worst = comp.results.find((x) => x.id === comp.worstId);
      const curr = comp.results.find((x) => x.id === p.regime);
      const saving = worst ? worst.year1Tax - best.year1Tax : 0;
      const optimalLine = curr && curr.id !== best.id
        ? ` Tu es actuellement en <strong>${curr.label}</strong> — passer en ${best.label} économiserait ` +
          `<span class="pos">${CI.fmtMoney(saving, 0)}/an</span>.`
        : ` Tu es déjà au régime optimal (<span class="pos">${best.label}</span>).`;
      setInsight('l-fiscal-comp',
        `Le régime fiscal le plus avantageux ici est <em>${best.label}</em> ` +
        `avec un rendement net-net de <strong>${best.yieldNetNet.toFixed(2)} %</strong>.${optimalLine} ` +
        `<span class="muted">Le bon régime change selon le ratio loyer/prix et l'amortissement disponible (LMNP réel souvent gagnant).</span>`
      );
    }

    // A07 Cashflows projetés (avec indexation)
    const rIdx = calc(Object.assign({}, p, { rentIndexation: la7Indexation }));
    const cf1 = (rIdx.yearly[0] ? rIdx.yearly[0].cashflow : 0) / 12;
    const cfn = (rIdx.yearly[rIdx.yearly.length - 1] ? rIdx.yearly[rIdx.yearly.length - 1].cashflow : 0) / 12;
    let cumCF = 0, breakevenYear = null;
    rIdx.yearly.forEach((yr) => { cumCF += yr.cashflow; if (cumCF >= 0 && breakevenYear === null) breakevenYear = yr.year; });
    const beLine = breakevenYear
      ? `Le seuil de rentabilité (cashflow cumulé positif) est atteint à <strong>l'an ${breakevenYear}</strong>.`
      : `<span class="warn">Le cashflow cumulé reste négatif sur ${p.holdYears} ans</span> — l'enrichissement vient de la valorisation du bien et de l'amortissement du capital.`;
    const idxLine = la7Indexation > 0
      ? `Avec ${la7Indexation} %/an d'indexation des loyers, le cashflow passe de ${cfSign}${CI.fmtMoney(cf1, 0)}/mois à <em>${CI.fmtMoney(cfn, 0)}/mois</em> en fin de période. `
      : `Sans indexation, le cashflow reste stable à environ <strong>${CI.fmtMoney(cf1, 0)}/mois</strong>. `;
    setInsight('l-cashflow-proj', idxLine + beLine);

    // A08 Revente plus-value
    const sellY = Math.min(Math.max(1, p.holdYears), r.yearly.length);
    const yrData = r.yearly[sellY - 1];
    if (yrData) {
      const pv = calcPV(p.price, yrData.propertyValue, sellY, 4, yrData.balance);
      const irLine = sellY >= 22
        ? `<span class="pos">exonéré IR</span>`
        : `IR ${(pv.abattIR * 100).toFixed(0)} % d'abattement (encore ${22 - sellY} ans pour exonération)`;
      const psLine = sellY >= 30
        ? `<span class="pos">exonéré PS</span>`
        : `PS ${(pv.abattPS * 100).toFixed(0)} % d'abattement (encore ${30 - sellY} ans pour exonération)`;
      setInsight('l-revente',
        `Revente an <strong>${sellY}</strong> à <em>${CI.fmtMoney(yrData.propertyValue, 0)}</em>, ` +
        `plus-value <span class="pos">+${CI.fmtMoney(pv.pv, 0)}</span>, impôts <span class="neg">−${CI.fmtMoney(pv.totalTax, 0)}</span> ` +
        `(${irLine}, ${psLine}). Net vendeur après remboursement crédit : <em>${CI.fmtMoney(pv.netVendeur, 0)}</em>. ` +
        `<span class="muted">Le timing de revente compte : 22 ans d'IR exonéré et 30 ans pour les PS, c'est la règle d'or fiscale.</span>`
      );
    }
  }

  function share() {
    if (lastParams) syncUrl(lastParams);
    CI.copyShareUrl();
  }

  function print() { window.print(); }

  function reset() {
    // Reset via URL purge
    window.location.search = '';
  }

  function save() {
    if (!lastResult) {
      CI.toast('Lance un calcul d\'abord', 'error');
      return;
    }
    CI.promptSave('Locatif', lastParams, 'Projet Locatif', () => {});
  }

  function exportPDF() {
    if (!lastResult) { CI.toast('Lance un calcul d\'abord', 'error'); return; }
    const p = lastParams;
    const summary = `Bien ${CI.fmtMoney(p.price, 0)} · loyer ${CI.fmtMoney(p.rent, 0)}/mois · crédit ${p.loanYears} ans @ ${p.loanRate} % · horizon ${p.holdYears} ans · régime ${p.regime}`;
    CI.exportPDF({
      title:    'CalcInvest — Rendement Locatif',
      summary:  summary,
      sectionIds: ['synthese','cashflow','amort','fisca','l-amort-credit','l-fiscal-comp','l-cashflow-proj','l-revente','l-vs-bourse','l-patrimoine','l-comparaison'],
      fileName: 'calcinvest-locatif'
    });
  }

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    // Expose pour les onclick HTML
    window.runLocatif       = run;
    window.shareLocatif     = share;
    window.printLocatif     = print;
    window.resetLocatif     = reset;
    window.saveLocatif      = save;
    window.exportLocatifPDF = exportPDF;

    // Load defaults + URL params + create initial bien
    const initParams = loadFromUrl();
    writeForm(initParams);
    biens = [{
      id:     'bien-' + Date.now(),
      name:   defaultBienName(0),
      params: initParams,
      result: calc(initParams)
    }];
    currentIdx = 0;

    // Init UI components
    CI.initAll();

    // Bouton "+ Ajouter un bien"
    const addBtn = document.getElementById('btn-add-bien');
    if (addBtn) addBtn.addEventListener('click', addBien);

    // Bind recompute on input change (global params only — pas les contrôles inline des analyses)
    document.querySelectorAll('#params input, #params select').forEach((el) => {
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    // A10 — bouton MC vacance
    const a10Btn = document.getElementById('la10-run');
    if (a10Btn) {
      a10Btn.addEventListener('click', () => { if (lastParams) renderA10Refresh(lastParams); });
    }

    // A09 — taux bourse pills
    document.querySelectorAll('#la9-rate-btns button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#la9-rate-btns button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        la9StockRate = parseFloat(b.dataset.val) || 7;
        if (lastParams && lastResult) renderA09(lastParams, lastResult);
      });
    });

    // A07 — indexation loyers
    document.querySelectorAll('#la7-indexation-btns button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#la7-indexation-btns button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        la7Indexation = parseFloat(b.dataset.val) || 0;
        if (lastParams && lastResult) renderCashflowProj(lastParams);
      });
    });

    // A08 — année de revente & frais
    ['la8-year', 'la8-fees'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { if (lastParams && lastResult) renderRevente(lastParams, lastResult); });
    });
    // Pills la8-year → déclenchent 'input' via CI.initPills, donc couvert

    // Initial run
    setTimeout(run, 30);
  });

  window.addEventListener('resize', () => {
    if (lastResult) renderChart(lastResult);
  });
})();
