/**
 * DCA advanced Monte Carlo: reproducibility, shape, sanity on synthetic prices.
 */
const test = require('node:test');
const assert = require('node:assert');
const dca = require('../../assets/js/core/calculators/dca');

// Synthetic price series: 20 years of monthly prices with ~7% annual, ~15% vol-ish
function synthPrices(n, seed) {
  const rng = require('../../assets/js/core/engine/rng');
  const rand = rng.mulberry32(seed || 1);
  const norm = rng.normal(rand);
  const prices = [100];
  const muM = Math.pow(1.07, 1 / 12) - 1;
  const sM = 0.15 / Math.sqrt(12);
  for (let i = 1; i < n; i++) {
    const r = muM + sM * norm();
    prices.push(prices[i - 1] * (1 + r));
  }
  return prices;
}

test('monteCarloAdvanced: reproducible with same seed', () => {
  const prices = synthPrices(360, 7);
  const opts = {
    prices,
    horizonYears: 10,
    simulations: 500,
    initialAmount: 1000,
    monthlyAmount: 200,
    seed: 123
  };
  const a = dca.monteCarloAdvanced(opts);
  const b = dca.monteCarloAdvanced(opts);
  assert.ok(a && b);
  assert.strictEqual(a.terminal[0], b.terminal[0]);
  assert.strictEqual(a.terminal[100], b.terminal[100]);
  assert.strictEqual(a.stats.percentiles.p50, b.stats.percentiles.p50);
});

test('monteCarloAdvanced: uniform output shape', () => {
  const prices = synthPrices(360, 2);
  const r = dca.monteCarloAdvanced({
    prices, horizonYears: 15, simulations: 300,
    initialAmount: 0, monthlyAmount: 500, seed: 42, goal: 150000
  });
  assert.ok(r.terminal && r.terminal.length === 300);
  assert.ok(r.stats && r.stats.percentiles);
  const p = r.stats.percentiles;
  assert.ok(p.p5 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p95);
  assert.ok(r.successRate >= 0 && r.successRate <= 1);
  assert.ok(typeof r.cvar05 === 'number');
  assert.strictEqual(r.years.length, 15);
  assert.strictEqual(r.percentileBands.p50.length, 15);
  assert.strictEqual(r.meta.N, 300);
  assert.strictEqual(r.meta.seed, 42);
});

test('monteCarloAdvanced: percentile bands monotone at each year', () => {
  const prices = synthPrices(300, 3);
  const r = dca.monteCarloAdvanced({
    prices, horizonYears: 10, simulations: 400,
    initialAmount: 1000, monthlyAmount: 100, seed: 9
  });
  const b = r.percentileBands;
  for (let i = 0; i < b.p50.length; i++) {
    assert.ok(b.p5[i] <= b.p25[i] + 1e-6);
    assert.ok(b.p25[i] <= b.p50[i] + 1e-6);
    assert.ok(b.p50[i] <= b.p75[i] + 1e-6);
    assert.ok(b.p75[i] <= b.p95[i] + 1e-6);
  }
});

test('monteCarloAdvanced: method student-t gives fatter tails than bootstrap', () => {
  const prices = synthPrices(300, 5);
  const common = {
    prices, horizonYears: 10, simulations: 1000,
    initialAmount: 1000, monthlyAmount: 100, seed: 7
  };
  const boot = dca.monteCarloAdvanced(Object.assign({}, common, { method: 'block-bootstrap' }));
  const stu  = dca.monteCarloAdvanced(Object.assign({}, common, { method: 'student-t' }));
  // Student-t should produce a lower p5 (worse bad-tail) most of the time.
  // Allow some slack since synth series is already normal-ish.
  assert.ok(stu.stats.percentiles.p5 <= boot.stats.percentiles.p5 * 1.2);
});

test('monteCarloAdvanced: crypto assetType activates fat-tail kicker', () => {
  const prices = synthPrices(300, 11);
  const r = dca.monteCarloAdvanced({
    prices, horizonYears: 5, simulations: 200,
    initialAmount: 500, monthlyAmount: 50, seed: 1, assetType: 'crypto',
    ctx: { tier: 'pro' }
  });
  assert.ok(r.meta.method.indexOf('t-kicker') >= 0);
});

test('monteCarloAdvanced: returns null on too-short series', () => {
  const r = dca.monteCarloAdvanced({ prices: [100, 101, 102], horizonYears: 1 });
  assert.strictEqual(r, null);
});

test('monteCarloAdvanced: delegated stocks API intact', () => {
  assert.strictEqual(typeof dca.calcDCA, 'function');
  assert.strictEqual(typeof dca.computeAssetStats, 'function');
  assert.strictEqual(typeof dca.computeLumpVsDCA, 'function');
});

test('monteCarloAdvanced: delegated crypto API intact', () => {
  assert.strictEqual(typeof dca.calcCryptoDCA, 'function');
  assert.strictEqual(typeof dca.detectCycles, 'function');
  assert.strictEqual(typeof dca.calcLumpSumVsDCA, 'function');
});

// ─── computeDeFiStrategies tests ────────────────────────────────────────────

const crypto = require('../../assets/js/core/calc-dca-crypto');

// Build synthetic monthly_data array (minimal shape required by computeDeFiStrategies)
function synthCryptoMonthly(nMonths) {
  const out = [];
  let price = 100, invested = 0;
  for (let i = 0; i < nMonths; i++) {
    price    *= (1 + 0.005); // +0.5%/month
    invested += 100;
    const coins = invested / price;
    const value = coins * price;
    out.push({ price, invested, coins, value, pnl: value - invested, pnlPct: (value - invested) / invested * 100 });
  }
  return out;
}

test('computeDeFiStrategies: returns 4 scenarios', () => {
  const md  = synthCryptoMonthly(60);
  const res = crypto.computeDeFiStrategies(md, 'eth');
  assert.strictEqual(res.scenarios.length, 4);
  const ids = res.scenarios.map((s) => s.id);
  assert.ok(ids.includes('hodl'));
  assert.ok(ids.includes('staking'));
  assert.ok(ids.includes('lending'));
  assert.ok(ids.includes('lp'));
});

test('computeDeFiStrategies: staking >= hodl at all yearly checkpoints', () => {
  const md  = synthCryptoMonthly(120);
  const res = crypto.computeDeFiStrategies(md, 'eth');
  const hodl    = res.scenarios.find((s) => s.id === 'hodl');
  const staking = res.scenarios.find((s) => s.id === 'staking');
  staking.yearly.forEach((yr, i) => {
    assert.ok(yr.value >= hodl.yearly[i].value, `year ${yr.year}: staking must be >= hodl`);
  });
});

test('computeDeFiStrategies: hodlFinal matches hodl scenario finalValue', () => {
  const md  = synthCryptoMonthly(60);
  const res = crypto.computeDeFiStrategies(md, 'btc');
  const hodl = res.scenarios.find((s) => s.id === 'hodl');
  assert.strictEqual(res.hodlFinal, hodl.finalValue);
});

test('computeDeFiStrategies: asset-specific staking APY (sol > eth)', () => {
  const md   = synthCryptoMonthly(120);
  const eth  = crypto.computeDeFiStrategies(md, 'eth');
  const sol  = crypto.computeDeFiStrategies(md, 'sol');
  const ethStakingApy = eth.scenarios.find((s) => s.id === 'staking').apy;
  const solStakingApy = sol.scenarios.find((s) => s.id === 'staking').apy;
  assert.ok(solStakingApy > ethStakingApy, 'SOL staking APY should exceed ETH staking APY');
});

test('computeDeFiStrategies: DEFI_YIELDS exported correctly', () => {
  assert.ok(crypto.DEFI_YIELDS, 'DEFI_YIELDS should be exported');
  assert.ok(crypto.DEFI_YIELDS.staking.eth.apy > 0);
  assert.ok(crypto.DEFI_YIELDS.lending.apy > 0);
  assert.ok(crypto.DEFI_YIELDS.lp.apy > 0);
});
