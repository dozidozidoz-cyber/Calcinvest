/* ============================================================
   CalcInvest — Calc DCA v2 (CORE, pure)
   ============================================================ */

(function (global) {
  'use strict';

  const FIN = global.FIN || (typeof require !== 'undefined' ? require('./finance-utils.js') : {});

  function calcDCA(p) {
    const prices = p.prices || [];
    const dividends = p.dividends || null;
    const cpi = p.cpi || null;
    if (prices.length < 2) return null;

    const startIdx = monthDiff(p.seriesStart, p.startDate);
    if (startIdx < 0 || startIdx >= prices.length) return { error: 'startDate hors série' };

    const monthlyAmount = p.monthlyAmount || 0;
    const initialAmount = p.initialAmount || 0;
    const deployment = p.deployment || 'lump';
    const feesPct = p.feesPct || 0;
    const feesMonthly = feesPct / 100 / 12;
    const contributionGrowth = (p.contributionGrowth || 0) / 100;
    const cashRate = p.cashRate || 0;
    const cashMonthly = cashRate / 100 / 12;
    const reinvestDivs = p.dividendsReinvested !== false && dividends && dividends.length === prices.length;
    const inflationAdj = p.inflationAdjusted === true && cpi && cpi.length === prices.length;

    const availableMonths = prices.length - startIdx;
    const duration = Math.min(
      p.durationMonths && p.durationMonths > 0 ? p.durationMonths : availableMonths,
      availableMonths
    );

    const out = { portfolio: [], noFees: [], invested: [], cash: [], real: [], price: [], date: [] };

    let totalUnits = 0, totalUnitsNoFees = 0, totalInvested = 0, cashValue = 0;
    let peakValue = 0, maxDrawdown = 0, maxDDMonth = 0, recoveryMonths = null;

    const initialPerMonth = deployment === 'spread' ? initialAmount / 12 : 0;
    const initialLump = deployment === 'spread' ? 0 : initialAmount;
    // Helper : versement mensuel effectif au mois i (croissance annuelle)
    function monthlyAt(i) {
      if (!contributionGrowth) return monthlyAmount;
      return monthlyAmount * Math.pow(1 + contributionGrowth, Math.floor(i / 12));
    }
    const cpiStart = inflationAdj ? cpi[startIdx] : 1;

    if (initialLump > 0) {
      const firstPrice = prices[startIdx];
      totalUnits += initialLump / firstPrice;
      totalUnitsNoFees += initialLump / firstPrice;
      totalInvested += initialLump;
      cashValue += initialLump;
    }

    for (let i = 0; i < duration; i++) {
      const idx = startIdx + i;
      const price = prices[idx];
      let monthInv = monthlyAt(i);
      if (deployment === 'spread' && i < 12) monthInv += initialPerMonth;

      if (monthInv > 0) {
        totalUnits += monthInv / price;
        totalUnitsNoFees += monthInv / price;
        totalInvested += monthInv;
        cashValue += monthInv;
      }

      if (reinvestDivs && dividends[idx] > 0) {
        const divCash = totalUnits * dividends[idx];
        const divCashNoFees = totalUnitsNoFees * dividends[idx];
        totalUnits += divCash / price;
        totalUnitsNoFees += divCashNoFees / price;
      }

      if (feesMonthly > 0) totalUnits *= (1 - feesMonthly);
      cashValue *= (1 + cashMonthly);

      const value = totalUnits * price;
      const valueNoFees = totalUnitsNoFees * price;

      if (value > peakValue) {
        peakValue = value;
        if (recoveryMonths === null && maxDrawdown > 0) recoveryMonths = i - maxDDMonth;
      }
      const dd = peakValue > 0 ? (peakValue - value) / peakValue : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDDMonth = i;
        recoveryMonths = null;
      }

      const realValue = inflationAdj && cpi[idx] ? value * (cpiStart / cpi[idx]) : value;

      out.portfolio.push(value);
      out.noFees.push(valueNoFees);
      out.invested.push(totalInvested);
      out.cash.push(cashValue);
      out.real.push(realValue);
      out.price.push(price);
      out.date.push(i);
    }

    const finalValue = out.portfolio[out.portfolio.length - 1];
    const finalGain = finalValue - totalInvested;
    const finalGainPct = totalInvested > 0 ? (finalGain / totalInvested) * 100 : 0;

    const cashflows = [-initialLump];
    for (let i = 0; i < duration; i++) {
      let cf = -monthlyAt(i);
      if (deployment === 'spread' && i < 12) cf -= initialPerMonth;
      cashflows.push(cf);
    }
    cashflows[cashflows.length - 1] += finalValue;
    const monthlyIRR = FIN.irr ? FIN.irr(cashflows) : null;
    const annualIRR = monthlyIRR != null ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : null;

    const yearlyReturns = computeYearlyReturns(out.portfolio, out.invested);

    return {
      totalInvested, finalValue, finalGain, finalGainPct,
      annualReturn: annualIRR,
      maxDrawdownPct: maxDrawdown * 100,
      maxDrawdownMonth: maxDDMonth,
      recoveryMonths,
      totalUnits,
      avgBuyPrice: totalUnits > 0 ? totalInvested / totalUnits : 0,
      durationMonths: duration,
      durationYears: duration / 12,
      hasDividends: !!dividends,
      hasCPI: !!cpi,
      dividendsReinvested: reinvestDivs,
      inflationAdjusted: inflationAdj,
      finalValueReal: inflationAdj ? out.real[out.real.length - 1] : null,
      finalCash: out.cash[out.cash.length - 1],
      finalNoFees: out.noFees[out.noFees.length - 1],
      series: out,
      yearlyReturns
    };
  }

  function computeYearlyReturns(portfolio, invested) {
    const out = [];
    for (let i = 11; i < portfolio.length; i += 12) {
      const prev = i >= 12 ? portfolio[i - 12] : 0;
      const added = invested[i] - (i >= 12 ? invested[i - 12] : 0);
      const gain = portfolio[i] - prev - added;
      const base = prev + added / 2;
      const pct = base > 0 ? (gain / base) * 100 : 0;
      out.push({ yearOffset: Math.floor(i / 12), pct, endValue: portfolio[i] });
    }
    return out;
  }

  /* Stats sur l'actif seul (indépendant du DCA) : rendements calendaires,
     meilleure/pire année, médiane, histogramme, drawdown historique */
  function computeAssetStats(prices, seriesStart, options) {
    options = options || {};
    const rangeStart = options.rangeStart || seriesStart;
    const rangeEnd = options.rangeEnd;
    const startIdx = Math.max(0, monthDiff(seriesStart, rangeStart));
    const endIdx = rangeEnd ? Math.min(prices.length - 1, monthDiff(seriesStart, rangeEnd)) : prices.length - 1;

    const [sy, sm] = seriesStart.split('-').map(Number);
    const years = {};
    for (let i = startIdx; i <= endIdx; i++) {
      const totalMonths = (sy * 12 + sm - 1) + i;
      const year = Math.floor(totalMonths / 12);
      if (!years[year]) years[year] = { start: prices[i], end: prices[i] };
      else years[year].end = prices[i];
    }

    const calYears = Object.keys(years).map((y) => ({
      year: parseInt(y, 10),
      pct: ((years[y].end / years[y].start) - 1) * 100
    })).filter((x) => isFinite(x.pct));

    const sorted = [...calYears].sort((a, b) => a.pct - b.pct);
    const best = sorted[sorted.length - 1];
    const worst = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = sorted.reduce((s, x) => s + x.pct, 0) / sorted.length;
    const positive = sorted.filter((x) => x.pct > 0).length;

    // Histogram buckets de 10%
    const bucketSize = 10;
    const bucketCounts = {};
    sorted.forEach((y) => {
      const b = Math.floor(y.pct / bucketSize) * bucketSize;
      bucketCounts[b] = (bucketCounts[b] || 0) + 1;
    });
    const buckets = Object.keys(bucketCounts).map((k) => ({
      pct: parseInt(k, 10),
      count: bucketCounts[k]
    })).sort((a, b) => a.pct - b.pct);

    // Drawdown historique continu
    let peak = prices[startIdx];
    let maxDD = 0, maxDDidx = startIdx, peakIdx = startIdx;
    for (let i = startIdx; i <= endIdx; i++) {
      if (prices[i] > peak) { peak = prices[i]; peakIdx = i; }
      const dd = (peak - prices[i]) / peak;
      if (dd > maxDD) { maxDD = dd; maxDDidx = i; }
    }

    return {
      calYears,
      stats: {
        best, worst,
        median: median ? median.pct : null,
        mean, positive,
        total: sorted.length,
        positivePct: sorted.length > 0 ? (positive / sorted.length) * 100 : 0
      },
      histogram: { bucketSize, buckets },
      drawdown: { maxPct: maxDD * 100, atIdx: maxDDidx }
    };
  }

  function monthDiff(start, target) {
    if (!start || !target) return 0;
    const [ys, ms] = start.split('-').map(Number);
    const [yt, mt] = target.split('-').map(Number);
    return (yt - ys) * 12 + (mt - ms);
  }
  function addMonths(ymStr, months) {
    const [y, m] = ymStr.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }
  function ymLabel(ymStr) {
    const [y, m] = ymStr.split('-').map(Number);
    const names = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
    return `${names[m - 1]} ${y}`;
  }

  /* Lump sum vs DCA étalé — sur toute la période historique disponible */
  function computeLumpVsDCA(prices, seriesStart, options) {
    options = options || {};
    const capital = options.capital || 10000;
    const durationMonths = (options.durationYears || 10) * 12;
    const dcaMonths = options.dcaMonths || 12;
    const feesPct = options.feesPct || 0;
    const feesMonthly = feesPct / 100 / 12;

    const [sy, sm] = seriesStart.split('-').map(Number);
    const results = [];

    for (let startIdx = 0; startIdx + durationMonths < prices.length; startIdx++) {
      const endIdx = startIdx + durationMonths;

      // Lump sum : invest tout au départ
      let lumpUnits = capital / prices[startIdx];
      if (feesMonthly > 0) lumpUnits *= Math.pow(1 - feesMonthly, durationMonths);
      const lumpFinal = lumpUnits * prices[endIdx];

      // DCA : investir capital/dcaMonths chaque mois pendant dcaMonths
      let dcaUnits = 0;
      const tranche = capital / dcaMonths;
      for (let k = 0; k < dcaMonths; k++) {
        const idx = startIdx + k;
        if (idx >= prices.length) break;
        let u = tranche / prices[idx];
        if (feesMonthly > 0) u *= Math.pow(1 - feesMonthly, durationMonths - k);
        dcaUnits += u;
      }
      const dcaFinal = dcaUnits * prices[endIdx];

      const totalM = (sy * 12 + sm - 1) + startIdx;
      results.push({
        year: Math.floor(totalM / 12),
        month: (totalM % 12) + 1,
        lumpFinal,
        dcaFinal,
        diffPct: ((lumpFinal - dcaFinal) / capital) * 100,
        lumpWins: lumpFinal >= dcaFinal
      });
    }

    if (!results.length) return null;

    const lumpWins = results.filter((r) => r.lumpWins).length;
    const diffs = results.map((r) => r.diffPct).sort((a, b) => a - b);
    const avg = diffs.reduce((s, v) => s + v, 0) / diffs.length;

    // Agréger par année (moyenne des mois de cette année)
    const byYear = {};
    results.forEach((r) => {
      if (!byYear[r.year]) byYear[r.year] = [];
      byYear[r.year].push(r.diffPct);
    });
    const yearlyDiff = Object.keys(byYear).map((y) => ({
      year: parseInt(y, 10),
      diffPct: byYear[y].reduce((s, v) => s + v, 0) / byYear[y].length,
      lumpWins: byYear[y].reduce((s, v) => s + v, 0) / byYear[y].length >= 0
    })).sort((a, b) => a.year - b.year);

    return {
      yearlyDiff,
      stats: {
        total: results.length,
        lumpWins,
        lumpWinsPct: (lumpWins / results.length) * 100,
        dcaWinsPct: ((results.length - lumpWins) / results.length) * 100,
        avgDiffPct: avg,
        medianDiffPct: diffs[Math.floor(diffs.length / 2)]
      }
    };
  }

  /* Volatilité glissante 12 mois + CAPE vs sa moyenne historique */
  function computeVolatilityCAPE(prices, seriesStart, pe10) {
    const [sy, sm] = seriesStart.split('-').map(Number);
    const WIN = 12;
    const volSeries = [], capeSeries = [], labels = [];
    let capeHistSum = 0, capeHistCount = 0;

    for (let i = WIN; i < prices.length; i++) {
      // Volatilité annualisée : écart-type des rendements mensuels × √12
      const rets = [];
      for (let k = i - WIN; k < i; k++) {
        rets.push((prices[k + 1] - prices[k]) / prices[k]);
      }
      const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
      const variance = rets.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / rets.length;
      const vol = Math.sqrt(variance * 12) * 100;

      const totalM = (sy * 12 + sm - 1) + i;
      labels.push(`${Math.floor(totalM / 12)}-${String((totalM % 12) + 1).padStart(2, '0')}`);
      volSeries.push(isFinite(vol) ? vol : 0);

      if (pe10 && pe10[i] > 0) {  // > 0 exclut les nulls ET les zéros de fin de série
        capeSeries.push(pe10[i]);
        capeHistSum += pe10[i];
        capeHistCount++;
      } else {
        capeSeries.push(null);
      }
    }

    const capeAvg = capeHistCount > 0 ? capeHistSum / capeHistCount : null;
    const currentVol = volSeries[volSeries.length - 1];
    // Dernière valeur CAPE valide (la série peut se terminer par des nulls)
    let currentCAPE = null;
    for (let i = capeSeries.length - 1; i >= 0; i--) {
      if (capeSeries[i] != null) { currentCAPE = capeSeries[i]; break; }
    }
    const avgVol = volSeries.reduce((s, v) => s + v, 0) / volSeries.length;

    return {
      labels, volSeries, capeSeries,
      stats: { capeAvg, currentVol, currentCAPE, avgVol }
    };
  }

  /* Monte Carlo bootstrap — rééchantillonnage des rendements mensuels historiques */
  function computeMonteCarlo(prices, dividends, options) {
    options = options || {};
    const N = options.simulations || 1000;
    const horizonMonths = (options.horizonYears || 20) * 12;
    const monthlyAmount = options.monthlyAmount || 0;
    const initialAmount = options.initialAmount || 0;
    const feesPct = options.feesPct || 0;
    const feesMonthly = feesPct / 100 / 12;
    const reinvestDivs = options.dividendsReinvested && dividends && dividends.length === prices.length;

    // Calcul des rendements mensuels historiques (prix)
    const monthlyReturns = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] && prices[i - 1]) monthlyReturns.push(prices[i] / prices[i - 1] - 1);
    }

    // Rendement dividende mensuel moyen (div / prix) — pas la valeur absolue
    // Les dividendes Shiller sont en points d'index (ex: 0.5 pts/mois), pas en %
    const avgDivYield = reinvestDivs
      ? (function () {
          let sum = 0, count = 0;
          for (let i = 0; i < dividends.length; i++) {
            if (dividends[i] > 0 && prices[i] > 0) { sum += dividends[i] / prices[i]; count++; }
          }
          return count > 0 ? sum / count : 0;
        })()
      : 0;

    const n = monthlyReturns.length;
    if (n < 12) return null;

    // Lancer N simulations
    const finalValues = [];
    const percentileData = { p10: [], p25: [], p50: [], p75: [], p90: [] };

    // Pour les percentiles on stocke toutes les trajectoires partiellement
    // On collecte la valeur finale + quelques snapshots intermédiaires
    const snapMonths = [];
    for (let m = 12; m <= horizonMonths; m += 12) snapMonths.push(m);

    const snapData = snapMonths.map(() => []);

    for (let sim = 0; sim < N; sim++) {
      let portfolio = initialAmount;
      let invested = initialAmount;
      let units = initialAmount > 0 ? 1 : 0; // on travaille en valeur relative
      portfolio = initialAmount;

      // Rééchantillonnage par blocs de 12 mois (préserve la saisonnalité)
      let value = initialAmount;
      const blockSize = 12;

      for (let m = 0; m < horizonMonths; m++) {
        // Versement mensuel
        value += monthlyAmount;
        invested += monthlyAmount;

        // Tirage aléatoire dans les rendements historiques
        const ri = Math.floor(Math.random() * n);
        const ret = monthlyReturns[ri];

        // Dividende
        const div = reinvestDivs ? value * avgDivYield : 0;
        value = (value + div) * (1 + ret);

        // Frais ETF
        if (feesMonthly > 0) value *= (1 - feesMonthly);

        if (value < 0) value = 0;

        // Snapshot annuel
        const snapIdx = snapMonths.indexOf(m + 1);
        if (snapIdx !== -1) snapData[snapIdx].push(value);
      }

      finalValues.push(value);
    }

    finalValues.sort((a, b) => a - b);

    const pct = (arr, p) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * p / 100)];
    };

    // Construire les courbes de percentiles par année
    const years = snapMonths.map((m) => m / 12);
    snapData.forEach((arr, i) => {
      arr.sort((a, b) => a - b);
      percentileData.p10.push(pct(arr, 10));
      percentileData.p25.push(pct(arr, 25));
      percentileData.p50.push(pct(arr, 50));
      percentileData.p75.push(pct(arr, 75));
      percentileData.p90.push(pct(arr, 90));
    });

    // Invested line
    const investedLine = snapMonths.map((m) => initialAmount + monthlyAmount * m);

    const totalInvested = initialAmount + monthlyAmount * horizonMonths;

    return {
      years,
      percentileData,
      investedLine,
      finalStats: {
        p10: pct(finalValues, 10),
        p25: pct(finalValues, 25),
        p50: pct(finalValues, 50),
        p75: pct(finalValues, 75),
        p90: pct(finalValues, 90),
        probPositive: (finalValues.filter((v) => v > totalInvested).length / N) * 100,
        totalInvested,
        simulations: N
      }
    };
  }

  function computeRollingReturns(prices, seriesStart, durationsYears) {
    durationsYears = durationsYears || [1, 2, 3, 5, 10, 15, 20, 30];
    const [sy, sm] = seriesStart.split('-').map(Number);
    const firstFullYear = sm > 1 ? sy + 1 : sy;
    const lastPossibleYear = sy + Math.floor((prices.length - 1) / 12);

    const entryYears = [];
    const data = {};

    for (let year = firstFullYear; year <= lastPossibleYear; year++) {
      const idx = (year - sy) * 12 + (1 - sm);
      if (idx < 0 || idx >= prices.length) continue;
      entryYears.push(year);
      data[year] = {};
      for (const d of durationsYears) {
        const endIdx = idx + d * 12;
        if (endIdx >= prices.length) { data[year][d] = null; continue; }
        const p0 = prices[idx], p1 = prices[endIdx];
        if (!p0 || !p1) { data[year][d] = null; continue; }
        data[year][d] = (Math.pow(p1 / p0, 1 / d) - 1) * 100;
      }
    }

    const durationStats = {};
    for (const d of durationsYears) {
      const vals = entryYears.map((y) => data[y][d]).filter((v) => v !== null && isFinite(v));
      if (!vals.length) { durationStats[d] = null; continue; }
      const pos = vals.filter((v) => v > 0).length;
      const best = Math.max(...vals);
      const worst = Math.min(...vals);
      const bestYear = entryYears.find((y) => data[y][d] !== null && Math.abs(data[y][d] - best) < 0.001);
      const worstYear = entryYears.find((y) => data[y][d] !== null && Math.abs(data[y][d] - worst) < 0.001);
      durationStats[d] = { positivePct: (pos / vals.length) * 100, best, worst, bestYear, worstYear, count: vals.length };
    }

    return { entryYears, durations: durationsYears, data, durationStats };
  }

  function computeFiscalImpact(finalValue, totalInvested, durationYears, tmi, statut) {
    const pv = Math.max(0, finalValue - totalInvested);
    if (pv === 0) return { plusValue: 0, scenarios: [], best: null, saving: 0 };
    const tmiRate = (tmi || 30) / 100;
    const ps = 0.172;
    const abat = statut === 'couple' ? 9200 : 4600;

    function sc(id, label, tax, condNote, eligible) {
      return { id, label, tax, condNote, eligible: eligible !== false, net: finalValue - tax, effectiveRate: pv > 0 ? tax / pv : 0 };
    }

    const scenarios = [
      sc('pea', 'PEA',
        durationYears >= 5 ? pv * ps : pv * 0.30,
        durationYears >= 5 ? 'Exonéré IR · PS 17.2 %' : '⚠ < 5 ans — PFU 30 %',
        durationYears >= 5),
      sc('av', 'Assurance-vie',
        durationYears >= 8 ? Math.max(0, pv - abat) * (0.075 + ps) : pv * 0.30,
        durationYears >= 8 ? 'Taux 7.5 % + PS · abat. ' + abat.toLocaleString('fr-FR') + ' €' : '⚠ < 8 ans — PFU 30 %',
        durationYears >= 8),
      sc('cto-pfu', 'CTO · PFU 30 %', pv * 0.30, '12.8 % IR + 17.2 % PS'),
      sc('cto-ir', 'CTO · Barème IR (' + (tmi || 30) + ' %)', pv * (tmiRate + ps), (tmi || 30) + ' % TMI + 17.2 % PS')
    ];

    const sorted = [...scenarios].sort((a, b) => b.net - a.net);
    return { plusValue: pv, scenarios, best: sorted[0], worstId: sorted[sorted.length - 1].id, saving: sorted[0].net - sorted[sorted.length - 1].net };
  }

  function computeDecaissement(capital, options) {
    options = options || {};
    const rates = options.rates || [0.03, 0.04, 0.05, 0.06];
    const horizonYears = options.horizonYears || 30;
    const annualReturn = (options.annualReturn != null ? options.annualReturn : 7) / 100;
    const mr = Math.pow(1 + annualReturn, 1 / 12) - 1;

    const results = rates.map((r) => {
      const w = capital * r / 12;
      let v = capital;
      const yearly = [capital];
      let depleted = false, depletedYear = null;
      for (let y = 0; y < horizonYears; y++) {
        for (let m = 0; m < 12; m++) {
          v = v * (1 + mr) - w;
          if (v <= 0) { v = 0; depleted = true; depletedYear = y + 1; break; }
        }
        yearly.push(Math.round(v));
        if (depleted) break;
      }
      return { rate: r, monthly: w, annual: w * 12, depleted, depletedYear, finalValue: yearly[yearly.length - 1], yearly };
    });

    const perpRate = Math.max(0, annualReturn - (options.inflation || 0.02));
    return { capital, horizonYears, results, perpetualMonthly: capital * perpRate / 12, annualReturn: annualReturn * 100 };
  }

  function computeValueAveraging(prices, dividends, seriesStart, options) {
    options = options || {};
    const si = monthDiff(seriesStart, options.startDate || seriesStart);
    if (si < 0 || si >= prices.length) return null;
    const tgt = options.monthlyAmount || 500;
    const init = options.initialAmount || 0;
    const fm = (options.feesPct || 0) / 100 / 12;
    const reinvDiv = options.dividendsReinvested !== false && dividends && dividends.length === prices.length;
    const dur = Math.min(
      options.durationMonths && options.durationMonths > 0 ? options.durationMonths : prices.length - si,
      prices.length - si
    );

    let units = 0, totalInv = 0;
    const cfs = [-init];
    const portfolio = [], invSeries = [];

    if (init > 0) { units += init / prices[si]; totalInv += init; }

    for (let i = 0; i < dur; i++) {
      const idx = si + i;
      const p = prices[idx];
      const targetV = init + (i + 1) * tgt;
      const currV = units * p;
      const toInvest = Math.max(0, targetV - currV);
      if (toInvest > 0) { units += toInvest / p; totalInv += toInvest; }
      cfs.push(-toInvest);
      if (reinvDiv && dividends[idx] > 0) units += (units * dividends[idx]) / p;
      if (fm > 0) units *= (1 - fm);
      portfolio.push(units * p);
      invSeries.push(totalInv);
    }

    const finalValue = portfolio[portfolio.length - 1] || 0;
    const finalGain = finalValue - totalInv;
    cfs[cfs.length - 1] += finalValue;
    const mIRR = FIN.irr ? FIN.irr(cfs) : null;
    const annIRR = mIRR != null ? (Math.pow(1 + mIRR, 12) - 1) * 100 : null;

    return {
      totalInvested: totalInv, finalValue, finalGain,
      finalGainPct: totalInv > 0 ? (finalGain / totalInv) * 100 : 0,
      annualReturn: annIRR,
      durationMonths: dur, durationYears: dur / 12,
      series: { portfolio, invested: invSeries }
    };
  }

  const mod = { calcDCA, computeAssetStats, computeLumpVsDCA, computeVolatilityCAPE, computeMonteCarlo, computeRollingReturns, computeFiscalImpact, computeDecaissement, computeValueAveraging, monthDiff, addMonths, ymLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else global.CalcDCA = mod;
})(typeof window !== 'undefined' ? window : this);
