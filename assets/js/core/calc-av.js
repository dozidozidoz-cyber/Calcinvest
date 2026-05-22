/* ============================================================
   CalcInvest — Core Assurance-Vie (France 2025)

   Simule un contrat d'assurance-vie multi-supports :
   - Fonds euros (capital garanti, ~2.5 %)
   - Unités de compte (UC, sans garantie, ~6 %)
   - Mix paramétrable

   Fiscalité française 2025 :
   - Phase capitalisation : pas d'IR ni PS sur les plus-values
     (sauf PS annuelles sur les fonds €)
   - Rachat avant 8 ans : PFU 30 % sur la part plus-value du rachat
   - Rachat après 8 ans :
       * Abattement annuel : 4 600 € (célib) / 9 200 € (couple)
       * Au-delà, jusqu'à 150 000 € versés : 7.5 % IR + 17.2 % PS
       * Au-delà de 150 000 € versés : 12.8 % IR + 17.2 % PS
   - Succession : versements avant 70 ans → exonération 152 500 € /
     bénéficiaire, puis 20 % jusqu'à 700k, 31.25 % au-delà
     (versements après 70 ans → abattement 30 500 € global)

   Sources : article 990 I CGI, article 125-0 A CGI, BOFiP.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  const PS_RATE = 0.172;            // Prélèvements sociaux
  const IR_AVANT_8 = 0.128;          // PFU IR part
  const IR_APRES_8_FAVORABLE = 0.075; // 7.5 % si versements < 150k
  const IR_APRES_8_AUDELA = 0.128;    // 12.8 % si > 150k
  const ABAT_CELIB = 4600;
  const ABAT_COUPLE = 9200;
  const SEUIL_VERSEMENTS_FAVORABLE = 150000;

  /**
   * Simule un contrat d'AV multi-supports.
   *
   * @param {Object} p
   * @param {number} p.K0            Versement initial (€)
   * @param {number} p.monthly       Versement mensuel (€)
   * @param {number} p.years         Durée totale (années)
   * @param {number} p.allocUC       Part UC (0-100 %)
   * @param {number} p.rendFondsEur  Rendement net fonds € (%/an, ~2.5)
   * @param {number} p.rendUC        Rendement brut UC (%/an, ~6)
   * @param {number} p.fraisEntree   Frais d'entrée (%) sur chaque versement
   * @param {number} p.fraisGestionUC Frais gestion UC (%/an, ~0.8)
   * @param {number} p.fraisGestionEur Frais gestion fonds € (%/an, ~0.6)
   * @param {boolean} p.couple       Couple marié/PACSé (abattement doublé)
   * @returns {Object}
   */
  function simulerAV(p) {
    const K0 = num(p.K0, 10000);
    const monthly = num(p.monthly, 0);
    const years = Math.max(1, num(p.years, 20));
    const allocUC = Math.max(0, Math.min(100, num(p.allocUC, 50))) / 100;
    const allocEur = 1 - allocUC;
    const rEur = num(p.rendFondsEur, 2.5) / 100;
    const rUC = num(p.rendUC, 6) / 100;
    const feeIn = num(p.fraisEntree, 3) / 100;
    const feeUC = num(p.fraisGestionUC, 0.8) / 100;
    const feeEur = num(p.fraisGestionEur, 0.6) / 100;
    const couple = !!p.couple;

    const months = years * 12;
    const psAnnuelEur = p.psAnnuelEur !== false; // par défaut ON (réalité légale)
    const inflation = num(p.inflation, 0) / 100;
    // Net of fees (annual rate)
    let rEurNet = rEur - feeEur;
    // PS annuels 17.2 % sur le gain fonds € → réduit le rendement net effectif
    // Exact car les PS sont calculés sur le gain et le rendement composé est multiplicatif
    let psAnnuelsCumulPaid = 0;
    if (psAnnuelEur) rEurNet = rEurNet * (1 - 0.172);
    const rUCNet = rUC - feeUC;
    const rMixNet = allocEur * rEurNet + allocUC * rUCNet;
    const monthlyRate = Math.pow(1 + rMixNet, 1 / 12) - 1;

    let capital = K0 * (1 - feeIn);
    let totalVerse = K0;
    const monthlyNet = monthly * (1 - feeIn);

    const serie = [{ month: 0, value: capital, verse: K0 }];
    for (let m = 1; m <= months; m++) {
      capital = capital * (1 + monthlyRate);
      if (monthly > 0) {
        capital += monthlyNet;
        totalVerse += monthly;
      }
      serie.push({ month: m, value: capital, verse: totalVerse });
    }

    const plusValue = Math.max(0, capital - totalVerse);
    const fraisTotaux = (K0 + monthly * 12 * years) * feeIn; // frais d'entrée cumulés (approx)

    // Fiscalité de rachat total
    const fisc = fiscaliteRachat({
      plusValue,
      versementsBruts: totalVerse,
      yearsHeld: years,
      couple
    });

    // Valeur réelle (post-inflation) sur le NET reçu après impôt sortie
    const netRecuTotal = totalVerse + (fisc.netRecu || 0);
    const valeurReelle = inflation > 0
      ? netRecuTotal / Math.pow(1 + inflation, years)
      : netRecuTotal;

    return {
      // Versements
      verseTotal: totalVerse,
      K0,
      monthly,
      // Allocation
      allocUC: allocUC * 100,
      allocEur: allocEur * 100,
      rendementMixNet: rMixNet * 100,
      // Capital
      capitalFinal: capital,
      plusValue,
      fraisEntreeTotaux: fraisTotaux,
      psAnnuelEurActif: psAnnuelEur,
      valeurReelle,
      inflation: inflation * 100,
      // Fiscalité sortie (rachat total)
      ...fisc,
      // Série pour chart
      serie,
      // TRI net
      tri: years > 0 && totalVerse > 0
        ? (Math.pow(capital / totalVerse, 1 / years) - 1) * 100
        : 0
    };
  }

  /**
   * Calcule la fiscalité d'un rachat total ou partiel.
   * @param {Object} p { plusValue, versementsBruts, yearsHeld, couple, rachatTotal?, rachatPartiel? }
   */
  function fiscaliteRachat(p) {
    const pv = num(p.plusValue, 0);
    const versements = num(p.versementsBruts, 0);
    const yearsHeld = num(p.yearsHeld, 0);
    const couple = !!p.couple;

    if (pv <= 0) {
      return { impotIR: 0, impotPS: 0, totalImpot: 0, abattementAppliq: 0, netRecu: pv, regimeFiscal: 'pas de plus-value' };
    }

    const ps = pv * PS_RATE;

    if (yearsHeld < 8) {
      const ir = pv * IR_AVANT_8;
      return {
        impotIR: ir, impotPS: ps,
        totalImpot: ir + ps,
        abattementAppliq: 0,
        netRecu: pv - ir - ps,
        regimeFiscal: 'PFU 30 % (< 8 ans)',
        tauxIR: IR_AVANT_8 * 100
      };
    }

    // Après 8 ans
    const abattement = couple ? ABAT_COUPLE : ABAT_CELIB;
    const pvImposable = Math.max(0, pv - abattement);

    // Le seuil 150k de versements s'applique au capital VERSÉ, pas à la plus-value
    let ir;
    let tauxApplique;
    if (versements <= SEUIL_VERSEMENTS_FAVORABLE) {
      ir = pvImposable * IR_APRES_8_FAVORABLE;
      tauxApplique = IR_APRES_8_FAVORABLE * 100;
    } else {
      // Part favorable au prorata des 150 premiers k€ versés
      const partFavorable = SEUIL_VERSEMENTS_FAVORABLE / versements;
      const pvFavorable = pvImposable * partFavorable;
      const pvAuDela = pvImposable * (1 - partFavorable);
      ir = pvFavorable * IR_APRES_8_FAVORABLE + pvAuDela * IR_APRES_8_AUDELA;
      tauxApplique = (ir / pvImposable) * 100;
    }

    return {
      impotIR: ir,
      impotPS: ps,
      totalImpot: ir + ps,
      abattementAppliq: Math.min(pv, abattement),
      netRecu: pv - ir - ps,
      regimeFiscal: 'Après 8 ans, abat. ' + abattement.toLocaleString('fr-FR') + ' €',
      tauxIR: tauxApplique
    };
  }

  /**
   * Compare AV vs CTO vs PER pour le même versement.
   */
  function compareAVvsAlternatives(p) {
    const K0 = num(p.K0, 10000);
    const monthly = num(p.monthly, 0);
    const years = Math.max(1, num(p.years, 20));
    const rUC = num(p.rendUC, 6) / 100;
    const tmi = num(p.tmi, 30) / 100;

    function fvDCA(annualRate, K0_, m_, yrs) {
      const r = annualRate / 12;
      let v = K0_;
      for (let i = 0; i < yrs * 12; i++) v = v * (1 + r) + m_;
      return v;
    }
    const totalVerse = K0 + monthly * 12 * years;

    // AV (UC 100 %)
    const av = simulerAV({ ...p, allocUC: 100, fraisEntree: 3, fraisGestionUC: 0.8 });

    // CTO (rendement brut, PFU 30 % en sortie)
    const ctoBrut = fvDCA(rUC, K0, monthly, years);
    const ctoPV = Math.max(0, ctoBrut - totalVerse);
    const ctoNet = ctoBrut - ctoPV * 0.30;

    // PER (avantage fiscal à l'entrée = TMI × versements, sortie taxée TMI + PS)
    const perBrut = fvDCA(rUC, K0, monthly, years);
    const economieEntree = totalVerse * tmi;
    const perPV = Math.max(0, perBrut - totalVerse);
    const perNet = perBrut - perPV * 0.172 - perBrut * tmi; // simplification : sortie 100% capital taxé TMI
    const perEffectif = perNet + economieEntree;

    return [
      { name: 'AV (UC 100 %)',  net: av.netRecu + av.verseTotal /*on additionne le K versé restitué pour comparer*/, plusValue: av.plusValue, impot: av.totalImpot },
      { name: 'CTO ETF',        net: ctoNet, plusValue: ctoPV, impot: ctoPV * 0.30 },
      { name: 'PER déductible', net: perEffectif, plusValue: perPV, impot: perPV * 0.172 + perBrut * tmi - economieEntree }
    ];
  }

  /**
   * Calcule la fiscalité succession sur un contrat d'AV.
   * Simplifié : suppose tous les versements avant 70 ans (cas le + courant).
   */
  function fiscaliteSuccession(p) {
    const capital = num(p.capital, 100000);
    const nombreBeneficiaires = Math.max(1, num(p.nombreBeneficiaires, 1));
    const versementsApres70 = num(p.versementsApres70, 0);

    const ABAT_AV70 = 152500; // par bénéficiaire
    const ABAT_APRES70 = 30500; // global, sur la somme des versements après 70 ans

    // Versements avant 70 ans + plus-value : régime art. 990 I
    const capitalAvant70 = capital - versementsApres70;
    const partParBenef = capitalAvant70 / nombreBeneficiaires;
    const taxableParBenef = Math.max(0, partParBenef - ABAT_AV70);
    // Taux : 20 % jusqu'à 700k taxable, 31.25 % au-delà
    let droitsParBenef = 0;
    if (taxableParBenef <= 700000) {
      droitsParBenef = taxableParBenef * 0.20;
    } else {
      droitsParBenef = 700000 * 0.20 + (taxableParBenef - 700000) * 0.3125;
    }
    const totalDroitsAvant70 = droitsParBenef * nombreBeneficiaires;

    // Versements après 70 ans : régime art. 757 B (droits de mutation classiques sur la part > 30 500 €)
    const taxableApres70 = Math.max(0, versementsApres70 - ABAT_APRES70);
    // Simplification : taux moyen estimé 20 % (varie selon lien de parenté)
    const droitsApres70 = taxableApres70 * 0.20;

    return {
      capitalTotal: capital,
      capitalAvant70,
      versementsApres70,
      nombreBeneficiaires,
      abattementParBenef: ABAT_AV70,
      abattementApres70Global: ABAT_APRES70,
      droitsAvant70: totalDroitsAvant70,
      droitsApres70,
      totalDroits: totalDroitsAvant70 + droitsApres70,
      netTransmis: capital - totalDroitsAvant70 - droitsApres70,
      tauxEffectif: capital > 0 ? ((totalDroitsAvant70 + droitsApres70) / capital) * 100 : 0
    };
  }

  const api = { simulerAV, fiscaliteRachat, compareAVvsAlternatives, fiscaliteSuccession };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.AV = api;
})(typeof window !== 'undefined' ? window : globalThis);
