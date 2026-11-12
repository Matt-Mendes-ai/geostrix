// TASKS.csv #2904 (WA iron review) — Correlation froze the window 4-13 s on 147,891 samples. Same r and n as before, less work: a native
// typed-array sort for each column's order, a complete column ranked once (a pair of them is one dot product), a gapped pair in one fused
// pass, and the QAQC toggle free on a project with no inserts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correlationMatrix, correlate, sortedOrder } from "../src/lib/correlation.js";

let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("sortedOrder: the rows with a number by value, ties in row order, as an index sort with a comparator", () => {
  const vals = Float64Array.from({ length: 3000 }, () => (rnd() < 0.15 ? NaN : rnd() < 0.05 ? (rnd() < 0.5 ? -0 : 0) : Math.round(rnd() * 50) / 10 - 1));
  const ref = [];
  for (let i = 0; i < vals.length; i++) if (!Number.isNaN(vals[i])) ref.push(i);
  ref.sort((a, b) => vals[a] - vals[b] || a - b);
  assert.deepEqual(Array.from(sortedOrder(vals)), ref);
  assert.deepEqual(Array.from(sortedOrder(new Float64Array([NaN, NaN]))), []);
});

test("Spearman on complete, gapped and mixed pairs with many ties: the same r and n as correlate() on the paired values", () => {
  const n = 1500, base = Array.from({ length: n }, () => rnd()), cols = {};
  cols.full1 = base.map((b) => Math.round((b + rnd() * 0.3) * 10) / 10); // complete, heavy ties
  cols.full2 = base.map((b) => b * 2 + rnd());
  cols.gap1 = base.map((b) => (rnd() < 0.3 ? null : Math.round((b + rnd()) * 20) / 20));
  cols.gap2 = base.map((b) => (rnd() < 0.1 ? null : b - rnd() * 0.2));
  cols.const = base.map(() => 5);
  const m = correlationMatrix(cols, Object.keys(cols), "spearman");
  for (const a of Object.keys(cols)) for (const b of Object.keys(cols)) {
    if (a === b) continue;
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) if (cols[a][i] != null && cols[b][i] != null) { xs.push(cols[a][i]); ys.push(cols[b][i]); }
    const ref = correlate(xs, ys, "spearman");
    assert.equal(m[a][b].n, ref.n, `${a}-${b} n`);
    if (ref.r == null) assert.equal(m[a][b].r, null, `${a}-${b} r null`);
    else assert.ok(Math.abs(m[a][b].r - ref.r) < 1e-10, `${a}-${b}: ${m[a][b].r} vs ${ref.r}`);
    assert.equal(m[a][b], m[b][a]);
  }
});

test("wiring: the QAQC toggle keeps the same rows (and the caches) when there are no inserts", () => {
  const c = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.match(c, /const qcFree = useMemo\(\(\) => \(surface \? labRows : excludeQAQC\(labRows\)\), \[labRows, surface\]\);/);
  assert.match(c, /const assays = includeQAQC \|\| surface \|\| qaqcCount === 0 \? labRows : qcFree;/);
  assert.match(c, /const caches = useMemo\(\(\) => \(\{ cols: \{\}, lt: \{\}, pairs: new Map\(\) \}\), \[assays, elementUnits, detectedOnly\]\);/);
});
