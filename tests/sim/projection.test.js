const test = require('node:test');
const assert = require('node:assert');
const projection = require('../../assets/js/core/sim/projection');

test('deterministic: constant 1%/mo, 12 months, 1000 initial', () => {
  const res = projection.deterministic({
    T: 12, monthlyReturn: 0.01, initial: 1000
  });
  assert.strictEqual(res.path.length, 13);
  assert.strictEqual(res.path[0], 1000);
  assert.ok(Math.abs(res.terminal - 1000 * Math.pow(1.01, 12)) < 1e-9);
});

test('deterministic with contributions', () => {
  const res = projection.deterministic({
    T: 12, monthlyReturn: 0, initial: 0,
    contribution: function () { return 100; }
  });
  assert.strictEqual(res.terminal, 1200);
});

test('deterministic with withdrawal until ruin', () => {
  const res = projection.deterministic({
    T: 24, monthlyReturn: 0, initial: 1000,
    withdrawal: function () { return 100; }
  });
  // 1000 - 100*10 = 0 at month 10, then stays 0
  assert.strictEqual(res.terminal, 0);
});
