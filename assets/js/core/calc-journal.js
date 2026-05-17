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
        nbTrades: 0, nbClosed: 0, nbWins: 0, nbLosses: 0,
        winrate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0,
        expectancy: 0, profitFactor: 0,
        biggestWin: 0, biggestLoss: 0,
        maxDrawdown: 0, maxDrawdownPct: 0,
        equityCurve: [],
        consecutiveWins: 0, consecutiveLosses: 0,
        sharpe: 0
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

    return {
      nbTrades: trades.length,
      nbClosed: closed.length,
      nbOpen: trades.length - closed.length,
      nbWins: wins.length, nbLosses: losses.length,
      winrate, totalPnl,
      avgWin, avgLoss,
      expectancy, profitFactor,
      biggestWin, biggestLoss,
      maxDrawdown: maxDD, maxDrawdownPct: maxDDPct,
      equityCurve,
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
      sharpe
    };
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

  const api = { tradePnl, stats, pnlDistribution, breakdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.JOURNAL = api;
})(typeof window !== 'undefined' ? window : globalThis);
