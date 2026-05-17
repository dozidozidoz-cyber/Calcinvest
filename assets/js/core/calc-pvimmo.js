/* ============================================================
   CalcInvest — Plus-Value Immobilière (France 2025)

   Régime particuliers — cession immobilière (résidence secondaire,
   locatif, terrain). La résidence principale est exonérée totale.

   Fiscalité :
   - IR : 19 % sur la plus-value imposable
   - PS : 17.2 % sur la plus-value imposable
   - Surtaxe pour les plus-values immobilières > 50 000 € (2 % à 6 %)

   Abattements pour durée de détention :
   - IR (19 %)  : 6 % par an de la 6e à la 21e année, 4 % la 22e
                   → exonération IR à 22 ans
   - PS (17.2 %): 1.65 % de la 6e à la 21e, 1.60 % la 22e,
                   9 % par an de la 23e à la 30e
                   → exonération PS à 30 ans

   Sources : article 150 VC du CGI, BOFiP.
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  // Abattement IR par année de détention
  function abattementIR(years) {
    if (years < 6) return 0;
    if (years >= 22) return 1;
    if (years === 22) return 1; // sécurité
    // Années 6 à 21 : 6 % chacune
    const fullYears = Math.min(years, 21) - 5; // 1..16
    let pct = fullYears * 0.06;
    if (years >= 22) pct += 0.04; // dernière année
    return Math.min(pct, 1);
  }

  // Abattement PS par année de détention
  function abattementPS(years) {
    if (years < 6) return 0;
    if (years >= 30) return 1;
    let pct = 0;
    // Années 6 à 21 : 1.65 % chacune
    const phase1 = Math.min(years, 21) - 5;
    pct += phase1 * 0.0165;
    // Année 22 : 1.60 %
    if (years >= 22) pct += 0.016;
    // Années 23 à 30 : 9 % chacune
    if (years >= 23) {
      const phase2 = Math.min(years, 30) - 22;
      pct += phase2 * 0.09;
    }
    return Math.min(pct, 1);
  }

  /**
   * Surtaxe sur plus-value > 50 000 € (article 1609 nonies G).
   * Barème progressif marginal.
   */
  function surtaxe(pv) {
    if (pv <= 50000) return 0;
    // Barème simplifié (approximation marginal lissé)
    if (pv <= 60000)  return (pv - 50000) * 0.02;
    if (pv <= 100000) return (pv - 60000) * 0.02 + 200;
    if (pv <= 110000) return (pv - 100000) * 0.03 + 1000;
    if (pv <= 150000) return (pv - 110000) * 0.03 + 1300;
    if (pv <= 160000) return (pv - 150000) * 0.04 + 2500;
    if (pv <= 200000) return (pv - 160000) * 0.04 + 2900;
    if (pv <= 210000) return (pv - 200000) * 0.05 + 4500;
    if (pv <= 250000) return (pv - 210000) * 0.05 + 5000;
    if (pv <= 260000) return (pv - 250000) * 0.06 + 7000;
    return pv * 0.06; // au-delà
  }

  /**
   * Calcule la fiscalité d'une cession immobilière.
   * @param {Object} p
   * @param {number} p.prixVente              Prix de cession (€)
   * @param {number} p.prixAchat              Prix d'achat initial (€)
   * @param {number} p.fraisAcquisition       Frais d'acquisition (notaire, agence). Si non précisé : forfait 7.5 % du prix d'achat
   * @param {number} p.travaux                Travaux réalisés (€). Si non précisé : forfait 15 % du prix d'achat (si détention > 5 ans)
   * @param {number} p.dureeDetention         Années de détention
   * @param {boolean} p.residencePrincipale   true → exonération totale
   * @param {boolean} p.utiliserForfaitFrais  true → 7.5 % forfaitaire
   * @param {boolean} p.utiliserForfaitTravaux true → 15 % forfaitaire (si > 5 ans)
   */
  function calcPV(p) {
    const prixVente = num(p.prixVente, 0);
    const prixAchat = num(p.prixAchat, 0);
    const dureeDetention = Math.max(0, num(p.dureeDetention, 0));
    const residencePrincipale = !!p.residencePrincipale;

    if (residencePrincipale) {
      return {
        prixVente, prixAchat, dureeDetention,
        plusValueBrute: prixVente - prixAchat,
        plusValueImposable: 0,
        abattementIR: 1, abattementPS: 1,
        irDu: 0, psDu: 0, surtaxe: 0, totalImpot: 0,
        netCedant: prixVente,
        exoneration: 'Résidence principale — exonération totale (art. 150 U CGI)'
      };
    }

    // Frais d'acquisition
    let fraisAcq = num(p.fraisAcquisition, 0);
    if (p.utiliserForfaitFrais || !fraisAcq) {
      fraisAcq = prixAchat * 0.075; // 7.5 %
    }

    // Travaux
    let travaux = num(p.travaux, 0);
    if (p.utiliserForfaitTravaux && dureeDetention >= 5) {
      travaux = Math.max(travaux, prixAchat * 0.15);
    }

    const prixAchatMaj = prixAchat + fraisAcq + travaux;
    const plusValueBrute = Math.max(0, prixVente - prixAchatMaj);

    if (plusValueBrute <= 0) {
      return {
        prixVente, prixAchat, dureeDetention,
        prixAchatMajore: prixAchatMaj, fraisAcquisition: fraisAcq, travaux,
        plusValueBrute: prixVente - prixAchatMaj,
        plusValueImposable: 0,
        abattementIR: 0, abattementPS: 0,
        irDu: 0, psDu: 0, surtaxe: 0, totalImpot: 0,
        netCedant: prixVente,
        moinsValue: true
      };
    }

    const abIR = abattementIR(dureeDetention);
    const abPS = abattementPS(dureeDetention);
    const pvImposableIR = plusValueBrute * (1 - abIR);
    const pvImposablePS = plusValueBrute * (1 - abPS);

    const irDu = pvImposableIR * 0.19;
    const psDu = pvImposablePS * 0.172;
    const surt = surtaxe(pvImposableIR);
    const totalImpot = irDu + psDu + surt;
    const netCedant = prixVente - totalImpot;

    return {
      prixVente, prixAchat, dureeDetention,
      prixAchatMajore: prixAchatMaj,
      fraisAcquisition: fraisAcq,
      travaux,
      plusValueBrute,
      abattementIR: abIR * 100,
      abattementPS: abPS * 100,
      plusValueImposableIR: pvImposableIR,
      plusValueImposablePS: pvImposablePS,
      irDu, psDu, surtaxe: surt,
      totalImpot,
      netCedant,
      tauxImpotEffectif: plusValueBrute > 0 ? (totalImpot / plusValueBrute) * 100 : 0
    };
  }

  /**
   * Renvoie la table année par année : abattement & impôt si on vend
   * à cette année-là. Utile pour visualiser "à partir de quand je vends".
   */
  function tableByYears(p, maxYears) {
    maxYears = maxYears || 32;
    const rows = [];
    for (let y = 0; y <= maxYears; y++) {
      const r = calcPV({ ...p, dureeDetention: y });
      rows.push({ year: y, ...r });
    }
    return rows;
  }

  const api = { calcPV, tableByYears, abattementIR, abattementPS, surtaxe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PVIMMO = api;
})(typeof window !== 'undefined' ? window : globalThis);
