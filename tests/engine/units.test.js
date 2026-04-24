const test = require('node:test');
const assert = require('node:assert');
const units = require('../../assets/js/core/engine/units');

test('units.num parses decimal comma', () => {
  assert.strictEqual(units.num('1,5'), 1.5);
  assert.strictEqual(units.num('1.5'), 1.5);
  assert.strictEqual(units.num('1 000,5'), 1000.5);
});

test('units.num fallback', () => {
  assert.strictEqual(units.num('', 42), 42);
  assert.strictEqual(units.num(null, 42), 42);
  assert.strictEqual(units.num('abc', 7), 7);
});

test('units.fromPct / toPct roundtrip', () => {
  assert.strictEqual(units.fromPct(5), 0.05);
  assert.strictEqual(units.toPct(0.05), 5);
  assert.strictEqual(units.toPct(0.12345, 2), 12.35);
});

test('units.clamp', () => {
  assert.strictEqual(units.clamp(5, 0, 10), 5);
  assert.strictEqual(units.clamp(-1, 0, 10), 0);
  assert.strictEqual(units.clamp(11, 0, 10), 10);
});

test('units.safeDiv', () => {
  assert.strictEqual(units.safeDiv(10, 2), 5);
  assert.strictEqual(units.safeDiv(10, 0), 0);
  assert.strictEqual(units.safeDiv(10, 0, -1), -1);
});
