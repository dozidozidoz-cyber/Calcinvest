const test = require('node:test');
const assert = require('node:assert');
const dates = require('../../assets/js/core/engine/dates');

test('dates.parse accepts YYYY-MM and YYYY-MM-DD', () => {
  assert.deepStrictEqual(dates.parse('2020-03'), { y: 2020, m: 3 });
  assert.deepStrictEqual(dates.parse('2020-03-15'), { y: 2020, m: 3 });
  assert.strictEqual(dates.parse('bad'), null);
  assert.strictEqual(dates.parse('2020-13'), null);
});

test('dates.monthDiff basic', () => {
  assert.strictEqual(dates.monthDiff('2020-01', '2020-12'), 11);
  assert.strictEqual(dates.monthDiff('2020-01', '2021-01'), 12);
  assert.strictEqual(dates.monthDiff('2021-01', '2020-01'), -12);
  assert.strictEqual(dates.monthDiff('2000-05', '2025-08'), 25 * 12 + 3);
});

test('dates.addMonths handles year rollover + negatives', () => {
  assert.strictEqual(dates.addMonths('2020-11', 3), '2021-02');
  assert.strictEqual(dates.addMonths('2020-01', -1), '2019-12');
  assert.strictEqual(dates.addMonths('2020-06', 0), '2020-06');
  assert.strictEqual(dates.addMonths('2020-01', 24), '2022-01');
});

test('dates.yearFrac', () => {
  assert.strictEqual(dates.yearFrac('2020-01', '2021-01'), 1);
  assert.strictEqual(dates.yearFrac('2020-01', '2020-07'), 0.5);
});

test('dates.lte', () => {
  assert.strictEqual(dates.lte('2020-01', '2020-02'), true);
  assert.strictEqual(dates.lte('2020-01', '2020-01'), true);
  assert.strictEqual(dates.lte('2020-02', '2020-01'), false);
});
