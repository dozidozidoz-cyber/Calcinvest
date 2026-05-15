/* ============================================================
   CalcInvest — Core Marge & Liquidation
   Calculs : marge requise, prix de liquidation, distance,
             SL/TP par montant cible, pip ↔ price converter.

   Réutilise PIPS.PAIRS (chargé via calc-pips.js).
   ============================================================ */
(function (global) {
  'use strict';

  // ─── Helpers ────────────────────────────────────────────
  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  function getPairs() {
    return global.PIPS && global.PIPS.PAIRS ? global.PIPS.PAIRS : null;
  }

  // ─── Marge requise + prix de liquidation ────────────────
  /**
   * @param {Object} p
   * @param {string} p.pair          ex 'EUR/USD'
   * @param {string} p.direction     'long' | 'short'
   * @param {number} p.lotSize       en unités (ex: 100000 = 1 lot)
   * @param {number} p.entryPrice    prix d'entrée
   * @param {number} p.leverage      ex: 30 pour 30:1
   * @param {number} p.balance       solde du compte (devise compte)
   * @param {number} [p.maintenanceMarginPct=0]  % d'equity en dessous duquel liquidation
   * @param {string} [p.accountCurr='EUR']
   */
  function marginInfo(p) {
    const PAIRS = getPairs();
    if (!PAIRS) return { error: 'Module PIPS non chargé' };
    const pair = PAIRS[p.pair];
    if (!pair) return { error: 'Paire inconnue : ' + p.pair };

    const lots         = num(p.lotSize, pair.contractSize || 100000);
    const entry        = num(p.entryPrice, pair.price);
    const lev          = Math.max(1, num(p.leverage, 30));
    const balance      = num(p.balance, 10000);
    const mmPct        = num(p.maintenanceMarginPct, 0) / 100;
    const accountCurr  = (p.accountCurr || 'EUR').toUpperCase();
    const direction    = p.direction === 'short' ? 'short' : 'long';

    // ─── Notional + marge ───
    // Notional (en quote currency) = lots × entry price
    const notionalQuote = lots * entry;

    // Conversion vers devise du compte via PIPS.pipValue (qui sait faire la conversion)
    const pv = global.PIPS.pipValue({
      pair: p.pair, lotSize: lots, accountCurr
    });
    // pip value account / pip value quote × notional = notional account
    const conversionRatio = pv.pipValueAccount / pv.pipValueQuote;
    const notionalAccount = notionalQuote * conversionRatio;

    const marginRequired = notionalAccount / lev;
    const freeMargin     = balance - marginRequired;
    const marginLevel    = balance > 0 ? (balance / marginRequired) * 100 : 0;

    // ─── Liquidation price ───
    // Pour long : perte totale = balance - balance × mmPct
    //          = ΔP × lots (en quote)
    //          en account : ΔP × lots × conversionRatio = balance × (1 - mmPct)
    //          → ΔP = balance × (1 - mmPct) / (lots × conversionRatio)
    const allowedLoss = balance * (1 - mmPct);
    const priceMove   = (lots > 0 && conversionRatio > 0)
      ? allowedLoss / (lots * conversionRatio)
      : 0;

    const liqPrice = direction === 'long'
      ? Math.max(0, entry - priceMove)
      : entry + priceMove;
    const liqDistancePrice = Math.abs(liqPrice - entry);
    const liqDistancePips  = liqDistancePrice / pair.pipSize;
    const liqDistancePct   = entry > 0 ? (liqDistancePrice / entry) * 100 : 0;

    return {
      pair: p.pair,
      direction,
      lotSize: lots,
      entryPrice: entry,
      leverage: lev,
      balance,
      notionalQuote,
      notionalAccount,
      marginRequired,
      freeMargin,
      marginLevel,
      liqPrice,
      liqDistancePrice,
      liqDistancePips,
      liqDistancePct,
      maxLossAtLiq: allowedLoss,
      accountCurrency: pv.accountCurrency,
      quoteCurrency: pair.quote,
      pipSize: pair.pipSize,
      pipValueAccount: pv.pipValueAccount,
      conversionRatio
    };
  }

  /**
   * Niveaux successifs de margin call (50 %, 30 %, 0 %).
   * Donne les prix correspondants pour visualiser la "zone de danger".
   */
  function marginCallLevels(p) {
    const PAIRS = getPairs();
    if (!PAIRS) return [];
    const pair = PAIRS[p.pair];
    if (!pair) return [];

    const levels = [
      { name: 'Margin call broker', threshold: 0.5, severity: 'warn' },
      { name: 'Stop out',           threshold: 0.2, severity: 'neg' },
      { name: 'Liquidation totale', threshold: 0.0, severity: 'neg' }
    ];

    return levels.map(lvl => {
      const info = marginInfo(Object.assign({}, p, { maintenanceMarginPct: lvl.threshold * 100 }));
      return {
        name: lvl.name,
        severity: lvl.severity,
        threshold: lvl.threshold * 100,
        price: info.liqPrice,
        pips: info.liqDistancePips,
        pct: info.liqDistancePct,
        lossAccount: info.maxLossAtLiq
      };
    });
  }

  // ─── SL/TP par montant cible ────────────────────────────
  /**
   * Étant donné un montant cible (gain ou perte), calcule à quel prix
   * placer le stop ou le take profit.
   *
   * @param {Object} p
   * @param {string} p.pair
   * @param {string} p.direction 'long' | 'short'
   * @param {number} p.lotSize en unités
   * @param {number} p.entryPrice
   * @param {number} p.targetAmount montant cible (positif = gain, négatif = perte)
   * @param {string} p.accountCurr
   */
  function priceForTarget(p) {
    const PAIRS = getPairs();
    if (!PAIRS) return { error: 'Module PIPS non chargé' };
    const pair = PAIRS[p.pair];
    if (!pair) return { error: 'Paire inconnue' };

    const lots      = num(p.lotSize, 100000);
    const entry     = num(p.entryPrice, pair.price);
    const target    = num(p.targetAmount, 0);
    const dir       = p.direction === 'short' ? 'short' : 'long';

    if (lots <= 0) return { error: 'Lot size doit être > 0' };

    const pv = global.PIPS.pipValue({
      pair: p.pair, lotSize: lots, accountCurr: p.accountCurr
    });
    const conversionRatio = pv.pipValueAccount / pv.pipValueQuote;

    // Pour gagner `target` €, il faut un mouvement de :
    // target = ΔP × lots × conversionRatio
    // → ΔP = target / (lots × conversionRatio)
    const priceMove = target / (lots * conversionRatio);

    // Si long et target > 0, le prix doit monter
    // Si long et target < 0, le prix doit baisser
    // Si short, inverse
    const signLong = dir === 'long' ? 1 : -1;
    const newPrice = entry + signLong * priceMove;
    const distancePips = Math.abs(newPrice - entry) / pair.pipSize;

    return {
      pair: p.pair,
      direction: dir,
      entryPrice: entry,
      targetAmount: target,
      newPrice: Math.max(0, newPrice),
      priceMove: Math.abs(priceMove),
      distancePips,
      isGain: (target > 0)
    };
  }

  // ─── Pip ↔ Price converter ──────────────────────────────
  /**
   * Convertit une distance en pips en prix cible (à partir d'un prix de base).
   *
   * @param {Object} p
   * @param {string} p.pair
   * @param {string} p.direction
   * @param {number} p.basePrice
   * @param {number} p.pips      Positif = mouvement favorable, négatif = défavorable
   */
  function pipsToPrice(p) {
    const PAIRS = getPairs();
    if (!PAIRS) return { error: 'Module PIPS non chargé' };
    const pair = PAIRS[p.pair];
    if (!pair) return { error: 'Paire inconnue' };

    const base = num(p.basePrice, pair.price);
    const pips = num(p.pips, 0);
    const dir  = p.direction === 'short' ? -1 : 1;

    const priceMove = pips * pair.pipSize * dir;
    const result = base + priceMove;

    return {
      pair: p.pair,
      basePrice: base,
      pips,
      priceTarget: Math.max(0, result),
      priceMove
    };
  }

  /**
   * Convertit une distance en prix en pips.
   */
  function priceToPips(p) {
    const PAIRS = getPairs();
    if (!PAIRS) return { error: 'Module PIPS non chargé' };
    const pair = PAIRS[p.pair];
    if (!pair) return { error: 'Paire inconnue' };

    const a = num(p.priceA, pair.price);
    const b = num(p.priceB, pair.price);

    const pips = (b - a) / pair.pipSize;
    return { pair: p.pair, priceA: a, priceB: b, pips };
  }

  // ─── Export ─────────────────────────────────────────────
  const api = { marginInfo, marginCallLevels, priceForTarget, pipsToPrice, priceToPips };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.MARGIN = api;
  }

})(typeof window !== 'undefined' ? window : global);
