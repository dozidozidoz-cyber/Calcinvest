const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const EE = require('../../assets/js/core/calc-entry-exit');

const close = (a, b, eps) => Math.abs(a - b) < (eps || 1e-9);

/** Série journalière synthétique à partir d'une liste de clôtures (O = clôture veille, H/L = ±1 %). */
function serie(closes, start) {
  const t0 = Date.parse((start || '2020-01-06') + 'T00:00:00Z');
  const d = [], o = [], h = [], l = [], c = [];
  closes.forEach((x, i) => {
    d.push(new Date(t0 + i * 864e5).toISOString().slice(0, 10));
    const op = i ? closes[i - 1] : x;
    o.push(op); c.push(x);
    h.push(Math.max(op, x) * 1.01); l.push(Math.min(op, x) * 0.99);
  });
  return { d, o, h, l, c };
}

test('sma / rollingMax / atr : valeurs connues', () => {
  assert.deepStrictEqual(EE.sma([1, 2, 3, 4], 2).slice(1), [1.5, 2.5, 3.5]);
  assert.ok(Number.isNaN(EE.sma([1, 2, 3], 2)[0]));
  assert.deepStrictEqual(EE.rollingMax([3, 1, 2, 5, 4, 1], 3).slice(2), [3, 5, 5, 5]);
  // TR constant = 2 (h-l), ATR = 2
  const a = EE.atr([11, 11, 11, 11], [9, 9, 9, 9], [10, 10, 10, 10], 3);
  assert.ok(Number.isNaN(a[1]));
  assert.strictEqual(a[2], 2);
  assert.strictEqual(a[3], 2);
});

test('weekKey : rattache chaque jour au lundi de sa semaine', () => {
  assert.strictEqual(EE.weekKey('2026-11-16'), '2026-11-16'); // lundi
  assert.strictEqual(EE.weekKey('2026-11-20'), '2026-11-16'); // vendredi
  assert.strictEqual(EE.weekKey('2026-11-22'), '2026-11-16'); // dimanche
  assert.strictEqual(EE.weekKey('2026-11-23'), '2026-11-23');
});

test('toWeekly : OHLC agrégé, dernière semaine écartée', () => {
  const s = { d: ['2026-11-02', '2026-11-03', '2026-11-09', '2026-11-10', '2026-11-16'],
              o: [10, 11, 12, 13, 14], h: [12, 15, 13, 16, 15], l: [9, 10, 11, 8, 13], c: [11, 12, 13, 14, 14.5] };
  const w = EE.toWeekly(s);
  assert.deepStrictEqual(w, { d: ['2026-11-02', '2026-11-09'], o: [10, 12], h: [15, 16], l: [9, 8], c: [12, 14] });
});

test('simulateExit : stop fixe exécuté au stop, ou à l\'ouverture en cas de gap', () => {
  const s = { o: [100, 100, 100, 80], h: [101, 101, 101, 81], l: [99, 99, 94, 79], c: [100, 100, 96, 80] };
  const atrArr = [2, 2, 2, 2];
  // stop = 100 - 3×2 = 94 ; touché barre 2 (plus bas 94) → sortie à 94
  const r = EE.simulateExit(s, atrArr, 0, 3, 'fixed', 3);
  assert.ok(close(r.ret, -0.06)); assert.strictEqual(r.bars, 2);
  // gap : stop à 96 (k=2), la barre 2 ouvre à 80, déjà sous le stop → sortie à 80
  const g ={ o: [100, 100, 80], h: [101, 101, 81], l: [99, 99, 79], c: [100, 100, 80] };
  const rg = EE.simulateExit(g, atrArr, 0, 2, 'fixed', 2); // stop 96, gap à 80
  assert.ok(close(rg.ret, -0.20)); assert.strictEqual(rg.bars, 2);
});

test('simulateExit : stop suiveur remonte avec le plus haut, jamais ne redescend', () => {
  // montée à 120 puis rechute ; ATR 2, k 3 → stop final = 121 - 6 = 115
  const c = [100, 110, 120, 118, 114, 100];
  const s = { o: [100, 100, 110, 120, 118, 114], h: [100, 110, 121, 120, 118, 114], l: [100, 100, 110, 117, 113, 99], c };
  const atrArr = c.map(() => 2);
  const r = EE.simulateExit(s, atrArr, 0, 5, 'trailing', 3);
  assert.strictEqual(r.bars, 4);
  assert.ok(close(r.ret, 0.15));
  // version clôture : clôture barre 4 = 114 ≤ 115 → sortie à 114
  const rc = EE.simulateExit(s, atrArr, 0, 5, 'trailingClose', 3);
  assert.strictEqual(rc.bars, 4);
  assert.ok(close(rc.ret, 0.14));
  // conserver : sortie à l'horizon, maxDD = plus bas / entrée - 1
  const rh = EE.simulateExit(s, atrArr, 0, 5, 'hold', 3);
  assert.strictEqual(rh.bars, 5); assert.ok(close(rh.ret, 0)); assert.ok(close(rh.maxDD, -0.01));
});

test('summarize : médiane, quantiles, part de perdants, rendement par mois', () => {
  const st = EE.summarize([{ ret: -0.1, bars: 21, maxDD: -0.4 }, { ret: 0.2, bars: 42, maxDD: -0.1 }, { ret: 0.5, bars: 21, maxDD: -0.05 }], 21);
  assert.strictEqual(st.n, 3);
  assert.ok(close(st.median, 0.2));
  assert.ok(close(st.mean, 0.2));
  assert.ok(close(st.pctLoss, 1 / 3));
  assert.ok(close(st.avgMonths, 4 / 3));
  assert.ok(close(st.perMonthInvested, 0.6 / 4));
  assert.ok(close(st.pctHit30, 1 / 3));
  assert.strictEqual(EE.summarize([], 21).n, 0);
});

test('run : marché qui monte régulièrement → conserver gagne, aucun stop touché', () => {
  const closes = Array.from({ length: 800 }, (_, i) => 100 * Math.pow(1.001, i));
  const r = EE.run(serie(closes), { timeframe: 'daily', entryRule: 'all', k: 3, horizonMonths: 12, feePct: 0 });
  assert.ok(!r.error, r.error);
  const hold = r.byExit.hold, trail = r.byExit.trailing;
  assert.strictEqual(hold.n, 800 - 252 - 251);
  assert.ok(close(hold.median, Math.pow(1.001, 252) - 1, 1e-9));
  assert.strictEqual(hold.pctLoss, 0);
  assert.ok(close(trail.median, hold.median, 1e-9)); // jamais touché
  assert.strictEqual(r.timeline.dates.length, hold.n);
  // tendance : toujours au-dessus de la SMA200 → mêmes entrées que "all"
  assert.strictEqual(r.byEntry.trend.hold.n, hold.n);
  assert.strictEqual(r.byEntry.countertrend.hold.n, 0);
});

test('run : les frais réduisent le rendement aller-retour', () => {
  const closes = Array.from({ length: 700 }, (_, i) => 100 + i * 0.1);
  const a = EE.run(serie(closes), { timeframe: 'daily', entryRule: 'all', horizonMonths: 6, feePct: 0 });
  const b = EE.run(serie(closes), { timeframe: 'daily', entryRule: 'all', horizonMonths: 6, feePct: 0.5 });
  const rA = a.byExit.hold.median, rB = b.byExit.hold.median;
  assert.ok(close(1 + rB, (1 + rA) * 0.995 * 0.995, 1e-9));
});

test('run : historique trop court → message d\'erreur explicite', () => {
  const r = EE.run(serie(Array.from({ length: 300 }, () => 100)), { timeframe: 'daily', entryRule: 'all', horizonMonths: 12 });
  assert.match(r.error, /Historique trop court/);
  assert.match(EE.run(serie([1, 2]), { entryRule: 'nimporte' }).error, /inconnue/);
});

test('run : S&P 500 réel, journalier et hebdomadaire, résultats cohérents', () => {
  const sp = require(path.join(__dirname, '..', '..', 'assets', 'data', 'daily', 'sp500.json'));
  for (const timeframe of ['daily', 'weekly']) {
    const r = EE.run(sp, { timeframe, entryRule: 'all', k: 3, horizonMonths: 12, feePct: 0 });
    assert.ok(!r.error, r.error);
    for (const ex of r.exitRules) {
      const st = r.byExit[ex.key];
      assert.ok(st.n > 1000, timeframe + ' ' + ex.key + ' n=' + st.n);
      assert.ok(st.median > -0.5 && st.median < 0.5);
      assert.ok(st.avgMonths > 0 && st.avgMonths <= 12.01);
      assert.ok(st.medianMaxDD <= 0);
    }
    // un stop raccourcit toujours la détention moyenne
    assert.ok(r.byExit.trailing.avgMonths < r.byExit.hold.avgMonths);
    // les entrées filtrées sont un sous-ensemble
    assert.strictEqual(r.byEntry.trend.hold.n + r.byEntry.countertrend.hold.n <= r.byEntry.all.hold.n, true);
  }
});

/* ─── Swing et capital réinvesti ───────────────────────────── */

test('rsi : Wilder, valeurs connues', () => {
  // hausses seules → 100 ; baisses seules → 0 ; alternance symétrique → 50 au départ
  assert.strictEqual(EE.rsi([1, 2, 3, 4], 2)[3], 100);
  assert.strictEqual(EE.rsi([4, 3, 2, 1], 2)[3], 0);
  assert.strictEqual(EE.rsi([10, 11, 10], 2)[2], 50);
  // après seed : gain moyen (1×1 + 0)/2 = 0.5... formule de lissage
  const r = EE.rsi([10, 11, 10, 12], 2);
  // seed (i=2) : gain 0.5, perte 0.5 ; i=3 : gain (0.5+2)/2 = 1.25, perte 0.25 → 100 − 100/6
  assert.ok(close(r[3], 100 - 100 / 6, 1e-9));
  assert.ok(Number.isNaN(r[1]));
});

test('rollingMin / indicateurs « barres précédentes » excluent la barre courante', () => {
  assert.deepStrictEqual(EE.rollingMin([3, 1, 2, 5, 4], 2).slice(1), [1, 1, 2, 4]);
  const s = serie(Array.from({ length: 80 }, (_, i) => (i < 30 ? 100 : 130)));
  const ind = EE.indicators(s, EE.TIMEFRAMES.daily);
  // hh20[i] = plus haut des 20 barres AVANT i
  assert.strictEqual(ind.hh20[30], Math.max(...s.h.slice(10, 30)));
  assert.ok(EE.isEntry('breakout20', s.c, ind, 30));  // saut à 130 : casse le plus haut des 20 barres précédentes
  assert.ok(!EE.isEntry('breakout20', s.c, ind, 31)); // la barre 30 fait désormais partie du plus haut de référence
  // plat à 100 puis saut à 130 à la barre 60 : la MM20 croise la MM50 à la barre 60, une seule fois
  const s2 = serie(Array.from({ length: 100 }, (_, i) => (i < 60 ? 100 : 130)));
  const ind2 = EE.indicators(s2, EE.TIMEFRAMES.daily);
  const crosses = s2.c.map((_, i) => (EE.isEntry('macross', s2.c, ind2, i) ? i : -1)).filter(i => i >= 0);
  assert.deepStrictEqual(crosses, [60]);
});

test('simulateExit : objectif 2R atteint, et stop prioritaire si les deux le même jour', () => {
  const s = { o: [100, 100, 104], h: [100, 103, 105], l: [100, 99, 103], c: [100, 102, 104] };
  const atrArr = [1, 1, 1];
  // k=2 → risque 2, stop 98, objectif 104 : atteint barre 2 (plus haut 105) → sortie à 104
  const r = EE.simulateExit(s, atrArr, 0, 5, 'target2r', 2);
  assert.ok(close(r.ret, 0.04)); assert.strictEqual(r.exitIdx, 2);
  const both = { o: [100, 100], h: [100, 110], l: [100, 90], c: [100, 100] };
  const rb = EE.simulateExit(both, [1, 1], 0, 5, 'target2r', 2);
  assert.ok(close(rb.ret, -0.02)); // stop retenu
});

test('simulateExit : sortie sur rebond (clôture > MM5) et sur plus bas 10 barres', () => {
  const s = { o: [100, 99, 98, 101], h: [100, 100, 99, 102], l: [99, 97, 96, 98], c: [100, 98, 97, 101] };
  const ind = { atr: [5, 5, 5, 5], sma5: [99, 99, 99, 99], ll10: [0, 0, 0, 0] };
  const r = EE.simulateExit(s, ind, 0, 10, 'rebound', 2); // stop 90 jamais touché ; clôture 101 > 99 à la barre 3
  assert.strictEqual(r.exitIdx, 3); assert.ok(close(r.ret, 0.01));
  const ind2 = { atr: [5, 5, 5, 5], ll10: [NaN, 99.5, 96.5, 90] };
  const r2 = EE.simulateExit(s, ind2, 0, 10, 'donchian10', 2); // clôture 98 < 99.5 à la barre 1
  assert.strictEqual(r2.exitIdx, 1); assert.ok(close(r2.ret, -0.02));
});

test('simulatePortfolio : marché haussier régulier, conserver ≈ achat-conservation', () => {
  const closes = Array.from({ length: 1200 }, (_, i) => 100 * Math.pow(1.0005, i));
  const r = EE.run(serie(closes), { style: 'position', timeframe: 'daily', entryRule: 'all', horizonMonths: 12, feePct: 0 });
  const pf = r.portfolio.hold, bh = r.buyHold;
  assert.ok(pf.trades >= 3);
  // une barre hors marché entre deux positions : écart minime
  assert.ok(Math.abs(pf.cagr - bh.cagr) < 0.003, pf.cagr + ' vs ' + bh.cagr);
  assert.ok(close(bh.maxDD, 0));
  assert.ok(pf.exposure > 0.99);
  assert.strictEqual(pf.equity[r.firstIdx - 1], null);
});

test('simulatePortfolio : stop + filtre de tendance coupent une chute de 50 %, l\'achat-conservation la subit', () => {
  const up = Array.from({ length: 400 }, (_, i) => 100 + i * 0.05);
  const down = Array.from({ length: 200 }, (_, i) => 120 * (1 - 0.5 * (i + 1) / 200));
  const flat = Array.from({ length: 200 }, () => 60);
  const r = EE.run(serie(up.concat(down, flat)), { style: 'position', timeframe: 'daily', entryRule: 'trend', k: 3, horizonMonths: 12, feePct: 0 });
  // sans filtre, le stop seul ne protège pas : on rachète aussitôt pendant la baisse
  const all = EE.run(serie(up.concat(down, flat)), { style: 'position', timeframe: 'daily', entryRule: 'all', k: 3, horizonMonths: 12, feePct: 0 });
  assert.ok(all.portfolio.fixed.maxDD < -0.4, String(all.portfolio.fixed.maxDD));
  assert.ok(r.buyHold.maxDD < -0.45);
  assert.ok(r.portfolio.fixed.maxDD > r.buyHold.maxDD + 0.1, r.portfolio.fixed.maxDD);
});

test('run swing : RSI 2 sur le S&P 500, résultats cohérents et bornes de dates', () => {
  const sp = require(path.join(__dirname, '..', '..', 'assets', 'data', 'daily', 'sp500.json'));
  const r = EE.run(sp, { style: 'swing', timeframe: 'daily', entryRule: 'rsi2', k: 2, horizonMonths: 1, feePct: 0.1 });
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.exitRules.map(e => e.key), ['hold', 'fixed', 'target2r', 'rebound', 'donchian10', 'trailing']);
  const st = r.byExit.rebound;
  assert.ok(st.n > 200 && st.n < 1500, 'n=' + st.n);
  assert.ok(st.avgMonths < 0.5, 'la sortie sur rebond tient quelques jours');
  assert.ok(Number.isFinite(st.meanR));
  const pf = r.portfolio.rebound;
  assert.ok(pf.trades > 50 && pf.exposure < 0.5);
  assert.ok(pf.maxDD > -0.6 && pf.maxDD <= 0);
  // bornes : toutes les entrées dans la fenêtre demandée
  const w = EE.run(sp, { style: 'swing', timeframe: 'daily', entryRule: 'rsi2', k: 2, horizonMonths: 1, from: '2013-01-01', to: '2018-12-31' });
  assert.ok(w.firstEntry >= '2013-01-01' && w.lastEntry <= '2018-12-31');
  assert.ok(w.lastDate <= '2019-02-28');
  assert.match(EE.run(sp, { style: 'swing', entryRule: 'pullback40' }).error, /inconnue pour ce style/);
});
