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
    // Exotiques (carry trade)
    'USD/MXN': { base: 'USD', quote: 'MXN', pipSize: 0.0001, price: 17.00,  category: 'forex_exotic' },
    'USD/TRY': { base: 'USD', quote: 'TRY', pipSize: 0.0001, price: 32.00,  category: 'forex_exotic' },
    'USD/ZAR': { base: 'USD', quote: 'ZAR', pipSize: 0.0001, price: 18.50,  category: 'forex_exotic' },
    // Métaux précieux & énergie
    'XAU/USD': { base: 'XAU', quote: 'USD', pipSize: 0.01,   price: 2400.00, category: 'metal' },
    'XAG/USD': { base: 'XAG', quote: 'USD', pipSize: 0.001,  price: 28.00,   category: 'metal' },
    'XPT/USD': { base: 'XPT', quote: 'USD', pipSize: 0.01,   price: 980.00,  category: 'metal' },  // Platine
    'WTI':     { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 72.00,   category: 'commodity' }, // Pétrole WTI
    'BRENT':   { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 76.00,   category: 'commodity' }, // Pétrole Brent
    'NATGAS':  { base: 'USD', quote: 'USD', pipSize: 0.001,  price: 2.85,    category: 'commodity' }, // Gaz naturel
    // Indices CFD (1 pip = 1 point)
    'US30':    { base: 'USD', quote: 'USD', pipSize: 1.0,    price: 39000,   category: 'index' }, // Dow
    'NAS100':  { base: 'USD', quote: 'USD', pipSize: 1.0,    price: 17500,   category: 'index' }, // Nasdaq
    'SPX500':  { base: 'USD', quote: 'USD', pipSize: 0.1,    price: 5200,    category: 'index' }, // S&P 500
    'GER40':   { base: 'EUR', quote: 'EUR', pipSize: 1.0,    price: 18200,   category: 'index' }, // DAX
    'FRA40':   { base: 'EUR', quote: 'EUR', pipSize: 1.0,    price: 7500,    category: 'index' }, // CAC 40
    'UK100':   { base: 'GBP', quote: 'GBP', pipSize: 1.0,    price: 8100,    category: 'index' }, // FTSE 100
    'JPN225':  { base: 'JPY', quote: 'JPY', pipSize: 1.0,    price: 38000,   category: 'index' }, // Nikkei
    // Actions US (CFD ou direct via broker)
    'AAPL':    { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 190.00,  category: 'stock' },
    'MSFT':    { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 420.00,  category: 'stock' },
    'TSLA':    { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 250.00,  category: 'stock' },
    'NVDA':    { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 130.00,  category: 'stock' },
    'AMZN':    { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 185.00,  category: 'stock' },
    'GOOGL':   { base: 'USD', quote: 'USD', pipSize: 0.01,   price: 175.00,  category: 'stock' },
    // Crypto (1 pip = 0.01 sur BTC, 0.001 sur ETH)
    'BTC/USD': { base: 'BTC', quote: 'USD', pipSize: 1.0,    price: 95000,   category: 'crypto' },
    'ETH/USD': { base: 'ETH', quote: 'USD', pipSize: 0.1,    price: 3500,    category: 'crypto' },
    'SOL/USD': { base: 'SOL', quote: 'USD', pipSize: 0.01,   price: 180.00,  category: 'crypto' },
    'BNB/USD': { base: 'BNB', quote: 'USD', pipSize: 0.01,   price: 620.00,  category: 'crypto' },
    'XRP/USD': { base: 'XRP', quote: 'USD', pipSize: 0.0001, price: 2.40,    category: 'crypto' },
    'DOGE/USD':{ base: 'DOGE',quote: 'USD', pipSize: 0.00001,price: 0.18,    category: 'crypto' },
    'ADA/USD': { base: 'ADA', quote: 'USD', pipSize: 0.0001, price: 0.90,    category: 'crypto' },
    'AVAX/USD':{ base: 'AVAX',quote: 'USD', pipSize: 0.001,  price: 36.00,   category: 'crypto' }
  };

  // ─── Profils brokers ──────────────────────────────────────
  // Frais typiques observés en mai 2026. Le user peut surcharger.
  const BROKERS = {
    'custom':         { name: 'Personnalisé',          spreadPips: 1.5,  commType: 'perlot', commValue: 7,   swapPips: -0.5, note: 'À paramétrer' },
    'ibkr':           { name: 'Interactive Brokers',   spreadPips: 0.2,  commType: 'perlot', commValue: 2,   swapPips: -0.3, note: 'ECN — spread minuscule, commission par lot' },
    'tradeRepublic':  { name: 'Trade Republic',        spreadPips: 0,    commType: 'fixed',  commValue: 1,   swapPips: 0,    note: '1 € fixe — pas de spread artificiel' },
    'saxo':           { name: 'Saxo Bank',             spreadPips: 0.8,  commType: 'fixed',  commValue: 0,   swapPips: -0.4, note: 'Spread inclus, 0 € commission' },
    'degiro':         { name: 'Degiro / Flatex',       spreadPips: 1.0,  commType: 'fixed',  commValue: 2,   swapPips: -0.5, note: 'Forfait par ordre' },
    'boursoBank':     { name: 'BoursoBank',            spreadPips: 1.5,  commType: 'fixed',  commValue: 1.99,swapPips: -0.6, note: 'Spread légèrement plus large' },
    'bourseDirect':   { name: 'Bourse Direct',         spreadPips: 1.2,  commType: 'fixed',  commValue: 0.99,swapPips: -0.4, note: 'CFD compétitif' },
    'xtb':            { name: 'XTB',                   spreadPips: 0.5,  commType: 'fixed',  commValue: 0,   swapPips: -0.5, note: 'Spread variable, 0 € commission' },
    'etoro':          { name: 'eToro',                 spreadPips: 2.0,  commType: 'fixed',  commValue: 0,   swapPips: -0.8, note: 'Spread plus large, frais cachés' }
  };

  // ─── Profils traders preset ──────────────────────────────
  const TRADER_PROFILES = {
    'debutant':   { name: 'Débutant prudent',     riskPct: 0.5, rrRatio: 2,    stopPct: 5,  numTrades: 50,  leverage: 5,  note: 'Maximum 0.5 % par trade, R/R 1:2' },
    'conservateur':{ name: 'Conservateur',         riskPct: 1,   rrRatio: 2,    stopPct: 4,  numTrades: 100, leverage: 10, note: 'Règle standard 1 % par trade' },
    'agressif':   { name: 'Trader agressif',      riskPct: 2,   rrRatio: 1.5,  stopPct: 3,  numTrades: 200, leverage: 20, note: '2 % par trade, R/R modéré' },
    'scalper':    { name: 'Scalper',              riskPct: 0.5, rrRatio: 1,    stopPct: 0.5,numTrades: 1000,leverage: 30, note: 'Beaucoup de trades, petits gains' },
    'swing':      { name: 'Swing trader',         riskPct: 1.5, rrRatio: 3,    stopPct: 8,  numTrades: 80,  leverage: 5,  note: 'Peu de trades, gros R/R asymétrique' }
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

  const api = { pipValue, positionSize, tradePnL, PAIRS, FX_RATES_EUR, BROKERS, TRADER_PROFILES };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.PIPS = api;
  }

})(typeof window !== 'undefined' ? window : global);
