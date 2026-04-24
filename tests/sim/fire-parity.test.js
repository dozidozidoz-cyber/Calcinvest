/**
 * FIRE calculator: parity on deterministic paths + MC reproducibility.
 */
const test = require('node:test');
const assert = require('node:assert');
const fire = require('../../assets/js/core/calculators/fire');

const BASE = {
  currentAge: 35, annualExpenses: 30000, currentSavings: 50000,
  monthlyContrib: 1500, annualReturn: 7, withdrawalRate: 4,
  inflation: 2, safetyMargin: 0
};

test('calcFIRE: target = expenses / rate', () => {
  const r = fire.calcFIRE(BASE);
  assert.strictEqual(r.fireTarget, 30000 / 0.04);
  assert.ok(r.yearsToFire > 10 && r.yearsToFire < 30);
  assert.ok(r.achieved);
});

test('calcFIRE: lean < main < fat target', () => {
  const r = fire.calcFIRE(BASE);
  assert.ok(r.leanTarget < r.fireTarget);
  assert.ok(r.fireTarget < r.fatTarget);
  assert.ok(r.baristaYears <= r.leanYears);
  assert.ok(r.leanYears <= r.yearsToFire);
  assert.ok(r.yearsToFire <= r.fatYears);
});

test('calcFIRE: coastFIRE when current savings already sufficient', () => {
  const r = fire.calcFIRE(Object.assign({}, BASE, { currentSavings: 750000, monthlyContrib: 0 }));
  assert.ok(r.isCoastFIRE);
});

test('simulateWithdrawal: survives 4% rule at 7% return / 2% inflation', () => {
  const s = fire.simulateWithdrawal(750000, 30000, 7, 2, 30);
  assert.ok(!s.depleted || s.depletedYear > 25);
});

test('simulateWithdrawal: ruin at unrealistic 10% withdrawal on 2% return', () => {
  const s = fire.simulateWithdrawal(300000, 30000, 2, 2, 50);
  assert.ok(s.depleted);
});

test('calcMonteCarloFIRE: reproducible with same seed', () => {
  // synthetic S&P-ish monthly returns
  const hist = [];
  for (let i = 0; i < 360; i++) hist.push(0.006 + 0.04 * (Math.sin(i) * 0.5));
  const opts = { capital: 750000, annualExpenses: 30000, monthlyReturns: hist,
                 years: 30, simulations: 500, seed: 42 };
  const a = fire.calcMonteCarloFIRE(opts);
  const b = fire.calcMonteCarloFIRE(opts);
  assert.strictEqual(a.successRate, b.successRate);
  assert.strictEqual(a.terminal[0], b.terminal[0]);
  assert.strictEqual(a.percentiles[10].p50, b.percentiles[10].p50);
});

test('calcMonteCarloFIRE: output shape', () => {
  const hist = [];
  for (let i = 0; i < 360; i++) hist.push(0.005 + 0.03 * Math.sin(i));
  const r = fire.calcMonteCarloFIRE({
    capital: 500000, annualExpenses: 25000, monthlyReturns: hist,
    years: 20, simulations: 300, seed: 7
  });
  assert.ok(r.successRate >= 0 && r.successRate <= 100);
  assert.strictEqual(r.percentiles.length, 21); // years 0..20
  assert.strictEqual(r.meta.seed, 7);
  assert.strictEqual(r.meta.N, 300);
  assert.ok(typeof r.cvar05 === 'number');
});

test('calcMonteCarloFIRE: legacy positional signature still works', () => {
  const hist = new Array(240).fill(0.005);
  const r = fire.calcMonteCarloFIRE(500000, 20000, hist, 20, 200);
  assert.ok(r.runs === 200);
});

test('calcMonteCarloFIRE: fatTail option alters path', () => {
  const hist = [];
  for (let i = 0; i < 360; i++) hist.push(0.006 + 0.05 * Math.sin(i * 0.3));
  const base = { capital: 500000, annualExpenses: 25000, monthlyReturns: hist,
                 years: 30, simulations: 400, seed: 5, ctx: { tier: 'pro' } };
  const a = fire.calcMonteCarloFIRE(base);
  const b = fire.calcMonteCarloFIRE(Object.assign({}, base, { fatTail: true }));
  assert.ok(b.meta.fatTail === true);
  // Fat tail should widen percentile band
  assert.ok(Math.abs(b.percentiles[10].p10 - a.percentiles[10].p10) > 0
        || Math.abs(b.percentiles[10].p90 - a.percentiles[10].p90) > 0);
});
