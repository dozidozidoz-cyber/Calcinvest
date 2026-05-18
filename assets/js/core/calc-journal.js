/* ============================================================
   CalcInvest — Core Journal de Trade
   Calcule les statistiques d'un journal : winrate, expectancy,
   profit factor, equity curve, drawdown, distribution P&L.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  function emptyGroup() {
    return { count: 0, wins: 0, pnl: 0, winrate: 0, avgPnl: 0 };
  }

  function addToGroup(g, t) {
    g.count++;
    g.pnl += t.pnl;
    if (t.pnl > 0) g.wins++;
  }

  function finalizeGroup(g) {
    g.winrate = g.count > 0 ? (g.wins / g.count) * 100 : 0;
    g.avgPnl = g.count > 0 ? g.pnl / g.count : 0;
    return g;
  }

  /**
   * Calcule le R-multiple d'un trade : (pnl - 0) / risk_initial
   * où risk_initial = |entry - stop_loss| × size
   */
  function rMultipleOf(t) {
    if (t.stop_loss == null || t.entry_price == null || t.size == null) return null;
    const riskPerUnit = Math.abs(t.entry_price - t.stop_loss);
    const risk = riskPerUnit * t.size;
    if (risk <= 0) return null;
    return t.pnl / risk;
  }

  /**
   * Durée de hold en heures.
   */
  function holdHoursOf(t) {
    if (!t.entry_date || !t.exit_date) return null;
    const a = new Date(t.entry_date).getTime();
    const b = new Date(t.exit_date).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, (b - a) / 36e5);
  }

  /**
   * Calcule le P&L d'un trade clôturé.
   * Renvoie aussi le P&L en % si stopLoss fourni (R-multiple).
   */
  function tradePnl(t) {
    if (t.exit_price == null || t.entry_price == null) return null;
    const dir = t.side === 'short' ? -1 : 1;
    const grossPnl = (t.exit_price - t.entry_price) * t.size * dir;
    const net = grossPnl - num(t.fees, 0);
    let rMultiple = null;
    if (t.stop_loss != null && t.risk_amount > 0) {
      rMultiple = net / t.risk_amount;
    }
    return { net, rMultiple, gross: grossPnl };
  }

  /**
   * Calcule les statistiques globales d'un set de trades.
   * @param {Array} trades  Array de trades (closed only sera filtré).
   */
  function stats(trades) {
    const closed = trades.filter(t => t.exit_price != null && t.pnl != null);
    if (closed.length === 0) {
      return {
        nbTrades: trades.length || 0, nbClosed: 0, nbOpen: trades.length || 0, nbWins: 0, nbLosses: 0,
        winrate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0,
        expectancy: 0, profitFactor: 0, payoffRatio: 0, recoveryFactor: 0, ulcerIndex: 0,
        biggestWin: 0, biggestLoss: 0,
        maxDrawdown: 0, maxDrawdownPct: 0,
        equityCurve: [], rCurve: [],
        consecutiveWins: 0, consecutiveLosses: 0,
        sharpe: 0,
        avgRMultiple: null, nbWithR: 0,
        avgHoldTime: null,
        bySide: { long: emptyGroup(), short: emptyGroup() },
        byPlan: { yes: emptyGroup(), no: emptyGroup(), unknown: emptyGroup() }
      };
    }

    closed.sort((a, b) => new Date(a.exit_date || a.entry_date) - new Date(b.exit_date || b.entry_date));

    const wins = closed.filter(t => t.pnl > 0);
    const losses = closed.filter(t => t.pnl <= 0);
    const winrate = (wins.length / closed.length) * 100;
    const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;

    // Expectancy = (winrate × avgWin) - (lossrate × |avgLoss|)
    const expectancy = (winrate / 100) * avgWin + ((100 - winrate) / 100) * avgLoss;

    // Profit Factor = sum(wins) / |sum(losses)|
    const sumWins = wins.reduce((s, t) => s + t.pnl, 0);
    const sumLossesAbs = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = sumLossesAbs > 0 ? sumWins / sumLossesAbs : (sumWins > 0 ? Infinity : 0);

    // Biggest win / loss
    const biggestWin = wins.length ? Math.max(...wins.map(t => t.pnl)) : 0;
    const biggestLoss = losses.length ? Math.min(...losses.map(t => t.pnl)) : 0;

    // Equity curve + max drawdown
    let equity = 0, peak = 0, maxDD = 0, maxDDPct = 0;
    const equityCurve = [];
    closed.forEach((t, i) => {
      equity += t.pnl;
      peak = Math.max(peak, equity);
      const dd = peak - equity;
      maxDD = Math.max(maxDD, dd);
      if (peak > 0) maxDDPct = Math.max(maxDDPct, (dd / peak) * 100);
      equityCurve.push({
        i: i + 1,
        date: t.exit_date || t.entry_date,
        pnl: t.pnl,
        equity,
        peak,
        drawdown: dd
      });
    });

    // Consecutive wins/losses
    let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
    let prevSign = null;
    closed.forEach(t => {
      const sign = t.pnl > 0 ? 1 : -1;
      if (sign === prevSign) curStreak++;
      else curStreak = 1;
      if (sign > 0) maxWinStreak = Math.max(maxWinStreak, curStreak);
      else maxLossStreak = Math.max(maxLossStreak, curStreak);
      prevSign = sign;
    });

    // Sharpe annualisé approximé (en supposant ~252 trades/an si daily)
    const returns = closed.map(t => t.pnl);
    const mean = returns.reduce((s, x) => s + x, 0) / returns.length;
    const variance = returns.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / returns.length;
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

    // Payoff ratio = avgWin / |avgLoss| (différent du profit factor)
    const payoffRatio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : (avgWin > 0 ? Infinity : 0);

    // Recovery factor = totalPnl / maxDD
    const recoveryFactor = maxDD > 0 ? totalPnl / maxDD : (totalPnl > 0 ? Infinity : 0);

    // Ulcer Index (Peter Martin) : sqrt(mean(drawdown_pct²))
    const ddPcts = equityCurve.map(p => p.peak > 0 ? (p.drawdown / p.peak * 100) : 0);
    const ulcerIndex = ddPcts.length > 0
      ? Math.sqrt(ddPcts.reduce((s, x) => s + x*x, 0) / ddPcts.length)
      : 0;

    // R-multiples (filtre trades avec stop loss)
    const rValues = closed.map(t => rMultipleOf(t)).filter(r => r != null && Number.isFinite(r));
    const avgR = rValues.length > 0 ? rValues.reduce((s, x) => s + x, 0) / rValues.length : null;

    // R cumulative curve
    let rCum = 0;
    const rCurve = closed.map((t, i) => {
      const r = rMultipleOf(t);
      if (r != null && Number.isFinite(r)) rCum += r;
      return { i: i + 1, r: r, cumulative: rCum, date: t.exit_date || t.entry_date };
    });

    // Hold time moyen
    const holds = closed.map(t => holdHoursOf(t)).filter(h => h != null);
    const avgHoldTime = holds.length ? holds.reduce((s, x) => s + x, 0) / holds.length : null;

    // Breakdowns
    const bySide = { long: emptyGroup(), short: emptyGroup() };
    const byPlan = { yes: emptyGroup(), no: emptyGroup(), unknown: emptyGroup() };
    closed.forEach(t => {
      const side = t.side === 'short' ? 'short' : 'long';
      addToGroup(bySide[side], t);
      let planKey = 'unknown';
      if (t.followed_plan === true || t.followed_plan === 'true') planKey = 'yes';
      else if (t.followed_plan === false || t.followed_plan === 'false') planKey = 'no';
      addToGroup(byPlan[planKey], t);
    });
    finalizeGroup(bySide.long); finalizeGroup(bySide.short);
    finalizeGroup(byPlan.yes); finalizeGroup(byPlan.no); finalizeGroup(byPlan.unknown);

    return {
      nbTrades: trades.length,
      nbClosed: closed.length,
      nbOpen: trades.length - closed.length,
      nbWins: wins.length, nbLosses: losses.length,
      winrate, totalPnl,
      avgWin, avgLoss,
      expectancy, profitFactor, payoffRatio, recoveryFactor, ulcerIndex,
      biggestWin, biggestLoss,
      maxDrawdown: maxDD, maxDrawdownPct: maxDDPct,
      equityCurve, rCurve,
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
      sharpe,
      avgRMultiple: avgR, nbWithR: rValues.length,
      avgHoldTime,
      bySide, byPlan
    };
  }

  /**
   * Heatmap performance : agrégation P&L par mois × année.
   * Renvoie une matrice { years: [...], months: [0..11], cells: { 'YYYY-MM': { pnl, count } } }
   */
  function monthlyHeatmap(trades) {
    const closed = trades.filter(t => t.exit_price != null && t.pnl != null);
    const cells = {};
    const yearsSet = new Set();
    closed.forEach(t => {
      const d = new Date(t.exit_date || t.entry_date);
      if (isNaN(d)) return;
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = y + '-' + String(m+1).padStart(2,'0');
      yearsSet.add(y);
      if (!cells[key]) cells[key] = { pnl: 0, count: 0, wins: 0 };
      cells[key].pnl += t.pnl;
      cells[key].count++;
      if (t.pnl > 0) cells[key].wins++;
    });
    const years = Array.from(yearsSet).sort();
    return { years, cells, totalMonths: Object.keys(cells).length };
  }

  /**
   * Stats par jour de semaine (lun=1, dim=0).
   */
  function byDayOfWeek(trades) {
    const closed = trades.filter(t => t.exit_price != null && t.pnl != null);
    const groups = [0,1,2,3,4,5,6].map(() => emptyGroup());
    closed.forEach(t => {
      const d = new Date(t.entry_date);
      if (isNaN(d)) return;
      addToGroup(groups[d.getDay()], t);
    });
    return groups.map(finalizeGroup);
  }

  /**
   * Distribution P&L pour histogramme (bins).
   */
  function pnlDistribution(trades, nbBins) {
    nbBins = nbBins || 12;
    const closed = trades.filter(t => t.pnl != null);
    if (closed.length === 0) return [];
    const pnls = closed.map(t => t.pnl);
    const min = Math.min(...pnls);
    const max = Math.max(...pnls);
    const range = max - min || 1;
    const step = range / nbBins;
    const bins = Array.from({ length: nbBins }, (_, i) => ({
      from: min + i * step,
      to: min + (i + 1) * step,
      count: 0,
      pnlSum: 0
    }));
    closed.forEach(t => {
      let idx = Math.floor((t.pnl - min) / step);
      if (idx >= nbBins) idx = nbBins - 1;
      bins[idx].count++;
      bins[idx].pnlSum += t.pnl;
    });
    return bins;
  }

  /**
   * Statistiques par instrument / stratégie / tag (breakdown).
   */
  function breakdown(trades, field) {
    const closed = trades.filter(t => t.pnl != null);
    const groups = {};
    closed.forEach(t => {
      const key = t[field] || '—';
      if (!groups[key]) groups[key] = { count: 0, pnl: 0, wins: 0 };
      groups[key].count++;
      groups[key].pnl += t.pnl;
      if (t.pnl > 0) groups[key].wins++;
    });
    return Object.entries(groups).map(([key, v]) => ({
      key,
      ...v,
      winrate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
      avgPnl: v.count > 0 ? v.pnl / v.count : 0
    })).sort((a, b) => b.pnl - a.pnl);
  }

  const api = { tradePnl, stats, pnlDistribution, breakdown, monthlyHeatmap, byDayOfWeek, rMultipleOf, holdHoursOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.JOURNAL = api;
})(typeof window !== 'undefined' ? window : globalThis);
