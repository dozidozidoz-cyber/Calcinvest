/* ============================================================
   CalcInvest — Core Salaire Brut / Net (France 2025)

   Approximation simplifiée des cotisations salariales URSSAF/Agirc-Arrco
   pour un salarié non cadre / cadre du secteur privé.

   Sources : URSSAF 2025, AGIRC-ARRCO, code de la Sécurité sociale.
   Plafond Sécurité Sociale (PSS) 2025 = 3 925 €/mois (47 100 €/an).

   ⚠ Simplifié : ne couvre pas tous les cas (fonction publique, expat,
   conventions collectives, primes/bonus, frais pro réels).
   Renvoie une estimation à ±2 % du vrai net selon le profil.
   ============================================================ */
(function (global) {
  'use strict';

  const PSS_MONTHLY = 3925;          // 2025
  const PSS_ANNUAL  = PSS_MONTHLY * 12;
  const SMIC_MONTHLY = 1801.80;       // SMIC brut mensuel 2025 (35h)

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  /**
   * Cotisations salariales 2025 (taux indicatifs).
   * Tranches :
   *   T1 : 0 → 1 PSS
   *   T2 : 1 → 8 PSS (jusqu'à 31 400 €/mois)
   *   T3 : (CET) > 1 PSS
   *
   * Taux par tranche (côté salarié) :
   */
  const RATES = {
    // Maladie : pas de part salariale en France métropolitaine standard (Alsace-Moselle 1.30 %)
    csgDeductible:   0.0680, // 6.80 % CSG déductible
    csgNonDeductible:0.0290, // 2.90 % CSG/CRDS non déductible
    cadre: {
      // T1 (jusqu'à 1 PSS)
      retraiteBaseT1:  0.0690, // assurance vieillesse plafonnée + déplafonnée
      agircArrcoT1:    0.0315, // retraite complémentaire AGIRC-ARRCO T1
      cetT1:           0.0014, // CET T1
      apec:            0.00024, // 0.024 %
      // T2 (1 → 8 PSS)
      retraiteBaseT2:  0.0040,
      agircArrcoT2:    0.0864,
      cetT2:           0.0014,
      ceg:             0.0086, // CEG (toutes tranches)
      complementaire:  0.0050  // Prévoyance/mutuelle obligatoire (estim.)
    },
    nonCadre: {
      retraiteBaseT1:  0.0690,
      agircArrcoT1:    0.0315,
      ceg:             0.0086,
      retraiteBaseT2:  0.0040,
      agircArrcoT2:    0.0864,
      complementaire:  0.0050
    }
  };

  /**
   * Convertit un salaire brut mensuel en net mensuel.
   * @param {Object} p
   * @param {number} p.brut         Brut mensuel (€)
   * @param {string} p.statut       'cadre' | 'nonCadre'
   * @param {number} p.heuresHebdo  35 par défaut (info, n'impacte pas le calcul)
   * @returns {Object}
   */
  function brutToNet(p) {
    const brut = num(p.brut, 0);
    const statut = p.statut === 'cadre' ? 'cadre' : 'nonCadre';
    const r = RATES[statut];

    // Découpage tranches
    const t1 = Math.min(brut, PSS_MONTHLY);
    const t2 = Math.max(0, Math.min(brut, 8 * PSS_MONTHLY) - PSS_MONTHLY);

    let cotis = 0;
    cotis += t1 * r.retraiteBaseT1;
    cotis += t1 * r.agircArrcoT1;
    cotis += t2 * r.retraiteBaseT2;
    cotis += t2 * r.agircArrcoT2;
    cotis += brut * r.ceg;
    cotis += brut * r.complementaire;
    if (statut === 'cadre') {
      cotis += t1 * r.cetT1;
      cotis += t2 * r.cetT2;
      cotis += brut * r.apec;
    }

    // CSG/CRDS : base = 98.25 % du brut (abattement frais pro 1.75 %)
    const baseCSG = brut * 0.9825;
    const csgDed     = baseCSG * RATES.csgDeductible;
    const csgNonDed  = baseCSG * RATES.csgNonDeductible;

    const totalCotis = cotis + csgDed + csgNonDed;
    const netAvantImpot = brut - totalCotis;

    // PAS (prélèvement à la source) : on ne le calcule pas ici car
    // ça dépend du foyer fiscal (IR). On expose le net AVANT impôt.
    // Le user peut combiner avec /calculateur-impot-revenu.

    return {
      brut,
      statut,
      t1, t2,
      cotisationsRetraite:  (t1 * (r.retraiteBaseT1 + r.agircArrcoT1)) + (t2 * (r.retraiteBaseT2 + r.agircArrcoT2)),
      cotisationsCadre:     statut === 'cadre' ? (t1 * r.cetT1 + t2 * r.cetT2 + brut * r.apec) : 0,
      complementaire:       brut * (r.ceg + r.complementaire),
      csg:                  csgDed + csgNonDed,
      csgDeductible:        csgDed,
      csgNonDeductible:     csgNonDed,
      totalCotisations:     totalCotis,
      netAvantImpot,
      netAnnuel:            netAvantImpot * 12,
      brutAnnuel:           brut * 12,
      tauxCotis:            brut > 0 ? (totalCotis / brut) * 100 : 0,
      // Pour info : assiette imposable = net + CSG non déductible
      revenuImposable:      (netAvantImpot + csgNonDed) * 12
    };
  }

  /**
   * Convertit un net mensuel souhaité → brut (résolution numérique).
   */
  function netToBrut(p) {
    const targetNet = num(p.net, 0);
    const statut = p.statut === 'cadre' ? 'cadre' : 'nonCadre';
    // Approche : ratio empirique, puis ajustement Newton.
    // Cadre ~ 75 % brut / Non-cadre ~ 78 %
    let brut = targetNet / (statut === 'cadre' ? 0.74 : 0.77);
    for (let i = 0; i < 20; i++) {
      const r = brutToNet({ brut, statut });
      const diff = r.netAvantImpot - targetNet;
      if (Math.abs(diff) < 0.5) break;
      // Ajustement : un € de brut donne ~0.75 € de net
      brut -= diff / 0.755;
    }
    return brutToNet({ brut, statut });
  }

  /**
   * Récap annuel : 13e mois éventuel, prime, ancienneté
   */
  function recap13Mois(p) {
    const brut = num(p.brut, 0);
    const statut = p.statut === 'cadre' ? 'cadre' : 'nonCadre';
    const mois13 = p.mois13 !== false; // bool, default true
    const primesAnnuelles = num(p.primes, 0);
    const months = mois13 ? 13 : 12;
    const brutAnnuel = brut * months + primesAnnuelles;
    const moyenneMensuelle = brutAnnuel / 12;
    const r = brutToNet({ brut: moyenneMensuelle, statut });
    return {
      brutAnnuel,
      moisDeclarés: months,
      primesAnnuelles,
      moyenneMensuelle,
      netMoyenMensuel: r.netAvantImpot,
      netAnnuel: r.netAvantImpot * 12
    };
  }

  const api = {
    brutToNet, netToBrut, recap13Mois,
    PSS_MONTHLY, PSS_ANNUAL, SMIC_MONTHLY, RATES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SALAIRE = api;
})(typeof window !== 'undefined' ? window : globalThis);
