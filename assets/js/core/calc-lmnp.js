/* ============================================================
   CalcInvest — Core LMNP (Location Meublée Non Professionnelle)
   France 2025

   2 régimes :
   1. Micro-BIC : abattement forfaitaire (50 % standard, 71 % meublé
                  de tourisme classé), CA < 77 700 €
   2. Réel BIC : déduction de TOUTES les charges + amortissements
                 du bien et du mobilier → fréquemment 0 € d'impôt
                 pendant 10-20 ans

   Sources : article 50-0 CGI, BOFiP, BOI-BIC-CHAMP-40-20.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  const SEUIL_MICRO = 77700;
  const SEUIL_MICRO_TOURISME_CLASSE = 188700;
  const PS_RATE = 0.172;

  /**
   * Calcule le résultat micro-BIC.
   * @param {Object} p
   * @param {number} p.loyersAnnuels
   * @param {boolean} p.tourismeClasse  Meublé de tourisme classé ?
   * @param {number} p.tmi  TMI %
   */
  function microBIC(p) {
    const loyers = num(p.loyersAnnuels, 0);
    const classe = !!p.tourismeClasse;
    const tmi = num(p.tmi, 30) / 100;
    // Charges et intérêts ne sont PAS déductibles en micro, mais l'investisseur les paie réellement
    const charges = num(p.charges, 0);
    const interets = num(p.interetsEmprunt, 0);

    const tauxAbattement = classe ? 0.71 : 0.50;
    const seuil = classe ? SEUIL_MICRO_TOURISME_CLASSE : SEUIL_MICRO;
    const revenuImposable = loyers * (1 - tauxAbattement);
    const ir = revenuImposable * tmi;
    const ps = revenuImposable * PS_RATE;
    const totalImpot = ir + ps;
    // Net cashflow réel = loyers - charges réelles - impôt
    const netCashflow = loyers - charges - interets - totalImpot;

    return {
      regime: 'micro-BIC',
      loyers, charges, interets,
      tauxAbattement: tauxAbattement * 100,
      revenuImposable,
      ir, ps,
      totalImpot,
      netLoyers: netCashflow,        // net réellement perçu (cash)
      tauxPrelevement: loyers > 0 ? (totalImpot / loyers) * 100 : 0,
      depasseSeuil: loyers > seuil,
      seuil
    };
  }

  /**
   * Calcule le résultat au réel BIC avec amortissements.
   * @param {Object} p
   * @param {number} p.loyersAnnuels
   * @param {number} p.charges        Charges déductibles annuelles (taxe foncière, copro, assurance, frais gestion, etc.)
   * @param {number} p.interetsEmprunt
   * @param {number} p.prixBien       Valeur du bâti (hors terrain)
   * @param {number} p.partTerrain    % du prix qui correspond au terrain (typiquement 15-30 %, non amortissable)
   * @param {number} p.dureeAmortBien Années (typiquement 25-40)
   * @param {number} p.prixMobilier
   * @param {number} p.dureeAmortMobilier Années (typiquement 7-10)
   * @param {number} p.tmi
   * @param {number} p.reportDeficit Déficits BIC reportables des années précédentes
   */
  function reelBIC(p) {
    const loyers = num(p.loyersAnnuels, 0);
    const charges = num(p.charges, 0);
    const interets = num(p.interetsEmprunt, 0);
    const prixBien = num(p.prixBien, 0);
    const partTerrain = num(p.partTerrain, 20) / 100;
    const dureeBien = Math.max(1, num(p.dureeAmortBien, 30));
    const prixMobilier = num(p.prixMobilier, 0);
    const dureeMobilier = Math.max(1, num(p.dureeAmortMobilier, 8));
    const tmi = num(p.tmi, 30) / 100;
    const reportDeficit = num(p.reportDeficit, 0);

    // Amortissements
    const valeurAmortissable = prixBien * (1 - partTerrain);
    const amortBien = valeurAmortissable / dureeBien;
    const amortMobilier = prixMobilier / dureeMobilier;
    const amortTotal = amortBien + amortMobilier;

    // Charges totales déductibles
    const totalCharges = charges + interets + amortTotal;

    // Résultat fiscal AVANT report de déficit
    // Particularité LMNP : les amortissements ne peuvent pas créer un déficit
    // → on plafonne d'abord à zéro, le reste est reporté
    const resultatHorsAmort = loyers - charges - interets;
    let amortDeductible = Math.min(amortTotal, Math.max(0, resultatHorsAmort));
    let amortReporte = amortTotal - amortDeductible;

    const resultatBIC = loyers - charges - interets - amortDeductible;
    // Si le résultat hors amort est négatif, déficit BIC reportable 10 ans (avant amort)
    const deficitNouveau = resultatHorsAmort < 0 ? Math.abs(resultatHorsAmort) : 0;

    // Imputation report de déficit ancien
    let resultatApresReport = Math.max(0, resultatBIC - reportDeficit);
    const reportConsomme = Math.min(reportDeficit, resultatBIC);

    const ir = resultatApresReport * tmi;
    const ps = resultatApresReport * PS_RATE;
    const totalImpot = ir + ps;
    const netLoyers = loyers - charges - interets - totalImpot;

    return {
      regime: 'réel-BIC',
      loyers, charges, interets,
      amortBien, amortMobilier, amortTotal,
      amortDeductible, amortReporte,
      valeurAmortissable,
      totalChargesDeductibles: charges + interets + amortDeductible,
      resultatBIC,
      reportDeficitConsomme: reportConsomme,
      resultatImposable: resultatApresReport,
      deficitNouveau,
      ir, ps,
      totalImpot,
      netLoyers,
      tauxPrelevement: loyers > 0 ? (totalImpot / loyers) * 100 : 0
    };
  }

  /**
   * Compare micro-BIC vs réel et indique le meilleur régime.
   */
  function compareRegimes(p) {
    const micro = microBIC(p);
    const reel = reelBIC(p);
    const ecart = micro.netLoyers - reel.netLoyers;
    return {
      micro,
      reel,
      meilleur: reel.netLoyers > micro.netLoyers ? 'réel' : 'micro',
      ecartAnnuel: Math.abs(ecart),
      ecartFavorableA: ecart < 0 ? 'réel' : 'micro'
    };
  }

  /**
   * Projection multi-années (utile pour voir quand les amortissements s'épuisent)
   */
  function projection(p, years) {
    years = years || 25;
    const rows = [];
    let reportCum = 0;
    let amortPourYear = num(p.prixBien, 0) * (1 - num(p.partTerrain, 20)/100) / Math.max(1, num(p.dureeAmortBien, 30))
                       + num(p.prixMobilier, 0) / Math.max(1, num(p.dureeAmortMobilier, 8));

    for (let y = 1; y <= years; y++) {
      const dureeBien = Math.max(1, num(p.dureeAmortBien, 30));
      const dureeMob = Math.max(1, num(p.dureeAmortMobilier, 8));
      // Amortissement bâti continue tant qu'on est dans la durée
      const amortBienY = y <= dureeBien ? num(p.prixBien, 0) * (1 - num(p.partTerrain, 20)/100) / dureeBien : 0;
      // Amortissement mobilier s'arrête après dureeMob
      const amortMobY = y <= dureeMob ? num(p.prixMobilier, 0) / dureeMob : 0;

      const r = reelBIC({ ...p, reportDeficit: reportCum });
      // Recalcule pour cette année avec son amort
      // (simplification : on suppose les mêmes loyers/charges chaque année)
      r.year = y;
      r.amortBienAnnee = amortBienY;
      r.amortMobAnnee = amortMobY;
      reportCum = Math.max(0, reportCum - r.reportDeficitConsomme + r.deficitNouveau);
      r.reportRestant = reportCum;
      rows.push(r);
    }
    return rows;
  }

  const api = { microBIC, reelBIC, compareRegimes, projection, SEUIL_MICRO, SEUIL_MICRO_TOURISME_CLASSE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.LMNP = api;
})(typeof window !== 'undefined' ? window : globalThis);
