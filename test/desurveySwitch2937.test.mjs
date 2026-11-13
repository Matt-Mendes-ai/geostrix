// TASKS.csv #2937 (WA iron review) — a desurvey method switch rebuilt every layer of 6,390 near-vertical holes (2.1-2.8 s each) though the
// methods agree within millimetres there. planHoles now desurveys a hole whose only change is the method and keeps its drawing when no
// station moved more than 10 cm (the new trace still goes to the tools), and reports the largest shift.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { desurveyHole } from "../src/lib/desurvey.js";

const scene = await import("../src/modules/viewer/drillholeScene.js").catch((e) => ({ err: e }));

test("a method switch: near-vertical holes keep their drawing, a curving hole is redrawn, the largest shift is said", { skip: scene.err ? `drillholeScene needs three in this runner: ${scene.err.message}` : false }, () => {
  const { planHoles, maxStationShift, QUIET_SHIFT_M } = scene;
  const straight = { hole_id: "V", x: 0, y: 0, z: 400, length: 60, azimuth: 0, dip: -90 };
  const curving = { hole_id: "C", x: 50, y: 0, z: 400, length: 300, azimuth: 90, dip: -60 };
  const survey = new Map([
    ["V", [0, 20, 40, 60].map((d) => ({ hole_id: "V", depth: d, azimuth: 0, dip: -89.9 }))],
    ["C", [0, 100, 200, 300].map((d, i) => ({ hole_id: "C", depth: d, azimuth: 90 + i * 15, dip: -60 + i * 8 }))],
  ]);
  const collars = [straight, curving], o = { ox: 0, oy: 0, oz: 0, rebuildSeq: 0 };
  const first = planHoles(null, collars, survey, "minimumCurvature", o, desurveyHole);
  assert.equal(first.full, true);
  // what the build stores on each entry: its desurvey
  for (const c of collars) first.holeEntries.get(c.hole_id).raw = desurveyHole(c, survey.get(c.hole_id), "minimumCurvature");
  const prev = { ...o, holes: first.holeEntries };
  const next = planHoles(prev, collars, survey, "tangential", o, desurveyHole);
  assert.equal(next.full, false);
  assert.deepEqual([...next.changedHoles], ["C"], "only the curving hole is redrawn");
  assert.equal(next.holeEntries.get("V").method, "tangential");
  assert.equal(next.holeEntries.get("V").pts, null, "its trace is made again from the new desurvey (for the tools)");
  assert.deepEqual(next.holeEntries.get("V").raw, desurveyHole(straight, survey.get("V"), "tangential"));
  assert.equal(next.shift.kept, 1); assert.equal(next.shift.moved, 1); assert.equal(next.shift.hole, "C");
  assert.ok(next.shift.max > QUIET_SHIFT_M);
  assert.ok(maxStationShift(prev.holes.get("V").raw, next.holeEntries.get("V").raw) <= QUIET_SHIFT_M);
  // the same method again: nothing changed, no shift to say; without the desurvey callback, the old rule
  assert.equal(planHoles({ ...o, holes: next.holeEntries }, collars, survey, "tangential", o, desurveyHole).shift, null);
  assert.equal(planHoles(prev, collars, survey, "tangential", o).changedHoles.size, 2);
});

test("maxStationShift; the build passes the desurvey, hands over the new traces and says the shift", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(s, /const plan = planHoles\(prev, collars, surveyByHole, desurveyMethod, \{ ox, oy, oz, rebuildSeq \}, desurveyHole\);/);
  assert.match(s, /if \(rebuildHoles \|\| plan\.shift\?\.kept\) tracesRef\.current = \[\.\.\.traceById\.values\(\)\];/);
  assert.match(s, /if \(plan\.shift && !plan\.full\) \{/);
  if (scene.err) return;
  const { maxStationShift } = scene;
  assert.equal(maxStationShift([{ x: 0, y: 0, z: 0 }], [{ x: 0, y: 0.003, z: 0.004 }]), 0.005);
  assert.equal(maxStationShift([{ x: 0, y: 0, z: 0 }], []), Infinity);
});
