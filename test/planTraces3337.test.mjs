// TASKS.csv #3337 (Galore Creek review) — the Maps plan drew each inclined hole as a dot at its collar only: its desurveyed trace in plan,
// with a tick at the toe, on by default when a hole ends more than 10 m from its collar, and 'colour at' the highest interval down the hole
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planTraces, highestAt } from "../src/lib/planTraces.js";

const collars = [
  { hole_id: "A", x: 1000, y: 2000, z: 500, depth: 200, dip: -60, azimuth: 90 },
  { hole_id: "N", x: 0, y: 0, z: 400, depth: 300, dip: -45, azimuth: 0 },
  { hole_id: "V", x: 50, y: 50, z: 400, depth: 100, dip: -90, azimuth: 0 },
];
const survey = [
  { hole_id: "A", depth: 0, azimuth: 90, dip: -60 }, { hole_id: "A", depth: 200, azimuth: 90, dip: -60 },
  { hole_id: "N", depth: 0, azimuth: 0, dip: -45 }, { hole_id: "N", depth: 300, azimuth: 0, dip: -45 },
];

test("an inclined hole's trace ends where the hand desurvey puts its toe; a vertical hole has none", () => {
  const r = planTraces(collars, survey, "minimumCurvature");
  assert.deepEqual([...r.traces.keys()], ["A", "N"]);
  const a = r.traces.get("A"), n = r.traces.get("N");
  assert.ok(Math.abs(a.toe.x - 1100) < 1e-6 && Math.abs(a.toe.y - 2000) < 1e-6); // 200 m at -60: 100 m east
  assert.ok(Math.abs(n.toe.x) < 1e-6 && Math.abs(n.toe.y - 300 * Math.SQRT1_2) < 1e-6); // 300 m at -45 north: 212.1 m
  assert.equal(r.longReach, 2);
  assert.ok(Math.abs(r.reachMax - 212.13) < 0.01);
  assert.equal(a.xy[0], 1000); assert.equal(a.xy[a.xy.length - 2], a.toe.x); // starts at the collar, ends at the toe
  assert.ok(a.xy.length / 2 < 60, "thinned to about one point every 5 m");
  assert.deepEqual(a.box.map((v) => Math.round(v)), [1000, 2000, 1100, 2000]);
});

test("the highest interval's mid-point down the hole: where the copper is, not where the rig stood", () => {
  const r = planTraces(collars, survey, "minimumCurvature");
  const at = highestAt([
    { hole_id: "A", from: 0, to: 10, values: { Cu: 0.1 } }, { hole_id: "A", from: 100, to: 110, values: { Cu: 2.4 } },
    { hole_id: "V", from: 0, to: 5, values: { Cu: 9 } }, // no trace: left to its collar
  ], "Cu", r.traces);
  const p = at.get("A");
  assert.equal(p.v, 2.4); assert.equal(p.md, 105);
  assert.ok(Math.abs(p.x - 1052.5) < 1e-6 && Math.abs(p.y - 2000) < 1e-6); // 105 m at -60 east
  assert.equal(at.has("V"), false);
});

test("the plan draws the traces under the dots, on by default with long reaches, and offers 'colour at'", () => {
  const src = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /planTraces\(collars, survey, desurveyMethod\)/);
  assert.match(src, /const showTraces = tracesPicked \?\? planT\.longReach > 0;/);
  assert.ok(src.indexOf("drawTraces(ctx, planT.traces") < src.indexOf("drawDots(ctx, dotsInView(dotCollars"), "the traces go under the dots");
  assert.match(src, /colourAt === "intercept" && colourBy\.startsWith\("max:"\)/);
  assert.match(src, /tr\("Hole traces \(a tick at the toe\)"\)/);
});
