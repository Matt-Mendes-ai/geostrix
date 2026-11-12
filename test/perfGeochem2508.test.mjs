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

// The work a tick does, counted rather than timed: a fixed millisecond budget failed on almost every loaded full gate (5-12 s against 600 ms)
// and passed alone. Every value correlationMatrix computes goes into its cache (prep|… per element, pair|… per pair), so a counting cache
// records exactly what was computed: ticking a 42nd element must prepare that one element and compute only its 42 cells, never the other
// 41 x 42 / 2 pairs again. This fails if the incremental path breaks (a missing cache key, a full recompute) whatever the machine's load.
class CountingCache extends Map {
  constructor() { super(); this.sets = []; }
  set(k, v) { this.sets.push(k); return super.set(k, v); }
}
test("a tick on 22,000 rows x 42 elements with gaps computes the new row only (counted, not timed)", () => {
  const n = 22000, cols = {}, syms = [];
  for (let e = 0; e < 42; e++) { const s = `E${e}`; syms.push(s); cols[s] = Array.from({ length: n }, () => (rnd() < 0.3 ? null : Math.round(rnd() * 1000) / 10)); }
  const cache = new CountingCache();
  correlationMatrix(cols, syms.slice(0, 41), "spearman", cache);
  assert.equal(cache.sets.filter((k) => k.startsWith("pair|")).length, (41 * 42) / 2, "the first pass: every pair once (upper triangle with the diagonal)");
  cache.sets = [];
  const m = correlationMatrix(cols, syms, "spearman", cache); // the 42nd element ticked
  const preps = cache.sets.filter((k) => k.startsWith("prep|")), pairs = cache.sets.filter((k) => k.startsWith("pair|"));
  assert.deepEqual(preps, ["prep|spearman|E41"], "only the new element is prepared");
  assert.equal(pairs.length, 42, "only the new element's 41 pairs and its diagonal are computed");
  assert.ok(pairs.every((k) => k.split("|").slice(2).includes("E41")), "every computed pair involves the new element");
  // and the incremental row is the one a fresh full pass gives
  const fresh = correlationMatrix(cols, ["E0", "E17", "E41"], "spearman");
  for (const s of ["E0", "E17"]) { assert.equal(m.E41[s].n, fresh.E41[s].n); assert.ok(Math.abs(m.E41[s].r - fresh.E41[s].r) < 1e-12); }
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
