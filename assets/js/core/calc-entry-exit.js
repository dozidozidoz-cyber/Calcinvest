/* ============================================================
   CalcInvest — Core Backtest Entrée / Sortie
   Logique pure (zéro DOM). Teste des règles d'ENTRÉE et de SORTIE
   sur une série OHLC journalière ajustée, en simulant une entrée à
   chaque clôture où la règle d'entrée est vraie.

   Série attendue (format assets/data/daily/{id}.json et /api/daily) :
     { d: ["YYYY-MM-DD"], o: [], h: [], l: [], c: [] }

   Hypothèses : achat à la clôture du signal ; stop touché si le plus
   bas de la barre <= stop, exécuté au stop ou à l'ouverture si elle a
   déjà ouvert sous le stop (gap) ; sinon sortie à l'horizon. Frais en
   % appliqués à l'achat et à la vente. Pas de fiscalité.
   ============================================================ */
(function (global) {
  'use strict';

  const ENTRY_RULES = [
    { key: 'all',       label: 'Tous les jours',      desc: 'Achat à chaque barre : la référence, sans aucun filtre.' },
    { key: 'trend',     label: 'Tendance',             desc: 'Seulement si la clôture est au-dessus de la moyenne simple 200 jours (40 semaines).' },
    { key: 'countertrend', label: 'Contre-tendance',   desc: 'Seulement si la clôture est sous la moyenne simple 200 jours (40 semaines).' },
    { key: 'high',      label: 'Plus haut 1 an',       desc: 'Seulement quand la clôture fait un nouveau plus haut sur un an.' },
    { key: 'pullback20', label: 'Repli −20 %',         desc: 'Seulement si le cours est au moins 20 % sous son plus haut d\'un an.' },
    { key: 'pullback40', label: 'Repli −40 %',         desc: 'Seulement si le cours est au moins 40 % sous son plus haut d\'un an.' }
  ];

  const EXIT_RULES = [
    { key: 'hold',          label: 'Conserver',            color: '#64748B', desc: 'Aucune sortie avant l\'horizon.' },
    { key: 'fixed',         label: 'Stop fixe',            color: '#F59E0B', desc: 'Stop à k × ATR sous le prix d\'entrée, jamais déplacé.' },
    { key: 'trailing',      label: 'Stop suiveur',         color: '#0EA5E9', desc: 'Stop à k × ATR sous le plus haut atteint depuis l\'entrée ; il ne redescend jamais. Sortie dès que le cours le touche.' },
    { key: 'trailingClose', label: 'Suiveur sur clôture',  color: '#A855F7', desc: 'Même stop suiveur, mais sortie seulement si la clôture de la barre passe dessous (à cette clôture).' }
  ];

  // Paramètres par unité de temps : moyenne longue, fenêtre "1 an", barres par mois
  const TIMEFRAMES = {
    daily:  { sma: 200, year: 252, perMonth: 21,   label: 'journalier' },
    weekly: { sma: 40,  year: 52,  perMonth: 52 / 12, label: 'hebdomadaire' }
  };
  const ATR_N = 14;

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

  /* ─── Règles ─────────────────────────────────────────────── */

  function entryMask(rule, c, smaArr, closeMax, highMax, i) {
    switch (rule) {
      case 'all':          return true;
      case 'trend':        return c[i] > smaArr[i];
      case 'countertrend': return c[i] < smaArr[i];
      case 'high':         return c[i] >= closeMax[i];
      case 'pullback20':   return c[i] <= 0.8 * highMax[i];
      case 'pullback40':   return c[i] <= 0.6 * highMax[i];
      default: throw new Error('Règle d\'entrée inconnue : ' + rule);
    }
  }

  /**
   * Simule une sortie pour une entrée à la clôture de la barre i.
   * Renvoie { ret, bars, maxDD } : rendement brut, nombre de barres tenues,
   * pire baisse (plus bas / prix d'entrée − 1) pendant la détention.
   */
  function simulateExit(s, atrArr, i, horizon, rule, k) {
    const { o, h, l, c } = s;
    const entry = c[i];
    const end = i + horizon;
    let stop = rule === 'hold' ? -Infinity : entry - k * atrArr[i];
    let top = h[i];
    let low = Infinity;
    for (let t = i + 1; t <= end; t++) {
      if (rule === 'trailingClose') {
        low = Math.min(low, l[t]);
        if (c[t] <= stop) return { ret: c[t] / entry - 1, bars: t - i, maxDD: low / entry - 1 };
      } else if (rule !== 'hold' && l[t] <= stop) {
        const px = Math.min(stop, o[t]);
        low = Math.min(low, px);
        return { ret: px / entry - 1, bars: t - i, maxDD: low / entry - 1 };
      } else {
        low = Math.min(low, l[t]);
      }
      if (rule === 'trailing' || rule === 'trailingClose') {
        top = Math.max(top, h[t]);
        stop = Math.max(stop, top - k * atrArr[t]);
      }
    }
    return { ret: c[end] / entry - 1, bars: horizon, maxDD: low / entry - 1 };
  }

  /* ─── Statistiques ───────────────────────────────────────── */

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /** Statistiques d'un ensemble d'issues {ret, bars, maxDD} (rendements nets, en fraction). */
  function summarize(outcomes, perMonth) {
    const n = outcomes.length;
    if (!n) return { n: 0 };
    const rets = outcomes.map(x => x.ret).sort((a, b) => a - b);
    const dds = outcomes.map(x => x.maxDD).sort((a, b) => a - b);
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
      avgMonths: sumBars / n / perMonth,
      perMonthInvested: sumBars > 0 ? sumRet / (sumBars / perMonth) : NaN,
      medianMaxDD: quantile(dds, 0.5),
      pctHit30: outcomes.filter(x => x.maxDD <= -0.30).length / n
    };
  }

  /* ─── Point d'entrée ─────────────────────────────────────── */

  /**
   * @param {object} series  Série journalière { d, o, h, l, c }
   * @param {object} p       { timeframe: 'daily'|'weekly', entryRule, k, horizonMonths, feePct }
   * @returns {object} { error } ou
   *   { timeframe, bars, horizon, firstEntry, lastEntry, years,
   *     byExit: { [exitKey]: stats },            // règle d'entrée choisie × chaque sortie
   *     byEntry: { [entryKey]: { [exitKey]: stats } }, // toutes les entrées × toutes les sorties
   *     timeline: { dates: [], [exitKey]: [ret %] } } // issue par date d'entrée (règle choisie)
   */
  function run(series, p) {
    const tf = TIMEFRAMES[p.timeframe] || TIMEFRAMES.daily;
    const s = p.timeframe === 'weekly' ? toWeekly(series) : series;
    const k = Number(p.k) > 0 ? Number(p.k) : 3;
    const horizon = Math.max(1, Math.round((Number(p.horizonMonths) || 12) * tf.perMonth));
    const fee = Math.max(0, Number(p.feePct) || 0) / 100;
    const entryRule = p.entryRule || 'all';
    if (!ENTRY_RULES.some(r => r.key === entryRule)) return { error: 'Règle d\'entrée inconnue : ' + entryRule };

    const n = s.c.length;
    const warmup = Math.max(tf.sma, tf.year, ATR_N);
    const first = warmup - 1, last = n - 1 - horizon;
    if (last < first + 20) {
      const need = Math.ceil((warmup + horizon + 20) / tf.perMonth / 12 * 10) / 10;
      return { error: `Historique trop court : il faut environ ${need} ans de cotation pour ces réglages (${(n / tf.perMonth / 12).toFixed(1)} ans disponibles).` };
    }

    const atrArr = atr(s.h, s.l, s.c, ATR_N);
    const smaArr = sma(s.c, tf.sma);
    const closeMax = rollingMax(s.c, tf.year);
    const highMax = rollingMax(s.h, tf.year);
    const net = r => (1 + r) * (1 - fee) * (1 - fee) - 1;

    // Issue de chaque sortie pour chaque barre d'entrée possible (calculée une fois)
    const outcomesByExit = {};
    EXIT_RULES.forEach(ex => {
      const arr = new Array(n);
      for (let i = first; i <= last; i++) {
        const o = simulateExit(s, atrArr, i, horizon, ex.key, k);
        arr[i] = { ret: net(o.ret), bars: o.bars, maxDD: o.maxDD };
      }
      outcomesByExit[ex.key] = arr;
    });

    const byEntry = {};
    let chosenIdx = [];
    ENTRY_RULES.forEach(en => {
      const idx = [];
      for (let i = first; i <= last; i++) if (entryMask(en.key, s.c, smaArr, closeMax, highMax, i)) idx.push(i);
      byEntry[en.key] = {};
      EXIT_RULES.forEach(ex => {
        byEntry[en.key][ex.key] = summarize(idx.map(i => outcomesByExit[ex.key][i]), tf.perMonth);
      });
      if (en.key === entryRule) chosenIdx = idx;
    });

    const timeline = { dates: chosenIdx.map(i => s.d[i]) };
    EXIT_RULES.forEach(ex => { timeline[ex.key] = chosenIdx.map(i => outcomesByExit[ex.key][i].ret * 100); });

    return {
      timeframe: p.timeframe === 'weekly' ? 'weekly' : 'daily',
      k, horizon, horizonMonths: horizon / tf.perMonth, feePct: fee * 100,
      bars: n,
      firstEntry: s.d[first], lastEntry: s.d[last],
      years: (last - first + 1) / tf.perMonth / 12,
      entryRule,
      byExit: byEntry[entryRule],
      byEntry,
      timeline
    };
  }

  const api = { ENTRY_RULES, EXIT_RULES, TIMEFRAMES, run, toWeekly, atr, sma, rollingMax, simulateExit, summarize, weekKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ENTRYEXIT = api;
})(typeof window !== 'undefined' ? window : globalThis);
