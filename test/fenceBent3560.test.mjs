// TASKS.csv #3560 B3 — the bent fence: the ticked holes in order, unfolded along the polyline of their collars (lib/fenceBent.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBentPanel } from "../src/lib/fenceBent.js";
import { buildFencePanel } from "../src/lib/fence.js";

// an L of three vertical holes: A (0,0) -> B (100,0) -> C (100,100): east 100 m then north 100 m
const vert = (id, x, y, z = 500, len = 50) => ({ hole_id: id, md: [0, len], wx: [x, x], wy: [y, y], wz: [z, z - len] });
const traces = [vert("A", 0, 0), vert("B", 100, 0), vert("C", 100, 100)];

test("the distance runs along the polyline: 0, 100, 200 (the straight panel would fold C back to 141 m)", () => {
  const p = buildBentPanel(traces, ["A", "B", "C"]);
  assert.deepEqual(p.holes.map((h) => [h.hole_id, Math.round(h.s)]), [["A", 0], ["B", 100], ["C", 200]]);
  assert.equal(p.line.bent, true);
  assert.equal(Math.round(p.line.length), 200);
  assert.equal(p.holes.every((h) => h.maxAbsOffset < 1e-9), true, "vertical holes hang straight under their collars");
  const straight = buildFencePanel(traces, { azimuth: 90 });
  assert.ok(straight.holes.find((h) => h.hole_id === "C").s < 101, "the straight fence puts C over B");
});

test("the order is the order given; an inclined hole is unfolded along the bisector at its collar", () => {
  const rev = buildBentPanel(traces, ["C", "B", "A"]);
  assert.deepEqual(rev.holes.map((h) => Math.round(h.s)), [0, 100, 200]);
  assert.equal(rev.holes[0].hole_id, "C");
  // B dips towards the bend's outside: its points leave the line; at the bisector (north-east at B going A->B->C: 135 deg... ) a point 20 m east of B
  const incl = [vert("A", 0, 0), { hole_id: "B", md: [0, 50], wx: [100, 120], wy: [0, 0], wz: [500, 450] }, vert("C", 100, 100)];
  const p = buildBentPanel(incl, ["A", "B", "C"]), b = p.holes[1];
  const d = Math.SQRT1_2; // the bisector of east and north
  assert.ok(Math.abs(b.pts[1].s - (100 + 20 * d)) < 1e-6, `${b.pts[1].s}`);
  assert.ok(Math.abs(Math.abs(b.pts[1].offset) - 20 * d) < 1e-6);
});

test("fewer than two holes, and a hole missing from the traces, give no bent panel / are skipped", () => {
  assert.equal(buildBentPanel(traces, ["A"]), null);
  assert.equal(buildBentPanel(traces, ["A", "ZZ"]), null);
  assert.equal(buildBentPanel(traces, ["A", "ZZ", "B"]).holes.length, 2);
});

test("the wiring: the Fence diagram's Section line choice, using the selection order", () => {
  const f = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.match(f, /<option value="through">\{tr\("Through the ticked holes, in order"\)\}<\/option>/);
  assert.match(f, /if \(azMode === "through"\) return buildBentPanel\(traces, \[\.\.\.selected\]\)/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Through the ticked holes, in order"], l);
});
