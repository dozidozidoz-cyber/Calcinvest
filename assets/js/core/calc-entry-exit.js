/* ============================================================
   CalcInvest — Core Backtest Entrée / Sortie
   Logique pure (zéro DOM). Teste des règles d'ENTRÉE et de SORTIE
   sur une série OHLC journalière ajustée.

   Deux styles :
     - position : tenue de plusieurs mois (filtres de tendance, replis)
     - swing    : tenue de quelques jours à quelques semaines
                  (RSI 2, cassures, croisement de moyennes, objectif en R)

   Deux lectures, calculées ensemble :
     - distribution : une entrée simulée à CHAQUE signal, chacune
       indépendante (statistiques de la règle, entrées chevauchées) ;
     - capital réinvesti : un seul capital, une position à la fois ;
       à chaque sortie le capital (gains ou pertes) est réinvesti au
       signal suivant. Donne une courbe de capital, un CAGR et un
       drawdown comparables à l'achat-conservation.

   Série attendue (format assets/data/daily/{id}.json et /api/daily) :
     { d: ["YYYY-MM-DD"], o: [], h: [], l: [], c: [] }

   Hypothèses : achat à la clôture du signal ; stop touché si le plus
   bas de la barre <= stop, exécuté au stop ou à l'ouverture si elle
   est déjà sous le stop (gap) ; si stop et objectif sont atteints dans
   la même barre, le stop est retenu (hypothèse prudente). Frais en %
   à l'achat et à la vente. Liquidités non rémunérées. Pas de fiscalité.
   ============================================================ */
(function (global) {
  'use strict';

  const ENTRY_RULES = [
    // Position
    { key: 'all',          style: 'both',     label: 'Tous les jours',   desc: 'Achat à chaque barre : la référence, sans aucun filtre.' },
    { key: 'trend',        style: 'both',     label: 'Tendance',         desc: 'Seulement si la clôture est au-dessus de la moyenne longue (200 jours / 40 semaines).' },
    { key: 'countertrend', style: 'position', label: 'Contre-tendance',  desc: 'Seulement si la clôture est sous la moyenne longue (200 jours / 40 semaines).' },
    { key: 'high',         style: 'position', label: 'Plus haut 1 an',   desc: 'Seulement quand la clôture fait un nouveau plus haut sur un an.' },
    { key: 'pullback20',   style: 'position', label: 'Repli −20 %',      desc: 'Seulement si le cours est au moins 20 % sous son plus haut d\'un an.' },
    { key: 'pullback40',   style: 'position', label: 'Repli −40 %',      desc: 'Seulement si le cours est au moins 40 % sous son plus haut d\'un an.' },
    // Swing
    { key: 'rsi2',         style: 'swing',    label: 'Repli RSI 2',      desc: 'Achat d\'un repli court dans une tendance haussière : clôture au-dessus de la moyenne longue et RSI(2) sous 10 (règle popularisée par Larry Connors).' },
    { key: 'breakout20',   style: 'swing',    label: 'Cassure 20 barres', desc: 'Achat quand la clôture dépasse le plus haut des 20 barres précédentes (canal de Donchian).' },
    { key: 'breakout55',   style: 'swing',    label: 'Cassure 55 barres', desc: 'Achat quand la clôture dépasse le plus haut des 55 barres précédentes (entrée longue des « Turtles »).' },
    { key: 'macross',      style: 'swing',    label: 'Croisement MM20/50', desc: 'Achat le jour où la moyenne 20 barres passe au-dessus de la moyenne 50 barres.' }
  ];

  const EXIT_RULES = [
    { key: 'hold',          style: 'both',     label: 'Conserver',           color: '#64748B', desc: 'Aucune sortie avant l\'horizon.' },
    { key: 'fixed',         style: 'both',     label: 'Stop fixe',           color: '#F59E0B', desc: 'Stop à k × ATR sous le prix d\'entrée, jamais déplacé ; sinon sortie à l\'horizon.' },
    { key: 'trailing',      style: 'both',     label: 'Stop suiveur',        color: '#0EA5E9', desc: 'Stop à k × ATR sous le plus haut atteint depuis l\'entrée ; il ne redescend jamais. Sortie dès que le cours le touche.' },
    { key: 'trailingClose', style: 'position', label: 'Suiveur sur clôture', color: '#A855F7', desc: 'Même stop suiveur, mais sortie seulement si la clôture de la barre passe dessous (à cette clôture).' },
    { key: 'target2r',      style: 'swing',    label: 'Objectif 2R',         color: '#10B981', desc: 'Stop fixe à k × ATR et objectif à 2 fois cette distance au-dessus de l\'entrée (gain visé = 2 fois le risque).' },
    { key: 'rebound',       style: 'swing',    label: 'Sortie sur rebond',   color: '#EC4899', desc: 'Vente à la première clôture au-dessus de la moyenne 5 barres, avec stop fixe de protection à k × ATR.' },
    { key: 'donchian10',    style: 'swing',    label: 'Plus bas 10 barres',  color: '#A855F7', desc: 'Vente quand la clôture passe sous le plus bas des 10 barres précédentes, avec stop fixe de protection à k × ATR.' }
  ];

  const STYLES = {
    position: {
      label: 'Position', horizons: [3, 6, 12, 24],
      defaults: { timeframe: 'weekly', k: 3, horizonMonths: 12 },
      entries: ['all', 'trend', 'countertrend', 'high', 'pullback20', 'pullback40'],
      exits: ['hold', 'fixed', 'trailing', 'trailingClose']
    },
    swing: {
      label: 'Swing', horizons: [0.25, 0.5, 1, 3],
      defaults: { timeframe: 'daily', k: 2, horizonMonths: 1 },
      entries: ['all', 'trend', 'rsi2', 'breakout20', 'breakout55', 'macross'],
      exits: ['hold', 'fixed', 'target2r', 'rebound', 'donchian10', 'trailing']
    }
  };

  // Paramètres par unité de temps : moyenne longue, fenêtre "1 an", barres par mois
  const TIMEFRAMES = {
    daily:  { sma: 200, year: 252, perMonth: 21,      label: 'journalier' },
    weekly: { sma: 40,  year: 52,  perMonth: 52 / 12, label: 'hebdomadaire' }
  };
  const ATR_N = 14;
  const RSI_N = 2;
  const RSI_MAX = 10;

  /* ─── Préparation des séries ─────────────────────────────── */

  /** Lundi (UTC) de la semaine d'une date ISO, en "YYYY-MM-DD". */
  function weekKey(iso) {
    const t = Date.parse(iso + 'T00:00:00Z');
    const dow = (new Date(t).getUTCDay() + 6) % 7; // lundi = 0
    return new Date(t - dow * 864e5).toISOString().slice(0, 10);
  }

  /**
   * Agrège une série journalière en barres hebdomadaires (lundi → dimanche).
   * La dernière semaine est écartée : elle peut être incomplète.
   */
  function toWeekly(s) {
    const out = { d: [], o: [], h: [], l: [], c: [] };
    let key = null;
    for (let i = 0; i < s.d.length; i++) {
      const k = weekKey(s.d[i]);
      if (k !== key) {
        out.d.push(s.d[i]); out.o.push(s.o[i]); out.h.push(s.h[i]); out.l.push(s.l[i]); out.c.push(s.c[i]);
        key = k;
      } else {
        const j = out.d.length - 1;
        out.h[j] = Math.max(out.h[j], s.h[i]);
        out.l[j] = Math.min(out.l[j], s.l[i]);
        out.c[j] = s.c[i];
      }
    }
    ['d', 'o', 'h', 'l', 'c'].forEach(f => out[f].pop());
    return out;
  }

  /** ATR simple (moyenne arithmétique du true range sur n barres). NaN avant n barres. */
  function atr(h, l, c, n) {
    const out = new Array(c.length).fill(NaN);
    let sum = 0;
    const tr = new Array(c.length);
    for (let i = 0; i < c.length; i++) {
      const prev = i > 0 ? c[i - 1] : c[0];
      tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - prev), Math.abs(l[i] - prev));
      sum += tr[i];
      if (i >= n) sum -= tr[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  /** Moyenne mobile simple. NaN avant n barres. */
  function sma(x, n) {
    const out = new Array(x.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i];
      if (i >= n) sum -= x[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  /** Maximum glissant sur n barres (barre courante incluse). NaN avant n barres. */
  function rollingMax(x, n) {
    const out = new Array(x.length).fill(NaN);
    const dq = []; // indices, valeurs décroissantes
    for (let i = 0; i < x.length; i++) {
      while (dq.length && x[dq[dq.length - 1]] <= x[i]) dq.pop();
      dq.push(i);
      if (dq[0] <= i - n) dq.shift();
      if (i >= n - 1) out[i] = x[dq[0]];
    }
    return out;
  }

  /** Minimum glissant sur n barres (barre courante incluse). */
  function rollingMin(x, n) {
    return rollingMax(x.map(v => -v), n).map(v => -v);
  }

  /** Décale une série d'une barre : out[i] = x[i-1] (valeur des barres PRÉCÉDENTES). */
  function shift1(x) {
    return [NaN].concat(x.slice(0, -1));
  }

  /** RSI de Wilder sur n barres. NaN avant n+1 barres. */
  function rsi(c, n) {
    const out = new Array(c.length).fill(NaN);
    if (c.length <= n) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= n; i++) {
      const ch = c[i] - c[i - 1];
      if (ch > 0) gain += ch; else loss -= ch;
    }
    gain /= n; loss /= n;
    const val = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
    out[n] = val();
    for (let i = n + 1; i < c.length; i++) {
      const ch = c[i] - c[i - 1];
      gain = (gain * (n - 1) + Math.max(ch, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-ch, 0)) / n;
      out[i] = val();
    }
    return out;
  }

  /** Tous les indicateurs utilisés par les règles, calculés une fois. */
  function indicators(s, tf) {
    const { h, l, c } = s;
    return {
      atr: atr(h, l, c, ATR_N),
      smaLong: sma(c, tf.sma),
      sma5: sma(c, 5),
      sma20: sma(c, 20),
      sma50: sma(c, 50),
      rsi2: rsi(c, RSI_N),
      closeMax: rollingMax(c, tf.year),
      highMax: rollingMax(h, tf.year),
      hh20: shift1(rollingMax(h, 20)),
      hh55: shift1(rollingMax(h, 55)),
      ll10: shift1(rollingMin(l, 10))
    };
  }

  /* ─── Règles d'entrée ────────────────────────────────────── */

  function isEntry(rule, c, ind, i) {
    switch (rule) {
      case 'all':          return true;
      case 'trend':        return c[i] > ind.smaLong[i];
      case 'countertrend': return c[i] < ind.smaLong[i];
      case 'high':         return c[i] >= ind.closeMax[i];
      case 'pullback20':   return c[i] <= 0.8 * ind.highMax[i];
      case 'pullback40':   return c[i] <= 0.6 * ind.highMax[i];
      case 'rsi2':         return c[i] > ind.smaLong[i] && ind.rsi2[i] < RSI_MAX;
      case 'breakout20':   return c[i] > ind.hh20[i];
      case 'breakout55':   return c[i] > ind.hh55[i];
      case 'macross':      return i > 0 && ind.sma20[i] > ind.sma50[i] && ind.sma20[i - 1] <= ind.sma50[i - 1];
      default: throw new Error('Règle d\'entrée inconnue : ' + rule);
    }
  }

  /* ─── Règles de sortie ───────────────────────────────────── */

  /**
   * Simule une sortie pour une entrée à la clôture de la barre i.
   * `ind` : objet d'indicateurs, ou directement le tableau d'ATR.
   * La position est close au plus tard à i + horizon (ou à la dernière barre).
   * Renvoie { ret, bars, maxDD, exitIdx } : rendement brut, barres tenues,
   * pire baisse pendant la détention (plus bas / entrée − 1), barre de sortie.
   */
  function simulateExit(s, ind, i, horizon, rule, k) {
    if (Array.isArray(ind)) ind = { atr: ind };
    const { o, h, l, c } = s;
    const entry = c[i];
    const end = Math.min(i + horizon, c.length - 1);
    const risk = k * ind.atr[i];
    let stop = rule === 'hold' ? -Infinity : entry - risk;
    const target = rule === 'target2r' ? entry + 2 * risk : Infinity;
    const trails = rule === 'trailing' || rule === 'trailingClose';
    let top = h[i];
    let low = Infinity;
    const out = (px, t) => ({ ret: px / entry - 1, bars: t - i, maxDD: Math.min(low, px) / entry - 1, exitIdx: t });

    for (let t = i + 1; t <= end; t++) {
      if (rule === 'trailingClose') {
        low = Math.min(low, l[t]);
        if (c[t] <= stop) return out(c[t], t);
      } else {
        if (rule !== 'hold' && l[t] <= stop) return out(Math.min(stop, o[t]), t);
        low = Math.min(low, l[t]);
        if (h[t] >= target) return out(Math.max(target, o[t]), t);
        if (rule === 'rebound' && c[t] > ind.sma5[t]) return out(c[t], t);
        if (rule === 'donchian10' && c[t] < ind.ll10[t]) return out(c[t], t);
      }
      if (trails) {
        top = Math.max(top, h[t]);
        stop = Math.max(stop, top - k * ind.atr[t]);
      }
    }
    return out(c[end], end);
  }

  /* ─── Statistiques ───────────────────────────────────────── */

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /**
   * Statistiques d'un ensemble d'issues {ret, bars, maxDD, r}
   * (rendements nets en fraction ; r = rendement net / risque initial k × ATR).
   */
  function summarize(outcomes, perMonth) {
    const n = outcomes.length;
    if (!n) return { n: 0 };
    const rets = outcomes.map(x => x.ret).sort((a, b) => a - b);
    const dds = outcomes.map(x => x.maxDD).sort((a, b) => a - b);
    const rs = outcomes.map(x => x.r).filter(Number.isFinite);
    const sumRet = rets.reduce((a, b) => a + b, 0);
    const sumBars = outcomes.reduce((a, x) => a + x.bars, 0);
    return {
      n,
      mean: sumRet / n,
      median: quantile(rets, 0.5),
      p5: quantile(rets, 0.05),
      p95: quantile(rets, 0.95),
      worst: rets[0],
      best: rets[n - 1],
      pctLoss: outcomes.filter(x => x.ret < 0).length / n,
      pctWin: outcomes.filter(x => x.ret > 0).length / n,
      meanR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : NaN,
      avgMonths: sumBars / n / perMonth,
      perMonthInvested: sumBars > 0 ? sumRet / (sumBars / perMonth) : NaN,
      medianMaxDD: quantile(dds, 0.5),
      pctHit30: outcomes.filter(x => x.maxDD <= -0.30).length / n
    };
  }

  /** Statistiques d'une courbe de capital (valeurs > 0, base 1). */
  function equityStats(equity, first, years) {
    let peak = -Infinity, maxDD = 0;
    for (let t = first; t < equity.length; t++) {
      peak = Math.max(peak, equity[t]);
      maxDD = Math.min(maxDD, equity[t] / peak - 1);
    }
    const final = equity[equity.length - 1];
    return { final, cagr: years > 0 ? Math.pow(final, 1 / years) - 1 : NaN, maxDD };
  }

  /**
   * Capital réinvesti : une position à la fois, entrée au premier signal
   * où l'on est sans position, sortie selon la règle, capital entier
   * réinvesti au signal suivant (à partir de la barre qui suit la sortie).
   * Renvoie { equity (base 1, null avant `first`), final, cagr, maxDD,
   *           trades, winRate, meanR, exposure, worstTrade }.
   */
  function simulatePortfolio(s, ind, entryRule, exitRule, p) {
    const c = s.c, n = c.length;
    const fee = p.fee, k = p.k, horizon = p.horizon, first = p.first;
    const equity = new Array(n).fill(null);
    let cap = 1, inMarket = 0, wins = 0, sumR = 0, nR = 0, worst = 0;
    const trades = [];
    let i = first;
    while (i < n) {
      if (i < n - 1 && isEntry(entryRule, c, ind, i)) {
        const capIn = cap * (1 - fee);
        const res = simulateExit(s, ind, i, horizon, exitRule, k);
        for (let t = i; t < res.exitIdx; t++) equity[t] = capIn * c[t] / c[i];
        const net = (1 + res.ret) * (1 - fee) * (1 - fee) - 1;
        cap = cap * (1 + net);
        equity[res.exitIdx] = cap;
        inMarket += res.exitIdx - i;
        const r = net / (k * ind.atr[i] / c[i]);
        if (Number.isFinite(r)) { sumR += r; nR++; }
        if (net > 0) wins++;
        worst = Math.min(worst, net);
        trades.push({ entry: s.d[i], exit: s.d[res.exitIdx], ret: net });
        i = res.exitIdx + 1;
      } else {
        equity[i] = cap;
        i++;
      }
    }
    const years = (n - 1 - first) / p.perMonth / 12;
    const st = equityStats(equity, first, years);
    return {
      equity, final: st.final, cagr: st.cagr, maxDD: st.maxDD,
      trades: trades.length, tradeList: trades,
      winRate: trades.length ? wins / trades.length : NaN,
      meanR: nR ? sumR / nR : NaN,
      exposure: (n - 1 - first) > 0 ? inMarket / (n - 1 - first) : 0,
      tradesPerYear: years > 0 ? trades.length / years : NaN,
      worstTrade: worst
    };
  }

  /** Achat-conservation de `first` à la fin, frais d'achat et de vente compris. */
  function buyAndHold(s, first, fee, perMonth) {
    const c = s.c, n = c.length;
    const equity = new Array(n).fill(null);
    for (let t = first; t < n; t++) equity[t] = (1 - fee) * c[t] / c[first];
    equity[n - 1] *= (1 - fee);
    const years = (n - 1 - first) / perMonth / 12;
    const st = equityStats(equity, first, years);
    return { equity, final: st.final, cagr: st.cagr, maxDD: st.maxDD, trades: 1, exposure: 1 };
  }

  /* ─── Point d'entrée ─────────────────────────────────────── */

  /**
   * @param {object} series  Série journalière { d, o, h, l, c }
   * @param {object} p       { style: 'position'|'swing', timeframe: 'daily'|'weekly',
   *                           entryRule, k, horizonMonths, feePct, from?, to? }
   *                         from/to ("YYYY-MM-DD", optionnels) bornent les DATES D'ENTRÉE.
   * @returns {object} { error } ou {
   *     entryRules, exitRules, byExit, byEntry,                  // distribution
   *     portfolio: { [exitKey]: … }, portfolioByEntry, buyHold,  // capital réinvesti
   *     timeline, dates, firstEntry, lastEntry, years, … }
   */
  function run(series, p) {
    const style = STYLES[p.style] ? p.style : 'position';
    const st = STYLES[style];
    const tfKey = p.timeframe === 'weekly' ? 'weekly' : (p.timeframe === 'daily' ? 'daily' : st.defaults.timeframe);
    const tf = TIMEFRAMES[tfKey];
    const s = tfKey === 'weekly' ? toWeekly(series) : series;
    const k = Number(p.k) > 0 ? Number(p.k) : st.defaults.k;
    const horizon = Math.max(1, Math.round((Number(p.horizonMonths) || st.defaults.horizonMonths) * tf.perMonth));
    const fee = Math.max(0, Number(p.feePct) || 0) / 100;
    const entryRule = p.entryRule || 'all';
    if (!st.entries.includes(entryRule)) return { error: 'Règle d\'entrée inconnue pour ce style : ' + entryRule };

    const n = s.c.length;
    const warmup = Math.max(tf.sma, tf.year, 56, ATR_N);
    let first = warmup - 1;
    let last = n - 1 - horizon;
    if (p.from) while (first < n && s.d[first] < p.from) first++;
    if (p.to) while (last >= 0 && s.d[last] > p.to) last--;
    if (last < first + 20) {
      const need = Math.ceil((warmup + horizon + 20) / tf.perMonth / 12 * 10) / 10;
      return { error: `Historique trop court : il faut environ ${need} ans de cotation pour ces réglages (${(n / tf.perMonth / 12).toFixed(1)} ans disponibles).` };
    }

    const ind = indicators(s, tf);
    const net = r => (1 + r) * (1 - fee) * (1 - fee) - 1;
    const exitRules = st.exits.map(key => EXIT_RULES.find(e => e.key === key));
    const entryRules = st.entries.map(key => ENTRY_RULES.find(e => e.key === key));

    // Distribution : issue de chaque sortie pour chaque barre d'entrée possible
    const outcomesByExit = {};
    exitRules.forEach(ex => {
      const arr = new Array(n);
      for (let i = first; i <= last; i++) {
        const o = simulateExit(s, ind, i, horizon, ex.key, k);
        const ret = net(o.ret);
        arr[i] = { ret, bars: o.bars, maxDD: o.maxDD, r: ret / (k * ind.atr[i] / s.c[i]) };
      }
      outcomesByExit[ex.key] = arr;
    });

    const byEntry = {};
    let chosenIdx = [];
    entryRules.forEach(en => {
      const idx = [];
      for (let i = first; i <= last; i++) if (isEntry(en.key, s.c, ind, i)) idx.push(i);
      byEntry[en.key] = {};
      exitRules.forEach(ex => {
        byEntry[en.key][ex.key] = summarize(idx.map(i => outcomesByExit[ex.key][i]), tf.perMonth);
      });
      if (en.key === entryRule) chosenIdx = idx;
    });

    const timeline = { dates: chosenIdx.map(i => s.d[i]) };
    exitRules.forEach(ex => { timeline[ex.key] = chosenIdx.map(i => outcomesByExit[ex.key][i].ret * 100); });

    // Capital réinvesti : de la première entrée possible à la fin des données
    // (ou à `to` + horizon si une fin est imposée)
    let pEnd = n;
    if (p.to) { pEnd = Math.min(n, last + horizon + 1); }
    const sp = pEnd < n ? { d: s.d.slice(0, pEnd), o: s.o.slice(0, pEnd), h: s.h.slice(0, pEnd), l: s.l.slice(0, pEnd), c: s.c.slice(0, pEnd) } : s;
    const pp = { fee, k, horizon, first, perMonth: tf.perMonth };
    const portfolioByEntry = {};
    entryRules.forEach(en => {
      portfolioByEntry[en.key] = {};
      exitRules.forEach(ex => { portfolioByEntry[en.key][ex.key] = simulatePortfolio(sp, ind, en.key, ex.key, pp); });
    });
    const buyHold = buyAndHold(sp, first, fee, tf.perMonth);

    return {
      style, timeframe: tfKey,
      k, horizon, horizonMonths: horizon / tf.perMonth, feePct: fee * 100,
      bars: n,
      firstEntry: s.d[first], lastEntry: s.d[last], lastDate: sp.d[sp.d.length - 1],
      years: (last - first + 1) / tf.perMonth / 12,
      portfolioYears: (sp.c.length - 1 - first) / tf.perMonth / 12,
      entryRule, entryRules, exitRules,
      byExit: byEntry[entryRule],
      byEntry,
      portfolio: portfolioByEntry[entryRule],
      portfolioByEntry,
      buyHold,
      dates: sp.d, firstIdx: first,
      timeline
    };
  }

  const api = {
    ENTRY_RULES, EXIT_RULES, STYLES, TIMEFRAMES,
    run, toWeekly, atr, sma, rsi, rollingMax, rollingMin, indicators, isEntry,
    simulateExit, simulatePortfolio, buyAndHold, summarize, weekKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ENTRYEXIT = api;
})(typeof window !== 'undefined' ? window : globalThis);
