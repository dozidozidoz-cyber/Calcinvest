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
      let monthInv = monthlyAmount;
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
      let cf = -monthlyAmount;
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

  const mod = { calcDCA, computeAssetStats, computeRollingReturns, monthDiff, addMonths, ymLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else global.CalcDCA = mod;
})(typeof window !== 'undefined' ? window : this);
