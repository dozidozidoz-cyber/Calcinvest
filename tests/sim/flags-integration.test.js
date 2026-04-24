/**
 * Flag-gating integration: free tier is capped, pro tier unlocks.
 */
const test = require('node:test');
const assert = require('node:assert');
const dca = require('../../assets/js/core/calculators/dca');
const fire = require('../../assets/js/core/calculators/fire');

function synthPrices(n) {
  const rng = require('../../assets/js/core/engine/rng');
  const rand = rng.mulberry32(1);
  const norm = rng.normal(rand);
  const p = [100];
  for (let i = 1; i < n; i++) p.push(p[i - 1] * (1 + 0.005 + 0.04 * norm()));
  return p;
}

test('DCA MC: free tier caps simulations at 5000', () => {
  const r = dca.monteCarloAdvanced({
    prices: synthPrices(300), horizonYears: 5, simulations: 50000,
    initialAmount: 1000, monthlyAmount: 100, seed: 1, ctx: { tier: 'free' }
  });
  assert.ok(r.meta.N <= 5000);
});

test('DCA MC: pro tier allows up to 50000', () => {
  const r = dca.monteCarloAdvanced({
    prices: synthPrices(300), horizonYears: 2, simulations: 10000,
    initialAmount: 1000, monthlyAmount: 100, seed: 1, ctx: { tier: 'pro' }
  });
  assert.strictEqual(r.meta.N, 10000);
});

test('DCA MC: free tier crypto does NOT activate fat-tail kicker', () => {
  const r = dca.monteCarloAdvanced({
    prices: synthPrices(300), horizonYears: 5, simulations: 200,
    initialAmount: 500, monthlyAmount: 50, seed: 1,
    assetType: 'crypto', ctx: { tier: 'free' }
  });
  assert.ok(r.meta.method.indexOf('t-kicker') < 0);
});

test('DCA MC: pro tier crypto activates fat-tail kicker', () => {
  const r = dca.monteCarloAdvanced({
    prices: synthPrices(300), horizonYears: 5, simulations: 200,
    initialAmount: 500, monthlyAmount: 50, seed: 1,
    assetType: 'crypto', ctx: { tier: 'pro' }
  });
  assert.ok(r.meta.method.indexOf('t-kicker') >= 0);
});

test('FIRE MC: free tier caps simulations at 5000 and rejects fatTail', () => {
  const hist = new Array(240).fill(0.005);
  const r = fire.calcMonteCarloFIRE({
    capital: 500000, annualExpenses: 25000, monthlyReturns: hist,
    years: 10, simulations: 20000, seed: 1, fatTail: true,
    ctx: { tier: 'free' }
  });
  assert.ok(r.meta.N <= 5000);
  assert.strictEqual(r.meta.fatTail, false);
});

test('FIRE MC: pro tier allows fatTail', () => {
  const hist = new Array(240).fill(0.005);
  const r = fire.calcMonteCarloFIRE({
    capital: 500000, annualExpenses: 25000, monthlyReturns: hist,
    years: 10, simulations: 500, seed: 1, fatTail: true,
    ctx: { tier: 'pro' }
  });
  assert.strictEqual(r.meta.fatTail, true);
});
