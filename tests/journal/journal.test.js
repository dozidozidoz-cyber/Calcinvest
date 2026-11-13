const test = require('node:test');
const assert = require('node:assert');
const JOURNAL = require('../../assets/js/core/calc-journal');

// Trade long clos : risque = |entry - stop| × size = 10 × 10 = 100
function trade(exit, reason, extra) {
  const t = Object.assign({
    side: 'long', entry_price: 100, stop_loss: 90, size: 10,
    exit_price: exit, exit_reason: reason,
    entry_date: '2026-01-05T10:00:00Z', exit_date: '2026-01-20T10:00:00Z'
  }, extra || {});
  t.pnl = (t.exit_price - t.entry_price) * t.size;
  return t;
}

test('normalizeExitReason : accepte les 4 clés, rejette le reste', () => {
  assert.strictEqual(JOURNAL.normalizeExitReason('stop'), 'stop');
  assert.strictEqual(JOURNAL.normalizeExitReason(' Target '), 'target');
  assert.strictEqual(JOURNAL.normalizeExitReason('invalidated'), 'invalidated');
  assert.strictEqual(JOURNAL.normalizeExitReason('discretionary'), 'discretionary');
  assert.strictEqual(JOURNAL.normalizeExitReason('panique'), null);
  assert.strictEqual(JOURNAL.normalizeExitReason(''), null);
  assert.strictEqual(JOURNAL.normalizeExitReason(null), null);
});

test('byExitReason : compte, P&L et R moyen par raison', () => {
  const trades = [
    trade(90, 'stop'),            // -100 € = -1R
    trade(90, 'stop'),            // -1R
    trade(130, 'target'),         // +300 € = +3R
    trade(95, 'invalidated'),     // -50 € = -0.5R
    trade(105, 'discretionary'),  // +50 € = +0.5R
    trade(110, null)              // +100 € = +1R, raison inconnue
  ];
  const r = JOURNAL.byExitReason(trades);
  assert.strictEqual(r.groups.stop.count, 2);
  assert.strictEqual(r.groups.stop.pnl, -200);
  assert.strictEqual(r.groups.stop.avgR, -1);
  assert.strictEqual(r.groups.stop.winrate, 0);
  assert.strictEqual(r.groups.target.avgR, 3);
  assert.strictEqual(r.groups.invalidated.avgR, -0.5);
  assert.strictEqual(r.groups.discretionary.avgR, 0.5);
  assert.strictEqual(r.groups.unknown.count, 1);
  assert.strictEqual(r.groups.unknown.avgR, 1);
});

test('byExitReason : planned agrège stop + invalidation + objectif, pas le discrétionnaire', () => {
  const r = JOURNAL.byExitReason([
    trade(90, 'stop'), trade(130, 'target'), trade(95, 'invalidated'),
    trade(105, 'discretionary'), trade(110, null)
  ]);
  assert.strictEqual(r.planned.count, 3);
  assert.strictEqual(r.planned.pnl, 150);
  assert.ok(Math.abs(r.planned.avgR - 0.5) < 1e-12); // (-1 + 3 - 0.5) / 3
  assert.strictEqual(r.discretionary.count, 1);
});

test('byExitReason : ignore les trades ouverts, avgR null sans stop', () => {
  const open = { side: 'long', entry_price: 100, stop_loss: 90, size: 10, exit_price: null, exit_reason: 'stop' };
  const noStop = trade(120, 'target', { stop_loss: null });
  const r = JOURNAL.byExitReason([open, noStop]);
  assert.strictEqual(r.groups.stop.count, 0);
  assert.strictEqual(r.groups.target.count, 1);
  assert.strictEqual(r.groups.target.nbWithR, 0);
  assert.strictEqual(r.groups.target.avgR, null);
});

test('byExitReason : journal vide', () => {
  const r = JOURNAL.byExitReason([]);
  assert.strictEqual(r.planned.count, 0);
  assert.strictEqual(r.planned.avgR, null);
  assert.strictEqual(r.groups.unknown.count, 0);
});

test('stats : inchangé par les nouveaux champs', () => {
  const s = JOURNAL.stats([trade(90, 'stop'), trade(130, 'target')]);
  assert.strictEqual(s.nbClosed, 2);
  assert.strictEqual(s.totalPnl, 200);
  assert.strictEqual(s.avgRMultiple, 1);
});
