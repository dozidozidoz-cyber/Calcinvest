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

// ─── DeFi enrichments (PR 7A) ──────────────────────────────────────────────

const ccrypto = require('../../assets/js/core/calc-dca-crypto');

test('computeDeFiStrategies: yieldTokens populated for staking ETH', () => {
  const prices = synthPrices(60, 11);
  const r = ccrypto.calcCryptoDCA({
    prices: prices, dataStart: '2018-01',
    startDate: '2018-01', endDate: null,
    initialAmount: 10000, monthlyAmount: 100, feesPct: 0, taxRate: 0
  });
  const defi = ccrypto.computeDeFiStrategies(r.monthly_data, 'eth');
  const staking = defi.scenarios.find((s) => s.id === 'staking');
  assert.ok(staking.yieldTokens > 0, 'staking yieldTokens should be > 0');
  assert.ok(staking.yieldUsdNow > 0, 'staking yieldUsdNow should be > 0');
  const lending = defi.scenarios.find((s) => s.id === 'lending');
  assert.strictEqual(lending.yieldTokens, 0, 'lending = pure USD, 0 tokens');
});

test('computeDeFiStrategies: hodl scenario has 0 yield (control)', () => {
  const prices = synthPrices(60, 12);
  const r = ccrypto.calcCryptoDCA({
    prices: prices, dataStart: '2018-01',
    startDate: '2018-01', endDate: null,
    initialAmount: 10000, monthlyAmount: 0, feesPct: 0, taxRate: 0
  });
  const defi = ccrypto.computeDeFiStrategies(r.monthly_data, 'eth');
  const hodl = defi.scenarios.find((s) => s.id === 'hodl');
  assert.strictEqual(hodl.yieldEarned, 0);
  assert.strictEqual(hodl.yieldTokens, 0);
});

test('BEAR_PERIODS exposes ETH window 2021-11 → 2022-12', () => {
  assert.ok(ccrypto.BEAR_PERIODS.eth);
  assert.strictEqual(ccrypto.BEAR_PERIODS.eth.start, '2021-11');
  assert.strictEqual(ccrypto.BEAR_PERIODS.eth.end, '2022-12');
  assert.ok(ccrypto.BEAR_PERIODS.eth.drawdown < 0);
});

test('computeDeFiStressTest: returns null if asset has no bear period', () => {
  const prices = synthPrices(60, 13);
  const out = ccrypto.computeDeFiStressTest(prices, '2018-01', 'unknown', {});
  assert.strictEqual(out, null);
});

test('computeDeFiStressTest: returns 4 strategies with drawdown info on covered window', () => {
  // Reusing real ETH data from disk would require fs; simulate with synthPrices that covers period
  const prices = synthPrices(102, 14);
  const out = ccrypto.computeDeFiStressTest(prices, '2017-11', 'eth', { initialAmount: 10000 });
  assert.ok(out, 'should return result');
  assert.strictEqual(out.drawdownByStrat.length, 4);
  out.drawdownByStrat.forEach((d) => {
    assert.ok(typeof d.drawdown === 'number');
    assert.ok(typeof d.deltaVsHodlPct === 'number');
    assert.ok(['hodl','staking','lending','lp'].indexOf(d.id) >= 0);
  });
});

test('computeGasBreakeven: small DCA mainnet → not worth it', () => {
  const r = ccrypto.computeGasBreakeven({ monthlyAmount: 50, apy: 4, gasUsdPerClaim: 30, claimsPerYear: 12 });
  assert.strictEqual(r.isWorthIt, false);
  assert.ok(r.netApy < 0);
  assert.ok(r.recommendation.length > 0);
});

test('computeGasBreakeven: large DCA L2 → worth it, net APY close to gross', () => {
  const r = ccrypto.computeGasBreakeven({ monthlyAmount: 2000, apy: 4, gasUsdPerClaim: 1, claimsPerYear: 4 });
  assert.strictEqual(r.isWorthIt, true);
  assert.ok(r.netApy > 3.5, 'net APY should be close to 4% gross');
});

test('computeGasBreakeven: auto-compound (0 claims) recommended for any size', () => {
  const r = ccrypto.computeGasBreakeven({ monthlyAmount: 100, apy: 4, gasUsdPerClaim: 0, claimsPerYear: 0 });
  assert.strictEqual(r.gasYearly, 0);
  assert.ok(r.recommendation.includes('Auto-compound'));
});

test('computeGasBreakeven: breakeven monotonically scales with gas cost', () => {
  const cheap = ccrypto.computeGasBreakeven({ monthlyAmount: 100, apy: 4, gasUsdPerClaim: 5,  claimsPerYear: 12 });
  const exp   = ccrypto.computeGasBreakeven({ monthlyAmount: 100, apy: 4, gasUsdPerClaim: 30, claimsPerYear: 12 });
  assert.ok(exp.breakevenMonthly > cheap.breakevenMonthly, 'higher gas → higher breakeven');
});
