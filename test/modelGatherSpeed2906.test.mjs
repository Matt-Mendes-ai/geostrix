// TASKS.csv #2906 (WA iron review) — the freeze before an implicit run: the hole spacing was an all-pairs loop, the contact gatherer filtered the
// whole Lithology log once per hole, and 'Add "modelled unit" layer' crossed every trace with every row. Same answers, without the scans.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { medianCollarSpacing } from "../src/lib/viewer/geomath.js";
import { rowsByHole } from "../src/lib/rowsByHole.js";

// the previous all-pairs version, for comparison
function bruteSpacing(list) {
  if (!list || list.length < 2) return null;
  const nn = [];
  for (let i = 0; i < list.length; i++) {
    let best = Infinity;
    for (let j = 0; j < list.length; j++) { if (i === j) continue; const dx = list[i].x - list[j].x, dy = list[i].y - list[j].y, d = Math.sqrt(dx * dx + dy * dy); if (d > 0 && d < best) best = d; }
    if (Number.isFinite(best)) nn.push(best);
  }
  if (!nn.length) return null;
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)];
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("the same median spacing as the all-pairs loop: random fields, fans at one spot, a line of holes, a bad coordinate", () => {
  for (let k = 0; k < 20; k++) {
    const n = 2 + Math.floor(rnd() * 300), wide = rnd() > 0.5;
    const list = Array.from({ length: n }, () => ({ x: rnd() * (wide ? 5000 : 200), y: rnd() * (wide ? 300 : 4000) }));
    for (let d = 0; d < n / 10; d++) list.push({ ...list[Math.floor(rnd() * n)] }); // fans: same collar
    assert.equal(medianCollarSpacing(list), bruteSpacing(list), `set ${k}`);
  }
  const line = Array.from({ length: 50 }, (_, i) => ({ x: 1000, y: i * 25 }));
  assert.equal(medianCollarSpacing(line), 25);
  assert.equal(medianCollarSpacing([{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 3, y: 4 }]), bruteSpacing([{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 3, y: 4 }]));
  assert.equal(medianCollarSpacing([{ x: 1, y: 1 }, { x: 1, y: 1 }]), null);
  assert.equal(medianCollarSpacing([{ x: 1, y: 1 }]), null);
});

test("6,292 collars (the WA iron field) in well under a second, and the second call is the cached answer", () => {
  const list = []; for (let i = 0; i < 6292; i++) list.push({ x: (i % 80) * 50 + rnd() * 5, y: Math.floor(i / 80) * 50 + rnd() * 5 });
  const t0 = performance.now(); const a = medianCollarSpacing(list); const ms = performance.now() - t0;
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
  assert.ok(a > 40 && a < 60, String(a));
  const t1 = performance.now(); assert.equal(medianCollarSpacing(list), a); assert.ok(performance.now() - t1 < 5);
});

test("rows by hole: the hole's rows in their order, built once per array", () => {
  const rows = [{ hole_id: "A", from: 0 }, { hole_id: "B", from: 0 }, { hole_id: "A", from: 5 }, null];
  const m = rowsByHole(rows);
  assert.deepEqual(m.get("A").map((r) => r.from), [0, 5]);
  assert.equal(m.get("C"), undefined);
  assert.equal(rowsByHole(rows), m);
  assert.equal(rowsByHole(null).size, 0);
});

test("wiring: the gatherer reads the hole's rows; 'Add modelled unit layer' skips the samples when the run gave intervals, one pass otherwise", () => {
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /\(rowsByHole\(layers\.litho\)\.get\(t\.hole_id\) \|\| \[\]\)\.filter\(\(r\) => !isNaN\(r\.from\)\)\.forEach/);
  assert.ok(!/\(layers\.litho \|\| \[\]\)\.filter\(\(r\) => r\.hole_id === t\.hole_id/.test(r));
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const samples = \[\], traceOf = exactRows \? null : new Map\(tracesRef\.current\.map\(\(t\) => \[t\.hole_id, t\]\)\);/);
  assert.match(v, /if \(traceOf\) for \(const r of unitLayers\.litho \|\| \[\]\) \{/);
});
