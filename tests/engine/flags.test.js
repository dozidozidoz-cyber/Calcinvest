const test = require('node:test');
const assert = require('node:assert');
const flags = require('../../assets/js/core/flags');

test('free tier defaults', () => {
  const ctx = { tier: 'free' };
  assert.strictEqual(flags.get('mc.maxPaths', ctx), 5000);
  assert.strictEqual(flags.isEnabled('mc.correlated', ctx), false);
  assert.strictEqual(flags.isEnabled('mc.enabled', ctx), true);
  assert.strictEqual(flags.get('projects.maxCount', ctx), 5);
});

test('pro tier unlocks features', () => {
  const ctx = { tier: 'pro' };
  assert.strictEqual(flags.get('mc.maxPaths', ctx), 50000);
  assert.strictEqual(flags.isEnabled('mc.correlated', ctx), true);
  assert.strictEqual(flags.isEnabled('export.pdf', ctx), true);
  assert.strictEqual(flags.get('projects.maxCount', ctx), 100);
});

test('gate throws for disabled', () => {
  const ctx = { tier: 'free' };
  assert.throws(() => flags.gate('mc.correlated', ctx), /FEATURE_GATED|Feature disabled/);
});

test('gate passes for enabled', () => {
  const ctx = { tier: 'pro' };
  assert.doesNotThrow(() => flags.gate('mc.correlated', ctx));
});

test('register overrides flag', () => {
  flags.register('test.flag', true);
  assert.strictEqual(flags.isEnabled('test.flag', { tier: 'free' }), true);
});

test('unknown flag returns undefined', () => {
  assert.strictEqual(flags.get('does.not.exist', { tier: 'free' }), undefined);
});
