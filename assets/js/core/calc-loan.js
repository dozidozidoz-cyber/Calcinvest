/* ============================================================
   CalcInvest — Core Simulateur de Prêt Immobilier (France)
   Capacité d'emprunt, mensualités, amortissement, frais notaire,
   comparaison durées, coût total, simulation modulation.
   ============================================================ */
(function (global) {
  'use strict';

  const FIN = global.FIN || (typeof require !== 'undefined' ? (function () { try { return require('./finance-utils.js'); } catch (e) { return null; } })() : null);

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  // ─── Taux d'usure (HCSF / Banque de France 2025) ────────
  // Taux maximums autorisés selon durée
  const TAUX_USURE = {
    '<10': 0.0467,
    '10-20': 0.0524,
    '>=20': 0.0588
  };

  // ─── Barème frais de notaire (achat ancien standard) ────
  // Approximation : 7-8 % dans l'ancien, 2-3 % dans le neuf
  function fraisNotaire(prix, neuf) {
    if (neuf) return prix * 0.025;
    // Ancien : décomposition
    // - Émoluments : ~1 %
    // - Droits d'enregistrement : ~5.8 %
    // - Débours + TVA : ~0.3 %
    return prix * 0.075;
  }

  /**
   * Calcule la capacité d'emprunt selon la règle des 35 % de taux d'endettement.
   *
   * @param {Object} p
   * @param {number} p.revenusNets     Revenus nets mensuels du foyer
   * @param {number} p.chargesExistantes Crédits/loyers déjà payés (à déduire)
   * @param {number} p.tauxEndettement Plafond endettement (défaut 35%)
   * @param {number} p.tauxNominal     Taux annuel nominal du prêt
   * @param {number} p.assuranceRate   Taux assurance annuel (défaut 0.36%)
   * @param {number} p.dureeAnnees     Durée souhaitée
   *
   * @returns {Object}
   */
  function capaciteEmprunt(p) {
    const revenus = num(p.revenusNets, 3500);
    const charges = num(p.chargesExistantes, 0);
    const plafondPct = num(p.tauxEndettement, 35) / 100;
    const tauxAnn = num(p.tauxNominal, 3.5) / 100;
    const assu = num(p.assuranceRate, 0.36) / 100;
    const annees = num(p.dureeAnnees, 25);

    const capaciteRemb = Math.max(0, revenus * plafondPct - charges);
    const tauxMensuel = tauxAnn / 12;
    const n = annees * 12;

    // Capacité = capacité remboursement (incluant assurance)
    // Mensualité prêt = capacité - assurance mensuelle (sur capital initial K)
    // Or assurance = K × assu/12
    // pmt(K) = K × r / (1 - (1+r)^-n)
    // capacité = pmt(K) + K × assu/12
    //         = K × [r/(1-(1+r)^-n) + assu/12]
    // → K = capacité / [r/(1-(1+r)^-n) + assu/12]
    const factorPmt = tauxMensuel > 0
      ? tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -n))
      : 1 / n;
    const factorTotal = factorPmt + assu / 12;
    const capitalMax = capaciteRemb / factorTotal;

    return {
      revenus, charges, plafondPct,
      capaciteRemb,           // €/mois disponibles pour rembourser
      capitalMax,             // somme maximale qu'on peut emprunter
      tauxNominal: tauxAnn,
      assuranceRate: assu,
      duree: annees,
      mensualitePrincipale: capitalMax * factorPmt,
      mensualiteAssurance: (capitalMax * assu) / 12,
      mensualiteTotale: capaciteRemb,
      tauxUsureAtteint: tauxAnn > tauxUsureFor(annees)
    };
  }

  function tauxUsureFor(years) {
    if (years < 10) return TAUX_USURE['<10'];
    if (years < 20) return TAUX_USURE['10-20'];
    return TAUX_USURE['>=20'];
  }

  /**
   * Simule un prêt complet : mensualités, amortissement, coût total.
   * Wrapper autour de FIN.amortization avec calculs supplémentaires.
   */
  function simulerPret(p) {
    if (!FIN) return { error: 'FIN non chargé' };
    const capital = num(p.capital, 200000);
    const annees = num(p.duree, 25);
    const tauxAnn = num(p.tauxNominal, 3.5) / 100;
    const assu = num(p.assuranceRate, 0.36) / 100;

    const amort = FIN.amortization(tauxAnn, annees, capital, { insuranceRate: assu });

    return {
      capital, annees, tauxNominal: tauxAnn, assuranceRate: assu,
      mensualitePret: amort.pmt,
      mensualiteAssurance: amort.insurance,
      mensualiteTotale: amort.total,
      totalInterets: amort.totalInterest,
      totalAssurance: amort.totalInsurance,
      coutTotalCredit: amort.totalInterest + amort.totalInsurance,
      coutTotalRemboursement: amort.totalCost,
      monthly: amort.monthly,
      yearly: amort.yearly,
      // TAEG approximé (intègre l'assurance dans le taux effectif)
      taeg: ((amort.totalCost / capital) ** (1 / annees) - 1) * 100,
      tauxUsureMax: tauxUsureFor(annees) * 100
    };
  }

  /**
   * Compare plusieurs durées pour le même capital et taux.
   * Retourne un array trié par durée croissante.
   */
  function comparerDurees(p, durees) {
    durees = durees || [15, 20, 25, 27, 30];
    return durees.map(d => {
      const r = simulerPret(Object.assign({}, p, { duree: d }));
      return {
        duree: d,
        mensualite: r.mensualiteTotale,
        totalInterets: r.totalInterets,
        coutTotalCredit: r.coutTotalCredit,
        coutTotalRemboursement: r.coutTotalRemboursement
      };
    });
  }

  /**
   * Calcule le coût total d'une opération immobilière complète :
   * prix bien + frais notaire + travaux + frais dossier banque
   */
  function coutOperation(p) {
    const prix = num(p.prixBien, 250000);
    const neuf = !!p.neuf;
    const travaux = num(p.travaux, 0);
    const fraisDossier = num(p.fraisDossier, 1000);
    const fraisGarantie = num(p.fraisGarantie, prix * 0.012); // ~1.2% caution
    const apport = num(p.apport, 0);

    const notaire = fraisNotaire(prix, neuf);
    const coutTotal = prix + notaire + travaux + fraisDossier + fraisGarantie;
    const aEmprunter = Math.max(0, coutTotal - apport);

    return {
      prixBien: prix,
      fraisNotaire: notaire,
      travaux,
      fraisDossier,
      fraisGarantie,
      apport,
      coutTotal,
      aEmprunter,
      ratioApport: coutTotal > 0 ? (apport / coutTotal) * 100 : 0,
      neuf
    };
  }

  /**
   * Simulation modulation : effet d'un remboursement anticipé partiel
   * après X mois sur la durée restante.
   */
  function remboursementAnticipe(p, montantAnticipe, moisRemboursement) {
    const r = simulerPret(p);
    if (r.error) return r;
    if (moisRemboursement >= r.monthly.length) return { error: 'Mois invalide' };

    const soldeAvant = r.monthly[moisRemboursement - 1].balance;
    const nouveauCapital = Math.max(0, soldeAvant - montantAnticipe);

    // Penalité (typique 3% du capital remboursé, plafonné à 6 mois d'intérêts)
    const tauxAnn = num(p.tauxNominal, 3.5) / 100;
    const interets6Mois = soldeAvant * tauxAnn / 2;
    const penalite = Math.min(montantAnticipe * 0.03, interets6Mois);

    // Recalcul avec même mensualité, durée réduite
    const pmtSameMonthly = r.mensualitePret;
    const tauxMensuel = tauxAnn / 12;
    // n = ln(1/(1 - K×r/pmt)) / ln(1+r)
    let nReste;
    if (tauxMensuel > 0 && pmtSameMonthly > nouveauCapital * tauxMensuel) {
      nReste = Math.log(1 / (1 - (nouveauCapital * tauxMensuel) / pmtSameMonthly)) / Math.log(1 + tauxMensuel);
    } else {
      nReste = nouveauCapital / pmtSameMonthly;
    }
    const nResteFinal = Math.ceil(nReste);
    const dureeOriginaleRestante = r.monthly.length - moisRemboursement;

    return {
      montantAnticipe,
      moisRemboursement,
      penalite,
      soldeAvant,
      soldeApres: nouveauCapital,
      moisRestantsAvant: dureeOriginaleRestante,
      moisRestantsApres: nResteFinal,
      moisGagnes: dureeOriginaleRestante - nResteFinal,
      anneesGagnees: (dureeOriginaleRestante - nResteFinal) / 12,
      interetsEconomises: Math.max(0,
        // Approximation : intérêts restants sur trajectoire originale vs nouvelle
        r.monthly.slice(moisRemboursement).reduce((s, x) => s + x.interest, 0)
        - (nResteFinal * pmtSameMonthly - nouveauCapital)
      )
    };
  }

  const api = {
    capaciteEmprunt,
    simulerPret,
    comparerDurees,
    coutOperation,
    remboursementAnticipe,
    fraisNotaire,
    tauxUsureFor,
    TAUX_USURE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.LOAN = api;
})(typeof window !== 'undefined' ? window : globalThis);
