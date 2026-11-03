// TASKS.csv #1514 (review #1497, Lawyers) — the whole-matrix computation gives correlate()'s r and n for every pair
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correlate, correlationMatrix } from "../src/lib/correlation.js";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const N = 400;
const base = Array.from({ length: N }, () => rnd());
const cols = {
  Au: base.map((b) => Math.exp(4 * b) * 0.01), // complete, skewed
  Ag: base.map((b) => Math.round(10 * (b + 0.3 * rnd()))), // complete, many ties
  As: base.map((b, i) => (i % 7 === 0 ? null : 5 + 100 * b * rnd())), // gaps
  Cu: base.map((b, i) => (i % 5 === 0 ? 0 : i % 11 === 0 ? null : 50 * (1 - b) + rnd())), // zeros (dropped by log) and gaps
  K: base.map(() => 2), // constant: r null
};
const symbols = Object.keys(cols);

for (const method of ["spearman", "log", "pearson"]) {
  test(`${method}: every pair matches correlate() on the paired rows`, () => {
    const m = correlationMatrix(cols, symbols, method);
    for (const a of symbols) for (const b of symbols) {
      const xs = [], ys = [];
      for (let i = 0; i < N; i++) if (cols[a][i] != null && cols[b][i] != null) { xs.push(cols[a][i]); ys.push(cols[b][i]); }
      const c = correlate(xs, ys, method);
      const want = a === b ? { r: c.n >= 2 ? 1 : null, n: c.n } : c;
      assert.equal(m[a][b].n, want.n, `${a}-${b} n`);
      if (want.r == null) assert.equal(m[a][b].r, null, `${a}-${b} r`);
      else assert.ok(Math.abs(m[a][b].r - want.r) < 1e-12, `${a}-${b} r ${m[a][b].r} vs ${want.r}`);
      assert.equal(m[a][b], m[b][a], "mirrored");
    }
  });
}

test("the cache keeps prepared columns and pairs: one more element computes its row only", () => {
  const cache = new Map();
  correlationMatrix(cols, ["Au", "Ag", "As"], "spearman", cache);
  const pairs = [...cache.keys()].filter((k) => k.startsWith("pair|")).length;
  assert.equal(pairs, 6); // upper triangle with the diagonal
  correlationMatrix(cols, ["Au", "Ag", "As", "Cu"], "spearman", cache);
  assert.equal([...cache.keys()].filter((k) => k.startsWith("pair|")).length, 10);
});

test("the dialog memoizes its symbols and uses the cached matrix", () => {
  const src = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("const symbols = useMemo(() => allSymbols.filter((s) => selected.has(s)), [assayElements, selected]);"));
  assert.ok(src.includes("return correlationMatrix(caches.cols, symbols, method, caches.pairs);"));
});
