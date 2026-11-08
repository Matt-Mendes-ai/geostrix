// TASKS.csv #2064 (review #2013, Woodjam) — 'Drop them from the panel' refits the line while dropping and never leaves one hole; a
// one-hole panel lies along its own trace.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFencePanel, dropOffLineSelection } from "../src/lib/fence.js";

// an inclined hole: collar at (x0, y0), 300 m long, dipping 55 deg towards azimuth `az`
const hole = (id, x0, y0, az = 90) => { const n = 11, md = [], wx = [], wy = [], wz = []; const a = (az * Math.PI) / 180, h = Math.cos((55 * Math.PI) / 180);
  for (let i = 0; i < n; i++) { const d = (300 * i) / (n - 1); md.push(d); wx.push(x0 + Math.sin(a) * d * h); wy.push(y0 + Math.cos(a) * d * h); wz.push(1000 - d * Math.sin((55 * Math.PI) / 180)); }
  return { hole_id: id, md, wx, wy, wz }; };

test("one hole: the section follows the hole, so it is 0 m off", () => {
  const p = buildFencePanel([hole("WJProp24_007", 0, 0, 90)]);
  assert.ok(Math.abs(p.line.azimuth - 90) < 1e-6);
  assert.ok(p.holes[0].maxAbsOffset < 1e-6, String(p.holes[0].maxAbsOffset));
});

test("three prospects kilometres apart: never one hole; whatever is kept lies within the limit", () => {
  const traces = [hole("DH1", 0, 0), hole("DH2", 60, 10), hole("SE1", 4000, -3000), hole("SE2", 4070, -2990), hole("TF1", -3000, -4000), hole("TF2", -2900, -4010)];
  const r = dropOffLineSelection(traces, 100);
  if (r) { assert.ok(r.ids.length >= 2); const p = buildFencePanel(traces.filter((t) => r.ids.includes(t.hole_id))); assert.ok(p.holes.every((h) => h.maxAbsOffset <= 100)); }
  // three holes in a triangle 2 km across cannot share a 100 m line: refused, not one hole
  assert.equal(dropOffLineSelection([hole("P", 0, 0, 0), hole("Q", 2000, 0, 0), hole("R", 1000, 1700, 90)], 100), null);
});

test("one prospect plus a stray: the stray is dropped and the line refitted to the rest", () => {
  const traces = [hole("A", 0, 0), hole("B", 100, 0), hole("C", 200, 0), hole("D", 300, 0), hole("FAR", 150, 900)];
  const r = dropOffLineSelection(traces, 100);
  assert.deepEqual(r, { ids: ["A", "B", "C", "D"], dropped: 1 });
  const p = buildFencePanel(traces.filter((t) => r.ids.includes(t.hole_id)));
  assert.ok(p.holes.every((h) => h.maxAbsOffset <= 100));
});

test("a typed azimuth: its origin (the collars' centre) moves as holes leave, so it refits too", () => {
  const traces = [hole("A", 0, 0, 0), hole("B", 0, 100, 0), hole("C", 300, 50, 0)]; // north-dipping holes on a north line through x = 100
  assert.deepEqual(dropOffLineSelection(traces, 100, { azimuth: 0 }), { ids: ["A", "B"], dropped: 1 });
});

test("a saved section's line is fixed: it only filters", () => {
  const traces = [hole("A", 0, 0, 0), hole("B", 0, 100, 0), hole("C", 300, 50, 0)];
  const line = { origin: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, azimuth: 0 };
  assert.deepEqual(dropOffLineSelection(traces, 100, { line }), { ids: ["A", "B"], dropped: 1 });
  assert.equal(dropOffLineSelection([hole("A", 0, 0, 0), hole("C", 300, 50, 0)], 100, { line }), null);
});

test("the modal uses it and says why when it refuses", () => {
  const m = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.ok(m.includes("dropOffLineSelection(chosen, offsetLimit"));
  assert.ok(m.includes("No two of these holes lie within {m} m of one line"));
});
