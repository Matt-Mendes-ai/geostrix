// TASKS.csv #872 — which bedding readings speak for a mapped contact's dip guide: the geologist decides
import { test } from "node:test";
import assert from "node:assert/strict";
import { dipGuideLines } from "../src/lib/explicitMapLines.js";

// an east-west contact at y = 0 on flat ground, a point every 25 m, dipping 40 deg N (rule of V's: flat ground gives no
// trace plane, so only readings decide here)
const line = { ref: "A | B", src: "map", pts: Array.from({ length: 21 }, (_, i) => ({ x: i * 25, y: 0, z: 100 })) };
const north40 = { x: 250, y: 100, dip: 40, dipDir: 0 };     // inside unit A (north of the contact)
const thrust60S = { x: 250, y: -350, dip: 60, dipDir: 180 }; // across a thrust, in another unit
const unitA = [[[-100, 0], [700, 0], [700, 1000], [-100, 1000]]], unitB = [[[-100, -200], [700, -200], [700, 0], [-100, 0]]];
const thrust = [[-100, -250], [700, -250]];

test("#872 by default (as the pane passes it) a reading in another unit or across a fault is not used", () => {
  const g = dipGuideLines([line], { measurements: [north40, thrust60S], unitPolys: [unitA, unitB], faults: [thrust], depthM: 100 });
  assert.equal(g.otherUnitReadings, 1);
  assert.ok(g.lines[0].pts.every((p) => p.y > 0), "every guide point goes north, down the contact's own dip");
});

test("#872 allowed by the geologist: the other readings come back (the review's case: the guide went south)", () => {
  const onlyThrust = dipGuideLines([line], { measurements: [thrust60S], depthM: 100 }); // both boxes ticked: no filters
  assert.ok(onlyThrust.lines[0].pts.every((p) => p.y < 0));
  const acrossOnly = dipGuideLines([line], { measurements: [thrust60S], faults: [thrust], depthM: 100 }); // other units allowed, faults not
  assert.equal(acrossOnly.measured, 0); assert.ok(acrossOnly.acrossFaultPoints > 0);
});

test("#872 two readings along strike are blended by distance, not switched between (no 118 m step)", () => {
  const g = dipGuideLines([line], { measurements: [{ x: 150, y: 50, dip: 30, dipDir: 0 }, { x: 350, y: 50, dip: 60, dipDir: 0 }], depthM: 100, radiusM: 500 });
  const ys = g.lines[0].pts.map((p) => p.y);
  let maxStep = 0; for (let i = 1; i < ys.length; i++) maxStep = Math.max(maxStep, Math.abs(ys[i] - ys[i - 1]));
  assert.ok(maxStep < 40, `largest step between guide points 25 m apart: ${maxStep.toFixed(1)} m`);
});

test("#872 a reading that disagrees with the trace's own plane by more than 30 deg is counted", () => {
  // a valley-crossing trace that the rule of V's reads as dipping north; a 60 deg S reading nearby disagrees
  // the trace of a plane dipping 40 deg N (z = 100 - tan40 * y) on a valley floor rising both ways from x = 400
  const t40 = Math.tan((40 * Math.PI) / 180);
  const v = { ref: "V", src: "map", pts: Array.from({ length: 33 }, (_, i) => { const x = i * 25, z = 100 + 0.3 * Math.abs(x - 400); return { x, y: (100 - z) / t40, z }; }) };
  const g = dipGuideLines([v], { measurements: [{ x: 400, y: -300, dip: 60, dipDir: 180 }], depthM: 100, radiusM: 2000 });
  assert.ok(g.disagree > 0 && g.maxDisagreeDeg > 30, JSON.stringify({ d: g.disagree, m: g.maxDisagreeDeg, f: g.fitted, me: g.measured }));
});
