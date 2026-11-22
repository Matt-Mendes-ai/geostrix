// TASKS.csv #3962 (P1) — the small numerical pieces of the drill planner's grade model: the standard normal (its inverse for the
// normal-score transform), a seeded generator (the same draws every run, so a prediction can be reproduced from its seed),
// and a Cholesky factor with forward / back substitution for the joint posterior along a hole. Pure; used by the worker and the tests.

// Acklam's rational approximation of the standard normal inverse CDF (good to about 1e-9)
const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
export function normInv(p) {
  if (!(p > 0)) return -Infinity;
  if (!(p < 1)) return Infinity;
  const lo = 0.02425, hi = 1 - lo;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1); }
  if (p > hi) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
}

// mulberry32 and Box-Muller: a seeded stream of standard normal draws
export function normalStream(seed = 1) {
  let s = seed >>> 0, spare = null;
  const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => {
    if (spare != null) { const v = spare; spare = null; return v; }
    let a = 0; while (a <= 1e-300) a = u();
    const r = Math.sqrt(-2 * Math.log(a)), th = 2 * Math.PI * u();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

// In-place lower Cholesky factor of a symmetric n x n matrix (row-major Float64Array). A pivot at or below zero (a matrix that is
// only semi-definite: two data at one place, a nugget of 0) gets `jitter` added on the diagonal and the factor starts again, up to
// four times as large. -> { L, jitter } or null.
export function cholesky(M, n, jitter = 1e-10) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const L = new Float64Array(n * n), add = attempt === 0 ? 0 : jitter * 10 ** (2 * attempt);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = M[i * n + j] + (i === j ? add : 0);
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) { if (!(s > 0)) { ok = false; break; } L[i * n + i] = Math.sqrt(s); }
        else L[i * n + j] = s / L[j * n + j];
      }
    }
    if (ok) return { L, jitter: add };
  }
  return null;
}

// L y = b (forward), in place on a copy; L is n x n lower
export function forwardSolve(L, n, b) {
  const y = Float64Array.from(b);
  for (let i = 0; i < n; i++) { let s = y[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  return y;
}
// L' x = y (back)
export function backSolve(L, n, y) {
  const x = Float64Array.from(y);
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}
