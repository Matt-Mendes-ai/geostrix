// TASKS.csv #3375 — a drill plan coloured by best intercept tells the holes never assayed for the element (a crossed ring, 'no Cu assays')
// from the assayed holes with no interval at the cut-off (a hollow ring, 'assayed, no Cu intercept at the cut-off')
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillPlanColouring, crossPath } from "../src/lib/drillPlan.js";

// SYNTHETIC: 6 holes; A and B have intercepts, C and D were assayed with nothing over the cut-off, E and F were never assayed for Cu
const collars = ["A", "B", "C", "D", "E", "F"].map((id, i) => ({ hole_id: id, x: 500000 + i * 50, y: 6000000, z: 500, azimuth: 0, dip: -60, length: 200 }));
const holes = collars.map((c) => ({ id: c.hole_id, inside: true }));
const el = { colourBy: "bi:Cu" };
const perHole = new Map([["A", 120], ["B", 40]]);

test("never assayed: crossed rings and their own key row; assayed with no intercept: hollow rings", () => {
  const c = drillPlanColouring(el, holes, collars, { perHole, biRule: "cut-off 7000 ppm", unit: "ppm", assayed: new Set(["A", "B", "C", "D"]) });
  assert.equal(c.styleOf("C").hollow, true); assert.ok(!c.styleOf("C").cross);
  assert.equal(c.styleOf("E").cross, true); assert.equal(c.styleOf("E").hollow, true);
  assert.ok(!c.styleOf("A").hollow);
  const labels = c.key.map((k) => k.label);
  assert.ok(labels.includes("assayed, no Cu intercept at the cut-off"), labels.join(" | "));
  assert.ok(labels.includes("no Cu assays"));
  assert.equal(c.key.find((k) => k.label === "no Cu assays").cross, true);
  assert.ok(!labels.includes("no Cu intercept"));
});

test("only one kind present: only its row; without the assayed set: as before", () => {
  const c = drillPlanColouring(el, holes.slice(0, 4), collars, { perHole, assayed: new Set(["A", "B", "C", "D"]) });
  assert.deepEqual(c.key.filter((k) => k.hollow).map((k) => k.label), ["assayed, no Cu intercept at the cut-off"]);
  const old = drillPlanColouring(el, holes, collars, { perHole });
  assert.deepEqual(old.key.filter((k) => k.hollow).map((k) => k.label), ["no Cu intercept"]);
  assert.ok(!old.styleOf("E").cross);
  // Highest grade keeps its row ('no Cu result': no segment = no result)
  const max = drillPlanColouring({ colourBy: "max:Cu" }, holes, collars, { segs: [{ hole_id: "A", from: 0, to: 2, value: 1 }], assayed: new Set(["A"]) });
  assert.ok(max.key.some((k) => k.label === "no Cu result") && !max.key.some((k) => k.cross));
});

test("the cross sits inside the ring", () => {
  assert.equal(crossPath(10, 10, 4), "M7.2,7.2L12.8,12.8M7.2,12.8L12.8,7.2");
  const d = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(d, /assayed: assayedHoles\(resolvedSegments\(assays, key, unit, units\)\) \/\* #3375 \*\//);
  assert.match(d, /: s\.cross \/\* #3375 — not assayed: a crossed ring \*\//);
  assert.match(d, /k\.cross \? <g><circle/);
  assert.match(d, /\{s\.cross && <path d=\{crossPath\(hh\.ax, hh\.ay, r\)\}/);
});
