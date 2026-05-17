/* ============================================================
   CalcInvest — Core Donation / Succession France 2025

   Sources : article 779 CGI (abattements), 777 CGI (barème),
   775 CGI (donation entre époux), BOFiP.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  // Abattements en ligne directe et indirecte (renouvelables tous les 15 ans pour donations)
  const ABATTEMENTS = {
    'enfant':            100000,
    'petitEnfant':        31865,
    'arrierePetitEnfant':  5310,
    'epoux':              80724,   // (Donation entre époux uniquement, succession = exonération totale)
    'frereSoeur':         15932,
    'neveuNiece':          7967,
    'handicape':          159325,  // s'ajoute aux autres abattements
    'autre':                1594
  };

  // Barème ligne directe (parents/enfants/petits-enfants) — art. 777 CGI
  const BAREME_LIGNE_DIRECTE = [
    { from: 0,       to: 8072,    rate: 0.05 },
    { from: 8072,    to: 12109,   rate: 0.10 },
    { from: 12109,   to: 15932,   rate: 0.15 },
    { from: 15932,   to: 552324,  rate: 0.20 },
    { from: 552324,  to: 902838,  rate: 0.30 },
    { from: 902838,  to: 1805677, rate: 0.40 },
    { from: 1805677, to: Infinity,rate: 0.45 }
  ];

  // Barème entre époux et PACSés (donation uniquement, succession exonérée)
  const BAREME_EPOUX = [
    { from: 0,       to: 8072,    rate: 0.05 },
    { from: 8072,    to: 15932,   rate: 0.10 },
    { from: 15932,   to: 31865,   rate: 0.15 },
    { from: 31865,   to: 552324,  rate: 0.20 },
    { from: 552324,  to: 902838,  rate: 0.30 },
    { from: 902838,  to: 1805677, rate: 0.40 },
    { from: 1805677, to: Infinity,rate: 0.45 }
  ];

  // Barème entre frères et sœurs
  const BAREME_FRERES = [
    { from: 0,     to: 24430,    rate: 0.35 },
    { from: 24430, to: Infinity, rate: 0.45 }
  ];

  // Forfait pour autres parents (oncles, cousins, etc.)
  const TAUX_AUTRES = 0.55;     // jusqu'au 4e degré
  const TAUX_NON_PARENT = 0.60; // au-delà du 4e degré

  // Décote pour démembrement (usufruit/nue-propriété) — art. 669 CGI
  // Selon âge de l'usufruitier
  const DEMEMBREMENT = [
    { ageMax: 20, usufruit: 0.90, nuePropriete: 0.10 },
    { ageMax: 30, usufruit: 0.80, nuePropriete: 0.20 },
    { ageMax: 40, usufruit: 0.70, nuePropriete: 0.30 },
    { ageMax: 50, usufruit: 0.60, nuePropriete: 0.40 },
    { ageMax: 60, usufruit: 0.50, nuePropriete: 0.50 },
    { ageMax: 70, usufruit: 0.40, nuePropriete: 0.60 },
    { ageMax: 80, usufruit: 0.30, nuePropriete: 0.70 },
    { ageMax: 90, usufruit: 0.20, nuePropriete: 0.80 },
    { ageMax: 200,usufruit: 0.10, nuePropriete: 0.90 }
  ];

  /**
   * Applique un barème progressif sur une base imposable.
   */
  function appliquerBareme(base, bareme) {
    if (base <= 0) return 0;
    let droits = 0;
    for (const t of bareme) {
      if (base <= t.from) break;
      const tranche = Math.min(base, t.to) - t.from;
      droits += tranche * t.rate;
    }
    return droits;
  }

  /**
   * Calcule les droits de donation pour 1 bénéficiaire.
   *
   * @param {Object} p
   * @param {number} p.montant       Montant de la donation (€)
   * @param {string} p.lienParente   'enfant' | 'petitEnfant' | 'epoux' | 'frereSoeur' | 'neveuNiece' | 'autre'
   * @param {boolean} p.handicape    Bénéficiaire handicapé ? (abattement +159 325 €)
   * @param {number} p.deja          Donations déjà reçues du même donateur dans les 15 ans (réduit l'abattement disponible)
   * @param {boolean} p.demembrement Donation en nue-propriété ?
   * @param {number} p.ageDonateur   Âge du donateur (pour calculer la valeur de la NP)
   * @returns {Object}
   */
  function calcDonation(p) {
    const montant = num(p.montant, 0);
    const lien = p.lienParente || 'enfant';
    const handicape = !!p.handicape;
    const deja = num(p.deja, 0);
    const demembrement = !!p.demembrement;
    const ageDonateur = num(p.ageDonateur, 60);

    // Montant retenu (en cas de démembrement)
    let montantRetenu = montant;
    let valeurUsufruit = 0;
    let valeurNuePropriete = montant;
    if (demembrement) {
      const dm = DEMEMBREMENT.find(d => ageDonateur < d.ageMax);
      valeurUsufruit = montant * dm.usufruit;
      valeurNuePropriete = montant * dm.nuePropriete;
      montantRetenu = valeurNuePropriete;
    }

    // Abattement
    const abatBase = ABATTEMENTS[lien] || ABATTEMENTS.autre;
    const abatHandi = handicape ? ABATTEMENTS.handicape : 0;
    const abatTotal = abatBase + abatHandi;
    const abatRestant = Math.max(0, abatTotal - deja);
    const base = Math.max(0, montantRetenu - abatRestant);

    // Barème
    let bareme;
    let droitsBruts;
    if (lien === 'enfant' || lien === 'petitEnfant' || lien === 'arrierePetitEnfant') {
      bareme = BAREME_LIGNE_DIRECTE;
      droitsBruts = appliquerBareme(base, bareme);
    } else if (lien === 'epoux') {
      bareme = BAREME_EPOUX;
      droitsBruts = appliquerBareme(base, bareme);
    } else if (lien === 'frereSoeur') {
      bareme = BAREME_FRERES;
      droitsBruts = appliquerBareme(base, bareme);
    } else if (lien === 'neveuNiece') {
      droitsBruts = base * 0.55;
      bareme = 'Forfait 55 %';
    } else {
      droitsBruts = base * TAUX_NON_PARENT;
      bareme = 'Forfait 60 %';
    }

    return {
      montant,
      lienParente: lien,
      demembrement,
      valeurUsufruit, valeurNuePropriete,
      montantRetenu,
      abattementBase: abatBase,
      abattementHandi: abatHandi,
      abattementUtiliseAuparavant: Math.min(deja, abatTotal),
      abattementRestant: abatRestant,
      baseImposable: base,
      droits: droitsBruts,
      netRecu: montantRetenu - droitsBruts,
      tauxEffectif: montant > 0 ? (droitsBruts / montant) * 100 : 0
    };
  }

  /**
   * Stratégie d'optimisation : combien donner sans payer de droits, en utilisant tous les leviers.
   */
  function strategieOptimale(p) {
    const lien = p.lienParente || 'enfant';
    const handicape = !!p.handicape;
    const conjoint = !!p.conjointDonateur; // les 2 parents donnent

    const abatBase = ABATTEMENTS[lien] || ABATTEMENTS.autre;
    const abatHandi = handicape ? ABATTEMENTS.handicape : 0;
    const parParent = abatBase + abatHandi;
    const total = conjoint ? parParent * 2 : parParent;

    return {
      parParent,
      surTous: total,
      tousLes15Ans: total,
      renouvelable: true,
      conseil: lien === 'enfant'
        ? 'Sur 30 ans, un enfant peut recevoir ' + (parParent * 2 * 3).toLocaleString('fr-FR') + ' € sans droits (3 vagues, 2 parents).'
        : 'Vérifiez le délai de 15 ans entre 2 donations du même donateur.'
    };
  }

  /**
   * Succession : calcule les droits sur la part nette d'un héritier.
   */
  function calcSuccession(p) {
    const partNette = num(p.partNette, 0);
    const lien = p.lienParente || 'enfant';
    const handicape = !!p.handicape;

    // Conjoint survivant et PACSé : exonération totale (loi TEPA 2007)
    if (lien === 'epoux') {
      return {
        partNette, lienParente: lien,
        abattementUtilise: 0,
        baseImposable: 0,
        droits: 0,
        netHerite: partNette,
        exoneration: 'Conjoint survivant : exonération totale (art. 796-0 bis CGI)'
      };
    }

    const abatBase = ABATTEMENTS[lien] || ABATTEMENTS.autre;
    const abatHandi = handicape ? ABATTEMENTS.handicape : 0;
    const abatTotal = abatBase + abatHandi;
    const base = Math.max(0, partNette - abatTotal);

    let droits;
    if (lien === 'enfant' || lien === 'petitEnfant' || lien === 'arrierePetitEnfant') {
      droits = appliquerBareme(base, BAREME_LIGNE_DIRECTE);
    } else if (lien === 'frereSoeur') {
      droits = appliquerBareme(base, BAREME_FRERES);
    } else if (lien === 'neveuNiece') {
      droits = base * 0.55;
    } else {
      droits = base * TAUX_NON_PARENT;
    }

    return {
      partNette, lienParente: lien,
      abattementUtilise: Math.min(partNette, abatTotal),
      baseImposable: base,
      droits,
      netHerite: partNette - droits,
      tauxEffectif: partNette > 0 ? (droits / partNette) * 100 : 0
    };
  }

  const api = {
    calcDonation, calcSuccession, strategieOptimale,
    ABATTEMENTS, BAREME_LIGNE_DIRECTE, BAREME_EPOUX, BAREME_FRERES, DEMEMBREMENT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.DONATION = api;
})(typeof window !== 'undefined' ? window : globalThis);
