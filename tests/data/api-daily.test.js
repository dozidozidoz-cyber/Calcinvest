const test = require('node:test');
const assert = require('node:assert');
const { buildSeries } = require('../../api/daily');

const ts = iso => Date.parse(iso) / 1000;

function result(rows, tz, adj) {
  return {
    meta: { exchangeTimezoneName: tz },
    timestamp: rows.map(r => ts(r[0])),
    indicators: {
      quote: [{ open: rows.map(r => r[1]), high: rows.map(r => r[2]), low: rows.map(r => r[3]), close: rows.map(r => r[4]) }],
      adjclose: adj ? [{ adjclose: adj }] : undefined
    }
  };
}

test('buildSeries : date dans le fuseau de la bourse, été comme hiver', () => {
  // Contrat à terme : barre à minuit New York = 04:00 UTC en été, 05:00 UTC en hiver
  const r = result([
    ['2026-07-06T04:00:00Z', 10, 12, 9, 11],
    ['2026-12-07T05:00:00Z', 11, 13, 10, 12]
  ], 'America/New_York');
  assert.deepStrictEqual(buildSeries(r, '2030-01-01').d, ['2026-07-06', '2026-12-07']);
  // Action US : barre à l'ouverture 09:30 New York
  const a = result([['2026-07-06T13:30:00Z', 10, 12, 9, 11]], 'America/New_York');
  assert.deepStrictEqual(buildSeries(a, '2030-01-01').d, ['2026-07-06']);
  // Hong Kong : 09:30 locale = 01:30 UTC
  const hk = result([['2026-07-06T01:30:00Z', 10, 12, 9, 11]], 'Asia/Hong_Kong');
  assert.deepStrictEqual(buildSeries(hk, '2030-01-01').d, ['2026-07-06']);
});

test('buildSeries : ajustement adjclose/close appliqué à O, H, L, C', () => {
  const r = result([['2026-01-05T14:30:00Z', 100, 120, 90, 110]], 'America/New_York', [55]);
  const s = buildSeries(r, '2030-01-01');
  assert.deepStrictEqual([s.o[0], s.h[0], s.l[0], s.c[0]], [50, 60, 45, 55]);
});

test('buildSeries : écarte séances nulles, négatives, du jour et doublons', () => {
  const r = result([
    ['2026-01-05T14:30:00Z', 10, 12, 9, 11],
    ['2026-01-05T15:30:00Z', 10, 12, 9, 11],
    ['2026-01-06T14:30:00Z', null, null, null, null],
    ['2026-01-07T14:30:00Z', 18, 18, -40, -37],
    ['2026-01-08T14:30:00Z', 10, 12, 9, 11]
  ], 'America/New_York');
  assert.deepStrictEqual(buildSeries(r, '2026-01-08').d, ['2026-01-05']);
});

test('buildSeries : plus haut / plus bas encadrent ouverture et clôture', () => {
  const r = result([['2026-01-05T14:30:00Z', 10, 9.5, 10.2, 11]], 'America/New_York');
  const s = buildSeries(r, '2030-01-01');
  assert.strictEqual(s.h[0], 11);
  assert.strictEqual(s.l[0], 9.5);
});
