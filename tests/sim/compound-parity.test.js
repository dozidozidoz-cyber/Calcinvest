/**
 * Parity test: new calculators/compound.js must match the legacy
 * algorithm exactly on a range of real-world inputs.
 * Legacy formula is mirrored here inline to avoid re-importing the
 * old implementation (which has already been swapped to a shim).
 */
const test = require('node:test');
const assert = require('node:assert');
const compound = require('../../assets/js/core/calculators/compound');

function legacy(p) {
  const annualRate  = (p.annualRate  || 0) / 100;
  const feesPct     = (p.feesPct    || 0) / 100;
  const inflation   = (p.inflation  || 0) / 100;
  const years       = Math.max(1, Math.floor(p.years || 10));
  const initial     = Math.max(0, p.initialAmount || 0);
  const monthly     = Math.max(0, p.monthlyAmount || 0);
  const netAnnualRate = annualRate - feesPct;
  const monthlyRate   = Math.pow(1 + netAnnualRate, 1 / 12) - 1;
  const grossMonthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

  let value = initial, invested = initial, noFees = initial;
  const yearly = [];
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      value += monthly; invested += monthly; value *= 1 + monthlyRate;
      noFees += monthly; noFees *= 1 + grossMonthlyRate;
    }
    const interest = value - invested;
    const realValue = inflation > 0 ? value / Math.pow(1 + inflation, y) : value;
    yearly.push({ year: y, value, invested, interest, realValue });
  }
  const last = yearly[yearly.length - 1];
  return {
    yearly, finalValue: last.value, finalInvested: last.invested,
    finalInterest: last.value - last.invested,
    multiplier: last.invested > 0 ? last.value / last.invested : 1,
    doublingYears: netAnnualRate > 0 ? Math.log(2) / Math.log(1 + netAnnualRate) : null,
    interestShare: last.value > 0 ? ((last.value - last.invested) / last.value) * 100 : 0,
    netAnnualRate: netAnnualRate * 100,
    noFeesValue: noFees, feesCost: noFees - last.value
  };
}

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const scenarios = [
  { initialAmount: 0, monthlyAmount: 200, annualRate: 7, years: 30 },
  { initialAmount: 10000, monthlyAmount: 500, annualRate: 8, feesPct: 0.3, inflation: 2, years: 25 },
  { initialAmount: 100000, monthlyAmount: 0, annualRate: 4, years: 10 },
  { initialAmount: 5000, monthlyAmount: 50, annualRate: 0, years: 5 },   // zero rate edge
  { initialAmount: 0, monthlyAmount: 100, annualRate: 12, feesPct: 2, years: 40 }
];

scenarios.forEach((p, i) => {
  test('parity scenario #' + (i + 1), () => {
    const a = compound.calcCompound(p);
    const b = legacy(p);
    assert.ok(close(a.finalValue, b.finalValue, 1e-6), 'finalValue: ' + a.finalValue + ' vs ' + b.finalValue);
    assert.ok(close(a.finalInvested, b.finalInvested, 1e-6));
    assert.ok(close(a.noFeesValue, b.noFeesValue, 1e-6));
    assert.ok(close(a.feesCost, b.feesCost, 1e-6));
    assert.ok(close(a.multiplier, b.multiplier, 1e-9));
    assert.strictEqual(a.yearly.length, b.yearly.length);
    for (let y = 0; y < a.yearly.length; y++) {
      assert.ok(close(a.yearly[y].value, b.yearly[y].value, 1e-6));
      assert.ok(close(a.yearly[y].realValue, b.yearly[y].realValue, 1e-6));
    }
  });
});

test('calcGoal mode=monthly: required contribution', () => {
  const r = compound.calcGoal({ initialAmount: 0, goalAmount: 100000, annualRate: 6, years: 20 });
  assert.strictEqual(r.mode, 'monthly');
  assert.ok(r.requiredMonthly > 0);
  // Simulate with that amount should hit the goal (within rounding)
  assert.ok(Math.abs(r.sim.finalValue - 100000) < 1);
});

test('calcGoal mode=time: years to reach', () => {
  const r = compound.calcGoal({ initialAmount: 10000, monthlyAmount: 200, goalAmount: 50000, annualRate: 5 });
  assert.strictEqual(r.mode, 'time');
  assert.ok(r.yearsToGoal > 0 && r.yearsToGoal < 50);
});

test('calcCompoundMultiRate returns row per rate', () => {
  const rows = compound.calcCompoundMultiRate({ monthlyAmount: 100, years: 20 }, [2, 5, 10]);
  assert.strictEqual(rows.length, 3);
  assert.ok(rows[0].finalValue < rows[1].finalValue);
  assert.ok(rows[1].finalValue < rows[2].finalValue);
});

test('calcEarlyStart: earlier start → bigger horizon value', () => {
  const rows = compound.calcEarlyStart({ monthlyAmount: 200, annualRate: 7, years: 20 }, [5, 10]);
  assert.ok(rows.length >= 3);
  // Sorted by extra ascending; values should be strictly increasing
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].valueAtHorizon > rows[i - 1].valueAtHorizon);
  }
});

// ─── contributionGrowth tests ───────────────────────────────────────────────

test('contributionGrowth=0 matches baseline (no growth)', () => {
  const base = compound.calcCompound({ initialAmount: 10000, monthlyAmount: 300, annualRate: 7, years: 20 });
  const zero = compound.calcCompound({ initialAmount: 10000, monthlyAmount: 300, annualRate: 7, years: 20, contributionGrowth: 0 });
  assert.ok(Math.abs(base.finalValue - zero.finalValue) < 1e-6, 'contributionGrowth=0 must equal no-growth baseline');
});

test('contributionGrowth=3 produces higher finalValue than baseline', () => {
  const base   = compound.calcCompound({ initialAmount: 10000, monthlyAmount: 300, annualRate: 7, years: 20 });
  const growth = compound.calcCompound({ initialAmount: 10000, monthlyAmount: 300, annualRate: 7, years: 20, contributionGrowth: 3 });
  assert.ok(growth.finalValue > base.finalValue, 'contributionGrowth=3 must increase finalValue');
  assert.ok(growth.finalInvested > base.finalInvested, 'more invested with growing contributions');
});

test('contributionGrowth=5 > contributionGrowth=2 for same horizon', () => {
  const g2 = compound.calcCompound({ initialAmount: 5000, monthlyAmount: 200, annualRate: 6, years: 25, contributionGrowth: 2 });
  const g5 = compound.calcCompound({ initialAmount: 5000, monthlyAmount: 200, annualRate: 6, years: 25, contributionGrowth: 5 });
  assert.ok(g5.finalValue > g2.finalValue, 'higher growth rate → higher final value');
});

test('contributionGrowth yearly array length unchanged', () => {
  const r = compound.calcCompound({ monthlyAmount: 100, annualRate: 5, years: 15, contributionGrowth: 3 });
  assert.strictEqual(r.yearly.length, 15);
});
