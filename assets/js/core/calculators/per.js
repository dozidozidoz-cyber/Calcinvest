/* ============================================================
   CalcInvest — Calculator : PER (Plan Épargne Retraite)
   Règles fiscales françaises 2026 :
   - Versement déductible à concurrence de 10 % des revenus pro
     (plafonné à 8 PASS, ~37k€)
   - Économie d'impôt entrée = versement × TMI
   - Sortie capital : versements imposés au barème IR (TMI sortie),
     plus-values en PFU 30 % (12.8 IR + 17.2 PS)
   - Sortie rente : barème IR avec abattement 10 % + PS 17.2 %
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const ENGINE = isNode ? require('../engine') : root.ENGINE;
  const rates = ENGINE.rates;

  const SOCIAL_TAX = 0.172;          // PS sur plus-values et fraction rente
  const RENTE_ABATTEMENT_IR = 0.10;  // Abattement 10 % sur la rente
  const PFU_RATE = 0.30;             // 12.8 IR + 17.2 PS

  /**
   * Simulation principale PER.
   * @param {object} p {
   *   currentAge, retirementAge, currentSavings, monthlyContrib,
   *   annualReturn, inflation, feesPct,
   *   tmiEntree, tmiSortie,
   *   exitMode: 'capital' | 'rente' (par défaut capital)
   * }
   */
  function calcPER(p) {
    const currentAge = p.currentAge || 30;
    const retirementAge = p.retirementAge || 64;
    const years = Math.max(1, retirementAge - currentAge);
    const months = years * 12;

    const monthlyContrib = p.monthlyContrib || 0;
    const annualContrib = monthlyContrib * 12;
    const initialSavings = p.currentSavings || 0;

    const annualReturn = (p.annualReturn || 6) / 100;
    const feesAnnual = (p.feesPct || 0) / 100;
    const netReturn = Math.max(-0.99, annualReturn - feesAnnual);
    const monthlyRate = rates.monthly(netReturn);

    const tmiEntree = (p.tmiEntree || 30) / 100;
    const tmiSortie = (p.tmiSortie || 11) / 100;

    const inflation = (p.inflation || 0) / 100;
    const inflationMonthly = Math.pow(1 + inflation, 1 / 12) - 1;

    // Trajectoire mois par mois
    let value = initialSavings;
    let totalContributed = initialSavings;
    let cumulatedTaxSaving = 0;

    const yearly = [];
    for (let m = 1; m <= months; m++) {
      value = (value + monthlyContrib) * (1 + monthlyRate);
      totalContributed += monthlyContrib;
      // Économie fiscale : sur les versements de l'année (pas l'initial)
      // On l'accumule en simulant un crédit d'impôt versé l'année suivante
      if (m % 12 === 0) {
        const yearlyContribThis = annualContrib;
        const taxSaving = yearlyContribThis * tmiEntree;
        cumulatedTaxSaving += taxSaving;
        const yr = m / 12;
        yearly.push({
          year: yr,
          age: currentAge + yr,
          value: value,
          contributed: totalContributed,
          taxSaving: taxSaving,
          cumTaxSaving: cumulatedTaxSaving
        });
      }
    }

    const finalCapital = value;
    const totalGain = finalCapital - totalContributed;
    const totalContributions = annualContrib * years; // versements seuls (hors initial)

    // ============= Sortie en capital =============
    // Part "versements déductibles" → imposée au barème IR (TMI sortie)
    // Part "plus-values" → PFU 30 %
    // Note simplifiée : on considère initialSavings + contributions = "déductible"
    const baseDeductible = initialSavings + totalContributions;
    const plusValues = Math.max(0, finalCapital - baseDeductible);
    const taxOnDeductibleCapital = baseDeductible * tmiSortie;
    const taxOnGainsCapital = plusValues * PFU_RATE;
    const totalTaxCapital = taxOnDeductibleCapital + taxOnGainsCapital;
    const netCapital = finalCapital - totalTaxCapital;

    // ============= Sortie en rente =============
    // Rente viagère : on calcule une rente théorique sur (95 - retirementAge) ans
    // Simplification : rente annuelle = capital / espérance restante (no actualisation)
    const renteHorizon = Math.max(15, 95 - retirementAge);
    const annualRente = finalCapital / renteHorizon;
    const renteAfterAbattement = annualRente * (1 - RENTE_ABATTEMENT_IR);
    const annualTaxRente = renteAfterAbattement * tmiSortie + annualRente * SOCIAL_TAX;
    const annualNetRente = annualRente - annualTaxRente;
    const monthlyNetRente = annualNetRente / 12;

    // ============= Comparaison sans déduction (CTO équivalent) =============
    // Si on avait investi le MÊME montant net (versement × (1 - tmi)) en CTO
    // Approximation : versement net = monthlyContrib × (1 - tmiEntree)
    const ctoMonthlyNet = monthlyContrib * (1 - tmiEntree);
    let ctoValue = initialSavings * (1 - tmiEntree);
    for (let m = 1; m <= months; m++) {
      ctoValue = (ctoValue + ctoMonthlyNet) * (1 + monthlyRate);
    }
    const ctoContributed = (initialSavings * (1 - tmiEntree)) + ctoMonthlyNet * months;
    const ctoGain = ctoValue - ctoContributed;
    const ctoTax = ctoGain * PFU_RATE; // PFU sur plus-values seulement
    const ctoNet = ctoValue - ctoTax;

    // Pouvoir d'achat
    const realFactor = Math.pow(1 + inflation, years);
    const netCapitalReal = netCapital / realFactor;

    return {
      // Trajectoire
      yearly: yearly,
      years: years,
      // Capitaux bruts
      finalCapital: finalCapital,
      totalContributed: totalContributed,
      totalGain: totalGain,
      // Avantage fiscal entrée
      annualTaxSaving: annualContrib * tmiEntree,
      cumulatedTaxSaving: cumulatedTaxSaving,
      // Sortie capital
      netCapital: netCapital,
      taxOnExit: totalTaxCapital,
      taxBreakdown: {
        onDeductible: taxOnDeductibleCapital,
        onGains: taxOnGainsCapital
      },
      // Sortie rente
      rente: {
        horizonYears: renteHorizon,
        annualGross: annualRente,
        annualNet: annualNetRente,
        monthlyNet: monthlyNetRente,
        annualTax: annualTaxRente
      },
      // Comparaison CTO
      cto: {
        finalValue: ctoValue,
        contributed: ctoContributed,
        gain: ctoGain,
        tax: ctoTax,
        net: ctoNet
      },
      perVsCtoDelta: netCapital - ctoNet,
      // Pouvoir d'achat
      netCapitalReal: netCapitalReal,
      inflation: p.inflation || 0,
      // Paramètres exposés
      tmiEntree: p.tmiEntree || 30,
      tmiSortie: p.tmiSortie || 11
    };
  }

  /**
   * Matrice de sensibilité TMI entrée × TMI sortie.
   * Retourne pour chaque combo le gain net du PER vs CTO.
   */
  function sensitivityMatrix(p, tmiEntreeList, tmiSortieList) {
    tmiEntreeList = tmiEntreeList || [11, 30, 41, 45];
    tmiSortieList = tmiSortieList || [0, 11, 30, 41];
    const rows = tmiEntreeList.map((te) => {
      return {
        tmiEntree: te,
        cells: tmiSortieList.map((ts) => {
          const r = calcPER(Object.assign({}, p, { tmiEntree: te, tmiSortie: ts }));
          return {
            tmiSortie: ts,
            netCapital: r.netCapital,
            ctoNet: r.cto.net,
            delta: r.perVsCtoDelta,
            advantage: r.perVsCtoDelta > 0 ? 'per' : 'cto'
          };
        })
      };
    });
    return { tmiEntreeList, tmiSortieList, rows };
  }

  /**
   * Plafond de déductibilité (10 % du revenu pro net, plafonné 8 PASS).
   * PASS 2026 ≈ 47 100 € → 8 PASS ≈ 376 800 €.
   */
  function calcPlafondDeductible(revenuPro) {
    const PASS_2026 = 47100;
    const max8Pass = 8 * PASS_2026;
    const plafond = Math.min(max8Pass, revenuPro * 0.10);
    return Math.max(4710, plafond); // plancher 10 % PASS
  }

  const mod = {
    calcPER: calcPER,
    sensitivityMatrix: sensitivityMatrix,
    calcPlafondDeductible: calcPlafondDeductible
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.per = mod;
    root.CalcPER = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
