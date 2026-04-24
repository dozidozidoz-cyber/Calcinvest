/* ============================================================
   CalcInvest — DCA Crypto VIEW (DOM binding)
   Charge les JSON crypto → CalcDCACrypto.* → render 7 analyses
   ============================================================ */

(function () {
  'use strict';

  const CC = window.CalcDCACrypto;

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
  }

  /* ------------------------------------------------------------------ */
  /* A04 — Lump Sum vs DCA                                                 */
  /* ------------------------------------------------------------------ */
  function renderA04(p, data) {
    const comp = CC.calcLumpSumVsDCA({
      prices:        data.prices,
      dataStart:     data.start,
      startDate:     p.startDate,
      endDate:       p.endDate || data.end,
      initialAmount: 0,
      monthlyAmount: p.monthlyAmount,
      feesPct:       p.feesPct,
      taxRate:       0
    });
    if (!comp) return;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    set('cr4-dca-value',  CI.fmtMoney(comp.dca.finalValue, 0));
    set('cr4-ls-value',   CI.fmtMoney(comp.lumpSum.finalValue, 0));
    set('cr4-winner',     comp.winner === 'dca' ? 'DCA gagne' : 'Lump Sum gagne');
    set('cr4-diff',       '+' + CI.fmtMoney(comp.difference, 0) + ' (' + comp.diffPct.toFixed(1) + ' %)');
    set('cr4-total',      CI.fmtMoney(comp.totalAmount, 0) + ' investi');

    cls('cr4-dca-value',  comp.winner === 'dca'     ? 'pos' : '');
    cls('cr4-ls-value',   comp.winner === 'lumpsum' ? 'pos' : '');

    requestAnimationFrame(() => {
      const labels = comp.dca.monthly_data.map((pt) => pt.date);
      // Aligner lumpSum sur les mêmes dates (peut différer si startDate différente)
      const lsMap = {};
      comp.lumpSum.monthly_data.forEach((pt) => { lsMap[pt.date] = pt.value; });
      const lsAligned = labels.map((d) => lsMap[d] ?? null);

      CI.drawChart('cra4-chart', labels, [
        { label: 'DCA',       data: comp.dca.monthly_data.map((pt) => pt.value),   color: '#34D399', fill: false, width: 2.5 },
        { label: 'Lump Sum',  data: lsAligned,                                      color: '#F7931A', fill: false, width: 2, dash: [5, 3] },
        { label: 'Investi',   data: comp.dca.monthly_data.map((pt) => pt.invested), color: '#94A3B8', fill: false, width: 1, dash: [2, 4] }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });
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
      })
      .catch((e) => console.error('A07 multi-crypto error:', e));
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
        renderA04(p, data);
        renderA05(p, data);
        renderA06(p, data);
        renderA07(p);
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
  });
})();
