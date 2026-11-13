// TASKS.csv #2977 (review #2876, WA iron) — Targeting stalls at 6,390 holes: opening Planned holes desurveyed every drilled hole and searched
// every trace for each planned hole again (1.4-2.1 s with 19 planned holes). The drilled collars, the traces and the drilled-trace index are
// kept per store array (and its survey / method); each planned hole's nearest-hole result per drilled index and geometry.
import test from "node:test";
import assert from "node:assert/strict";
import { drilledTraceIndex, planChecks } from "../src/lib/plannedHoleChecks.js";
import { holeTraces } from "../src/lib/evidenceSources.js";
import { drilledCollars } from "../src/lib/collarStatus.js";

const grid = () => { const c = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) c.push({ hole_id: `H${i}_${j}`, x: i * 23, y: j * 23, z: 450, azimuth: 0, dip: -90, length: 60 }); return c; };

test("kept per store array, found again; a new array, survey or method is measured again", () => {
  const collars = grid(), survey = [];
  assert.equal(drilledCollars(collars), drilledCollars(collars));
  const a = drilledTraceIndex(collars, survey, "minimum_curvature");
  assert.equal(drilledTraceIndex(collars, survey, "minimum_curvature"), a);
  assert.notEqual(drilledTraceIndex(collars, [], "minimum_curvature"), a, "another survey array");
  assert.notEqual(drilledTraceIndex(collars, survey, "tangential"), drilledTraceIndex(collars, survey, "minimum_curvature"));
  const moved = collars.map((c) => (c.hole_id === "H0_0" ? { ...c, x: 5 } : c));
  assert.equal(drilledTraceIndex(moved, survey, "minimum_curvature").holes.find((h) => h.hole_id === "H0_0").pts[0].x, 5, "an edited collar list");
  const t = holeTraces(drilledCollars(collars).collars, survey, "minimum_curvature");
  assert.equal(holeTraces(drilledCollars(collars).collars, survey, "minimum_curvature"), t);
  assert.equal(t.size, 100);
});

test("a planned hole's nearest-hole check is kept per geometry, the same answer; a moved hole is searched again", () => {
  const idx = drilledTraceIndex(grid(), [], "minimum_curvature");
  const p = { id: "p1", name: "INF-01", x: 11.5, y: 11.5, z: 450, azimuth: 0, dip: -90, length: 52 };
  const [r1] = planChecks([p], idx, []);
  const [r2] = planChecks([{ ...p, name: "renamed", notes: "x" }], idx, []);
  assert.equal(r2.nearestReal, r1.nearestReal, "kept: name and notes are not geometry");
  assert.ok(Math.abs(r1.nearestReal.distance - Math.hypot(11.5, 11.5)) < 0.01);
  const [r3] = planChecks([{ ...p, x: 23 + 2 }], idx, []);
  assert.equal(r3.nearestReal.hole_id, "H1_0"); assert.ok(Math.abs(r3.nearestReal.distance - Math.hypot(2, 11.5)) < 0.01, "moved: searched again");
  // a custom trace function is never cached (here a point 11.66 m from H2_2, beyond the 10 m pad)
  const [r4] = planChecks([p], idx, [], () => [{ x: 40, y: 56, z: 450, md: 0 }, { x: 40, y: 56, z: 447, md: 3 }]);
  assert.equal(r4.nearestReal.hole_id, "H2_2"); assert.ok(Math.abs(r4.nearestReal.distance - Math.hypot(6, 10)) < 0.01);
});
