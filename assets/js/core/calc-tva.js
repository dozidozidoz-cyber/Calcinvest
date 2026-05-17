/* ============================================================
   CalcInvest — Core TVA / Auto-Entrepreneur (France 2025)

   2 modules :
   1. TVA HT ↔ TTC (4 taux : 20% / 10% / 5.5% / 2.1%)
   2. Auto-entrepreneur : cotisations + impôt + seuils
   ============================================================ */
(function (global) {
  'use strict';

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb || 0);
  }

  const TVA_RATES = [
    { code: 'normal',    rate: 0.20,  label: 'Taux normal 20 %',    desc: 'Majorité des biens et services' },
    { code: 'intermed',  rate: 0.10,  label: 'Taux intermédiaire 10 %', desc: 'Restauration, transport, travaux logement > 2 ans' },
    { code: 'reduit',    rate: 0.055, label: 'Taux réduit 5.5 %',   desc: 'Alimentation, livres, billets culture/sport, énergie' },
    { code: 'super',     rate: 0.021, label: 'Taux super-réduit 2.1 %', desc: 'Médicaments remboursés, presse, redevance TV' }
  ];

  /**
   * Conversion HT ↔ TTC
   * @param {Object} p { mode: 'htToTtc' | 'ttcToHt' | 'tvaFromHt' | 'tvaFromTtc', amount, taxCode }
   */
  function tva(p) {
    const amount = num(p.amount, 0);
    const taxCode = p.taxCode || 'normal';
    const rate = (TVA_RATES.find(t => t.code === taxCode) || TVA_RATES[0]).rate;
    const mode = p.mode || 'htToTtc';
    let ht, ttc, tvaAmount;
    if (mode === 'ttcToHt') {
      ttc = amount;
      ht = ttc / (1 + rate);
      tvaAmount = ttc - ht;
    } else {
      ht = amount;
      tvaAmount = ht * rate;
      ttc = ht + tvaAmount;
    }
    return { ht, ttc, tva: tvaAmount, rate: rate * 100, taxCode };
  }

  /* ============================================================
     AUTO-ENTREPRENEUR (micro-entreprise) 2025
     Sources : URSSAF Indépendants, BOFiP-Impôts.
     ============================================================ */

  // Seuils CA annuels (2025)
  const SEUILS_2025 = {
    venteMarchandises: 188700,   // < 188 700 € : franchise TVA + micro-BIC autorisé
    franchiseTvaVente: 91900,    // < 91 900 € : franchise TVA (seuil bas) — règle 2025 modifiée
    prestaServices:    77700,
    franchiseTvaPresta: 36800,
    professionsLib:    77700
  };

  // Taux cotisations sociales 2025 (URSSAF Indépendants)
  const TAUX_URSSAF = {
    venteMarchandises:  0.123,   // 12.3 %
    prestaServicesBIC:  0.211,   // 21.1 %
    prestaServicesBNC:  0.211,   // 21.1 %
    professionsLibCipav:0.232    // 23.2 % (CIPAV depuis 2023)
  };

  // Versement libératoire IR (option) — barème 2025
  const TAUX_VL = {
    venteMarchandises:  0.010,
    prestaServicesBIC:  0.017,
    prestaServicesBNC:  0.022,
    professionsLibCipav:0.022
  };

  // Abattement forfaitaire micro-fiscal (si pas versement libératoire)
  const ABATTEMENT = {
    venteMarchandises:  0.71, // 71 %
    prestaServicesBIC:  0.50, // 50 %
    prestaServicesBNC:  0.34, // 34 %
    professionsLibCipav:0.34
  };

  /**
   * Calcule le net après cotisations URSSAF + IR pour un auto-entrepreneur.
   *
   * @param {Object} p
   * @param {number} p.caAnnuel     Chiffre d'affaires annuel (€)
   * @param {string} p.activite     'venteMarchandises' | 'prestaServicesBIC' | 'prestaServicesBNC' | 'professionsLibCipav'
   * @param {boolean} p.versementLiberatoire   true si option VL choisie
   * @param {number} p.tmi          TMI si pas de VL (pour estimer IR)
   * @param {number} p.qf           Quotient familial (parts) si IR calculé
   * @returns {Object}
   */
  function autoEntrepreneur(p) {
    const ca = num(p.caAnnuel, 0);
    const activite = p.activite || 'prestaServicesBIC';
    const vl = !!p.versementLiberatoire;
    const tmi = num(p.tmi, 30) / 100;

    const tauxUrssaf = TAUX_URSSAF[activite] || TAUX_URSSAF.prestaServicesBIC;
    const tauxVL = TAUX_VL[activite] || TAUX_VL.prestaServicesBIC;
    const abattement = ABATTEMENT[activite] || ABATTEMENT.prestaServicesBIC;
    const seuil = SEUILS_2025[activite === 'venteMarchandises' ? 'venteMarchandises' :
                              activite === 'professionsLibCipav' ? 'professionsLib' : 'prestaServices'];
    const seuilTva = SEUILS_2025[activite === 'venteMarchandises' ? 'franchiseTvaVente' : 'franchiseTvaPresta'];

    // Cotisations URSSAF
    const cotisUrssaf = ca * tauxUrssaf;

    // CFP (Contribution à la Formation Professionnelle) — 0.1 à 0.3 % selon activité
    const taxCfp = activite === 'venteMarchandises' ? 0.001
                  : activite === 'professionsLibCipav' ? 0.002 : 0.003;
    const cfp = ca * taxCfp;

    // Cotisation foncière des entreprises (CFE) — fixe ~250 €/an dès 2e année (estimation)
    const cfe = 0; // On laisse à 0 par défaut, l'utilisateur peut estimer

    let ir = 0;
    let nature = '';

    if (vl) {
      // Versement libératoire : IR forfaitaire
      ir = ca * tauxVL;
      nature = 'Versement libératoire (' + (tauxVL * 100).toFixed(1) + ' %)';
    } else {
      // Régime micro-fiscal : abattement forfaitaire puis barème IR du foyer
      const revenuImposable = ca * (1 - abattement);
      ir = revenuImposable * tmi;
      nature = 'Micro-fiscal (abattement ' + (abattement * 100).toFixed(0) + ' %, taxé à TMI ' + (tmi * 100).toFixed(0) + ' %)';
    }

    const totalPrelevements = cotisUrssaf + cfp + cfe + ir;
    const netDansLaPoche = ca - totalPrelevements;
    const tauxNet = ca > 0 ? (netDansLaPoche / ca) * 100 : 0;

    // Seuils
    const depasseSeuil = ca > seuil;
    const depasseSeuilTva = ca > seuilTva;

    return {
      caAnnuel: ca,
      activite,
      cotisUrssaf,
      tauxUrssaf: tauxUrssaf * 100,
      cfp,
      cfe,
      ir,
      natureIR: nature,
      versementLiberatoire: vl,
      totalPrelevements,
      netDansLaPoche,
      tauxNet,
      // Mensuel
      caMensuel: ca / 12,
      netMensuel: netDansLaPoche / 12,
      cotisMensuelle: (cotisUrssaf + cfp) / 12,
      // Seuils
      seuilCA: seuil,
      seuilCADepasse: depasseSeuil,
      seuilTVA: seuilTva,
      seuilTVADepasse: depasseSeuilTva,
      // Pour info : revenu imposable (si pas VL)
      revenuImposable: vl ? 0 : ca * (1 - abattement)
    };
  }

  const api = { tva, autoEntrepreneur, TVA_RATES, SEUILS_2025, TAUX_URSSAF, ABATTEMENT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TVA = api;
})(typeof window !== 'undefined' ? window : globalThis);
