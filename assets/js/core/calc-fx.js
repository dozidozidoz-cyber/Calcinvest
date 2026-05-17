/* ============================================================
   CalcInvest — Core Convertisseur Devises
   Logique pure, utilise PRICES (api-prices.js) pour les taux live.
   Fallback statique si l'API n'est pas dispo.
   ============================================================ */
(function (global) {
  'use strict';

  // Devises supportées (les plus tradées + EUR-centriques)
  const CURRENCIES = [
    { code: 'EUR', name: 'Euro',                  symbol: '€', flag: '🇪🇺' },
    { code: 'USD', name: 'Dollar US',             symbol: '$', flag: '🇺🇸' },
    { code: 'GBP', name: 'Livre sterling',        symbol: '£', flag: '🇬🇧' },
    { code: 'JPY', name: 'Yen japonais',          symbol: '¥', flag: '🇯🇵' },
    { code: 'CHF', name: 'Franc suisse',          symbol: 'CHF',flag: '🇨🇭' },
    { code: 'CAD', name: 'Dollar canadien',       symbol: 'C$',flag: '🇨🇦' },
    { code: 'AUD', name: 'Dollar australien',     symbol: 'A$',flag: '🇦🇺' },
    { code: 'CNY', name: 'Yuan chinois',          symbol: '¥', flag: '🇨🇳' },
    { code: 'HKD', name: 'Dollar HK',             symbol: 'HK$',flag:'🇭🇰' },
    { code: 'SGD', name: 'Dollar Singapour',      symbol: 'S$',flag: '🇸🇬' },
    { code: 'SEK', name: 'Couronne suédoise',     symbol: 'kr',flag: '🇸🇪' },
    { code: 'NOK', name: 'Couronne norvégienne',  symbol: 'kr',flag: '🇳🇴' },
    { code: 'DKK', name: 'Couronne danoise',      symbol: 'kr',flag: '🇩🇰' },
    { code: 'PLN', name: 'Zloty polonais',        symbol: 'zł',flag: '🇵🇱' },
    { code: 'CZK', name: 'Couronne tchèque',      symbol: 'Kč',flag: '🇨🇿' },
    { code: 'HUF', name: 'Forint hongrois',       symbol: 'Ft',flag: '🇭🇺' },
    { code: 'TRY', name: 'Livre turque',          symbol: '₺', flag: '🇹🇷' },
    { code: 'BRL', name: 'Réal brésilien',        symbol: 'R$',flag: '🇧🇷' },
    { code: 'MXN', name: 'Peso mexicain',         symbol: '$', flag: '🇲🇽' },
    { code: 'INR', name: 'Roupie indienne',       symbol: '₹', flag: '🇮🇳' },
    { code: 'KRW', name: 'Won sud-coréen',        symbol: '₩', flag: '🇰🇷' },
    { code: 'ZAR', name: 'Rand sud-africain',     symbol: 'R', flag: '🇿🇦' },
    { code: 'AED', name: 'Dirham EAU',            symbol: 'د.إ',flag:'🇦🇪' },
    { code: 'IDR', name: 'Roupie indonésienne',   symbol: 'Rp',flag: '🇮🇩' },
    { code: 'THB', name: 'Baht thaïlandais',      symbol: '฿', flag: '🇹🇭' },
    { code: 'MYR', name: 'Ringgit malaisien',     symbol: 'RM',flag: '🇲🇾' },
    { code: 'PHP', name: 'Peso philippin',        symbol: '₱', flag: '🇵🇭' },
    { code: 'ILS', name: 'Shekel israélien',      symbol: '₪', flag: '🇮🇱' },
    { code: 'RON', name: 'Leu roumain',           symbol: 'lei',flag:'🇷🇴' },
    { code: 'NZD', name: 'Dollar néo-zélandais',  symbol: 'NZ$',flag:'🇳🇿' }
  ];

  /**
   * Convertit un montant from → to via les taux fournis.
   * @param {Object} p { amount, from, to, rates }  rates = {EUR: 1, USD: 1.08, ...}
   * @returns {Object} { value, rate, inverse }
   */
  function convert(p) {
    const amount = Number(p.amount) || 0;
    const from = (p.from || 'EUR').toUpperCase();
    const to = (p.to || 'USD').toUpperCase();
    const rates = p.rates || {};
    if (from === to) return { value: amount, rate: 1, inverse: 1 };

    // Rates depuis EUR : EUR=1, USD=1.08 → 1 EUR = 1.08 USD
    const rFrom = from === 'EUR' ? 1 : rates[from];
    const rTo   = to === 'EUR' ? 1 : rates[to];
    if (!rFrom || !rTo) return { error: 'Taux indisponible (' + from + ' ou ' + to + ')' };

    // amount (from) → EUR → to
    const inEur = amount / rFrom;
    const value = inEur * rTo;
    const rate = rTo / rFrom;
    return { value, rate, inverse: 1 / rate };
  }

  /**
   * Fetch les taux depuis l'API PRICES (Frankfurter) ou retourne ceux du cache.
   * Renvoie null si l'API échoue.
   */
  async function fetchRates(base) {
    base = base || 'EUR';
    if (typeof global.PRICES === 'undefined' || !global.PRICES.fetchForexRates) return null;
    return await global.PRICES.fetchForexRates(base);
  }

  /**
   * Génère une grille de conversion (montant donné → toutes les devises).
   */
  function gridFromAmount(amount, from, rates, currencies) {
    currencies = currencies || CURRENCIES.map(c => c.code);
    return currencies.filter(c => c !== from).map(to => {
      const r = convert({ amount, from, to, rates });
      return { to, value: r.value, rate: r.rate, error: r.error };
    });
  }

  const api = { convert, fetchRates, gridFromAmount, CURRENCIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FX = api;
})(typeof window !== 'undefined' ? window : globalThis);
