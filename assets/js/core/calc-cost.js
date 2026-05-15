/* ============================================================
   CalcInvest — Core Coûts réels du trade
   Spread · Commission · Swap (overnight) · Break-even pips
   Compound trading projection
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  /**
   * Calcule les coûts complets d'un trade :
   * - Spread (pip × pip value)
   * - Commission broker (forfait ou %)
   * - Swap si tenu N nuits
   * - Total + break-even pips
   *
   * @param {Object} p
   * @param {string} p.pair             ex 'EUR/USD'
   * @param {number} p.lotSize          en unités
   * @param {number} p.spreadPips       spread du broker en pips
   * @param {string} p.commissionType   'fixed' | 'pct' | 'perlot'
   * @param {number} p.commissionValue
   * @param {number} p.swapPipsPerNight swap quotidien en pips (positif/négatif)
   * @param {number} p.nightsHeld       nb de nuits tenues
   * @param {string} p.accountCurr
   *
   * @returns {Object} { spreadCost, commissionCost, swapCost, totalCost,
   *                     breakEvenPips, pipValueAccount }
   */
  function tradeCost(p) {
    if (!global.PIPS) return { error: 'Module PIPS non chargé' };
    const PAIRS = global.PIPS.PAIRS;
    const pair = PAIRS[p.pair];
    if (!pair) return { error: 'Paire inconnue : ' + p.pair };

    const lots         = num(p.lotSize, 100000);
    const spreadPips   = num(p.spreadPips, 1.5);
    const commType     = p.commissionType || 'fixed';
    const commValue    = num(p.commissionValue, 0);
    const swapPips     = num(p.swapPipsPerNight, 0);
    const nights       = Math.max(0, num(p.nightsHeld, 0));
    const accountCurr  = (p.accountCurr || 'EUR').toUpperCase();
    const entryPrice   = num(p.entryPrice, pair.price);

    // Pip value en devise du compte pour la taille demandée
    const pv = global.PIPS.pipValue({
      pair: p.pair, lotSize: lots, accountCurr
    });
    const pipValueAccount = pv.pipValueAccount;

    // 1. Coût du spread
    const spreadCost = spreadPips * pipValueAccount;

    // 2. Commission
    let commissionCost;
    if (commType === 'fixed') {
      commissionCost = commValue; // ex 5 € par trade
    } else if (commType === 'perlot') {
      commissionCost = commValue * (lots / 100000); // ex 7 € par lot standard
    } else if (commType === 'pct') {
      // % du notional (souvent pour stocks/CFD)
      const notionalQuote = lots * entryPrice;
      const conversionRatio = pipValueAccount / pv.pipValueQuote;
      const notionalAccount = notionalQuote * conversionRatio;
      commissionCost = notionalAccount * (commValue / 100);
    } else {
      commissionCost = 0;
    }

    // 3. Swap (peut être positif si long un haut-rendement)
    const swapCost = -swapPips * pipValueAccount * nights; // négatif = coût pour le trader si swapPips négatif convention broker
    // On affiche en valeur absolue le coût ; signe -> savoir si payé ou reçu

    // 4. Total
    const totalCost = spreadCost + commissionCost + Math.abs(Math.min(0, -swapCost)) + Math.max(0, swapCost);
    // Plus simple : on traite swapCost comme un coût net (positif = payé, négatif = reçu)
    const swapNetCost = swapPips < 0 ? Math.abs(swapPips) * pipValueAccount * nights : -swapPips * pipValueAccount * nights;
    const totalNet = spreadCost + commissionCost + swapNetCost;

    // 5. Break-even : combien de pips il faut pour annuler les coûts
    const breakEvenPips = pipValueAccount > 0 ? totalNet / pipValueAccount : 0;

    return {
      pair: p.pair,
      lotSize: lots,
      pipValueAccount,
      accountCurrency: accountCurr,
      spreadCost,
      commissionCost,
      swapCost: swapNetCost,
      swapPaidOrReceived: swapPips < 0 ? 'payé' : (swapPips > 0 ? 'reçu' : 'neutre'),
      totalCost: totalNet,
      breakEvenPips,
      // Détails
      spreadPips,
      nightsHeld: nights,
      commissionType: commType
    };
  }

  /**
   * Projection compound — réinvestissement des gains sur N mois.
   *
   * @param {Object} p
   * @param {number} p.startCapital
   * @param {number} p.monthlyReturnPct   % de gain mensuel cible (ex 2 = 2 %/mois)
   * @param {number} p.months
   * @param {number} [p.monthlyWithdrawal=0]  retrait fixe mensuel (mode "vivre du trading")
   * @param {number} [p.taxRate=0]            taxe en sortie (PFU 30 % = 30)
   */
  function compoundProjection(p) {
    const start  = num(p.startCapital, 10000);
    const ratePm = num(p.monthlyReturnPct, 2) / 100;
    const months = Math.max(1, num(p.months, 12));
    const wd     = num(p.monthlyWithdrawal, 0);
    const tax    = num(p.taxRate, 0) / 100;

    const series = [];
    let cur = start;
    let totalGain = 0;
    let totalWithdrawn = 0;

    for (let m = 0; m <= months; m++) {
      if (m === 0) {
        series.push({ month: 0, balance: cur, gainCumul: 0, withdrawn: 0 });
        continue;
      }
      const gain = cur * ratePm;
      cur += gain;
      totalGain += gain;
      if (wd > 0 && cur > wd) {
        cur -= wd;
        totalWithdrawn += wd;
      }
      series.push({ month: m, balance: cur, gainCumul: totalGain, withdrawn: totalWithdrawn });
    }

    const finalBalance = cur;
    const grossProfit = finalBalance - start + totalWithdrawn;
    const taxAmount = grossProfit > 0 ? grossProfit * tax : 0;
    const netProfit = grossProfit - taxAmount;
    const cagrM = months > 0 ? Math.pow(finalBalance / start, 1 / months) - 1 : 0;
    const cagrAnnualized = Math.pow(1 + cagrM, 12) - 1;

    return {
      series,
      startCapital: start,
      finalBalance,
      totalWithdrawn,
      grossProfit,
      taxAmount,
      netProfit,
      cagrMonthly: cagrM * 100,
      cagrAnnualized: cagrAnnualized * 100,
      months,
      monthlyReturnPct: p.monthlyReturnPct,
      monthlyWithdrawal: wd
    };
  }

  /**
   * Réalité-check : ratio gain / frais.
   * Si la position bouge de N pips, combien me reste-t-il après tous les coûts ?
   */
  function realProfitVsCost(p) {
    const costs = tradeCost(p);
    if (costs.error) return costs;

    const targetPips = num(p.expectedMovePips, 30);
    const grossPnl   = targetPips * costs.pipValueAccount;
    const netPnl     = grossPnl - costs.totalCost;
    const costPct    = grossPnl > 0 ? (costs.totalCost / grossPnl) * 100 : 0;

    return {
      ...costs,
      expectedMovePips: targetPips,
      grossPnl,
      netPnl,
      costPctOfGross: costPct
    };
  }

  const api = { tradeCost, compoundProjection, realProfitVsCost };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.COST = api;
  }

})(typeof window !== 'undefined' ? window : global);
