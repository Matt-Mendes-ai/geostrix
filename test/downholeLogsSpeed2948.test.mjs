// TASKS.csv #2948 (review #2876, WA iron) — Downhole logs froze 2 to 8 s per choice at 484,531 bins: every reading was matched to its code, its
// assay and its model cell with Array.find, the grouping was redone on a ranking change, and Spearman ranked each column through an index sort
// with a comparator. The answers must not change: each new path is checked against the old one, written out here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupLogByCode, rankLogGroups, logByCode, logVsAssay, logVsModel, NOT_LOGGED, boxStats } from "../src/lib/downholeLogs.js";
import { correlate, pearson } from "../src/lib/correlation.js";
import { quantileSorted } from "../src/lib/arrayStats.js";

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// the code as it was (master before #2948)
function oldDomainOf(domainRows) {
  const byHole = new Map();
  for (const d of domainRows || []) { if (!(Number(d.to) > Number(d.from))) continue; (byHole.get(d.hole_id) || byHole.set(d.hole_id, []).get(d.hole_id)).push(d); }
  byHole.forEach((r) => r.sort((a, b) => a.from - b.from));
  return (a) => { const rows = byHole.get(a.hole_id); if (!rows) return null; const m = (Number(a.from) + Number(a.to)) / 2; const hit = rows.find((r) => m >= r.from && m < r.to); return hit ? String(hit.value ?? "") : null; };
}
function oldLogByCode(rows, symbol, domainRows, { minN = 3, stat = "median", above = null } = {}) {
  const codeOf = oldDomainOf(domainRows), groups = new Map();
  for (const r of rows) { const v = r.values?.[symbol]; if (!Number.isFinite(v)) continue; const code = codeOf(r) ?? NOT_LOGGED; (groups.get(code) || groups.set(code, []).get(code)).push(v); }
  const out = [], thr = Number(above);
  for (const [key, vals] of groups) {
    const stats = boxStats(vals);
    if (!stats || stats.n < minN) continue;
    let value = stats.median, nAbove;
    if (stat === "mean") value = vals.reduce((s, v) => s + v, 0) / vals.length;
    else if (stat === "p90") value = quantileSorted([...vals].sort((a, b) => a - b), 0.9);
    else if (stat === "above" && Number.isFinite(thr)) { nAbove = vals.filter((v) => v > thr).length; value = (100 * nAbove) / vals.length; }
    out.push({ key, stats, n: stats.n, value, ...(nAbove != null ? { nAbove } : {}) });
  }
  return out.sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key)));
}
function oldRanks(v) {
  const idx = v.map((x, i) => i).sort((a, b) => v[a] - v[b]), r = new Array(v.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = avg; i = j + 1; }
  return r;
}

// a log over holes whose code layer has gaps, overlaps (hole B), string depths (hole C), a blank code and unlogged holes
function project() {
  const rows = [], dom = [], assays = [], model = [];
  for (let h = 0; h < 60; h++) {
    const id = `H${h}`;
    for (let b = 0; b < 80; b++) rows.push({ hole_id: id, from: b * 0.5, to: b * 0.5 + 0.5, values: { SG: b % 17 === 3 ? NaN : Math.round((1.5 + rnd() * 3) * 20) / 20 } });
    if (h % 7 === 6) continue; // not logged
    let d = rnd() * 2;
    for (let k = 0; d < 40; k++) {
      const t = d + 0.4 + rnd() * 5, code = ["HEM", "GOE", "SHL", "", " shl"][(h + k) % 5];
      dom.push({ hole_id: id, from: h % 5 === 2 ? String(d) : d, to: h % 5 === 2 ? String(t) : t, value: code });
      if (h % 4 === 1 && k % 3 === 0) dom.push({ hole_id: id, from: d - 0.3, to: t + 1.2, value: "OVR" }); // overlapping intervals
      d = t + (rnd() < 0.2 ? 0.7 : 0); // a gap now and then
    }
    for (let a = 0; a < 20; a++) assays.push({ hole_id: id, from: a * 2, to: a * 2 + 2, values: { Fe: Math.round(rnd() * 600) / 10 }, ...(a % 9 === 4 ? { source: "pXRF" } : {}) });
    if (h % 3 === 0) assays.push({ hole_id: id, from: 5, to: 9, values: { Fe: 33 } }); // overlaps the regular intervals
    for (let a = 0; a < 8; a++) model.push({ hole_id: id, from: a * 5, to: a * 5 + (h % 6 === 0 ? 6 : 5), value: rnd() * 3 });
  }
  return { rows, dom, assays, model };
}

test("grouping once and ranking from the kept arrays gives what logByCode gave, for every ranking", () => {
  const { rows, dom } = project();
  const grouped = groupLogByCode(rows, "SG", dom);
  for (const opt of [{}, { stat: "mean" }, { stat: "p90" }, { stat: "above", above: 3 }, { stat: "above", above: 2.5 }, { stat: "median", minN: 1 }]) {
    const want = oldLogByCode(rows, "SG", dom, opt);
    assert.deepEqual(rankLogGroups(grouped, opt), want, JSON.stringify(opt));
    assert.deepEqual(logByCode(rows, "SG", dom, opt), want);
  }
  const keys = rankLogGroups(grouped).map((g) => g.key);
  for (const k of [NOT_LOGGED, "", "OVR", " shl"]) assert.ok(keys.includes(k), k);
});

test("the log against its assays and against a model: the same pairs and statistics as the per-reading find", () => {
  const { rows, assays, model } = project();
  const vs = logVsAssay(rows, "SG", assays, "Fe", { Fe: "%" });
  // the old pairing, by find
  const byHole = new Map();
  for (const a of assays) { if (a.source === "pXRF") continue; (byHole.get(a.hole_id) || byHole.set(a.hole_id, []).get(a.hole_id)).push(a); }
  byHole.forEach((l) => l.sort((x, y) => x.from - y.from));
  const want = [];
  for (const r of rows) { const v = r.values.SG, l = byHole.get(r.hole_id); if (!Number.isFinite(v) || !l) continue; const m = (r.from + r.to) / 2, hit = l.find((a) => m >= a.from && m < a.to); if (hit) want.push([v, hit.values.Fe]); }
  assert.deepEqual(vs.pairs, want);
  assert.ok(vs.pairs.some(([, g]) => g === 33), "an overlapping interval that comes first by depth is the one read");
  const xs = want.map((p) => p[0]), ys = want.map((p) => p[1]);
  assert.equal(vs.r, pearson(oldRanks(xs), oldRanks(ys)));
  const ratios = want.filter(([, a]) => a > 0).map(([l, a]) => l / a).sort((a, b) => a - b);
  assert.equal(vs.medianRatio, ratios[ratios.length >> 1]);
  const vm = logVsModel(rows, "SG", model);
  const mb = new Map();
  for (const m of model) (mb.get(m.hole_id) || mb.set(m.hole_id, []).get(m.hole_id)).push(m);
  mb.forEach((l) => l.sort((x, y) => x.from - y.from));
  const wantM = [];
  for (const r of rows) { const v = r.values.SG, l = mb.get(r.hole_id); if (!Number.isFinite(v) || !l) continue; const m = (r.from + r.to) / 2, hit = l.find((c) => m >= c.from && m < c.to); if (hit) wantM.push([v, hit.value]); }
  assert.deepEqual(vm.pairs, wantM);
});

test("Spearman's ranks from the radix order are the comparator sort's ranks: ties, negatives, -0 and 0, extremes, and NaN as before", () => {
  const v = Array.from({ length: 5000 }, () => (rnd() < 0.4 ? -1 : 1) * Math.round(rnd() * 300) / 10);
  v.push(-0, 0, 0, -0, 1e308, -1e308, 5e-324, -5e-324, 7.25, 7.25);
  const w = v.map((x, i) => (i % 3 ? x * 2 : -x) + 1);
  assert.equal(correlate(v, w, "spearman").r, pearson(oldRanks(v), oldRanks(w)));
  const withNaN = [3, NaN, 1, 2, 2], other = [1, 2, 3, 4, 5];
  assert.equal(correlate(withNaN, other, "spearman").r, pearson(oldRanks(withNaN), oldRanks(other)), "a NaN keeps the old path");
  assert.equal(correlate([], [], "spearman").r, null);
  assert.equal(correlate([4], [2], "spearman").r, null);
});

test("a ranking change on half a million readings reads the kept arrays (no regrouping)", () => {
  const rows = [], dom = [];
  for (let h = 0; h < 6000; h++) {
    for (let b = 0; b < 80; b++) rows.push({ hole_id: h, from: b * 0.5, to: b * 0.5 + 0.5, values: { D: 1.5 + rnd() * 3 } });
    for (let k = 0; k < 8; k++) dom.push({ hole_id: h, from: k * 5, to: k * 5 + 5, value: `C${(h + k) % 10}` });
  }
  const grouped = groupLogByCode(rows, "D", dom);
  const t0 = performance.now();
  for (const stat of ["median", "mean", "p90", "above"]) rankLogGroups(grouped, { stat, above: 3 });
  assert.ok(performance.now() - t0 < 200, `four rankings took ${(performance.now() - t0).toFixed(0)} ms`);
});

test("the pane keeps the grouping per (log, code layer), defers the heavy passes on a big log and says so", () => {
  const src = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(src, /useDeferredMemo\(\(\) => \(data && domainFold \? groupLogByCode\(data\.assays, data\.symbol, domainFold\.rows\) : null\), \[data, domainFold\], heavy\)/);
  assert.match(src, /rankLogGroups\(grouped, \{ stat: rankStat, above: Number\(rankAbove\) \}\) : \[\]\), \[grouped, rankStat, rankAbove\]\)/);
  assert.match(src, /useDeferredMemo\(\(\) => \(vsIndex && el \? logVsAssayIndexed\(/); // #3078 — from the index kept per (log, assay table)
  assert.match(src, /useDeferredMemo\(\(\) => \(data && modelLayer \? logVsModel\(/);
  assert.match(src, /tr\("Grouping \{n\} readings by \{layer\}…"/);
  assert.match(src, /tr\("Pairing \{n\} readings with the \{el\} assays…"/);
  assert.match(src, /\}, \[pairs, (xs, ys, )?logX, logY\]\);/, "the scatter's points are kept while its pairs and axes stay"); // xs, ys: #3078
  assert.doesNotMatch(src, /allAboveZero\(vs\.pairs\.map\(\(p\) => p\[0\]\)\)\} /, "not recomputed in the render");
  const hook = readFileSync(new URL("../src/lib/useDeferredMemo.js", import.meta.url), "utf8");
  assert.match(hook, /setTimeout\(\(\) => setDone\(\{ token, value: compute\(\) \}\), 30\)/);
  assert.match(hook, /\{ value: undefined, pending: true \}/, "never the previous choice's answer while pending");
});
