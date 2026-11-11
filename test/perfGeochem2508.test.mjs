// TASKS.csv #2508 — Grade stats by 'Hole + lithology' (5,938 groups) froze the window 1.6-3.8 s, and each Correlation tick took up to 644 ms
// (10.7 s for 30 ticks) on 21,974 rows with gaps: every pair re-sorted both columns. Now each element is sorted once and a pair's ranks come
// from one walk of that order; Grade stats draws and lists the first 200 groups.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correlationMatrix, correlate } from "../src/lib/correlation.js";

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("Spearman with gaps and ties: the same r and n as correlate() on the paired values", () => {
  const n = 400, cols = {};
  const base = Array.from({ length: n }, () => rnd());
  for (const s of ["A", "B", "C", "D"]) cols[s] = base.map((b) => (rnd() < 0.2 ? null : Math.round((b + rnd() * 0.5) * 20) / 20)); // gaps, many ties
  cols.E = base.map((b) => b * 3); // complete
  const m = correlationMatrix(cols, Object.keys(cols), "spearman");
  for (const a of Object.keys(cols)) for (const b of Object.keys(cols)) {
    if (a === b) continue;
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) if (cols[a][i] != null && cols[b][i] != null) { xs.push(cols[a][i]); ys.push(cols[b][i]); }
    const ref = correlate(xs, ys, "spearman");
    assert.equal(m[a][b].n, ref.n, `${a}-${b} n`);
    assert.ok(Math.abs(m[a][b].r - ref.r) < 1e-12, `${a}-${b}: ${m[a][b].r} vs ${ref.r}`);
  }
});

test("a tick on 22,000 rows x 42 elements with gaps computes the new row only, quickly", () => {
  const n = 22000, cols = {}, syms = [];
  for (let e = 0; e < 42; e++) { const s = `E${e}`; syms.push(s); cols[s] = Array.from({ length: n }, () => (rnd() < 0.3 ? null : Math.round(rnd() * 1000) / 10)); }
  const cache = new Map();
  const t0 = performance.now();
  correlationMatrix(cols, syms.slice(0, 41), "spearman", cache);
  const tAll = performance.now() - t0;
  const t1 = performance.now();
  correlationMatrix(cols, syms, "spearman", cache); // the 42nd element ticked
  const tTick = performance.now() - t1;
  assert.ok(tTick < 600, `one tick ${tTick.toFixed(0)} ms (was up to 644 ms in the app on a similar set)`);
  assert.ok(tAll < 15000, `41 elements at once ${tAll.toFixed(0)} ms`);
});

test("Grade stats draws and lists at most 200 groups and says so; Correlation has All / None / Suggested suite", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /const SHOWN_MAX = 200;/);
  assert.match(g, /<BoxPlots groups=\{shownGroups\}/);
  assert.match(g, /\{shownGroups\.map\(\(g\) =>/);
  assert.match(g, /groups\.slice\(0, SHOWN_MAX\)\.map\(\(g\) => \{/);
  assert.match(g, /The \{shown\} largest of \{n\} groups are drawn and listed; \{more\} more are in the CSV export\./);
  const c = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.match(c, /setSelected\(new Set\(allSymbols\)\)/);
  assert.match(c, /setSelected\(new Set\(\)\)/);
  assert.match(c, /tr\("Suggested suite"\)/);
});
