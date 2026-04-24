const test = require('node:test');
const assert = require('node:assert');
const correlation = require('../../assets/js/core/engine/correlation');

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('pearson perfect positive', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [2, 4, 6, 8, 10];
  assert.ok(close(correlation.pearson(x, y), 1, 1e-12));
});

test('pearson perfect negative', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [5, 4, 3, 2, 1];
  assert.ok(close(correlation.pearson(x, y), -1, 1e-12));
});

test('pearson zero for constant', () => {
  assert.ok(Number.isNaN(correlation.pearson([1, 2, 3], [5, 5, 5])));
});

test('matrix is symmetric with 1s on diagonal', () => {
  const s1 = [1, 2, 3, 4];
  const s2 = [4, 3, 2, 1];
  const s3 = [1, 3, 2, 4];
  const m = correlation.matrix([s1, s2, s3]);
  assert.strictEqual(m[0][0], 1);
  assert.strictEqual(m[1][1], 1);
  assert.strictEqual(m[2][2], 1);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assert.ok(close(m[i][j], m[j][i], 1e-12));
    }
  }
});

test('cholesky reconstructs matrix', () => {
  // 2×2 correlation matrix, rho = 0.3
  const A = [[1, 0.3], [0.3, 1]];
  const L = correlation.cholesky(A);
  // L·Lᵀ
  const LLT = [[0, 0], [0, 0]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      let s = 0;
      for (let k = 0; k < 2; k++) s += L[i][k] * L[j][k];
      LLT[i][j] = s;
    }
  }
  assert.ok(close(LLT[0][0], 1, 1e-12));
  assert.ok(close(LLT[0][1], 0.3, 1e-12));
  assert.ok(close(LLT[1][1], 1, 1e-12));
});

test('cholesky throws on non-PD', () => {
  // rho = 1.1 impossible
  assert.throws(() => correlation.cholesky([[1, 1.1], [1.1, 1]]));
});

test('applyL: identity on diagonal I', () => {
  const L = [[1, 0], [0, 1]];
  const z = [0.5, -0.3];
  const out = correlation.applyL(L, z);
  assert.deepStrictEqual(out, [0.5, -0.3]);
});
