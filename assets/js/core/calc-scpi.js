/* ============================================================
   CalcInvest — Core SCPI
   Logique pure, zéro DOM. Testable en Node.js.
   ============================================================
   Modèle: simulation mois par mois d'un investissement SCPI
   avec versements optionnels, revalorisation parts, dividendes,
   fiscalité différenciée selon le régime.

   Régimes supportés:
   - 'PP'  Pleine propriété (revenus fonciers : TMI + PS 17.2 %)
   - 'EU'  SCPI européenne (TMI seul, pas de PS, via crédit d'impôt)
   - 'AV'  Assurance-vie (capitalisation, flat tax 30 % ou
                          7.5 % IR + 17.2 % PS après 8 ans avec abattement 4 600 €)
   - 'NP'  Nue-propriété (pas de loyers pendant démembrement,
                          récupération pleine propriété en fin)
   ============================================================ */
(function (global) {
  'use strict';

  const FIN = global.FIN || (typeof require !== 'undefined' ? (function(){ try { return require('./finance-utils.js'); } catch(e){ return null; } })() : null);

  function num(v, fb) {
    if (FIN && FIN.num) return FIN.num(v, fb);
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  /**
   * Simule un investissement SCPI sur N années.
   *
   * @param {Object} p
   * @param {number} p.K0           Investissement initial (€)
   * @param {number} p.monthly      Versement mensuel (€)
   * @param {number} p.years        Durée d'investissement (années)
   * @param {number} p.tdvm         Taux de distribution annuel (%)
   * @param {number} p.reval        Revalorisation annuelle des parts (%)
   * @param {number} p.fraisEntree  Frais d'entrée (% du montant investi)
   * @param {number} p.tmi          Tranche marginale d'imposition (%)
   * @param {number} [p.ps=17.2]    Prélèvements sociaux (%)
   * @param {string} [p.regime='PP'] Régime fiscal
   * @param {number} [p.decoteNP]   Décote nue-propriété (%, si regime='NP')
   * @param {number} [p.dureeNP]    Durée démembrement (années, si regime='NP')
   *
   * @returns {Object} { serie, summary }
   */
  function calcSCPI(p) {
    const K0         = num(p.K0, 10000);
    const monthly    = num(p.monthly, 0);
    const years      = Math.max(1, num(p.years, 20));
    const tdvm       = num(p.tdvm, 5.5) / 100;
    const reval      = num(p.reval, 1.0) / 100;
    const feeIn      = num(p.fraisEntree, 10) / 100;
    const tmi        = num(p.tmi, 30) / 100;
    const ps         = num(p.ps, 17.2) / 100;
    const regime     = p.regime || 'PP';
    const decoteNP   = num(p.decoteNP, 30) / 100;
    const dureeNP    = num(p.dureeNP, Math.min(10, years));

    const months       = Math.round(years * 12);
    const monthlyReval = Math.pow(1 + reval, 1 / 12) - 1;
    const monthlyTdvm  = tdvm / 12;

    // Capital effectif : ce que l'investisseur récupère en valeur
    // (= cash investi × (1 − frais d'entrée))
    let capital     = (regime === 'NP') ? K0 / (1 - decoteNP) * (1 - feeIn) : K0 * (1 - feeIn);
    let cashOut     = K0;       // cash réellement payé
    let divBrutCum  = 0;
    let divNetCum   = 0;
    let taxCum      = 0;

    const serie = [{
      month:        0,
      value:        capital,
      cashOut:      cashOut,
      divBrut:      0,
      divNet:       0,
      tax:          0,
      cumDivBrut:   0,
      cumDivNet:    0
    }];

    /**
     * Calcule l'impôt mensuel sur un dividende brut selon le régime.
     * Pour 'AV' : retourne 0 (pas d'imposition en phase capitalisation).
     * Pour 'NP' : retourne 0 si encore en démembrement.
     */
    function taxOnDividend(brut, monthIdx) {
      if (brut <= 0) return 0;
      if (regime === 'AV') return 0;
      if (regime === 'NP') return 0; // pas de dividendes en NP de toute façon

      if (regime === 'EU') {
        // Crédit d'impôt : taxe étrangère payée à l'étranger,
        // imposition française au TMI mais avec crédit d'impôt = TMI moyen
        // → effectif ≈ TMI seul (pas de PS car convention)
        return brut * tmi;
      }

      // PP : pleine propriété → revenus fonciers TMI + PS
      return brut * (tmi + ps);
    }

    // ─── Simulation mois par mois ───────────────────────────
    for (let m = 1; m <= months; m++) {

      // 1. Versement mensuel
      if (monthly > 0) {
        capital += monthly * (1 - feeIn);
        cashOut += monthly;
      }

      // 2. Revalorisation mensuelle des parts
      capital *= (1 + monthlyReval);

      // 3. Dividendes
      let divBrut = 0, divNet = 0, tax = 0;
      const npActif = (regime === 'NP') && (m <= dureeNP * 12);

      if (regime === 'AV') {
        // En AV : les dividendes sont automatiquement capitalisés (réinvestis)
        // → pas de cash-out mais le capital intègre les loyers
        divBrut = capital * monthlyTdvm;
        capital += divBrut;
        // tax = 0 pendant la phase capitalisation
        divNet  = 0;
      } else if (npActif) {
        // En NP pendant démembrement : pas de loyers
        divBrut = 0;
        divNet  = 0;
      } else {
        // PP, EU, ou NP après démembrement
        divBrut = capital * monthlyTdvm;
        tax     = taxOnDividend(divBrut, m);
        divNet  = divBrut - tax;
      }

      divBrutCum += divBrut;
      divNetCum  += divNet;
      taxCum     += tax;

      serie.push({
        month:      m,
        value:      capital,
        cashOut:    cashOut,
        divBrut:    divBrut,
        divNet:     divNet,
        tax:        tax,
        cumDivBrut: divBrutCum,
        cumDivNet:  divNetCum
      });
    }

    // ─── Fiscalité de sortie spécifique AV ──────────────────
    let taxSortie = 0;
    let capitalFinal = capital;

    if (regime === 'AV') {
      const plusValue = capital - cashOut;
      if (plusValue > 0) {
        if (years >= 8) {
          // 7.5 % IR avec abattement 4 600 € (célibataire) + PS 17.2 %
          const abattement   = 4600;
          const baseIR       = Math.max(0, plusValue - abattement);
          taxSortie          = baseIR * 0.075 + plusValue * ps;
        } else {
          // Flat tax 30 %
          taxSortie = plusValue * 0.30;
        }
      }
      capitalFinal -= taxSortie;
      taxCum       += taxSortie;
    }

    // ─── Métriques de synthèse ──────────────────────────────
    const plusValueCapital = capitalFinal - cashOut;
    const totalRetour      = capitalFinal + divNetCum;

    // TRI approximé : (1 + r)^years = totalRetour / cashOut
    const triApprox = (cashOut > 0)
      ? Math.pow(totalRetour / cashOut, 1 / years) - 1
      : 0;

    // Yield net moyen = dividendes nets / capital moyen / an
    const capitalMoyen = (serie[0].value + capital) / 2;
    const yieldNet     = (capitalMoyen > 0)
      ? (divNetCum / capitalMoyen) / years
      : 0;

    const cashflowMensuelMoyen = divNetCum / months;

    return {
      serie,
      summary: {
        regime:                regime,
        capitalFinal:          capitalFinal,
        verseTotal:            cashOut,
        plusValueCapital:      plusValueCapital,
        dividendesBruts:       divBrutCum,
        dividendesNets:        divNetCum,
        impotsTotaux:          taxCum,
        taxSortie:             taxSortie,
        tri:                   triApprox * 100,
        yieldNet:              yieldNet * 100,
        cashflowMensuelMoyen:  cashflowMensuelMoyen,
        totalRetour:           totalRetour
      }
    };
  }

  /**
   * Compare 3 régimes fiscaux pour les mêmes paramètres.
   * Retourne un array de résultats summary par régime.
   */
  function compareRegimes(p) {
    const regimes = ['PP', 'EU', 'AV'];
    return regimes.map(r => {
      const res = calcSCPI(Object.assign({}, p, { regime: r }));
      return Object.assign({}, res.summary, { regime: r });
    });
  }

  /**
   * Stress test : 5 scénarios avec ajustements TDVM / revalorisation.
   */
  function stressTest(p) {
    const scenarios = [
      { name: 'Base',                     dTdvm:  0,    dReval:  0    },
      { name: 'TDVM −1 pt',               dTdvm: -1,    dReval:  0    },
      { name: 'TDVM −2 pt',               dTdvm: -2,    dReval:  0    },
      { name: 'Parts −10 %',              dTdvm:  0,    dReval: -0.5  },
      { name: 'Choc (−1 pt + −10 %)',     dTdvm: -1,    dReval: -0.5  }
    ];
    return scenarios.map(s => {
      const res = calcSCPI(Object.assign({}, p, {
        tdvm:  Math.max(0, p.tdvm  + s.dTdvm),
        reval: Math.max(-2, (p.reval || 1) + s.dReval)
      }));
      return Object.assign({}, res.summary, { name: s.name });
    });
  }

  /**
   * Compare SCPI à 3 alternatives sur la même somme et durée :
   * - Livret A (3 % net)
   * - Fonds euro AV (2.5 % net)
   * - ETF World (7 % avant fiscalité, PFU 30 % en sortie)
   */
  function compareAlternatives(p) {
    const scpi = calcSCPI(p).summary;

    const years  = Math.max(1, num(p.years, 20));
    const K0     = num(p.K0, 10000);
    const monthly = num(p.monthly, 0);

    function fvDCA(annualRate, K0_, m_, yrs) {
      const r = annualRate / 12;
      const n = yrs * 12;
      let v = K0_;
      for (let i = 0; i < n; i++) {
        v = v * (1 + r) + m_;
      }
      return v;
    }

    // Livret A : 3 % net
    const livretA = fvDCA(0.03, K0, monthly, years);

    // Fonds euro AV : 2.5 % net
    const fondsEuro = fvDCA(0.025, K0, monthly, years);

    // ETF World : 7 % brut, PFU 30 % en sortie sur la plus-value
    const totalVerse = K0 + monthly * 12 * years;
    const etfBrut    = fvDCA(0.07, K0, monthly, years);
    const pvEtf      = etfBrut - totalVerse;
    const etfNet     = etfBrut - Math.max(0, pvEtf) * 0.30;

    return [
      { name: 'SCPI ' + p.regime,         total: scpi.totalRetour,  verse: scpi.verseTotal },
      { name: 'Livret A (3 % net)',       total: livretA,            verse: totalVerse     },
      { name: 'Fonds euro AV (2.5 %)',    total: fondsEuro,          verse: totalVerse     },
      { name: 'ETF World 7 % − PFU 30 %', total: etfNet,             verse: totalVerse     }
    ];
  }

  /**
   * Calcule combien d'années il faut pour atteindre un cashflow net mensuel cible.
   * Simule jusqu'à 50 ans et renvoie l'année où l'objectif est atteint.
   *
   * @param {Object} p   Paramètres SCPI standard
   * @param {number} targetMonthly  Rente nette mensuelle cible (€/mois)
   * @returns {Object} { years, capitalAtTarget, monthlyAtTarget, found }
   */
  function yearsToTargetRente(p, targetMonthly) {
    targetMonthly = num(targetMonthly, 500);
    const maxYears = 50;
    // On simule mois par mois jusqu'à dépasser la cible
    const params = Object.assign({}, p, { years: maxYears });
    const r = calcSCPI(params);
    const serie = r.serie;
    const targetAnnual = targetMonthly * 12;

    // On considère que la rente atteinte = dividendes nets des 12 derniers mois
    for (let m = 12; m < serie.length; m++) {
      let annualNet = 0;
      for (let k = m - 11; k <= m; k++) annualNet += serie[k].divNet;
      if (annualNet >= targetAnnual) {
        return {
          found: true,
          years: Math.ceil(m / 12),
          monthsExact: m,
          capitalAtTarget: serie[m].value,
          monthlyAtTarget: annualNet / 12,
          versePourAtteindre: serie[m].cashOut
        };
      }
    }
    // Pas atteint
    const lastAnnualNet = serie.slice(-12).reduce((s, x) => s + x.divNet, 0);
    return {
      found: false,
      years: maxYears,
      capitalAtTarget: serie[serie.length - 1].value,
      monthlyAtTarget: lastAnnualNet / 12,
      versePourAtteindre: serie[serie.length - 1].cashOut
    };
  }

  // ─── Export ─────────────────────────────────────────────
  const api = { calcSCPI, compareRegimes, stressTest, compareAlternatives, yearsToTargetRente };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SCPI = api;
  }

})(typeof window !== 'undefined' ? window : global);
