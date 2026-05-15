/* ============================================================
   CalcInvest — Core Calculateur PIPS (Forex / Métaux / CFD)
   Logique pure, zéro DOM. Testable en Node.js.

   Concepts :
   - 1 pip = plus petite variation de prix (ex: 0.0001 sur EUR/USD)
   - Pip value (en devise QUOTE) = pip_size × taille position
     • EUR/USD 1 lot (100k) → 0.0001 × 100 000 = 10 USD/pip
     • USD/JPY 1 lot (100k) → 0.01 × 100 000 = 1 000 JPY/pip
   - Pip value en devise du COMPTE = via taux de conversion
   ============================================================ */
(function (global) {
  'use strict';

  // ─── Base de paires connues ──────────────────────────────
  // Pour chaque paire : base + quote + taille de pip + prix indicatif
  const PAIRS = {
    // Forex majors
    'EUR/USD': { base: 'EUR', quote: 'USD', pipSize: 0.0001, price: 1.0800, category: 'forex' },
    'GBP/USD': { base: 'GBP', quote: 'USD', pipSize: 0.0001, price: 1.2700, category: 'forex' },
    'USD/JPY': { base: 'USD', quote: 'JPY', pipSize: 0.01,   price: 155.00, category: 'forex' },
    'USD/CHF': { base: 'USD', quote: 'CHF', pipSize: 0.0001, price: 0.9100, category: 'forex' },
    'AUD/USD': { base: 'AUD', quote: 'USD', pipSize: 0.0001, price: 0.6600, category: 'forex' },
    'NZD/USD': { base: 'NZD', quote: 'USD', pipSize: 0.0001, price: 0.6000, category: 'forex' },
    'USD/CAD': { base: 'USD', quote: 'CAD', pipSize: 0.0001, price: 1.3500, category: 'forex' },
    // Crosses EUR
    'EUR/GBP': { base: 'EUR', quote: 'GBP', pipSize: 0.0001, price: 0.8500, category: 'forex' },
    'EUR/JPY': { base: 'EUR', quote: 'JPY', pipSize: 0.01,   price: 167.00, category: 'forex' },
    'EUR/CHF': { base: 'EUR', quote: 'CHF', pipSize: 0.0001, price: 0.9800, category: 'forex' },
    'GBP/JPY': { base: 'GBP', quote: 'JPY', pipSize: 0.01,   price: 196.00, category: 'forex' },
    // Métaux précieux
    'XAU/USD': { base: 'XAU', quote: 'USD', pipSize: 0.01,   price: 2400.00, category: 'metal' }, // Or — convention 0.01 par pip
    'XAG/USD': { base: 'XAG', quote: 'USD', pipSize: 0.001,  price: 28.00,   category: 'metal' }, // Argent
    // Indices CFD (1 pip = 1 point)
    'US30':    { base: 'USD', quote: 'USD', pipSize: 1.0,    price: 39000,   category: 'index' }, // Dow
    'NAS100':  { base: 'USD', quote: 'USD', pipSize: 1.0,    price: 17500,   category: 'index' }, // Nasdaq
    'SPX500':  { base: 'USD', quote: 'USD', pipSize: 0.1,    price: 5200,    category: 'index' }, // S&P 500
    'GER40':   { base: 'EUR', quote: 'EUR', pipSize: 1.0,    price: 18200,   category: 'index' }, // DAX
    // Crypto (1 pip = 0.01 sur BTC, 0.001 sur ETH)
    'BTC/USD': { base: 'BTC', quote: 'USD', pipSize: 1.0,    price: 95000,   category: 'crypto' },
    'ETH/USD': { base: 'ETH', quote: 'USD', pipSize: 0.1,    price: 3500,    category: 'crypto' }
  };

  // Taux de conversion par défaut (approximatifs — l'utilisateur peut surcharger)
  const FX_RATES_EUR = {
    'USD': 1.08,  // 1 EUR = 1.08 USD
    'GBP': 0.85,
    'JPY': 167,
    'CHF': 0.98,
    'CAD': 1.46,
    'AUD': 1.64,
    'NZD': 1.80,
    'EUR': 1.00
  };

  /**
   * Calcule la valeur d'un pip pour une taille de position donnée,
   * convertie en devise du compte.
   *
   * @param {Object} p
   * @param {string} p.pair        Ex: 'EUR/USD'
   * @param {number} p.lotSize     Taille en unités (ex: 100000 = 1 lot standard)
   * @param {string} p.accountCurr Devise du compte: 'EUR' | 'USD'
   * @param {Object} [p.customRates] Taux de change personnalisés {USD: 1.08, ...}
   *
   * @returns {Object} { pipValueQuote, pipValueAccount, pair, lotSize }
   */
  function pipValue(p) {
    const pair = PAIRS[p.pair];
    if (!pair) throw new Error('Paire inconnue : ' + p.pair);

    const lotSize = num(p.lotSize, 100000);
    const accountCurr = (p.accountCurr || 'EUR').toUpperCase();
    const rates = Object.assign({}, FX_RATES_EUR, p.customRates || {});

    // 1. Pip value en devise QUOTE (formule universelle)
    const pipValueQuote = pair.pipSize * lotSize;

    // 2. Conversion vers devise du compte
    let pipValueAccount;
    if (pair.quote === accountCurr) {
      pipValueAccount = pipValueQuote;
    } else if (accountCurr === 'EUR') {
      // 1 unité quote = 1 / rate(EUR→quote) EUR
      const rate = rates[pair.quote];
      if (!rate) throw new Error('Taux EUR→' + pair.quote + ' manquant');
      pipValueAccount = pipValueQuote / rate;
    } else if (accountCurr === 'USD') {
      // Conversion via EUR comme pivot, ou direct si quote est USD
      if (pair.quote === 'USD') {
        pipValueAccount = pipValueQuote;
      } else {
        // quote → EUR → USD
        const quoteToEur = 1 / (rates[pair.quote] || 1);
        const eurToUsd = rates['USD'] || 1.08;
        pipValueAccount = pipValueQuote * quoteToEur * eurToUsd;
      }
    } else {
      pipValueAccount = pipValueQuote;
    }

    return {
      pair: p.pair,
      lotSize: lotSize,
      pipValueQuote: pipValueQuote,
      pipValueAccount: pipValueAccount,
      quoteCurrency: pair.quote,
      accountCurrency: accountCurr,
      pipSize: pair.pipSize
    };
  }

  /**
   * Calcule la taille de position optimale pour un risque donné.
   * Le trader sait : "Je risque 1 % de mon capital, mon stop est à 30 pips,
   * combien de lots dois-je prendre ?"
   *
   * @param {Object} p
   * @param {string} p.pair          Ex: 'EUR/USD'
   * @param {number} p.balance       Capital total du compte (en devise compte)
   * @param {number} p.riskPct       % du capital à risquer (ex: 1 = 1 %)
   * @param {number} p.stopPips      Distance du stop loss en pips
   * @param {string} p.accountCurr   'EUR' | 'USD'
   * @param {Object} [p.customRates]
   *
   * @returns {Object} { riskAmount, lotSize, pipValuePerLot, units, microLots, miniLots, standardLots }
   */
  function positionSize(p) {
    const balance = num(p.balance, 10000);
    const riskPct = num(p.riskPct, 1) / 100;
    const stopPips = num(p.stopPips, 30);

    if (stopPips <= 0) {
      return { error: 'Le stop loss en pips doit être > 0' };
    }
    if (balance <= 0) {
      return { error: 'Le capital doit être > 0' };
    }

    const riskAmount = balance * riskPct;

    // Pip value pour 1 lot standard (100 000 unités)
    const pv = pipValue({
      pair: p.pair,
      lotSize: 100000,
      accountCurr: p.accountCurr,
      customRates: p.customRates
    });

    const pipValuePerStandardLot = pv.pipValueAccount;

    // Taille position = risque / (pips × pip value par lot)
    const lotsNeeded = riskAmount / (stopPips * pipValuePerStandardLot);
    const units = Math.round(lotsNeeded * 100000);

    return {
      pair: p.pair,
      riskAmount: riskAmount,
      stopPips: stopPips,
      pipValuePerLot: pipValuePerStandardLot,
      pipValuePerUnit: pipValuePerStandardLot / 100000,
      lotSize: lotsNeeded,
      standardLots: lotsNeeded,
      miniLots: lotsNeeded * 10,
      microLots: lotsNeeded * 100,
      units: units,
      accountCurrency: pv.accountCurrency,
      // Risque ré-évalué avec la taille effective
      effectiveRisk: stopPips * lotsNeeded * pipValuePerStandardLot
    };
  }

  /**
   * Calcule le P&L théorique d'un trade.
   *
   * @param {Object} p
   * @param {string} p.pair
   * @param {string} p.direction 'long' | 'short'
   * @param {number} p.lotSize en unités
   * @param {number} p.entryPrice
   * @param {number} p.exitPrice
   * @param {string} p.accountCurr
   *
   * @returns {Object} { pips, profitQuote, profitAccount }
   */
  function tradePnL(p) {
    const pair = PAIRS[p.pair];
    if (!pair) throw new Error('Paire inconnue : ' + p.pair);

    const dir = p.direction === 'short' ? -1 : 1;
    const lots = num(p.lotSize, 100000);
    const entry = num(p.entryPrice, pair.price);
    const exit  = num(p.exitPrice, pair.price);

    const moveAbsolute = (exit - entry) * dir;
    const pips = moveAbsolute / pair.pipSize;
    const profitQuote = moveAbsolute * lots;

    const pv = pipValue({
      pair: p.pair,
      lotSize: lots,
      accountCurr: p.accountCurr,
      customRates: p.customRates
    });
    const profitAccount = pips * pv.pipValueAccount;

    return {
      pair: p.pair,
      direction: p.direction || 'long',
      pips: pips,
      profitQuote: profitQuote,
      profitAccount: profitAccount,
      pipValueAccount: pv.pipValueAccount,
      quoteCurrency: pair.quote,
      accountCurrency: pv.accountCurrency
    };
  }

  // ─── Helpers ────────────────────────────────────────────
  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  const api = { pipValue, positionSize, tradePnL, PAIRS, FX_RATES_EUR };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.PIPS = api;
  }

})(typeof window !== 'undefined' ? window : global);
