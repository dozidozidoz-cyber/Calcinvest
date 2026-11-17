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
  const a = EE.run(serie(closes), { entryRule: 'all', horizonMonths: 6, feePct: 0 });
  const b = EE.run(serie(closes), { entryRule: 'all', horizonMonths: 6, feePct: 0.5 });
  const rA = a.byExit.hold.median, rB = b.byExit.hold.median;
  assert.ok(close(1 + rB, (1 + rA) * 0.995 * 0.995, 1e-9));
});

test('run : historique trop court → message d\'erreur explicite', () => {
  const r = EE.run(serie(Array.from({ length: 300 }, () => 100)), { entryRule: 'all', horizonMonths: 12 });
  assert.match(r.error, /Historique trop court/);
  assert.match(EE.run(serie([1, 2]), { entryRule: 'nimporte' }).error, /inconnue/);
});

test('run : S&P 500 réel, journalier et hebdomadaire, résultats cohérents', () => {
  const sp = require(path.join(__dirname, '..', '..', 'assets', 'data', 'daily', 'sp500.json'));
  for (const timeframe of ['daily', 'weekly']) {
    const r = EE.run(sp, { timeframe, entryRule: 'all', k: 3, horizonMonths: 12, feePct: 0 });
    assert.ok(!r.error, r.error);
    for (const ex of EE.EXIT_RULES) {
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
