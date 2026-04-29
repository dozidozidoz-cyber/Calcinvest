/* ============================================================
   CalcInvest — Calc DCA Crypto (CORE, pure)
   DCA sur cryptomonnaies : BTC, ETH, XRP, BNB, SOL
   ZÉRO accès au DOM. Portable Node.js / tests.
   ============================================================ */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Helpers internes                                                      */
  /* ------------------------------------------------------------------ */

  function monthsBetween(startYYYYMM, endYYYYMM) {
    const [sy, sm] = startYYYYMM.split('-').map(Number);
    const [ey, em] = endYYYYMM.split('-').map(Number);
    return (ey - sy) * 12 + (em - sm);
  }

  function addMonths(yyyymm, n) {
    const [y, m] = yyyymm.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function priceAt(prices, start, yyyymm) {
    const idx = monthsBetween(start, yyyymm);
    if (idx < 0 || idx >= prices.length) return null;
    return prices[idx];
  }

  /**
   * Trouve l'indice correspondant à une date YYYY-MM dans les données.
   */
  function indexForDate(startYYYYMM, yyyymm) {
    return monthsBetween(startYYYYMM, yyyymm);
  }

  /* ------------------------------------------------------------------ */
  /* calcCryptoDCA — simulation principale                                */
  /* ------------------------------------------------------------------ */
  /**
   * @param {object} p
   *   p.prices        {number[]}  Prix mensuels de clôture
   *   p.dataStart     {string}    'YYYY-MM' du premier prix
   *   p.startDate     {string}    'YYYY-MM' début de l'investissement
   *   p.endDate       {string}    'YYYY-MM' fin (inclus) — null = dernier point
   *   p.initialAmount {number}    Investissement initial (€/$ une seule fois)
   *   p.monthlyAmount {number}    Versement mensuel
   *   p.feesPct       {number}    Frais par transaction (%/100 → ex: 0.1 pour 0.1%)
   *   p.taxRate       {number}    Taux d'imposition sur PV (30 pour flat tax FR)
   */
  function calcCryptoDCA(p) {
    const prices      = p.prices;
    const dataStart   = p.dataStart;
    const startDate   = p.startDate   || dataStart;
    const endDate     = p.endDate     || addMonths(dataStart, prices.length - 1);
    const initial     = Math.max(0, p.initialAmount || 0);
    const monthly     = Math.max(0, p.monthlyAmount || 0);
    const feesPct     = (p.feesPct  || 0) / 100;
    const taxRate     = (p.taxRate  || 0) / 100;

    const startIdx    = Math.max(0, indexForDate(dataStart, startDate));
    const endIdx      = Math.min(prices.length - 1, indexForDate(dataStart, endDate));

    if (startIdx > endIdx) return null;

    let coins         = 0;       // unités crypto accumulées
    let totalInvested = 0;       // € investis
    let totalFees     = 0;       // cumul frais

    const monthly_data = [];    // un point par mois

    for (let i = startIdx; i <= endIdx; i++) {
      const price = prices[i];
      if (price == null || price <= 0) continue;

      const monthDate = addMonths(dataStart, i);
      let invest = i === startIdx ? initial + monthly : monthly;

      // Frais sur l'achat
      const fees       = invest * feesPct;
      const netInvest  = invest - fees;

      // Achat
      coins         += netInvest / price;
      totalInvested += invest;
      totalFees     += fees;

      const portfolioValue = coins * price;
      const pnl            = portfolioValue - totalInvested;
      const pnlPct         = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

      monthly_data.push({
        date:       monthDate,
        price,
        invested:   totalInvested,
        coins,
        value:      portfolioValue,
        pnl,
        pnlPct
      });
    }

    if (monthly_data.length === 0) return null;

    const last          = monthly_data[monthly_data.length - 1];
    const finalValue    = last.value;
    const finalInvested = last.invested;
    const finalPnL      = finalValue - finalInvested;
    const finalPnLPct   = finalInvested > 0 ? (finalPnL / finalInvested) * 100 : 0;

    // CAGR
    const years = monthly_data.length / 12;
    const cagr  = finalInvested > 0 && years > 0
      ? (Math.pow(finalValue / finalInvested, 1 / years) - 1) * 100
      : 0;

    // Meilleur/pire mois
    let bestMonth  = null, worstMonth = null;
    for (let i = 1; i < monthly_data.length; i++) {
      const prev = monthly_data[i - 1];
      const curr = monthly_data[i];
      const ret  = prev.value > 0 ? ((curr.value - prev.value) / prev.value) * 100 : 0;
      if (bestMonth  === null || ret > bestMonth.ret)  bestMonth  = { date: curr.date, ret };
      if (worstMonth === null || ret < worstMonth.ret) worstMonth = { date: curr.date, ret };
    }

    // Fiscalité flat tax
    const taxDue      = finalPnL > 0 ? finalPnL * taxRate : 0;
    const netAfterTax = finalValue - taxDue;

    // Prix moyen d'acquisition (DCA price)
    const avgBuyPrice = last.coins > 0 ? finalInvested / last.coins : 0;

    // Multiplier
    const multiplier = finalInvested > 0 ? finalValue / finalInvested : 1;

    return {
      monthly_data,
      finalValue, finalInvested, finalPnL, finalPnLPct,
      cagr, multiplier, totalFees, avgBuyPrice,
      taxDue, netAfterTax,
      bestMonth, worstMonth,
      months: monthly_data.length
    };
  }

  /* ------------------------------------------------------------------ */
  /* computeYearlyReturns                                                  */
  /* ------------------------------------------------------------------ */
  /**
   * Retourne les rendements annuels du prix de l'actif (pas du portfolio DCA).
   * Utile pour le bar chart A02.
   */
  function computeYearlyReturns(prices, dataStart, startDate, endDate) {
    const si = Math.max(0, indexForDate(dataStart, startDate));
    const ei = Math.min(prices.length - 1, indexForDate(dataStart, endDate));

    const byYear = {};
    for (let i = si; i <= ei; i++) {
      const date = addMonths(dataStart, i);
      const year = date.split('-')[0];
      if (!byYear[year]) byYear[year] = { first: prices[i], last: prices[i] };
      else byYear[year].last = prices[i];
    }

    return Object.entries(byYear).map(([year, { first, last }]) => ({
      year: parseInt(year),
      ret: first > 0 ? ((last - first) / first) * 100 : 0,
      startPrice: first,
      endPrice: last
    })).sort((a, b) => a.year - b.year);
  }

  /* ------------------------------------------------------------------ */
  /* computeDrawdown                                                       */
  /* ------------------------------------------------------------------ */
  /**
   * Calcule la série de drawdown (% depuis le plus haut récent).
   * Retourne aussi max drawdown et sa durée de recovery.
   */
  function computeDrawdown(monthly_data) {
    if (!monthly_data || monthly_data.length === 0) return null;

    let peak         = monthly_data[0].value;
    let maxDD        = 0;
    let maxDDStart   = null;
    let maxDDEnd     = null;
    let ddStart      = null;
    let recoveryTime = null;
    let currentDDTime = 0;

    const series = monthly_data.map((pt, i) => {
      if (pt.value >= peak) {
        if (ddStart !== null) {
          // Recovery
          const dur = i - ddStart;
          if (recoveryTime === null || dur > currentDDTime) {
            currentDDTime = dur;
          }
        }
        peak    = pt.value;
        ddStart = null;
      } else {
        if (ddStart === null) ddStart = i;
      }

      const dd = peak > 0 ? ((pt.value - peak) / peak) * 100 : 0;

      if (dd < maxDD) {
        maxDD      = dd;
        maxDDEnd   = pt.date;
        maxDDStart = monthly_data[ddStart || 0].date;
      }

      return { date: pt.date, value: pt.value, peak, drawdown: dd };
    });

    // Drawdowns > 50%
    let deepDrawdowns = 0;
    let inDeep        = false;
    series.forEach((pt) => {
      if (pt.drawdown < -50 && !inDeep) { deepDrawdowns++; inDeep = true; }
      else if (pt.drawdown >= -50) inDeep = false;
    });

    return { series, maxDD, maxDDStart, maxDDEnd, deepDrawdowns };
  }

  /* ------------------------------------------------------------------ */
  /* computeRollingVolatility                                              */
  /* ------------------------------------------------------------------ */
  /**
   * Volatilité glissante annualisée sur les prix.
   * windows: tableau de nombres de mois [3, 6, 12]
   */
  function computeRollingVolatility(prices, dataStart, startDate, endDate, windows) {
    windows = windows || [3, 6, 12];
    const si = Math.max(0, indexForDate(dataStart, startDate));
    const ei = Math.min(prices.length - 1, indexForDate(dataStart, endDate));

    // Rendements mensuels logarithmiques
    const dates   = [];
    const logRets = [];
    for (let i = si + 1; i <= ei; i++) {
      if (prices[i] > 0 && prices[i - 1] > 0) {
        logRets.push(Math.log(prices[i] / prices[i - 1]));
        dates.push(addMonths(dataStart, i));
      }
    }

    // Volatilité annualisée = stddev(logRets_window) * sqrt(12)
    const result = {};
    windows.forEach((w) => {
      result[w] = dates.map((date, i) => {
        if (i < w - 1) return { date, vol: null };
        const slice  = logRets.slice(i - w + 1, i + 1);
        const mean   = slice.reduce((s, v) => s + v, 0) / w;
        const vari   = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / (w - 1);
        const volAnn = Math.sqrt(vari * 12) * 100;
        return { date, vol: volAnn };
      });
    });

    // Volatilité actuelle (dernière valeur de la fenêtre 12m)
    const last12 = result[12] ? result[12].filter((p) => p.vol != null) : [];
    const currentVol = last12.length > 0 ? last12[last12.length - 1].vol : null;

    // Volatilité historique moyenne (12m)
    const histVol = last12.length > 0
      ? last12.reduce((s, p) => s + p.vol, 0) / last12.length
      : null;

    return { series: result, currentVol, histVol };
  }

  /* ------------------------------------------------------------------ */
  /* detectCycles                                                          */
  /* ------------------------------------------------------------------ */
  /**
   * Détecte les cycles bull/bear sur les prix.
   * Bull : hausse de +50% depuis un creux
   * Bear : baisse de -30% depuis un sommet
   * Retourne un tableau de cycles avec type, date début/fin, perf.
   */
  function detectCycles(prices, dataStart, startDate, endDate) {
    const si = Math.max(0, indexForDate(dataStart, startDate));
    const ei = Math.min(prices.length - 1, indexForDate(dataStart, endDate));

    const cycles = [];

    // Déterminer la phase initiale : regarder les 12 premiers mois
    // Si le prix chute de >20% avant de monter de >20% → bear ; sinon → bull
    let initPhase = 'bull';
    const initPrice = prices[si];
    for (let k = si + 1; k <= Math.min(si + 12, ei); k++) {
      const chg = initPrice > 0 ? (prices[k] - initPrice) / initPrice : 0;
      if (chg <= -0.2) { initPhase = 'bear'; break; }
      if (chg >= 0.2)  { initPhase = 'bull'; break; }
    }

    let phase     = initPhase;
    let phaseStart = si;
    let extremum   = prices[si];  // track running peak or trough

    for (let i = si + 1; i <= ei; i++) {
      const p     = prices[i];
      const change = extremum > 0 ? (p - extremum) / extremum : 0;

      if (phase === 'bull') {
        if (p > extremum) extremum = p;
        if (change < -0.3) {
          // Switch to bear
          cycles.push({
            type:   'bull',
            start:  addMonths(dataStart, phaseStart),
            end:    addMonths(dataStart, i),
            startPrice: prices[phaseStart],
            endPrice:   prices[i],
            ret:    prices[phaseStart] > 0 ? (prices[i] - prices[phaseStart]) / prices[phaseStart] * 100 : 0,
            months: i - phaseStart
          });
          phase      = 'bear';
          phaseStart = i;
          extremum   = p;
        }
      } else {
        if (p < extremum) extremum = p;
        if (change > 0.5) {
          // Switch to bull
          cycles.push({
            type:   'bear',
            start:  addMonths(dataStart, phaseStart),
            end:    addMonths(dataStart, i),
            startPrice: prices[phaseStart],
            endPrice:   prices[i],
            ret:    prices[phaseStart] > 0 ? (prices[i] - prices[phaseStart]) / prices[phaseStart] * 100 : 0,
            months: i - phaseStart
          });
          phase      = 'bull';
          phaseStart = i;
          extremum   = p;
        }
      }
    }

    // Dernier cycle en cours
    if (phaseStart < ei) {
      cycles.push({
        type:   phase,
        start:  addMonths(dataStart, phaseStart),
        end:    addMonths(dataStart, ei),
        startPrice: prices[phaseStart],
        endPrice:   prices[ei],
        ret:    prices[phaseStart] > 0 ? (prices[ei] - prices[phaseStart]) / prices[phaseStart] * 100 : 0,
        months: ei - phaseStart,
        current: true
      });
    }

    return cycles;
  }

  /* ------------------------------------------------------------------ */
  /* calcLumpSumVsDCA                                                      */
  /* ------------------------------------------------------------------ */
  /**
   * Compare deux stratégies avec le même montant total investi :
   * - Lump Sum : tout au début
   * - DCA : versement mensuel étalé sur la même durée
   * Retourne la série mensuelle pour les deux + stats finales.
   */
  function calcLumpSumVsDCA(p) {
    const prices    = p.prices;
    const dataStart = p.dataStart;
    const startDate = p.startDate || dataStart;
    const endDate   = p.endDate   || addMonths(dataStart, prices.length - 1);

    const si = Math.max(0, indexForDate(dataStart, startDate));
    const ei = Math.min(prices.length - 1, indexForDate(dataStart, endDate));
    const n  = ei - si + 1;
    if (n <= 0) return null;

    const monthly   = Math.max(0, p.monthlyAmount || 0);
    const totalDCA  = monthly * n;

    // --- DCA ---
    const dcaResult = calcCryptoDCA({ ...p, startDate, endDate, initialAmount: 0, monthlyAmount: monthly });

    // --- Lump Sum (même montant total, tout dès le départ) ---
    const lsResult  = calcCryptoDCA({ ...p, startDate, endDate, initialAmount: totalDCA, monthlyAmount: 0 });

    if (!dcaResult || !lsResult) return null;

    return {
      dca:       dcaResult,
      lumpSum:   lsResult,
      totalAmount: totalDCA,
      winner:    dcaResult.finalValue >= lsResult.finalValue ? 'dca' : 'lumpsum',
      difference: Math.abs(dcaResult.finalValue - lsResult.finalValue),
      diffPct:    lsResult.finalValue > 0
        ? Math.abs(dcaResult.finalValue - lsResult.finalValue) / lsResult.finalValue * 100
        : 0
    };
  }

  /* ------------------------------------------------------------------ */
  /* calcMultiCryptoComp                                                   */
  /* ------------------------------------------------------------------ */
  /**
   * Calcule le DCA sur plusieurs cryptos avec les mêmes paramètres.
   * Retourne un tableau de résultats, un par crypto.
   * @param {object} baseParams    — params communs (monthly, fees, etc.)
   * @param {Array}  cryptoDataArr — [{ id, name, color, prices, dataStart, halvings? }]
   */
  function calcMultiCryptoComp(baseParams, cryptoDataArr) {
    // Fenêtre commune : intersect de toutes les périodes disponibles
    let commonStart = null;
    let commonEnd   = null;

    cryptoDataArr.forEach((c) => {
      const cEnd = addMonths(c.dataStart, c.prices.length - 1);
      if (commonStart === null || c.dataStart > commonStart) commonStart = c.dataStart;
      if (commonEnd   === null || cEnd         < commonEnd)   commonEnd   = cEnd;
    });

    const start = baseParams.startDate || commonStart;
    const end   = baseParams.endDate   || commonEnd;

    return cryptoDataArr.map((c) => {
      const r = calcCryptoDCA({
        ...baseParams,
        prices:    c.prices,
        dataStart: c.dataStart,
        startDate: start < c.dataStart ? c.dataStart : start,
        endDate:   end
      });
      return {
        id:     c.id,
        name:   c.name,
        color:  c.color,
        result: r,
        start,
        end
      };
    }).filter((c) => c.result !== null);
  }

  /* ------------------------------------------------------------------ */
  /* DeFi yield strategies                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Taux DeFi historiques moyens 2022-2026 (données indicatives).
   * Organisés par type de stratégie + par actif pour le staking.
   */
  var DEFI_YIELDS = {
    staking: {
      btc: { apy: 1.5, label: 'Lending BTC (wrapped, Aave)' },
      eth: { apy: 3.5, label: 'Staking ETH liquid (Lido)' },
      bnb: { apy: 4.0, label: 'Staking BNB (native)' },
      sol: { apy: 6.5, label: 'Staking SOL (liquid)' },
      xrp: { apy: 2.0, label: 'Lending XRP (Nexo/Aave)' }
    },
    lending:  { apy: 5.0, label: 'Lending stablecoins (Aave/Compound)', risk: 'Dépeg stablecoin · Smart contract' },
    lp:       { apy: 8.0, label: 'Liquidity Providing (Uniswap V3)',    risk: 'Perte impermanente · Smart contract' }
  };

  /**
   * Simule 4 stratégies DeFi sur un résultat DCA existant.
   *
   * @param {Array}  monthlyData  r.monthly_data de calcCryptoDCA
   * @param {string} assetId      'btc' | 'eth' | 'sol' | 'bnb' | 'xrp'
   * @param {Object} [opts]       override APY : { stakingApy, lendingApy, lpApy, lendingStablePct }
   *
   * @returns {{ scenarios, hodlFinal }}
   *   scenarios: [{ id, label, color, yearly, finalValue, yieldEarned, apy, risk }]
   */
  function computeDeFiStrategies(monthlyData, assetId, opts) {
    opts = opts || {};
    var asset   = assetId || 'eth';
    var stInfo  = DEFI_YIELDS.staking[asset] || DEFI_YIELDS.staking.eth;
    var stakingAPR  = ((opts.stakingApy  != null ? opts.stakingApy  : stInfo.apy)          ) / 100 / 12;
    var lendingAPR  = ((opts.lendingApy  != null ? opts.lendingApy  : DEFI_YIELDS.lending.apy)) / 100 / 12;
    var lpAPR       = ((opts.lpApy       != null ? opts.lpApy       : DEFI_YIELDS.lp.apy)     ) / 100 / 12;
    var stablePct   =  (opts.lendingStablePct != null ? opts.lendingStablePct : 30) / 100;
    var ilAnnual    = 0.03;   // ~3 % IL/an estimé pour paire volatile/stable
    var ilMonthly   = ilAnnual / 12;

    var cumStaking = 0;
    var cumLending = 0;
    var cumLpFees  = 0;
    var cumIL      = 0;

    var hodlMonthly    = [];
    var stakingMonthly = [];
    var lendingMonthly = [];
    var lpMonthly      = [];

    for (var i = 0; i < monthlyData.length; i++) {
      var m = monthlyData[i];
      var hodlVal = m.value;

      // Staking : rendement composé sur (portfolio + cumul rewards)
      cumStaking += (hodlVal + cumStaking) * stakingAPR;

      // Lending : yield sur la fraction stablecoin (stablePct du capital investi)
      // Les stables ne suivent pas le prix → valeur = capital stable + yield
      cumLending += m.invested * stablePct * lendingAPR;

      // LP : frais sur la totalité du portfolio, moins perte impermanente estimée
      cumLpFees += hodlVal * lpAPR;
      cumIL     += hodlVal * ilMonthly;

      hodlMonthly.push(hodlVal);
      stakingMonthly.push(hodlVal + cumStaking);
      // Lending : (1 - stablePct) suit le prix + portion stable au coût + yield
      lendingMonthly.push(hodlVal * (1 - stablePct) + m.invested * stablePct + cumLending);
      lpMonthly.push(hodlVal + Math.max(0, cumLpFees - cumIL));
    }

    var n    = monthlyData.length;
    var yrs  = Math.ceil(n / 12);

    function toYearly(vals) {
      var out = [];
      for (var y = 1; y <= yrs; y++) {
        var idx = Math.min(y * 12 - 1, n - 1);
        out.push({ year: y, value: vals[idx] });
      }
      return out;
    }

    var fi = n - 1;
    var stakingApyVal = opts.stakingApy != null ? opts.stakingApy : stInfo.apy;
    var lendingApyVal = opts.lendingApy != null ? opts.lendingApy : DEFI_YIELDS.lending.apy;
    var lpApyVal      = opts.lpApy      != null ? opts.lpApy      : DEFI_YIELDS.lp.apy;

    return {
      scenarios: [
        {
          id: 'hodl', label: 'HODL pur',
          color: '#60A5FA',
          yearly: toYearly(hodlMonthly),
          finalValue: hodlMonthly[fi],
          yieldEarned: 0,
          apy: 0,
          risk: '—'
        },
        {
          id: 'staking', label: stInfo.label,
          color: '#34D399',
          yearly: toYearly(stakingMonthly),
          finalValue: stakingMonthly[fi],
          yieldEarned: cumStaking,
          apy: stakingApyVal,
          risk: DEFI_YIELDS.staking[asset] ? 'Slashing · Smart contract' : 'Smart contract'
        },
        {
          id: 'lending', label: DEFI_YIELDS.lending.label,
          color: '#FBBF24',
          yearly: toYearly(lendingMonthly),
          finalValue: lendingMonthly[fi],
          yieldEarned: cumLending,
          apy: lendingApyVal,
          risk: DEFI_YIELDS.lending.risk
        },
        {
          id: 'lp', label: DEFI_YIELDS.lp.label,
          color: '#F87171',
          yearly: toYearly(lpMonthly),
          finalValue: lpMonthly[fi],
          yieldEarned: Math.max(0, cumLpFees - cumIL),
          apy: lpApyVal,
          risk: DEFI_YIELDS.lp.risk
        }
      ],
      hodlFinal: hodlMonthly[fi]
    };
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                               */
  /* ------------------------------------------------------------------ */
  const mod = {
    calcCryptoDCA,
    computeYearlyReturns,
    computeDrawdown,
    computeRollingVolatility,
    detectCycles,
    calcLumpSumVsDCA,
    calcMultiCryptoComp,
    computeDeFiStrategies,
    DEFI_YIELDS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    global.CalcDCACrypto = mod;
  }
})(typeof window !== 'undefined' ? window : this);
