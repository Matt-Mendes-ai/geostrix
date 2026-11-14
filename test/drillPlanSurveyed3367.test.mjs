// TASKS.csv #3367 (review #3195, Galore Creek) — the Layout drill plan drew every hole straight from its collar's planned azimuth and dip:
// 25 of 70 traces ended more than 10 m from the surveyed toe. A hole with survey stations is drawn along its desurveyed path; one with
// none, and a planned hole, stay straight; the sheet says which
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planTraces, drillPlanGeometry, fitDrillPlan, traceCaption, holePlan, pxPerMetre, drillPlanPlanned } from "../src/lib/drillPlan.js";
import { desurveyHole } from "../src/lib/desurvey.js";

// SYNTHETIC: S1 collared at azimuth 077 dip -58, its gyro swinging to 095 and flattening with depth (as GC23-0981's did); S2 with no survey
const collars = [
  { hole_id: "S1", x: 1000, y: 2000, z: 500, azimuth: 77, dip: -58, length: 300 },
  { hole_id: "S2", x: 1100, y: 2000, z: 500, azimuth: 0, dip: -60, length: 100 },
];
const survey = [0, 50, 100, 150, 200, 250, 300].map((d, i) => ({ hole_id: "S1", depth: d, azimuth: 77 + i * 3, dip: -58 + i * 2 }));
const el = { w: 600, h: 400, scale: 5000, centre: { x: 1100, y: 2050 } };

test("a surveyed hole follows its desurveyed path to the toe; a hole with no survey stays straight", () => {
  const traces = planTraces(collars, survey, "minimumCurvature");
  assert.equal(traces.size, 1, "S2 has no stations");
  const toe = desurveyHole(collars[0], survey, "minimumCurvature").at(-1);
  assert.deepEqual(traces.get("S1").at(-1), [toe.x, toe.y]);
  const straight = holePlan(collars[0]);
  assert.ok(Math.hypot(toe.x - straight.x1, toe.y - straight.y1) > 10, "the surveyed toe is well off the straight end");
  const g = drillPlanGeometry(el, collars, traces);
  const s1 = g.holes.find((h) => h.id === "S1"), s2 = g.holes.find((h) => h.id === "S2");
  assert.equal(s1.surveyed, true); assert.ok(s1.path.length > 2);
  const [tx, ty] = s1.path.at(-1);
  assert.ok(Math.abs(tx - s1.bx) < 1e-9 && Math.abs(ty - s1.by) < 1e-9, "the end is the toe");
  assert.equal(s2.surveyed, false); assert.equal(s2.path, null);
  assert.ok(pxPerMetre(el.scale) > 0);
  assert.equal(planTraces(collars, [], "minimumCurvature"), null);
  assert.equal(planTraces(collars, survey, "minimumCurvature"), traces, "kept per collars, survey and method");
});

test("the fit frames the surveyed toe; planned holes stay straight", () => {
  const traces = planTraces(collars, survey, "minimumCurvature");
  const wide = { hole_id: "W", x: 0, y: 0, azimuth: 90, dip: -5, length: 2000 };
  const ss = [{ hole_id: "W", depth: 0, azimuth: 90, dip: -5 }, { hole_id: "W", depth: 2000, azimuth: 0, dip: -5 }];
  const t2 = planTraces([wide], ss, "minimumCurvature");
  const straightFit = fitDrillPlan([wide], 600, 400), pathFit = fitDrillPlan([wide], 600, 400, undefined, t2);
  assert.notDeepEqual(straightFit.centre, pathFit.centre, "the bent hole is framed along its path");
  assert.equal(drillPlanPlanned(el, [{ name: "S1", x: 1000, y: 2000, azimuth: 77, dip: -58, length: 300 }])[0].path, null, "a planned hole of the same name stays straight");
  assert.ok(traces.has("S1"));
});

test("the sheet's caption says how the traces were drawn", () => {
  assert.equal(traceCaption({ surveyed: 3, method: "minimumCurvature" }), "Traces along the downhole surveys (minimum curvature)");
  assert.equal(traceCaption({ surveyed: 3, straight: 2, method: "tangential" }), "Traces along the downhole surveys (tangential); 2 hole(s) with no survey straight from the collar azimuth and dip");
  assert.equal(traceCaption({ straight: 4 }), "Traces straight from each collar's azimuth and dip (no downhole surveys)");
  assert.equal(traceCaption({ surveyed: 1, planned: 2 }), "Traces along the downhole surveys (minimum curvature); planned holes straight from their design");
  assert.equal(traceCaption({}), "");
});

test("wiring: the element draws a path as a polyline and prints the caption; Layout passes the survey on both render paths and fits along it", () => {
  const e = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(e, /const traces = useMemo\(\(\) => planTraces\(collars, survey, desurveyMethod\)/);
  assert.match(e, /hh\.path \/\* #3367 — along the survey \*\/\r?\n\s*\? <polyline/);
  assert.match(e, /\{d\.caption && \(\(\) => \{/);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /survey=\{ctx\?\.survey \|\| null\} desurveyMethod=\{ctx\?\.desurveyMethod \|\| null\}/);
  assert.match(l, /<LayoutPrintRoot ref=\{printRootRef\} plannedHoles=\{plannedHoles\} \/\* #2259 \*\/ survey=\{survey\}/);
  assert.match(l, /plannedHoles \/\* #2259 \*\/, survey, desurveyMethod: project\?\.desurveyMethod \/\* #3367 \*\/(, displayUnits: project\?\.displayUnits \/\* #3382 \*\/)? \}\), \[/);
  assert.match(l, /SCALE_PRESETS, traces \/\* #3367 \*\/\);/);
  assert.doesNotMatch(l, /traces run straight from each collar's azimuth, dip and length/);
});
