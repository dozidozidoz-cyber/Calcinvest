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
    pretInFine,
    modulationMensualite,
    TAUX_USURE
  };

  /**
   * Prêt IN FINE : on rembourse uniquement les intérêts pendant la durée,
   * puis le capital total à l'échéance.
   * Typique en investissement locatif pour optimiser fiscalement
   * (intérêts déductibles maximaux, capital placé en assurance-vie nantie).
   *
   * @param {Object} p
   * @param {number} p.capital
   * @param {number} p.duree
   * @param {number} p.tauxNominal (% annuel)
   * @param {number} p.assuranceRate (% capital/an)
   */
  function pretInFine(p) {
    const capital = num(p.capital, 200000);
    const duree = Math.max(1, num(p.duree, 15));
    const taux = num(p.tauxNominal, 4) / 100;
    const tauxAssu = num(p.assuranceRate, 0.36) / 100;

    // Intérêts mensuels constants pendant toute la durée
    const interetsMensuels = capital * taux / 12;
    const assuranceMensuelle = capital * tauxAssu / 12;
    const mensualite = interetsMensuels + assuranceMensuelle;
    const totalInterets = interetsMensuels * duree * 12;
    const totalAssurance = assuranceMensuelle * duree * 12;
    const coutTotalCredit = totalInterets + totalAssurance;

    // Comparaison vs prêt amortissable classique
    const amort = simulerPret({ ...p, capital, duree, tauxNominal: p.tauxNominal, assuranceRate: p.assuranceRate });

    return {
      type: 'in-fine',
      capital,
      duree,
      mensualite,
      mensualiteInterets: interetsMensuels,
      mensualiteAssurance: assuranceMensuelle,
      capitalRembourseFinal: capital,
      totalInterets,
      totalAssurance,
      coutTotalCredit,
      coutTotalRemboursement: capital + coutTotalCredit,
      // Comparaison amortissable
      vsAmortissable: {
        ecartMensualite: mensualite - amort.mensualiteTotale,
        ecartCoutTotal: coutTotalCredit - amort.coutTotalCredit,
        amort
      }
    };
  }

  /**
   * Modulation de mensualité : permet de hausser ou baisser la mensualité
   * (typiquement ±30 % de la mensualité d'origine, dans la limite des plafonds).
   */
  function modulationMensualite(p) {
    const base = simulerPret(p);
    const moduPct = num(p.modulationPct, 20) / 100; // +20 % typique
    const newMensualite = base.mensualitePret * (1 + moduPct);

    // Recalcule la durée nécessaire pour solder avec cette nouvelle mensualité
    const r = num(p.tauxNominal, 4) / 100 / 12;
    const C = num(p.capital, 200000);
    // n = -log(1 - C*r/PMT) / log(1+r)
    let newDurationMonths;
    if (newMensualite <= C * r) {
      newDurationMonths = Infinity; // mensualité trop faible
    } else {
      newDurationMonths = -Math.log(1 - (C * r) / newMensualite) / Math.log(1 + r);
    }
    const newDurationYears = newDurationMonths / 12;
    const gainAnnees = base.duree - newDurationYears;
    const gainInterets = base.totalInterets - (newMensualite * newDurationMonths - C);

    return {
      modulationPct: moduPct * 100,
      ancienneMensualite: base.mensualitePret,
      nouvelleMensualite: newMensualite,
      ancienneDuree: base.duree,
      nouvelleDuree: newDurationYears,
      gainAnnees,
      gainInterets,
      base
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.LOAN = api;
})(typeof window !== 'undefined' ? window : globalThis);
