/**
 * CalcInvest — Smart Money core (pure logic, no DOM)
 * ===================================================
 *
 * Travaille sur les JSON produits par scripts/fetch_smartmoney.py
 *
 * Exporte :
 *   SM.diffFilings(curr, prev)        → positions avec flag NEW / EXIT / ADD / TRIM / HOLD + dShares + dPct
 *   SM.concentration(positions, n)    → % du portfolio dans le top N
 *   SM.topMovers(diff, n)             → top N par valeur de mouvement
 *   SM.summarizeTxns(txns, sinceDays) → stats récentes (count, buy/sell, top tickers) pour un politicien
 *   SM.tickerHolders(managers, ticker)→ liste des gérants qui détiennent un ticker donné
 */
(function (root) {
  'use strict';

  function diffFilings(curr, prev) {
    var byCusip = {};
    if (prev && prev.positions) {
      prev.positions.forEach(function (p) { byCusip[p.cusip] = p; });
    }
    var out = [];
    var currTotal = curr.total_value || 1;
    var prevTotal = (prev && prev.total_value) || 1;
    var seen = {};

    curr.positions.forEach(function (p) {
      seen[p.cusip] = true;
      var prevP = byCusip[p.cusip];
      var flag, dShares = 0, dPct = 0, dValue = 0;
      if (!prevP) {
        flag = 'NEW';
        dShares = p.shares;
        dValue = p.value;
        dPct = p.pct;
      } else {
        dShares = p.shares - prevP.shares;
        dValue = p.value - prevP.value;
        dPct = (p.pct - prevP.pct);
        var sharesRatio = prevP.shares ? dShares / prevP.shares : 0;
        if (Math.abs(sharesRatio) < 0.01) flag = 'HOLD';
        else if (sharesRatio > 0) flag = 'ADD';
        else flag = 'TRIM';
      }
      out.push({
        issuer: p.issuer, class: p.class, cusip: p.cusip,
        value: p.value, shares: p.shares, pct: p.pct,
        prevValue: prevP ? prevP.value : 0,
        prevShares: prevP ? prevP.shares : 0,
        prevPct: prevP ? prevP.pct : 0,
        dShares: dShares, dValue: dValue, dPct: dPct,
        flag: flag,
      });
    });

    // Sorties : positions qui étaient dans prev mais plus dans curr
    if (prev && prev.positions) {
      prev.positions.forEach(function (p) {
        if (!seen[p.cusip]) {
          out.push({
            issuer: p.issuer, class: p.class, cusip: p.cusip,
            value: 0, shares: 0, pct: 0,
            prevValue: p.value, prevShares: p.shares, prevPct: p.pct,
            dShares: -p.shares, dValue: -p.value, dPct: -p.pct,
            flag: 'EXIT',
          });
        }
      });
    }

    out.sort(function (a, b) { return b.value - a.value; });
    return out;
  }

  function concentration(positions, n) {
    n = n || 10;
    var total = positions.reduce(function (s, p) { return s + (p.value || 0); }, 0);
    if (!total) return 0;
    var top = positions.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, n);
    var sum = top.reduce(function (s, p) { return s + p.value; }, 0);
    return 100 * sum / total;
  }

  function topMovers(diff, n) {
    n = n || 5;
    var moves = diff.filter(function (d) { return d.flag !== 'HOLD'; });
    moves.sort(function (a, b) { return Math.abs(b.dValue) - Math.abs(a.dValue); });
    return moves.slice(0, n);
  }

  // Pour les politiciens : amount strings comme "$1,001 - $15,000" → midpoint
  function parseAmount(a) {
    if (!a || typeof a !== 'string') return 0;
    var clean = a.replace(/[$,]/g, '').toLowerCase();
    var nums = clean.match(/(\d+(?:\.\d+)?)\s*([km]?)/g);
    if (!nums) return 0;
    var vals = nums.map(function (n) {
      var m = n.match(/(\d+(?:\.\d+)?)\s*([km]?)/);
      var v = parseFloat(m[1]);
      if (m[2] === 'k') v *= 1000;
      if (m[2] === 'm') v *= 1000000;
      return v;
    });
    if (vals.length === 2) return (vals[0] + vals[1]) / 2;
    return vals[0];
  }

  function summarizeTxns(txns, sinceDays) {
    var cutoff = null;
    if (sinceDays) {
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - sinceDays);
    }
    var filtered = txns.filter(function (t) {
      if (!cutoff) return true;
      var d = new Date(t.date);
      return !isNaN(d) && d >= cutoff;
    });
    var buys = 0, sells = 0, buyAmt = 0, sellAmt = 0;
    var tickerCount = {};
    filtered.forEach(function (t) {
      var amt = parseAmount(t.amount);
      var type = (t.type || '').toLowerCase().trim();
      // Wayback : "purchase", "sale", "exchange"
      // Live House : "p", "s", "s (partial)", "e"
      var isBuy = type === 'p' || type.indexOf('purchase') >= 0 || type === 'buy';
      var isSell = type === 's' || type.indexOf('sale') >= 0 || type.indexOf('s (') === 0 || type === 'sell';
      if (isBuy) { buys++; buyAmt += amt; }
      if (isSell) { sells++; sellAmt += amt; }
      if (t.ticker) tickerCount[t.ticker] = (tickerCount[t.ticker] || 0) + 1;
    });
    var topTickers = Object.keys(tickerCount)
      .map(function (k) { return { ticker: k, count: tickerCount[k] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 8);
    return {
      total: filtered.length, buys: buys, sells: sells,
      buyAmt: buyAmt, sellAmt: sellAmt, topTickers: topTickers,
    };
  }

  function tickerHolders(managers, cusip) {
    // managers: array de { meta, latestFiling } — renvoie ceux qui détiennent ce cusip
    return managers.filter(function (m) {
      if (!m.latestFiling || !m.latestFiling.positions) return false;
      return m.latestFiling.positions.some(function (p) { return p.cusip === cusip; });
    }).map(function (m) {
      var pos = m.latestFiling.positions.find(function (p) { return p.cusip === cusip; });
      return { manager: m.meta.name, fund: m.meta.fund, pct: pos.pct, value: pos.value };
    });
  }

  // Trouve le prix de close le plus proche d'une date donnée (dans la série mensuelle)
  function priceAtDate(series, isoDate) {
    if (!series || !isoDate) return null;
    var keys = Object.keys(series).sort();
    if (!keys.length) return null;
    // Premier mois ≥ isoDate
    var target = isoDate.slice(0, 7); // YYYY-MM
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].slice(0, 7) >= target) return series[keys[i]];
    }
    return series[keys[keys.length - 1]]; // dernier dispo si futur
  }

  function latestPrice(series) {
    if (!series) return null;
    var keys = Object.keys(series).sort();
    return keys.length ? series[keys[keys.length - 1]] : null;
  }

  function tradeReturn(prices, ticker, isoDate) {
    if (!prices || !ticker || !isoDate) return null;
    var series = prices[ticker];
    if (!series) return null;
    var entry = priceAtDate(series, isoDate);
    var latest = latestPrice(series);
    if (entry == null || latest == null || entry === 0) return null;
    return {
      entryPrice: entry,
      latestPrice: latest,
      returnPct: 100 * (latest - entry) / entry,
    };
  }

  var api = {
    diffFilings: diffFilings,
    concentration: concentration,
    topMovers: topMovers,
    summarizeTxns: summarizeTxns,
    tickerHolders: tickerHolders,
    parseAmount: parseAmount,
    priceAtDate: priceAtDate,
    latestPrice: latestPrice,
    tradeReturn: tradeReturn,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SM = api;
})(typeof window !== 'undefined' ? window : globalThis);
