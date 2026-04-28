/* ============================================================
   CalcInvest — Calculator : PER (Plan Épargne Retraite)
   Règles fiscales françaises 2026 :
   - Versement déductible à concurrence de 10 % des revenus pro
     (plancher 10 % PASS, plafond 8 PASS, ~37k€)
   - Plafond non utilisé reportable sur 3 années suivantes
   - Économie d'impôt entrée = versement déductible × TMI
   - Sortie capital : 2 options
       a) barème IR sur versés + PFU 30 % sur plus-values (défaut)
       b) flat tax 30 % sur tout
   - Sortie rente : barème IR avec abattement 10 % + PS 17.2 %
   - Sortie mixte (X % capital + (100-X) % rente) supportée
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const ENGINE = isNode ? require('../engine') : root.ENGINE;
  const rates = ENGINE.rates;

  const SOCIAL_TAX = 0.172;          // PS sur plus-values et fraction rente
  const RENTE_ABATTEMENT_IR = 0.10;  // Abattement 10 % sur la rente
  const PFU_RATE = 0.30;             // 12.8 IR + 17.2 PS

  /** Profils PER prédéfinis (returns + frais typiques marché 2026). */
  const PROFILES = {
    prudent:   { id: 'prudent',   label: 'Prudent',   annualReturn: 4, feesPct: 1.5, desc: '60 % obligations · pour <10 ans avant retraite' },
    balanced:  { id: 'balanced',  label: 'Équilibré', annualReturn: 6, feesPct: 1.0, desc: '50/50 actions/obligations · 10-20 ans' },
    dynamic:   { id: 'dynamic',   label: 'Dynamique', annualReturn: 8, feesPct: 0.7, desc: '80 % actions · >20 ans avant retraite' }
  };

  /**
   * Calcule la part déductible et l'économie fiscale RÉELLE en tenant
   * compte du plafond et du report 3 ans.
   * @param {number} annualVersement
   * @param {number|null} plafondAnnuel — null si pas de revenu pro fourni → pas de cap
   * @param {number} reportable — plafonds non utilisés des 3 dernières années
   * @param {number} tmiEntreeDecimal
   */
  function computeDeductibleSavings(annualVersement, plafondAnnuel, reportable, tmiEntreeDecimal) {
    const plafond = plafondAnnuel != null ? plafondAnnuel : Infinity;
    const totalDispo = plafond + (reportable || 0);
    const deductible = Math.min(annualVersement, totalDispo);
    const excess = Math.max(0, annualVersement - totalDispo);
    const taxSaving = deductible * tmiEntreeDecimal;
    const usedFromReport = Math.max(0, annualVersement - plafond);
    const newReportable = Math.max(0, (reportable || 0) - usedFromReport) +
                          Math.max(0, plafond - annualVersement);
    return { deductible, excess, taxSaving, newReportable };
  }

  /**
   * Simulation principale PER.
   * @param {object} p {
   *   currentAge, retirementAge, currentSavings, monthlyContrib,
   *   annualReturn, inflation, feesPct,
   *   tmiEntree, tmiSortie,
   *   revenuPro?,           // € — pour calculer le plafond annuel
   *   cumulatedUnused?,     // € — plafond reportable (cumul 3 dernières années)
   *   exitCapitalPct?,      // 0..1 — fraction du capital à sortir en capital (reste = rente). Défaut 1.
   *   exitTaxMethod?,       // 'auto' | 'baremeIR' | 'flatTax' — défaut 'auto' (min des deux)
   *   profileId?            // pass-through, 'prudent' | 'balanced' | 'dynamic' | 'custom'
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

    // ============= Plafond de déduction (avec report 3 ans) =============
    const plafondAnnuel = p.revenuPro ? calcPlafondDeductible(p.revenuPro) : null;
    const initialReportable = p.cumulatedUnused || 0;

    // Trajectoire mois par mois + tracking du report année par année
    let value = initialSavings;
    let totalContributed = initialSavings;
    let cumulatedTaxSaving = 0;
    let cumulatedDeductible = 0;
    let cumulatedExcess = 0;
    let currentReportable = initialReportable;

    const yearly = [];
    for (let m = 1; m <= months; m++) {
      value = (value + monthlyContrib) * (1 + monthlyRate);
      totalContributed += monthlyContrib;
      if (m % 12 === 0) {
        const ds = computeDeductibleSavings(annualContrib, plafondAnnuel, currentReportable, tmiEntree);
        cumulatedTaxSaving += ds.taxSaving;
        cumulatedDeductible += ds.deductible;
        cumulatedExcess += ds.excess;
        currentReportable = ds.newReportable;
        const yr = m / 12;
        yearly.push({
          year: yr,
          age: currentAge + yr,
          value: value,
          contributed: totalContributed,
          taxSaving: ds.taxSaving,
          cumTaxSaving: cumulatedTaxSaving,
          deductibleThisYear: ds.deductible,
          excessThisYear: ds.excess,
          reportableEnd: currentReportable
        });
      }
    }

    const finalCapital = value;
    const totalGain = finalCapital - totalContributed;
    const totalContributions = annualContrib * years; // versements seuls (hors initial)
    const baseDeductible = initialSavings + totalContributions;
    const plusValues = Math.max(0, finalCapital - baseDeductible);

    // ============= Sortie : split capital/rente =============
    const capitalPct = (p.exitCapitalPct != null) ? Math.max(0, Math.min(1, p.exitCapitalPct)) : 1;
    const rentePct = 1 - capitalPct;
    const capitalPart = finalCapital * capitalPct;
    const rentePart = finalCapital * rentePct;

    // -- Imposition sur la part CAPITAL --
    // Méthode A : barème IR sur versés (au prorata) + PFU 30 % sur PV
    const capitalDeductibleFraction = baseDeductible * capitalPct;
    const capitalGainsFraction = plusValues * capitalPct;
    const taxIR_deductible = capitalDeductibleFraction * tmiSortie;
    const taxPFU_gains = capitalGainsFraction * PFU_RATE;
    const exitTaxBaremeIR = taxIR_deductible + taxPFU_gains;
    // Méthode B : flat tax 30 % sur tout le capital part
    const exitTaxFlatTax = capitalPart * PFU_RATE;
    // Choix
    const taxMethodPref = p.exitTaxMethod || 'auto';
    let chosenCapitalTax, chosenMethod;
    if (taxMethodPref === 'flatTax') {
      chosenCapitalTax = exitTaxFlatTax;
      chosenMethod = 'flatTax';
    } else if (taxMethodPref === 'baremeIR') {
      chosenCapitalTax = exitTaxBaremeIR;
      chosenMethod = 'baremeIR';
    } else {
      // auto = min des deux
      if (exitTaxBaremeIR <= exitTaxFlatTax) {
        chosenCapitalTax = exitTaxBaremeIR;
        chosenMethod = 'baremeIR';
      } else {
        chosenCapitalTax = exitTaxFlatTax;
        chosenMethod = 'flatTax';
      }
    }
    const netCapitalPart = capitalPart - chosenCapitalTax;

    // -- Rente sur la part RENTE --
    const renteHorizon = Math.max(15, 95 - retirementAge);
    const annualRente = rentePart > 0 ? rentePart / renteHorizon : 0;
    const renteAfterAbattement = annualRente * (1 - RENTE_ABATTEMENT_IR);
    const annualTaxRente = renteAfterAbattement * tmiSortie + annualRente * SOCIAL_TAX;
    const annualNetRente = annualRente - annualTaxRente;
    const monthlyNetRente = annualNetRente / 12;
    const totalNetRenteOverHorizon = annualNetRente * renteHorizon;

    // Total net après impôts (capital + rente cumulée)
    const totalNetExit = netCapitalPart + totalNetRenteOverHorizon;

    // ============= Comparaison sans déduction (CTO équivalent) =============
    const ctoMonthlyNet = monthlyContrib * (1 - tmiEntree);
    let ctoValue = initialSavings * (1 - tmiEntree);
    for (let m = 1; m <= months; m++) {
      ctoValue = (ctoValue + ctoMonthlyNet) * (1 + monthlyRate);
    }
    const ctoContributed = (initialSavings * (1 - tmiEntree)) + ctoMonthlyNet * months;
    const ctoGain = ctoValue - ctoContributed;
    const ctoTax = ctoGain * PFU_RATE;
    const ctoNet = ctoValue - ctoTax;

    // Pouvoir d'achat
    const realFactor = Math.pow(1 + inflation, years);
    const netCapitalReal = netCapitalPart / realFactor;

    // ============= Plafond de déduction summary =============
    const plafondSummary = plafondAnnuel != null ? {
      annualPlafond: plafondAnnuel,
      initialReportable: initialReportable,
      cumulatedDeductible: cumulatedDeductible,
      cumulatedExcess: cumulatedExcess,
      finalReportable: currentReportable,
      annualVersement: annualContrib,
      isOverPlafond: annualContrib > (plafondAnnuel + initialReportable),
      utilisationRatio: plafondAnnuel > 0 ? Math.min(1, annualContrib / plafondAnnuel) : 0
    } : null;

    return {
      yearly: yearly,
      years: years,
      finalCapital: finalCapital,
      totalContributed: totalContributed,
      totalGain: totalGain,

      // Avantage fiscal entrée (RÉEL, plafonné)
      annualTaxSaving: yearly[0] ? yearly[0].taxSaving : 0,
      cumulatedTaxSaving: cumulatedTaxSaving,
      cumulatedDeductible: cumulatedDeductible,
      cumulatedExcess: cumulatedExcess,
      plafond: plafondSummary,

      // Sortie capital (sur la part capitalPct)
      exitCapitalPct: capitalPct,
      capitalPart: capitalPart,
      netCapital: netCapitalPart,           // net après impôts sur la part capital
      taxOnExit: chosenCapitalTax,           // impôt total sur la part capital
      taxMethod: chosenMethod,                // 'baremeIR' | 'flatTax'
      taxBreakdown: {
        baremeIR: exitTaxBaremeIR,
        flatTax: exitTaxFlatTax,
        onDeductible: taxIR_deductible,
        onGains: taxPFU_gains
      },

      // Rente (sur la part 1 - capitalPct)
      rentePart: rentePart,
      rente: {
        horizonYears: renteHorizon,
        annualGross: annualRente,
        annualNet: annualNetRente,
        monthlyNet: monthlyNetRente,
        annualTax: annualTaxRente,
        totalNetOverHorizon: totalNetRenteOverHorizon
      },

      // Total cumulé sortie (capital immédiat + rente sur l'horizon)
      totalNetExit: totalNetExit,

      // Comparaison CTO
      cto: {
        finalValue: ctoValue,
        contributed: ctoContributed,
        gain: ctoGain,
        tax: ctoTax,
        net: ctoNet
      },
      perVsCtoDelta: netCapitalPart - ctoNet,

      netCapitalReal: netCapitalReal,
      inflation: p.inflation || 0,

      // Pass-through
      tmiEntree: p.tmiEntree || 30,
      tmiSortie: p.tmiSortie || 11,
      profileId: p.profileId || 'custom'
    };
  }

  /**
   * Matrice de sensibilité TMI entrée × TMI sortie.
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
   * PASS 2026 ≈ 47 100 €.
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
    calcPlafondDeductible: calcPlafondDeductible,
    computeDeductibleSavings: computeDeductibleSavings,
    PROFILES: PROFILES
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.per = mod;
    root.CalcPER = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
