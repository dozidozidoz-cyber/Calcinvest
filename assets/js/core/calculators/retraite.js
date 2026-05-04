/* ============================================================
   CalcInvest — Calculator : Retraite (régime général + Agirc-Arrco)

   Public scope : salariés du privé en France
   Sources officielles 2025 :
   - PASS 2025 : 47 100 € (plafond annuel sécurité sociale)
   - Réforme retraite 2023 : âge légal 64 ans, durée 172 trim. (génération 1973+)
   - Décote 1.25 %/trim manquant (max 25 %)
   - Surcote 1.25 %/trim au-delà
   - Agirc-Arrco : valeur d'achat point 20.1877 €, valeur service 1.4159 €
   - Cotisation Agirc-Arrco : 7.87 % T1 + 21.59 % T2 (taux contractuel 6.20 % T1 + 17 % T2 dont seul ce taux génère des points)

   Pure, no DOM. Exposé sous window.Calculators.retraite + window.CalcRetraite
   ============================================================ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  // ─── Constantes 2025 ───────────────────────────────────────────────
  const PASS_2025               = 47100;       // €/an
  const AGIRC_VALEUR_ACHAT      = 20.1877;     // € pour acheter 1 point en 2025
  const AGIRC_VALEUR_SERVICE    = 1.4159;      // € de pension brute par point (2025)
  const AGIRC_TAUX_T1           = 0.0620;      // 6.20 % cotisation génératrice de points sur tranche 1 (≤ PASS)
  const AGIRC_TAUX_T2           = 0.1700;      // 17.00 % cotisation génératrice sur tranche 2 (1 à 8 PASS)
  const TAUX_PLEIN              = 0.50;        // 50 % SAM
  const DECOTE_PAR_TRIM         = 0.0125;      // 1.25 % par trimestre manquant
  const SURCOTE_PAR_TRIM        = 0.0125;      // 1.25 % par trimestre supplémentaire
  const DECOTE_MAX              = 0.25;        // Plafond décote 25 %
  const NB_ANNEES_SAM           = 25;          // 25 meilleures années pour le SAM
  const TAUX_CSG_CRDS_RETRAITE  = 0.0830;      // CSG 8.3 % + CRDS 0.5 % (taux normal). 0 si revenus < seuil
  const TAUX_CASA               = 0.0030;      // CASA 0.3 %

  /* ------------------------------------------------------------
     Trimestres requis selon génération (réforme 2023 progressive)
     ------------------------------------------------------------ */
  function trimestresRequis(anneeNaissance) {
    if (anneeNaissance <= 1957) return 166;
    if (anneeNaissance === 1958 || anneeNaissance === 1959 || anneeNaissance === 1960) return 167;
    if (anneeNaissance === 1961 || anneeNaissance === 1962 || anneeNaissance === 1963) return 168;
    if (anneeNaissance === 1964 || anneeNaissance === 1965) return 169;
    if (anneeNaissance === 1966 || anneeNaissance === 1967) return 170;
    if (anneeNaissance === 1968 || anneeNaissance === 1969 || anneeNaissance === 1970 ||
        anneeNaissance === 1971 || anneeNaissance === 1972) return 171;
    return 172; // 1973 et après
  }

  /* ------------------------------------------------------------
     Âge légal de départ selon génération (réforme 2023)
     ------------------------------------------------------------ */
  function ageLegalDepart(anneeNaissance) {
    if (anneeNaissance < 1961) return 62;
    if (anneeNaissance === 1961) return 62 + 3 / 12;     // 62 ans 3 mois
    if (anneeNaissance === 1962) return 62 + 6 / 12;
    if (anneeNaissance === 1963) return 62 + 9 / 12;
    if (anneeNaissance === 1964) return 63;
    if (anneeNaissance === 1965) return 63 + 3 / 12;
    if (anneeNaissance === 1966) return 63 + 6 / 12;
    if (anneeNaissance === 1967) return 63 + 9 / 12;
    return 64;
  }

  // Âge taux plein automatique = 67 ans pour tous post-1955
  const AGE_TAUX_PLEIN_AUTO = 67;

  /* ------------------------------------------------------------
     Helpers : conversion ans ↔ trimestres
     ------------------------------------------------------------ */
  function trimestresFromAns(ans) { return Math.floor(ans * 4); }

  /* ------------------------------------------------------------
     Calcul SAM (Salaire Annuel Moyen des 25 meilleures années)
     ------------------------------------------------------------
     Approximation : on suppose le salaire actuel + croissance constante.
     Le SAM est plafonné au PASS de chaque année (revalorisé approximativement).
     ------------------------------------------------------------ */
  function calcSAM(salaireBrutAnnuelActuel, dureeCotisationAns, croissanceSalaireAnnuelle) {
    // Approximation : la CNAV revalorise les anciens salaires par coef officiels
    // (~ inflation INSEE 2 %/an). On simule donc :
    //   salaire_année_i_passée_revalorisé = salaire_actuel × (1+revalo)^i / (1+g)^i
    // Si revalo ≈ g : les salaires deviennent ~constants (ce qui est proche du réel
    // pour un salarié avec progression carrière standard).
    var REVALO = 0.02;  // coef de revalorisation moyen
    var salaires = [];
    for (var i = 0; i < dureeCotisationAns; i++) {
      var salNominal = salaireBrutAnnuelActuel / Math.pow(1 + croissanceSalaireAnnuelle, i);
      var salReval = salNominal * Math.pow(1 + REVALO, i);
      var passYear = PASS_2025 / Math.pow(1.015, i);
      var passRevalYear = passYear * Math.pow(1 + REVALO, i);
      salaires.push(Math.min(salReval, passRevalYear));
    }
    // Garde les 25 meilleures
    salaires.sort(function (a, b) { return b - a; });
    var top25 = salaires.slice(0, NB_ANNEES_SAM);
    var sum = top25.reduce(function (s, v) { return s + v; }, 0);
    return sum / Math.max(1, top25.length);
  }

  /* ------------------------------------------------------------
     Calcul pension régime général
     ------------------------------------------------------------ */
  function calcPensionRegimeGeneral(opts) {
    var anneeNaissance = opts.anneeNaissance;
    var trimValides    = opts.trimestresValides || 0;
    var ageDepart      = opts.ageDepart;
    var sam            = opts.sam;

    var trimRequis = trimestresRequis(anneeNaissance);
    var ageLegal = ageLegalDepart(anneeNaissance);

    // Calcul du taux : décote ou surcote selon trimestres
    var taux = TAUX_PLEIN;
    var trimSurplus = 0;
    var trimManquants = 0;

    if (ageDepart >= AGE_TAUX_PLEIN_AUTO) {
      // Taux plein automatique à 67 ans
      taux = TAUX_PLEIN;
      // Surcote possible si trim > requis
      if (trimValides > trimRequis) {
        trimSurplus = trimValides - trimRequis;
        taux += trimSurplus * SURCOTE_PAR_TRIM;
      }
    } else if (trimValides >= trimRequis) {
      // Taux plein car durée requise atteinte
      taux = TAUX_PLEIN;
      // Surcote si trim au-delà ET âge ≥ âge légal
      var trimSurAgeLegal = Math.max(0, (ageDepart - ageLegal) * 4);
      var trimEffectifSurcote = Math.min(trimSurAgeLegal, trimValides - trimRequis);
      if (trimEffectifSurcote > 0) {
        trimSurplus = trimEffectifSurcote;
        taux += trimSurplus * SURCOTE_PAR_TRIM;
      }
    } else {
      // Décote : trimestres manquants vs (durée requise OU âge taux plein - âge actuel)
      var trimManqDuree = trimRequis - trimValides;
      var trimManqAge   = Math.max(0, (AGE_TAUX_PLEIN_AUTO - ageDepart) * 4);
      trimManquants = Math.min(trimManqDuree, trimManqAge);
      var decote = Math.min(trimManquants * DECOTE_PAR_TRIM, DECOTE_MAX);
      taux = TAUX_PLEIN * (1 - decote);
    }

    // Pension annuelle brute = SAM × taux × (D / DR)
    var ratioDuree = Math.min(1, trimValides / trimRequis);
    var pensionBrute = sam * taux * ratioDuree;

    return {
      pensionBrute:    pensionBrute,
      taux:            taux,
      sam:             sam,
      trimValides:     trimValides,
      trimRequis:      trimRequis,
      trimManquants:   trimManquants,
      trimSurplus:     trimSurplus,
      ageLegal:        ageLegal,
      ageTauxPleinAuto: AGE_TAUX_PLEIN_AUTO,
      ratioDuree:      ratioDuree
    };
  }

  /* ------------------------------------------------------------
     Calcul points Agirc-Arrco accumulés
     ------------------------------------------------------------
     Cotisation contractuelle à 6.20 % T1 + 17 % T2 (le taux d'appel à
     127 % est lui non-générateur de points → on garde le contractuel).
     ------------------------------------------------------------ */
  function calcPointsAgircArrco(salaireBrutAnnuelActuel, dureeCotisationAns, croissanceSalaireAnnuelle, pointsExistants) {
    var totalPoints = pointsExistants || 0;
    for (var i = 0; i < dureeCotisationAns; i++) {
      // Salaire à l'année passée i
      var salYear = salaireBrutAnnuelActuel / Math.pow(1 + croissanceSalaireAnnuelle, i);
      var passYear = PASS_2025 / Math.pow(1.015, i);
      var valAchatYear = AGIRC_VALEUR_ACHAT / Math.pow(1.015, i);

      // Tranche 1 : 0 → PASS
      var t1 = Math.min(salYear, passYear);
      // Tranche 2 : PASS → 8 PASS
      var t2 = Math.max(0, Math.min(salYear - passYear, 7 * passYear));

      var cotisationPoints = t1 * AGIRC_TAUX_T1 + t2 * AGIRC_TAUX_T2;
      totalPoints += cotisationPoints / valAchatYear;
    }
    return totalPoints;
  }

  /* ------------------------------------------------------------
     Pension Agirc-Arrco
     ------------------------------------------------------------ */
  function calcPensionAgircArrco(points, ageDepart, ageLegal, trimValides, trimRequis) {
    // Coefficient de minoration si départ avant taux plein (sans condition de durée)
    // Si départ à âge légal sans durée requise : minoration 1 %/trim manquant (limite 22 trim = 22 %)
    // Si trimValides >= trimRequis OU âge ≥ 67 → pas de minoration
    var coef = 1;
    if (ageDepart < AGE_TAUX_PLEIN_AUTO && trimValides < trimRequis) {
      var trimManq = trimRequis - trimValides;
      var trimManqAge = Math.max(0, (AGE_TAUX_PLEIN_AUTO - ageDepart) * 4);
      var trimEffectif = Math.min(trimManq, trimManqAge);
      coef = Math.max(0.78, 1 - trimEffectif * 0.01);
    }
    return points * AGIRC_VALEUR_SERVICE * coef;
  }

  /* ------------------------------------------------------------
     Pension nette = pension brute − CSG/CRDS/CASA − IR (si applicable)
     ------------------------------------------------------------
     On applique le taux normal CSG (8.3 %) par défaut.
     IR : non calculé ici (dépend du foyer fiscal complet).
     ------------------------------------------------------------ */
  function pensionNetteSociale(pensionBrute) {
    return pensionBrute * (1 - TAUX_CSG_CRDS_RETRAITE - TAUX_CASA);
  }

  /* ------------------------------------------------------------
     calcRetraite — fonction principale
     ------------------------------------------------------------ */
  function calcRetraite(p) {
    var anneeNaissance      = p.anneeNaissance      || 1985;
    var anneeDebutCarriere  = p.anneeDebutCarriere  || 2010;
    var ageDepart           = p.ageDepart           || 64;
    var salaireBrut         = p.salaireBrutAnnuel   || 35000;
    var croissanceSalaire   = (p.croissanceSalaire  != null ? p.croissanceSalaire : 1.5) / 100;
    var trimDejaValides     = p.trimDejaValides     || 0;
    var pointsExistants     = p.pointsAgircArrco    || 0;
    var anneeActuelle       = p.anneeActuelle       || new Date().getFullYear();

    var anneeDepart = anneeNaissance + ageDepart;
    var dureeRestanteAns = Math.max(0, anneeDepart - anneeActuelle);
    var dureeCarriereAns = anneeDepart - anneeDebutCarriere;

    // Trimestres acquis : déjà validés + à venir
    var trimAVenir = trimestresFromAns(dureeRestanteAns);
    var trimTotaux = trimDejaValides + trimAVenir;

    // SAM sur les 25 meilleures années (sur toute la carrière)
    var sam = calcSAM(salaireBrut, dureeCarriereAns, croissanceSalaire);

    // Pension régime général
    var rg = calcPensionRegimeGeneral({
      anneeNaissance:    anneeNaissance,
      trimestresValides: trimTotaux,
      ageDepart:         ageDepart,
      sam:               sam
    });

    // Points Agirc-Arrco
    var pointsTotal = calcPointsAgircArrco(salaireBrut, dureeCarriereAns, croissanceSalaire, pointsExistants);
    var pensionAgirc = calcPensionAgircArrco(pointsTotal, ageDepart, rg.ageLegal, trimTotaux, rg.trimRequis);

    var pensionTotaleBrute = rg.pensionBrute + pensionAgirc;
    var pensionTotaleNette = pensionNetteSociale(pensionTotaleBrute);

    // Taux de remplacement = pension nette / dernier salaire net (proxy : 0.78 du brut)
    var dernierNet = salaireBrut * 0.78;
    var tauxRemplacementBrut = salaireBrut > 0 ? (pensionTotaleBrute / salaireBrut) : 0;
    var tauxRemplacementNet  = dernierNet > 0 ? (pensionTotaleNette / dernierNet) : 0;

    return {
      // Inputs normalisés
      anneeNaissance:      anneeNaissance,
      anneeDebutCarriere:  anneeDebutCarriere,
      ageDepart:           ageDepart,
      anneeDepart:         anneeDepart,
      salaireBrutAnnuel:   salaireBrut,

      // Régime général
      pensionRegimeGeneralAnnuelle:  rg.pensionBrute,
      pensionRegimeGeneralMensuelle: rg.pensionBrute / 12,
      taux:                rg.taux,
      sam:                 sam,
      trimValides:         trimTotaux,
      trimRequis:          rg.trimRequis,
      trimManquants:       rg.trimManquants,
      trimSurplus:         rg.trimSurplus,
      ageLegal:            rg.ageLegal,
      ratioDuree:          rg.ratioDuree,

      // Agirc-Arrco
      pointsAgircArrco:    pointsTotal,
      pensionAgircAnnuelle:  pensionAgirc,
      pensionAgircMensuelle: pensionAgirc / 12,

      // Total
      pensionAnnuelleBrute:    pensionTotaleBrute,
      pensionMensuelleBrute:   pensionTotaleBrute / 12,
      pensionAnnuelleNette:    pensionTotaleNette,
      pensionMensuelleNette:   pensionTotaleNette / 12,
      tauxRemplacementBrut:    tauxRemplacementBrut * 100,
      tauxRemplacementNet:     tauxRemplacementNet * 100
    };
  }

  /* ------------------------------------------------------------
     compareDepart — compare le départ à différents âges (62 → 70)
     ------------------------------------------------------------ */
  function compareDepart(p, ages) {
    var list = ages || [62, 63, 64, 65, 66, 67, 68];
    return list.map(function (age) {
      var r = calcRetraite(Object.assign({}, p, { ageDepart: age }));
      return {
        age:                  age,
        pensionMensuelleBrute: r.pensionMensuelleBrute,
        pensionMensuelleNette: r.pensionMensuelleNette,
        taux:                 r.taux,
        trimManquants:        r.trimManquants,
        trimSurplus:          r.trimSurplus,
        result:               r
      };
    });
  }

  /* ------------------------------------------------------------
     calcRachatTrimestres — coût/bénéfice du rachat
     ------------------------------------------------------------
     Coût indicatif (option taux et durée, le plus cher) : ~5 200 € /trim
     pour un quadragénaire à TMI 30 % (estimation 2025).
     Bénéfice = surcroît de pension annuelle × espérance de vie restante
     ------------------------------------------------------------ */
  function calcRachatTrimestres(p, nbTrimestresRachetes, coutParTrimestre) {
    var coutUnit = coutParTrimestre || 5200;
    var coutTotal = nbTrimestresRachetes * coutUnit;

    var rSans = calcRetraite(p);
    var rAvec = calcRetraite(Object.assign({}, p, {
      trimDejaValides: (p.trimDejaValides || 0) + nbTrimestresRachetes
    }));

    var gainAnnuelBrut = rAvec.pensionAnnuelleBrute - rSans.pensionAnnuelleBrute;
    var gainAnnuelNet  = rAvec.pensionAnnuelleNette - rSans.pensionAnnuelleNette;
    var ageEsperance = 85; // espérance vie moyenne FR
    var ageDepart = p.ageDepart || 64;
    var anneesRetraite = Math.max(1, ageEsperance - ageDepart);
    var gainTotalNet = gainAnnuelNet * anneesRetraite;
    var roi = gainTotalNet > coutTotal && coutTotal > 0 ? gainTotalNet / coutTotal : 0;
    var anneesRentabilite = gainAnnuelNet > 0 ? coutTotal / gainAnnuelNet : Infinity;

    return {
      nbTrimestresRachetes: nbTrimestresRachetes,
      coutUnitaire:         coutUnit,
      coutTotal:            coutTotal,
      gainAnnuelBrut:       gainAnnuelBrut,
      gainAnnuelNet:        gainAnnuelNet,
      gainMensuelNet:       gainAnnuelNet / 12,
      gainTotalNet:         gainTotalNet,
      anneesRentabilite:    anneesRentabilite,
      roi:                  roi,
      pensionAvant:         rSans,
      pensionApres:         rAvec
    };
  }

  /* ------------------------------------------------------------
     calcCarriereLongue — éligibilité départ anticipé carrière longue
     ------------------------------------------------------------ */
  function calcCarriereLongue(p) {
    var ageDebut = p.anneeDebutCarriere - p.anneeNaissance;
    var trimAv20Ans = p.trimAvant20Ans || 0;

    // Règles 2023+ :
    // - Début avant 16 ans + 5 trim avant 16 → départ 58 ans (sous condition trim requis)
    // - Début avant 18 ans → départ 60 ans
    // - Début avant 20 ans → départ 62 ans
    // - Début avant 21 ans → départ 63 ans
    var ageDepartPossible = null;
    var conditionMet = trimAv20Ans >= 5;
    if (ageDebut < 16 && trimAv20Ans >= 5) ageDepartPossible = 58;
    else if (ageDebut < 18 && trimAv20Ans >= 5) ageDepartPossible = 60;
    else if (ageDebut < 20 && trimAv20Ans >= 5) ageDepartPossible = 62;
    else if (ageDebut < 21 && trimAv20Ans >= 5) ageDepartPossible = 63;

    if (!ageDepartPossible) {
      return { eligible: false, ageDebut: ageDebut, raison: 'Conditions non remplies' };
    }

    var rNormal = calcRetraite(p);
    var rAnticipe = calcRetraite(Object.assign({}, p, { ageDepart: ageDepartPossible }));

    return {
      eligible:           true,
      ageDebut:           ageDebut,
      trimAvant20Ans:     trimAv20Ans,
      ageDepartPossible:  ageDepartPossible,
      pensionNormale:     rNormal,
      pensionAnticipee:   rAnticipe,
      gainAnneesAnticipees: (p.ageDepart || 64) - ageDepartPossible,
      pensionMensuelleAnticipee: rAnticipe.pensionMensuelleBrute,
      ecartMensuel:       rNormal.pensionMensuelleBrute - rAnticipe.pensionMensuelleBrute
    };
  }

  /* ------------------------------------------------------------
     calcSensibiliteSalaire — variations du salaire / croissance
     ------------------------------------------------------------ */
  function calcSensibiliteSalaire(p, scenarios) {
    var configs = scenarios || [0, 1, 2, 3, 4];
    return configs.map(function (croissance) {
      var r = calcRetraite(Object.assign({}, p, { croissanceSalaire: croissance }));
      return {
        croissance:           croissance,
        pensionMensuelleBrute: r.pensionMensuelleBrute,
        pensionMensuelleNette: r.pensionMensuelleNette,
        sam:                  r.sam,
        result:               r
      };
    });
  }

  /* ------------------------------------------------------------
     Exports
     ------------------------------------------------------------ */
  const mod = {
    calcRetraite:           calcRetraite,
    compareDepart:          compareDepart,
    calcRachatTrimestres:   calcRachatTrimestres,
    calcCarriereLongue:     calcCarriereLongue,
    calcSensibiliteSalaire: calcSensibiliteSalaire,

    // Helpers exposés
    trimestresRequis:       trimestresRequis,
    ageLegalDepart:         ageLegalDepart,
    calcSAM:                calcSAM,
    calcPointsAgircArrco:   calcPointsAgircArrco,

    // Constantes
    PASS_2025:              PASS_2025,
    AGIRC_VALEUR_SERVICE:   AGIRC_VALEUR_SERVICE,
    AGIRC_VALEUR_ACHAT:     AGIRC_VALEUR_ACHAT,
    TAUX_PLEIN:             TAUX_PLEIN,
    AGE_TAUX_PLEIN_AUTO:    AGE_TAUX_PLEIN_AUTO
  };

  if (isNode) {
    module.exports = mod;
  } else {
    root.Calculators = root.Calculators || {};
    root.Calculators.retraite = mod;
    root.CalcRetraite = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis);
