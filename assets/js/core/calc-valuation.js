/* ============================================================
   CalcInvest — Valorisation marché (CAPE proxy + DD + Momentum)

   Calcule plusieurs indicateurs de "cherté" d'un indice :
   - CAPE proxy (P/E lissé sur 10 ans — utilise la regression historique)
   - Drawdown depuis l'ATH
   - Position vs MM200 mois
   - Momentum 12 mois
   - Score composite 0-100

   Données utilisées : sp500.json (prices mensuels depuis 1985).
   Pour le CAPE actuel, on utilise une valeur live fetched côté UI.

   Le score est PROXY pédagogique — pas un signal d'investissement.
   ============================================================ */
(function (global) {
  'use strict';

  // Moyennes historiques observées (Shiller CAPE 1881-2024)
  const CAPE_HISTORICAL_MEAN = 17.0;
  const CAPE_HISTORICAL_MEDIAN = 16.0;
  const CAPE_LOW_25TH = 11.0;     // sous-évalué
  const CAPE_HIGH_75TH = 22.0;    // surévalué
  const CAPE_BUBBLE = 30.0;       // bulle (1929, 2000, 2021)

  /**
   * Calcule le drawdown maximal depuis l'ATH.
   */
  function drawdownFromATH(prices) {
    if (!prices.length) return { current: 0, max: 0, ath: 0, athIndex: 0 };
    let ath = -Infinity, athIndex = 0;
    let maxDD = 0;
    prices.forEach((p, i) => {
      if (p > ath) { ath = p; athIndex = i; }
      const dd = (p - ath) / ath;
      if (dd < maxDD) maxDD = dd;
    });
    const last = prices[prices.length - 1];
    // ATH le plus récent
    let recentATH = -Infinity, recentATHIdx = 0;
    for (let i = prices.length - 1; i >= 0; i--) {
      if (prices[i] > recentATH) { recentATH = prices[i]; recentATHIdx = i; }
    }
    return {
      currentDD: (last - recentATH) / recentATH * 100,
      maxDD: maxDD * 100,
      ath: recentATH,
      athIndex: recentATHIdx,
      monthsFromATH: prices.length - 1 - recentATHIdx
    };
  }

  /**
   * Position du prix actuel vs Moyenne Mobile N mois.
   */
  function positionVsMA(prices, period) {
    period = period || 200;
    if (prices.length < period) return { pct: 0, ma: 0 };
    const last = prices[prices.length - 1];
    const slice = prices.slice(-period);
    const ma = slice.reduce((s, v) => s + v, 0) / slice.length;
    return {
      pct: (last - ma) / ma * 100,
      ma,
      current: last
    };
  }

  /**
   * Momentum 12 mois (variation prix actuel vs 12 mois en arrière).
   */
  function momentum(prices, periodMonths) {
    periodMonths = periodMonths || 12;
    if (prices.length < periodMonths + 1) return 0;
    const last = prices[prices.length - 1];
    const past = prices[prices.length - 1 - periodMonths];
    return (last - past) / past * 100;
  }

  /**
   * Rendement annualisé sur N années (calculé sur la série).
   */
  function annualReturn(prices, years) {
    const periodMonths = years * 12;
    if (prices.length < periodMonths + 1) return null;
    const last = prices[prices.length - 1];
    const past = prices[prices.length - 1 - periodMonths];
    return (Math.pow(last / past, 1 / years) - 1) * 100;
  }

  /**
   * Rendement futur 10Y estimé à partir du CAPE actuel.
   * Modèle Hussman/Shiller simplifié :
   *   return_10y ≈ 1.06 × (1/CAPE) - 1.5%   (calibré historique)
   * Cette estimation est PROXY pédagogique.
   */
  function expectedReturn10Y(cape) {
    if (!cape || cape <= 0) return null;
    const earningsYield = 1 / cape * 100;
    // Régression historique simplifiée
    return earningsYield * 0.7 + 1.5;
  }

  /**
   * Classifie le CAPE actuel : sous-évalué / normal / cher / bulle.
   */
  function capeClassification(cape) {
    if (!cape) return { label: '—', level: 'unknown', color: 'var(--text-4)', percentile: null };
    let label, level, color;
    if (cape < CAPE_LOW_25TH) {
      label = 'Très sous-évalué';
      level = 'cheap';
      color = '#10B981';
    } else if (cape < CAPE_HISTORICAL_MEAN) {
      label = 'Légèrement sous-évalué';
      level = 'normal-cheap';
      color = '#34D399';
    } else if (cape < CAPE_HIGH_75TH) {
      label = 'Normal';
      level = 'normal';
      color = '#FBBF24';
    } else if (cape < CAPE_BUBBLE) {
      label = 'Cher';
      level = 'expensive';
      color = '#F97316';
    } else {
      label = 'Bulle (1929 / 2000)';
      level = 'bubble';
      color = '#DC2626';
    }
    // Percentile approximé linéaire 5-40
    const percentile = Math.min(99, Math.max(1, ((cape - 5) / (40 - 5)) * 100));
    return { label, level, color, percentile: Math.round(percentile) };
  }

  /**
   * Score composite de valorisation 0-100.
   * 0 = sous-évalué profond, 50 = normal, 100 = bulle.
   * Combine : CAPE (50 %), MA position (25 %), momentum (15 %), DD from ATH (10 %).
   */
  function compositeScore(p) {
    let totalWeight = 0, totalScore = 0;

    // CAPE component (poids 50)
    if (p.cape != null) {
      const capeNorm = Math.min(100, Math.max(0, ((p.cape - 8) / (35 - 8)) * 100));
      totalScore += capeNorm * 50;
      totalWeight += 50;
    }
    // MA position component (poids 25)
    if (p.maPct != null) {
      const maNorm = Math.min(100, Math.max(0, 50 + p.maPct * 2)); // ±25% = 0-100
      totalScore += maNorm * 25;
      totalWeight += 25;
    }
    // Momentum (poids 15)
    if (p.momentum != null) {
      const momNorm = Math.min(100, Math.max(0, 50 + p.momentum * 1.5)); // ±33% = 0-100
      totalScore += momNorm * 15;
      totalWeight += 15;
    }
    // DD inverse (poids 10) — un DD profond = sous-évalué
    if (p.currentDD != null) {
      const ddNorm = Math.min(100, Math.max(0, 100 + p.currentDD * 2)); // 0% DD = 100, -50% DD = 0
      totalScore += ddNorm * 10;
      totalWeight += 10;
    }
    const score = totalWeight > 0 ? totalScore / totalWeight : 50;

    let verdict, color;
    if (score < 25)      { verdict = 'OPPORTUNITÉ HISTORIQUE'; color = '#10B981'; }
    else if (score < 45) { verdict = 'SOUS-ÉVALUÉ';            color = '#34D399'; }
    else if (score < 60) { verdict = 'NORMAL';                  color = '#FBBF24'; }
    else if (score < 80) { verdict = 'CHER';                    color = '#F97316'; }
    else                 { verdict = 'BULLE';                   color = '#DC2626'; }

    return { score: Math.round(score), verdict, color };
  }

  /**
   * Calcule tous les indicateurs pour une série de prix mensuels.
   * @param {Object} p { prices: [], cape: number|null }
   */
  function analyzeValuation(p) {
    const prices = p.prices || [];
    const cape = p.cape || null;
    if (prices.length === 0) return { error: 'Pas de prix disponibles' };

    const dd = drawdownFromATH(prices);
    // MA10 mensuel ≈ 200 jours bourse (Faber GTAA classique)
    const ma200 = positionVsMA(prices, 10);
    // MA60 mensuel ≈ 5 ans pour lisser
    const ma50 = positionVsMA(prices, 60);
    const mom12 = momentum(prices, 12);
    const mom3 = momentum(prices, 3);
    const ann10y = annualReturn(prices, 10);
    const ann20y = annualReturn(prices, 20);

    const capeClass = capeClassification(cape);
    const expRet = expectedReturn10Y(cape);

    const composite = compositeScore({
      cape,
      maPct: ma200.pct,
      momentum: mom12,
      currentDD: dd.currentDD
    });

    return {
      cape,
      capeClassification: capeClass,
      expectedReturn10Y: expRet,
      drawdown: dd,
      ma200, ma50,
      momentum12m: mom12,
      momentum3m: mom3,
      annualReturn10Y: ann10y,
      annualReturn20Y: ann20y,
      compositeScore: composite,
      historicalCAPE: {
        mean: CAPE_HISTORICAL_MEAN,
        median: CAPE_HISTORICAL_MEDIAN,
        low25: CAPE_LOW_25TH,
        high75: CAPE_HIGH_75TH,
        bubble: CAPE_BUBBLE
      }
    };
  }

  const api = {
    analyzeValuation, drawdownFromATH, positionVsMA, momentum, annualReturn,
    capeClassification, expectedReturn10Y, compositeScore,
    CAPE_HISTORICAL_MEAN, CAPE_HISTORICAL_MEDIAN, CAPE_LOW_25TH, CAPE_HIGH_75TH, CAPE_BUBBLE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.VALUATION = api;
})(typeof window !== 'undefined' ? window : globalThis);
