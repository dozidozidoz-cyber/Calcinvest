/* ============================================================
   CalcInvest — DCA Crypto VIEW (DOM binding)
   Charge les JSON crypto → CalcDCACrypto.* → render 7 analyses
   ============================================================ */

(function () {
  'use strict';

  const CC = window.CalcDCACrypto;
  // CalcDCA loaded from /assets/js/core/calc-dca.js — used here only for
  // computeValueAveraging dans la 2e tab "Stratégies de déploiement".
  const VAfn = (window.CalcDCA && window.CalcDCA.computeValueAveraging) || null;

  /* ------------------------------------------------------------------ */
  /* Catalogue des cryptos                                                 */
  /* ------------------------------------------------------------------ */
  const CRYPTOS_META = {
    btc: { name: 'Bitcoin',      symbol: 'BTC', color: '#F7931A' },
    eth: { name: 'Ethereum',     symbol: 'ETH', color: '#627EEA' },
    xrp: { name: 'XRP (Ripple)', symbol: 'XRP', color: '#00AAE4' },
    bnb: { name: 'BNB',          symbol: 'BNB', color: '#F3BA2F' },
    sol: { name: 'Solana',       symbol: 'SOL', color: '#9945FF' }
  };

  /* Cache des données JSON chargées */
  const DATA_CACHE = {};

  /* Insight box helper (matching dca.view.js component) */
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
  /* Chargement données JSON                                               */
  /* ------------------------------------------------------------------ */
  function loadCrypto(id) {
    if (DATA_CACHE[id]) return Promise.resolve(DATA_CACHE[id]);
    return fetch(`/assets/data/${id}.json`)
      .then((r) => r.json())
      .then((d) => { DATA_CACHE[id] = d; return d; });
  }

  /* ------------------------------------------------------------------ */
  /* Lecture formulaire                                                    */
  /* ------------------------------------------------------------------ */
  function readForm() {
    const v   = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const str = (id) => document.getElementById(id)?.value || '';
    return {
      cryptoId:      str('cr-asset'),
      startDate:     str('cr-start'),
      endDate:       str('cr-end'),
      initialAmount: v('cr-initial'),
      monthlyAmount: v('cr-monthly'),
      feesPct:       v('cr-fees'),
      taxRate:       v('cr-tax')
    };
  }

  /* ------------------------------------------------------------------ */
  /* Mise à jour du résumé de params                                       */
  /* ------------------------------------------------------------------ */
  function updateSummary(p, data) {
    const el = document.getElementById('cr-sum-params');
    if (!el) return;
    const meta = CRYPTOS_META[p.cryptoId] || {};
    el.textContent =
      (meta.symbol || p.cryptoId.toUpperCase()) + ' · ' +
      CI.fmtNum(p.monthlyAmount, 0) + ' $/mois · ' +
      p.startDate + ' → ' + (p.endDate || data.end);
  }

  /* ------------------------------------------------------------------ */
  /* Mise à jour du sélecteur de dates selon la crypto choisie            */
  /* ------------------------------------------------------------------ */
  function updateDateRange(data) {
    const startEl = document.getElementById('cr-start');
    const endEl   = document.getElementById('cr-end');
    if (startEl) {
      startEl.min = data.start;
      startEl.max = data.end;
      if (!startEl.value || startEl.value < data.start) startEl.value = data.start;
    }
    if (endEl) {
      endEl.min = data.start;
      endEl.max = data.end;
      if (!endEl.value || endEl.value > data.end) endEl.value = data.end;
    }
  }

  /* ------------------------------------------------------------------ */
  /* A01 — Vue d'ensemble                                                  */
  /* ------------------------------------------------------------------ */
  function renderA01(p, r, data) {
    const meta = CRYPTOS_META[p.cryptoId] || {};
    const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls  = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('cr1-value',    CI.fmtMoney(r.finalValue, 0));
    set('cr1-invested', CI.fmtMoney(r.finalInvested, 0));
    set('cr1-pnl',      (r.finalPnL >= 0 ? '+' : '') + CI.fmtMoney(r.finalPnL, 0));
    set('cr1-pnl-pct',  (r.finalPnLPct >= 0 ? '+' : '') + r.finalPnLPct.toFixed(1) + ' %');
    set('cr1-cagr',     (r.cagr >= 0 ? '+' : '') + r.cagr.toFixed(1) + ' %/an');
    set('cr1-mult',     '×' + r.multiplier.toFixed(2));
    set('cr1-avgbuy',   CI.fmtNum(r.avgBuyPrice, 0) + ' $');
    set('cr1-fees',     '−' + CI.fmtMoney(r.totalFees, 0));
    set('cr1-months',   r.months + ' mois');

    cls('cr1-value',   'pos');
    cls('cr1-pnl',     r.finalPnL >= 0 ? 'pos' : 'neg');
    cls('cr1-pnl-pct', r.finalPnL >= 0 ? 'pos' : 'neg');
    cls('cr1-cagr',    r.cagr    >= 0 ? 'pos' : 'neg');

    if (r.bestMonth)  set('cr1-best',  '+' + r.bestMonth.ret.toFixed(1) + ' % (' + r.bestMonth.date + ')');
    if (r.worstMonth) set('cr1-worst', r.worstMonth.ret.toFixed(1) + ' % (' + r.worstMonth.date + ')');

    // Flat tax
    const taxRow = document.getElementById('cr1-tax-row');
    if (p.taxRate > 0) {
      set('cr1-tax',     '−' + CI.fmtMoney(r.taxDue, 0));
      set('cr1-net',     CI.fmtMoney(r.netAfterTax, 0));
      if (taxRow) taxRow.style.display = '';
    } else {
      if (taxRow) taxRow.style.display = 'none';
    }

    // Prix actuel
    const lastPrice = data.prices[data.prices.length - 1];
    const priceEl   = document.getElementById('cr1-current-price');
    if (priceEl) priceEl.textContent = CI.fmtNum(lastPrice, 0) + ' $ (dernier)';

    // Halvings badge pour BTC
    const halvEl = document.getElementById('cr1-halvings');
    if (halvEl) {
      if (p.cryptoId === 'btc' && data.halvings) {
        halvEl.style.display = '';
        halvEl.textContent   = 'Halvings : ' + data.halvings.join(' · ');
      } else {
        halvEl.style.display = 'none';
      }
    }

    // Mettre à jour la couleur de la légende
    const legendDot = document.getElementById('cr1-legend-dot');
    if (legendDot) legendDot.style.background = meta.color || '#F7931A';

    // Chart
    requestAnimationFrame(() => {
      const labels = r.monthly_data.map((pt) => pt.date);
      CI.drawChart('cra1-chart', labels, [
        { label: 'Investi',    data: r.monthly_data.map((pt) => pt.invested), color: '#94A3B8', fill: false, width: 1.5, dash: [4, 3] },
        { label: 'Portfolio',  data: r.monthly_data.map((pt) => pt.value),    color: meta.color || '#F7931A', fill: true, width: 2.5 }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Tableau annuel
    const tbody = document.getElementById('cra1-tbody');
    if (tbody) {
      // Grouper les monthly_data par année
      const byYear = {};
      r.monthly_data.forEach((pt) => {
        const y = pt.date.split('-')[0];
        if (!byYear[y]) byYear[y] = { year: y, first: pt, last: pt };
        byYear[y].last = pt;
      });
      tbody.innerHTML = Object.values(byYear).map((yr) => {
        const pnl = yr.last.value - yr.last.invested;
        const pct = yr.last.invested > 0 ? (pnl / yr.last.invested * 100).toFixed(1) : '0.0';
        return `<tr>
          <td>${yr.year}</td>
          <td>${CI.fmtNum(yr.last.price, 0)} $</td>
          <td>${CI.fmtMoney(yr.last.invested, 0)}</td>
          <td>${CI.fmtMoney(yr.last.value, 0)}</td>
          <td class="${pnl >= 0 ? 'pos' : 'neg'}">${pnl >= 0 ? '+' : ''}${CI.fmtMoney(pnl, 0)}</td>
          <td class="${pnl >= 0 ? 'pos' : 'neg'}">${pnl >= 0 ? '+' : ''}${pct} %</td>
        </tr>`;
      }).join('');
    }

    // Insight A01
    const pnlCls = r.finalPnL >= 0 ? 'pos' : 'neg';
    const cagrCls = r.cagr >= 0 ? 'pos' : 'neg';
    const taxLine = p.taxRate > 0
      ? ` Après flat tax ${p.taxRate} %, il te reste <em>${CI.fmtMoney(r.netAfterTax, 0)}</em>.`
      : '';
    setInsight('cra-overview',
      `Sur <strong>${(r.months / 12).toFixed(1)} ans</strong> de DCA sur <strong>${meta.name}</strong>, ` +
      `<em>${CI.fmtMoney(r.finalInvested, 0)}</em> versés deviennent ` +
      `<em>${CI.fmtMoney(r.finalValue, 0)}</em> ` +
      `(<span class="${pnlCls}">${r.finalPnL >= 0 ? '+' : ''}${CI.fmtMoney(r.finalPnL, 0)}</span>, ` +
      `CAGR <span class="${cagrCls}">${r.cagr >= 0 ? '+' : ''}${r.cagr.toFixed(1)} %/an</span>, ×${r.multiplier.toFixed(2)}). ` +
      `Prix moyen d'achat <strong>${CI.fmtNum(r.avgBuyPrice, 0)} $</strong>.${taxLine}`
    );
  }

  /* ------------------------------------------------------------------ */
  /* A02 — Performance annuelle                                            */
  /* ------------------------------------------------------------------ */
  function renderA02(p, data) {
    const meta    = CRYPTOS_META[p.cryptoId] || {};
    const yearly  = CC.computeYearlyReturns(data.prices, data.start, p.startDate, p.endDate || data.end);

    const posYears = yearly.filter((y) => y.ret >= 0).length;
    const negYears = yearly.length - posYears;
    const best     = yearly.reduce((m, y) => y.ret > m.ret ? y : m, yearly[0] || { ret: 0, year: '-' });
    const worst    = yearly.reduce((m, y) => y.ret < m.ret ? y : m, yearly[0] || { ret: 0, year: '-' });

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cr2-pos-years',  posYears + ' / ' + yearly.length);
    set('cr2-best-year',  best.year + ' : +' + best.ret.toFixed(0) + ' %');
    set('cr2-worst-year', worst.year + ' : ' + worst.ret.toFixed(0) + ' %');
    set('cr2-median',     yearly.length > 0
      ? (function() {
          const s = [...yearly].sort((a, b) => a.ret - b.ret);
          const m = s[Math.floor(s.length / 2)];
          return (m.ret >= 0 ? '+' : '') + m.ret.toFixed(0) + ' %';
        })()
      : '—');

    // Bar chart via CI.drawChart
    requestAnimationFrame(() => {
      const labels = yearly.map((y) => String(y.year));
      // On dessine une série par couleur (positif vert, négatif rouge)
      // CI.drawChart ne supporte pas les barres multicolores nativement
      // → on dessine deux séries : valeurs positives et valeurs négatives
      const posData = yearly.map((y) => y.ret >= 0 ? y.ret : 0);
      const negData = yearly.map((y) => y.ret <  0 ? y.ret : 0);

      CI.drawChart('cra2-chart', labels, [
        { data: negData, color: '#F87171', fill: true, width: 0 },
        { data: posData, color: '#34D399', fill: true, width: 0 }
      ], {
        yFormat: (v) => v.toFixed(0) + ' %',
        barMode: true
      });
    });

    // Halvings pour BTC
    const halvEl = document.getElementById('cr2-halvings');
    if (halvEl) {
      if (p.cryptoId === 'btc' && data.halvings) {
        halvEl.style.display = '';
        const halvings = data.halvings;
        halvEl.innerHTML = halvings.map((h) => {
          const yr = h.split('-')[0];
          return `<span style="background:rgba(247,147,26,0.15);border:1px solid rgba(247,147,26,0.4);color:#F7931A;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">Halving ${yr}</span>`;
        }).join(' ');
      } else {
        halvEl.style.display = 'none';
      }
    }

    // Insight A02
    if (yearly.length > 0) {
      const posPct = (posYears / yearly.length * 100).toFixed(0);
      setInsight('cra-yearly',
        `Sur <strong>${yearly.length} années</strong> de données ${meta.name}, ` +
        `<em>${posYears}</em> ont fini en hausse (<strong>${posPct} %</strong>). ` +
        `Plus belle année : <span class="pos">+${best.ret.toFixed(0)} %</span> (${best.year}). ` +
        `Pire : <span class="neg">${worst.ret.toFixed(0)} %</span> (${worst.year}). ` +
        `<span class="muted">La crypto amplifie tout — gains comme pertes — d'où l'intérêt du DCA pour lisser.</span>`
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* A03 — Drawdown historique                                             */
  /* ------------------------------------------------------------------ */
  function renderA03(p, r) {
    const dd  = CC.computeDrawdown(r.monthly_data);
    if (!dd) return;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('cr3-maxdd',        dd.maxDD.toFixed(1) + ' %');
    set('cr3-maxdd-period', (dd.maxDDStart || '—') + ' → ' + (dd.maxDDEnd || '—'));
    set('cr3-deep-dds',     dd.deepDrawdowns + ' fois');
    cls('cr3-maxdd', 'neg');

    // Valeur actuelle du drawdown
    const lastDD = dd.series[dd.series.length - 1];
    set('cr3-current-dd', lastDD ? lastDD.drawdown.toFixed(1) + ' %' : '—');

    requestAnimationFrame(() => {
      const labels  = dd.series.map((pt) => pt.date);
      const ddData  = dd.series.map((pt) => pt.drawdown);
      CI.drawChart('cra3-chart', labels, [
        { data: ddData, color: '#F87171', fill: true, width: 1.5 }
      ], { yFormat: (v) => v.toFixed(0) + ' %' });
    });

    // Insight A03
    const meta = CRYPTOS_META[p.cryptoId] || {};
    const ddCurrentLine = lastDD && lastDD.drawdown < -1
      ? ` Actuellement le portefeuille est en drawdown de <span class="neg">${lastDD.drawdown.toFixed(1)} %</span>.`
      : ` Le portefeuille est actuellement <span class="pos">proche de son sommet</span>.`;
    setInsight('cra-drawdown',
      `Pire chute historique de <strong>${meta.name}</strong> sur cette plage : ` +
      `<span class="neg">${dd.maxDD.toFixed(1)} %</span> (${dd.maxDDStart || '—'} → ${dd.maxDDEnd || '—'}). ` +
      `<strong>${dd.deepDrawdowns}</strong> drawdowns sévères (>50 %) dans l'histoire de l'actif.${ddCurrentLine} ` +
      `<span class="muted">Sur crypto, viser ${'>'} 4 ans d'horizon minimum pour absorber un cycle bear complet.</span>`
    );
  }

  /* ------------------------------------------------------------------ */
  /* A04 — Stratégies de déploiement (DCA vs VA vs Lump Sum)              */
  /* ------------------------------------------------------------------ */
  function renderA04(p, r, data) {
    if (!r) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    // Window in months between start and end
    const [sy, sm] = p.startDate.split('-').map(Number);
    const [ey, em] = (p.endDate || data.end).split('-').map(Number);
    const months = (ey - sy) * 12 + (em - sm) + 1;

    // 1) DCA = déjà calculé (r) — finalValue, finalInvested, monthly_data
    const dcaFinal = r.finalValue;
    const dcaInv   = r.finalInvested;

    // 2) Lump Sum = même montant total versé, tout au mois 1
    const lump = CC.calcCryptoDCA({
      prices: data.prices,
      dataStart: data.start,
      startDate: p.startDate,
      endDate: p.endDate || data.end,
      initialAmount: dcaInv,
      monthlyAmount: 0,
      feesPct: p.feesPct,
      taxRate: 0
    });

    // 3) Value Averaging — réutilise computeValueAveraging du module stocks
    let va = null;
    if (VAfn) {
      va = VAfn(data.prices, null, data.start, {
        startDate: p.startDate,
        durationMonths: months,
        monthlyAmount: p.monthlyAmount,
        initialAmount: p.initialAmount || 0,
        feesPct: p.feesPct,
        dividendsReinvested: false
      });
    }

    if (!lump || !va) return;

    const lumpFinal = lump.finalValue;
    const vaFinal = va.finalValue;
    const vaInv = va.totalInvested;

    // Vainqueur
    const finals = [
      { id: 'dca', label: 'DCA', val: dcaFinal, color: '#34D399' },
      { id: 'va', label: 'Value Averaging', val: vaFinal, color: '#A78BFA' },
      { id: 'lump', label: 'Lump Sum', val: lumpFinal, color: '#F7931A' }
    ].sort((a, b) => b.val - a.val);
    const winner = finals[0];
    const runner = finals[1];
    const gap = winner.val - runner.val;
    const gapPct = runner.val > 0 ? (gap / runner.val) * 100 : 0;

    set('cr4-winner', winner.label);
    set('cr4-winner-sub', '+' + CI.fmtCompact(gap) + ' € (+' + gapPct.toFixed(1) + ' % vs ' + runner.label + ')');
    const winEl = document.getElementById('cr4-winner');
    if (winEl) winEl.style.color = winner.color;

    const triFmt = (val) => CI.fmtCompact(val) + ' €';
    const triPct = (a, b) => b > 0 ? ((a / b - 1) * 100).toFixed(1) + ' %' : '—';

    set('cr4-dca-final', triFmt(dcaFinal));
    set('cr4-dca-detail', 'Versé ' + CI.fmtCompact(dcaInv) + ' · gain ' + triPct(dcaFinal, dcaInv));
    cls('cr4-dca-final', winner.id === 'dca' ? 'pos' : '');

    set('cr4-va-final', triFmt(vaFinal));
    set('cr4-va-detail', 'Versé ' + CI.fmtCompact(vaInv) + ' · gain ' + triPct(vaFinal, vaInv));
    cls('cr4-va-final', winner.id === 'va' ? 'pos' : '');

    set('cr4-lump-final', triFmt(lumpFinal));
    set('cr4-lump-detail', 'Versé ' + CI.fmtCompact(dcaInv) + ' · gain ' + triPct(lumpFinal, dcaInv));
    cls('cr4-lump-final', winner.id === 'lump' ? 'pos' : '');

    set('cr4-meta', (CRYPTOS_META[p.cryptoId] || {name: p.cryptoId}).name + ' · ' + p.startDate + ' → ' + (p.endDate || data.end));

    requestAnimationFrame(() => {
      const dcaPts = r.monthly_data || [];
      const lumpPts = lump.monthly_data || [];
      const vaSeries = va.series || { portfolio: [], invested: [] };
      const n = Math.min(dcaPts.length, lumpPts.length, vaSeries.portfolio.length);
      if (n < 2) return;
      const stride = Math.max(1, Math.ceil(n / 300));
      const idxs = [];
      for (let i = 0; i < n; i += stride) idxs.push(i);
      if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
      const labels = idxs.map((i) => dcaPts[i].date);
      CI.drawChart('cra4-chart', labels, [
        { label: 'Versé DCA / Lump', data: idxs.map((i) => dcaPts[i].invested), color: '#94A3B8', width: 1, dash: [3, 3] },
        { label: 'Versé VA',         data: idxs.map((i) => vaSeries.invested[i]), color: '#FBBF24', width: 1, dash: [3, 3] },
        { label: 'Lump Sum',         data: idxs.map((i) => lumpPts[i].value),     color: '#F7931A', width: 2.5 },
        { label: 'Value Averaging',  data: idxs.map((i) => vaSeries.portfolio[i]), color: '#A78BFA', width: 2.5 },
        { label: 'DCA classique',    data: idxs.map((i) => dcaPts[i].value),       color: '#34D399', width: 3 }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Insight A04
    setInsight('cra-lumpvsdca',
      `<strong>${winner.label}</strong> domine sur cette plage avec <em>${CI.fmtCompact(winner.val)} €</em>, ` +
      `soit <span class="pos">+${CI.fmtCompact(gap)} €</span> (<strong>+${gapPct.toFixed(1)} %</strong>) de plus que ${runner.label}. ` +
      `<span class="muted">DCA ${CI.fmtCompact(dcaFinal)} · VA ${CI.fmtCompact(vaFinal)} · Lump ${CI.fmtCompact(lumpFinal)}.</span>`
    );
  }

  /* ------------------------------------------------------------------ */
  /* A05 — Volatilité & risque                                             */
  /* ------------------------------------------------------------------ */
  function renderA05(p, data) {
    const vol = CC.computeRollingVolatility(
      data.prices, data.start,
      p.startDate, p.endDate || data.end,
      [3, 12]
    );

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('cr5-current-vol', vol.currentVol != null ? vol.currentVol.toFixed(1) + ' %/an' : '—');
    set('cr5-hist-vol',    vol.histVol    != null ? vol.histVol.toFixed(1)    + ' %/an' : '—');
    // Benchmark S&P 500 ~15%
    set('cr5-sp500-vol', '~15 %/an');

    const ratio = vol.currentVol != null ? (vol.currentVol / 15).toFixed(1) : '—';
    set('cr5-ratio', ratio !== '—' ? ratio + '× plus volatile' : '—');

    requestAnimationFrame(() => {
      const series3  = (vol.series[3]  || []).filter((pt) => pt.vol != null);
      const series12 = (vol.series[12] || []).filter((pt) => pt.vol != null);

      if (series12.length === 0) return;

      CI.drawChart('cra5-chart', series12.map((pt) => pt.date), [
        { data: series12.map((pt) => pt.vol), color: '#F7931A', fill: true, width: 2 },
        { data: series3.length > 0
            ? series12.map((pt) => {
                const found = series3.find((s) => s.date === pt.date);
                return found ? found.vol : null;
              })
            : [],
          color: '#F87171', fill: false, width: 1.5, dash: [3, 3] }
      ], { yFormat: (v) => v.toFixed(0) + ' %' });
    });

    // Insight A05
    const meta = CRYPTOS_META[p.cryptoId] || {};
    if (vol.currentVol != null && vol.histVol != null) {
      const ratioNum = parseFloat(ratio);
      const ratioCls = ratioNum > 4 ? 'neg' : ratioNum > 2.5 ? 'warn' : 'muted';
      setInsight('cra-volatility',
        `Volatilité actuelle de <strong>${meta.name}</strong> : <em>${vol.currentVol.toFixed(1)} %/an</em> ` +
        `(moyenne historique <strong>${vol.histVol.toFixed(1)} %/an</strong>). ` +
        `Soit <span class="${ratioCls}">${ratio}× plus volatile que le S&P 500</span>. ` +
        `<span class="muted">À retenir : un actif crypto demande une enveloppe psychologique solide et un horizon long.</span>`
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* A06 — Cycles de marché                                                */
  /* ------------------------------------------------------------------ */
  function renderA06(p, data) {
    const cycles = CC.detectCycles(data.prices, data.start, p.startDate, p.endDate || data.end);

    const bulls = cycles.filter((c) => c.type === 'bull');
    const bears = cycles.filter((c) => c.type === 'bear');

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('cr6-bull-count', bulls.length);
    set('cr6-bear-count', bears.length);

    const avgBull = bulls.length > 0
      ? bulls.reduce((s, c) => s + c.ret, 0) / bulls.length : 0;
    const avgBear = bears.length > 0
      ? bears.reduce((s, c) => s + c.ret, 0) / bears.length : 0;

    set('cr6-avg-bull', (avgBull >= 0 ? '+' : '') + avgBull.toFixed(0) + ' %');
    set('cr6-avg-bear', (avgBear >= 0 ? '+' : '') + avgBear.toFixed(0) + ' %');

    // Table des cycles
    const tbody = document.getElementById('cra6-tbody');
    if (tbody) {
      tbody.innerHTML = cycles.map((c) => {
        const isBull  = c.type === 'bull';
        const badge   = isBull
          ? '<span style="background:rgba(52,211,153,0.15);color:#34D399;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:700">BULL</span>'
          : '<span style="background:rgba(248,113,113,0.15);color:#F87171;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:700">BEAR</span>';
        const curr    = c.current ? ' <span style="font-size:10px;opacity:.6">(en cours)</span>' : '';
        const retSign = c.ret >= 0 ? '+' : '';
        const retCls  = c.ret >= 0 ? 'pos' : 'neg';
        return `<tr>
          <td>${badge}</td>
          <td>${c.start} → ${c.end}${curr}</td>
          <td>${c.months} mois</td>
          <td class="${retCls}">${retSign}${c.ret.toFixed(0)} %</td>
          <td>${CI.fmtNum(c.startPrice, 0)} $</td>
          <td>${CI.fmtNum(c.endPrice, 0)} $</td>
        </tr>`;
      }).join('');
    }

    // Chart : prix + coloration bull/bear
    requestAnimationFrame(() => {
      const si     = Math.max(0, monthIndex(data.start, p.startDate));
      const ei     = Math.min(data.prices.length - 1, monthIndex(data.start, p.endDate || data.end));
      const labels = [];
      const prices = [];
      for (let i = si; i <= ei; i++) {
        const d = addM(data.start, i);
        labels.push(d);
        prices.push(data.prices[i]);
      }
      CI.drawChart('cra6-chart', labels, [
        { data: prices, color: '#60A5FA', fill: false, width: 2 }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    // Insight A06
    const metaA6 = CRYPTOS_META[p.cryptoId] || {};
    const currentCycle = cycles[cycles.length - 1];
    const cycleLine = currentCycle && currentCycle.current
      ? ` Cycle actuel : <span class="${currentCycle.type === 'bull' ? 'pos' : 'neg'}">${currentCycle.type === 'bull' ? 'BULL' : 'BEAR'}</span> depuis ${currentCycle.start} (${currentCycle.months} mois, ${currentCycle.ret >= 0 ? '+' : ''}${currentCycle.ret.toFixed(0)} %).`
      : '';
    setInsight('cra-cycles',
      `<strong>${metaA6.name}</strong> a connu <em>${bulls.length}</em> cycles bull (perf moyenne ` +
      `<span class="pos">+${avgBull.toFixed(0)} %</span>) et <em>${bears.length}</em> cycles bear ` +
      `(<span class="neg">${avgBear.toFixed(0)} %</span>) sur cette plage.${cycleLine} ` +
      `<span class="muted">Acheter pendant un bear et tenir jusqu'au prochain bull = la stratégie historique gagnante.</span>`
    );
  }

  // Helpers locaux (répliques simplifiées des fonctions du core)
  function monthIndex(dataStart, yyyymm) {
    if (!yyyymm) return 0;
    const [sy, sm] = dataStart.split('-').map(Number);
    const [ey, em] = yyyymm.split('-').map(Number);
    return (ey - sy) * 12 + (em - sm);
  }
  function addM(base, n) {
    const [y, m] = base.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* ------------------------------------------------------------------ */
  /* A07 — Comparaison multi-cryptos                                       */
  /* ------------------------------------------------------------------ */
  function renderA07(p) {
    // Charger toutes les cryptos en parallèle
    const ids = Object.keys(CRYPTOS_META);
    Promise.all(ids.map((id) => loadCrypto(id).then((d) => ({ id, name: CRYPTOS_META[id].name, color: CRYPTOS_META[id].color, prices: d.prices, dataStart: d.start }))))
      .then((cryptoArr) => {
        const results = CC.calcMultiCryptoComp({
          initialAmount: 0,
          monthlyAmount: p.monthlyAmount,
          feesPct:       p.feesPct,
          taxRate:       0
        }, cryptoArr);

        if (!results || results.length === 0) return;

        // Cards
        const cards = document.getElementById('cra7-cards');
        if (cards) {
          const sorted = [...results].sort((a, b) => b.result.finalValue - a.result.finalValue);
          cards.innerHTML = sorted.map((c, rank) => {
            const r     = c.result;
            const meta  = CRYPTOS_META[c.id];
            const badge = rank === 0
              ? `<span style="background:${meta.color};color:#000;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">🏆 #1</span>`
              : `<span style="color:var(--text-3);font-size:11px">#${rank + 1}</span>`;
            return `<div style="background:var(--bg-elev);border:2px solid ${rank === 0 ? meta.color : 'var(--border-soft)'};border-radius:var(--r);padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-size:13px;font-weight:700;color:${meta.color}">${meta.symbol}</div>
                ${badge}
              </div>
              <div style="font-size:22px;font-weight:800">${CI.fmtCompact(r.finalValue)}</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:3px">×${r.multiplier.toFixed(1)} · versé : ${CI.fmtCompact(r.finalInvested)}</div>
              <div style="font-size:11px;margin-top:3px;color:${r.finalPnL >= 0 ? '#34D399' : '#F87171'}">${r.finalPnL >= 0 ? '+' : ''}${CI.fmtCompact(r.finalPnL)} (${r.finalPnLPct.toFixed(0)} %)</div>
              <div style="font-size:10px;color:var(--text-3);margin-top:2px">${c.start} → ${c.end}</div>
            </div>`;
          }).join('');
        }

        // Légende A07
        const legendEl = document.getElementById('cra7-legend');
        if (legendEl) {
          legendEl.innerHTML = results.map((c) => {
            const m = CRYPTOS_META[c.id];
            return `<div><span class="legend-dot" style="background:${m.color}"></span>${m.symbol}</div>`;
          }).join('');
        }

        // Chart
        requestAnimationFrame(() => {
          // Trouver la période commune la plus longue
          const allDates = new Set();
          results.forEach((c) => c.result.monthly_data.forEach((pt) => allDates.add(pt.date)));
          const labels = [...allDates].sort();

          CI.drawChart('cra7-chart', labels,
            results.map((c) => {
              const dateMap = {};
              c.result.monthly_data.forEach((pt) => { dateMap[pt.date] = pt.value; });
              return {
                label: CRYPTOS_META[c.id].symbol,
                data:  labels.map((d) => dateMap[d] ?? null),
                color: CRYPTOS_META[c.id].color,
                width: 2,
                fill:  false
              };
            }),
            { yFormat: (v) => CI.fmtCompact(v) }
          );
        });

        // Insight A07
        const sorted = [...results].sort((a, b) => b.result.finalValue - a.result.finalValue);
        const winner = sorted[0];
        const loser  = sorted[sorted.length - 1];
        const wMeta  = CRYPTOS_META[winner.id];
        const lMeta  = CRYPTOS_META[loser.id];
        const ratio  = loser.result.finalValue > 0
          ? (winner.result.finalValue / loser.result.finalValue).toFixed(1)
          : '∞';
        setInsight('cra-multi',
          `Sur la période commune (${winner.start} → ${winner.end}), <strong>${wMeta.name}</strong> ` +
          `domine avec <em>${CI.fmtCompact(winner.result.finalValue)} €</em> (×${winner.result.multiplier.toFixed(1)}). ` +
          `Le pire (${lMeta.name}) finit à <strong>${CI.fmtCompact(loser.result.finalValue)} €</strong>, ` +
          `soit un écart de <span class="warn">${ratio}×</span>. ` +
          `<span class="muted">Diversifier sur 2-3 cryptos lisse les paris perdus, mais BTC reste le benchmark.</span>`
        );
      })
      .catch((e) => console.error('A07 multi-crypto error:', e));
  }

  /* ------------------------------------------------------------------ */
  /* A08 — Stratégies de rendement DeFi                                   */
  /* ------------------------------------------------------------------ */
  function renderA08(p, r) {
    if (!r.monthly_data || r.monthly_data.length < 12) return;

    const defi  = CC.computeDeFiStrategies(r.monthly_data, p.cryptoId);
    const scens = defi.scenarios;

    // ── Cards ──────────────────────────────────────────────────────────
    const cards = document.getElementById('cra8-cards');
    const symbol = (CRYPTOS_META[p.cryptoId] && CRYPTOS_META[p.cryptoId].symbol) || p.cryptoId.toUpperCase();
    if (cards) {
      cards.innerHTML = scens.map((s, i) => {
        const isBest  = i === 1; // staking — best realistic upside
        const border  = isBest ? 'var(--accent)' : 'var(--border-soft)';
        const badge   = isBest ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">RECOMMANDÉ</span>' : '';
        const yieldLine = s.yieldEarned > 0
          ? `<div style="font-size:11px;color:var(--accent);margin-top:2px">+${CI.fmtMoney(s.yieldEarned, 0)} de yield</div>`
          : '<div style="font-size:11px;color:var(--text-3);margin-top:2px">Référence HODL</div>';
        // Real yield decoupling : yield natif (tokens) vs USD aujourd'hui
        let tokenLine = '';
        if (s.yieldTokens > 0) {
          const tokensStr = s.yieldTokens >= 1
            ? s.yieldTokens.toFixed(2)
            : s.yieldTokens.toFixed(4);
          tokenLine = `<div style="font-size:11px;color:var(--text-3);margin-top:2px;font-family:var(--font-mono)">+${tokensStr} ${symbol} (${CI.fmtCompact(s.yieldUsdNow)} aujourd'hui)</div>`;
        } else if (s.id === 'lending' && s.yieldEarned > 0) {
          tokenLine = `<div style="font-size:11px;color:var(--text-3);margin-top:2px;font-family:var(--font-mono)">USD pur (stables, pas de token natif)</div>`;
        }
        const apyBadge = s.apy > 0
          ? `<span style="font-size:10px;color:var(--text-3)"> · ${s.apy} % APY</span>`
          : '';
        return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:12px;font-weight:700;color:${s.color}">${s.label}${apyBadge}</div>${badge}
          </div>
          <div style="font-size:20px;font-weight:700">${CI.fmtCompact(s.finalValue)}</div>
          ${yieldLine}
          ${tokenLine}
          <div style="font-size:11px;color:var(--text-3);margin-top:4px">⚠ ${s.risk}</div>
        </div>`;
      }).join('');
    }

    // ── Chart 4 courbes ───────────────────────────────────────────────
    requestAnimationFrame(() => {
      const labels  = scens[0].yearly.map((y) => 'An ' + y.year);
      CI.drawChart('cra8-chart', labels,
        scens.map((s) => ({
          data:  s.yearly.map((y) => y.value),
          color: s.color,
          width: s.id === 'staking' ? 3 : s.id === 'hodl' ? 2 : 1.5,
          dash:  s.id === 'hodl' ? [4, 3] : undefined
        })),
        { yFormat: (v) => CI.fmtCompact(v) }
      );
    });

    // ── Tableau récapitulatif ─────────────────────────────────────────
    const tbody = document.getElementById('cra8-tbody');
    if (tbody) {
      const hodlFinal = defi.hodlFinal;
      tbody.innerHTML = scens.map((s) => {
        const delta = s.finalValue - hodlFinal;
        const pct   = hodlFinal > 0 ? (delta / hodlFinal * 100).toFixed(0) : 0;
        return `<tr>
          <td style="font-weight:600;color:${s.color}">${s.label}</td>
          <td>${CI.fmtMoney(s.finalValue, 0)}</td>
          <td>${s.yieldEarned > 0 ? CI.fmtMoney(s.yieldEarned, 0) : '—'}</td>
          <td>${delta > 0 ? '<span class="pos">+' + CI.fmtMoney(delta, 0) + ' (' + pct + ' %)</span>' : '—'}</td>
        </tr>`;
      }).join('');
    }

    // ── Insight A08 ───────────────────────────────────────────────────
    const staking = scens.find((s) => s.id === 'staking');
    const hodl    = scens.find((s) => s.id === 'hodl');
    const years   = (r.months / 12).toFixed(1);
    if (staking && hodl) {
      const gain    = staking.finalValue - hodl.finalValue;
      const gainPct = hodl.finalValue > 0 ? (gain / hodl.finalValue * 100).toFixed(0) : 0;
      const lp      = scens.find((s) => s.id === 'lp');
      const lpNote  = lp && lp.finalValue > staking.finalValue
        ? ` Le LP génère encore plus de rendement (<span style="color:${lp.color}">${CI.fmtCompact(lp.finalValue)}</span>), mais au prix d'une perte impermanente estimée.`
        : '';
      setInsight('cra-defi',
        `Sur <strong>${years} ans</strong>, le staking liquid aurait apporté ` +
        `<span class="pos">+${CI.fmtMoney(gain, 0)} (+${gainPct} %)</span> vs HODL pur, ` +
        `sans modifier ton exposition au prix.${lpNote} ` +
        `<span class="muted">Ces taux sont des moyennes historiques 2022-2026 — ils varient et ces stratégies comportent des risques spécifiques (voir ci-dessous).</span>`
      );
    }

    // ── 7A : Stress test bear 2022 ────────────────────────────────────
    renderA08StressTest(p);

    // ── 7A : Gas fees calculator ──────────────────────────────────────
    renderA08GasCalc(p);
  }

  /* ------------------------------------------------------------------ */
  /* A08 sub : Stress test bear 2022                                       */
  /* ------------------------------------------------------------------ */
  function renderA08StressTest(p) {
    if (!CC.computeDeFiStressTest) return;
    const data = DATA_CACHE[p.cryptoId];
    if (!data) return;

    const st = CC.computeDeFiStressTest(data.prices, data.start, p.cryptoId, { initialAmount: 10000, monthlyAmount: 0 });
    const cardEl = document.getElementById('cra8-stress');
    if (!cardEl) return;
    if (!st) {
      cardEl.innerHTML = '<div style="color:var(--text-3);font-size:13px;padding:14px">Pas de période bear documentée pour ' + (p.cryptoId || '').toUpperCase() + '.</div>';
      return;
    }

    const period = st.period;
    const meta   = (CRYPTOS_META[p.cryptoId] || {});
    const symbol = meta.symbol || p.cryptoId.toUpperCase();
    const headerLine = '<strong>' + symbol + '</strong> · ' + period.label + ' · ' + period.start + ' → ' + period.end + ' · drawdown spot ' + period.drawdown + ' %';

    const hodl = st.drawdownByStrat.find(function (d) { return d.id === 'hodl'; });
    const rows = st.drawdownByStrat.map(function (d) {
      const ddCls = d.drawdown <= -50 ? 'neg' : d.drawdown <= -20 ? 'warn' : 'pos';
      const deltaCls = d.deltaVsHodlPct >= 5 ? 'pos' : d.deltaVsHodlPct <= -5 ? 'neg' : '';
      const deltaStr = d.id === 'hodl' ? '—' : '<span class="' + deltaCls + '">' + (d.deltaVsHodlPct >= 0 ? '+' : '') + d.deltaVsHodlPct.toFixed(1) + ' %</span>';
      return '<tr>' +
        '<td style="font-weight:600;color:' + d.color + '">' + d.label + '</td>' +
        '<td>' + CI.fmtMoney(d.startValue, 0) + '</td>' +
        '<td>' + CI.fmtMoney(d.endValue, 0) + '</td>' +
        '<td class="' + ddCls + '">' + d.drawdown.toFixed(1) + ' %</td>' +
        '<td>' + deltaStr + '</td>' +
        '</tr>';
    }).join('');

    cardEl.innerHTML =
      '<div style="font-size:13px;color:var(--text-2);margin-bottom:10px">' + headerLine + '</div>' +
      '<table class="data-table" style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
          '<th style="text-align:left;font-size:12px;color:var(--text-3);padding:8px 10px">Stratégie</th>' +
          '<th style="text-align:left;font-size:12px;color:var(--text-3);padding:8px 10px">Capital début</th>' +
          '<th style="text-align:left;font-size:12px;color:var(--text-3);padding:8px 10px">Capital fin</th>' +
          '<th style="text-align:left;font-size:12px;color:var(--text-3);padding:8px 10px">Drawdown</th>' +
          '<th style="text-align:left;font-size:12px;color:var(--text-3);padding:8px 10px">vs HODL</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';

    // Insight
    if (hodl) {
      const staking = st.drawdownByStrat.find(function (d) { return d.id === 'staking'; });
      const lending = st.drawdownByStrat.find(function (d) { return d.id === 'lending'; });
      const stakingDelta = staking ? staking.deltaVsHodlPct : 0;
      setInsight('cra-stress',
        'Pendant le ' + period.label.toLowerCase() + ', un placement initial de 10 000 € sur ' + symbol +
        ' a chuté de <span class="neg">' + hodl.drawdown.toFixed(1) + ' %</span>. ' +
        'Le staking a limité la perte de seulement <strong>' + stakingDelta.toFixed(1) + ' %</strong> vs HODL pur — ' +
        'la fraction de yield (~' + ((staking ? staking.yieldEarned : 0) / 10000 * 100).toFixed(1) + ' % du capital) est négligeable face à la baisse de prix. ' +
        (lending ? 'Seul le <span style="color:#FBBF24">lending stable</span> a tenu (<strong>' + lending.drawdown.toFixed(1) + ' %</strong>), mais avec 30 % seulement en stables. ' : '') +
        '<span class="muted">Conclusion : en bear, le yield n\'est pas un parachute. La couverture vient de la diversification stables / cash, pas du staking.</span>'
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* A08 sub : Gas fees calculator (interactif)                            */
  /* ------------------------------------------------------------------ */
  function renderA08GasCalc(p) {
    if (!CC.computeGasBreakeven) return;
    const monthlyEl = document.getElementById('cra8-gas-monthly');
    const chainEl   = document.getElementById('cra8-gas-chain');
    const freqEl    = document.getElementById('cra8-gas-freq');
    if (!monthlyEl || !chainEl || !freqEl) return;

    const monthlyAmount = parseFloat(monthlyEl.value) || 0;
    const chainCost     = chainEl.value === 'mainnet' ? 30 : (chainEl.value === 'l2' ? 1 : 0);
    const claimsPerYear = parseInt(freqEl.value, 10);

    // APY de référence : staking de l'asset sélectionné
    const stakingApy = (CC.DEFI_YIELDS && CC.DEFI_YIELDS.staking[p.cryptoId])
      ? CC.DEFI_YIELDS.staking[p.cryptoId].apy
      : 4;

    const result = CC.computeGasBreakeven({
      monthlyAmount: monthlyAmount,
      apy: stakingApy,
      gasUsdPerClaim: chainCost,
      claimsPerYear: claimsPerYear
    });

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cra8-gas-net-apy', result.netApy.toFixed(2) + ' %');
    set('cra8-gas-yearly',  CI.fmtMoney(result.gasYearly, 0));
    set('cra8-gas-yield',   CI.fmtMoney(result.yieldYearly, 0));
    set('cra8-gas-breakeven', result.breakevenMonthly != null ? CI.fmtMoney(result.breakevenMonthly, 0) + '/mois' : '—');

    const recoEl = document.getElementById('cra8-gas-reco');
    if (recoEl) {
      const cls = result.isWorthIt ? 'pos' : 'neg';
      const icon = result.isWorthIt ? '✅' : '⚠️';
      recoEl.className = 'insight';
      recoEl.innerHTML = '<div class="insight-icon">' + icon + '</div><div class="insight-text"><strong class="' + cls + '">' + result.recommendation + '</strong></div>';
    }

    // Couleur de la net APY
    const netApyEl = document.getElementById('cra8-gas-net-apy');
    if (netApyEl) {
      netApyEl.className = 'stat-value ' + (result.netApy >= stakingApy * 0.7 ? 'pos' : result.netApy >= 0 ? 'warn' : 'neg');
    }
  }

  /* ------------------------------------------------------------------ */
  /* run() — point d'entrée principal                                      */
  /* ------------------------------------------------------------------ */
  function run() {
    const p      = readForm();
    const loadEl = document.getElementById('cr-loading');
    if (loadEl) loadEl.style.display = '';

    loadCrypto(p.cryptoId)
      .then((data) => {
        if (loadEl) loadEl.style.display = 'none';

        // Dates par défaut
        if (!p.startDate) p.startDate = data.start;
        if (!p.endDate)   p.endDate   = data.end;

        updateDateRange(data);
        updateSummary(p, data);
        CI.setUrlParams({ crypto: p.cryptoId, start: p.startDate, end: p.endDate, monthly: p.monthlyAmount, fees: p.feesPct, tax: p.taxRate, initial: p.initialAmount });

        const params = {
          prices:        data.prices,
          dataStart:     data.start,
          startDate:     p.startDate,
          endDate:       p.endDate,
          initialAmount: p.initialAmount,
          monthlyAmount: p.monthlyAmount,
          feesPct:       p.feesPct,
          taxRate:       p.taxRate
        };

        const r = CC.calcCryptoDCA(params);
        if (!r) { CI.toast('Données insuffisantes pour cette période.', 'error'); return; }

        renderA01(p, r, data);
        renderA02(p, data);
        renderA03(p, r);
        renderA04(p, r, data);
        renderA05(p, data);
        renderA06(p, data);
        renderA07(p);
        renderA08(p, r);
      })
      .catch((e) => {
        if (loadEl) loadEl.style.display = 'none';
        CI.toast('Erreur chargement données crypto.', 'error');
        console.error(e);
      });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                  */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    CI.initAll(document.body);

    // Restaurer depuis URL
    const urlGet = (k) => CI.getUrlParam(k);
    const cryptoId = urlGet('crypto') || 'btc';
    const assetEl  = document.getElementById('cr-asset');
    if (assetEl) assetEl.value = cryptoId;

    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== null) el.value = val; };
    set('cr-monthly',  urlGet('monthly')  || '100');
    set('cr-initial',  urlGet('initial')  || '0');
    set('cr-fees',     urlGet('fees')     || '0.1');
    set('cr-tax',      urlGet('tax')      || '30');
    set('cr-start',    urlGet('start'));
    set('cr-end',      urlGet('end'));

    // Bindings
    document.querySelectorAll('#cr-params input, #cr-params select').forEach((el) => {
      el.addEventListener('change', run);
      el.addEventListener('input',  run);
    });

    // Changer de crypto : reset les dates
    const assetSel = document.getElementById('cr-asset');
    if (assetSel) {
      assetSel.addEventListener('change', () => {
        document.getElementById('cr-start').value = '';
        document.getElementById('cr-end').value   = '';
        run();
      });
    }

    run();

    // Bind gas calculator inputs (live update)
    ['cra8-gas-monthly', 'cra8-gas-chain', 'cra8-gas-freq'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input',  () => renderA08GasCalc(readForm()));
        el.addEventListener('change', () => renderA08GasCalc(readForm()));
      }
    });

    // Public actions (window-scoped)
    window.resetCrypto = () => { window.location.search = ''; };
    window.exportCryptoPDF = () => {
      const sel = document.getElementById('cr-asset');
      const meta = sel ? CRYPTOS_META[sel.value] : null;
      const monthly = parseFloat(document.getElementById('cr-monthly').value) || 0;
      const summary = (meta ? meta.name : 'Crypto') + ' · ' + monthly + ' €/mois · début ' + (document.getElementById('cr-start').value || '—');
      CI.exportPDF({
        title:    'CalcInvest — DCA Crypto',
        summary:  summary,
        sectionIds: ['cra-overview','cra-yearly','cra-drawdown','cra-lumpvsdca','cra-volatility','cra-cycles','cra-multi','cra-defi'],
        fileName: 'calcinvest-dca-crypto'
      });
    };
  });
})();
