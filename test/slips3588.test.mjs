// TASKS.csv #3588 (Fireweed rehearsal, Macpass): (1) the sample opens with Zn on, (5) the unsurveyed tail dashed, (6) the north reference kept with the
// project, (7) far labels left out of the live view.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { unsurveyedTailStart, TAIL_MIN_M } from "../src/lib/viewer/unsurveyedTail.js";
import { dropFarLabels } from "../src/lib/viewer/holeLabels.js";
import { azimuthNorthText } from "../src/lib/azimuthNorthText.js";
import { WA_SAMPLES } from "../src/lib/sampleWa.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("(5) NB91-22: one survey at 0 m on a 262.4 m hole is all tail; a hole surveyed to its end or within 10 m of it has none", () => {
  const pts = (mds) => mds.map((md) => ({ md }));
  assert.equal(unsurveyedTailStart([{ depth: 0 }], pts([0, 262.4])), 0);
  assert.equal(unsurveyedTailStart([{ depth: 0 }, { depth: 150 }], pts([0, 150, 262.4])), 1);
  assert.equal(unsurveyedTailStart([{ depth: 0 }, { depth: 150 }], pts([0, 150, 155])), -1, "a tail under " + TAIL_MIN_M + " m");
  assert.equal(unsurveyedTailStart([{ depth: 0 }, { depth: 262.4 }], pts([0, 262.4])), -1);
  assert.equal(unsurveyedTailStart([], pts([0, 100])), -1, "no survey rows: the assumed stick, dashed whole already");
  const src = read("../src/modules/viewer/drillholeScene.js");
  assert.match(src, /for \(const sp of \[\.\.\.spans\]\.sort\(\(a, b\) => a\.i0 - b\.i0\)\)/); // #3761: every unsurveyed span, solid between, dashed on them
});

test("(7) a label more than 5 times as far as the nearest is left out; nothing is dropped in an orthographic view (equal depths)", () => {
  const b = (d) => ({ x: 0, y: 0, w: 10, h: 10, d });
  const r = dropFarLabels([b(1000), b(1500), b(8000), null, b(4900)]);
  assert.deepEqual(r.map((x) => x && x.d), [1000, 1500, null, null, 4900]);
  assert.deepEqual(dropFarLabels([b(1), b(1), b(1)]).map((x) => x.d), [1, 1, 1]);
  assert.match(read("../src/lib/viewer/holeLabels.js"), /labelsToShow\(dropFarLabels\(boxes, FAR_DEPTH_RATIO, \{ width, height \}\)\)/ /* #3760: against the labels on screen */);
  assert.match(read("../src/lib/viewer/holeLabels.js"), /return labelsToShow\(labelBoxes\(group, camera, width, height, labelPx\)\)\.filter/, "a Layout capture keeps every label");
});

test("(6) the north a survey was read from is kept on the project and read back; an old project has no such key", () => {
  assert.equal(azimuthNorthText({}), "");
  assert.equal(azimuthNorthText({ azimuthNorth: { survey: { ref: "magnetic", date: "2023-08-01" } } }), " Azimuths were read from magnetic north (2023-08-01) and converted to grid north.");
  assert.match(azimuthNorthText({ azimuthNorth: { survey: { ref: "true" } } }), /true north/);
  assert.match(azimuthNorthText({ azimuthNorth: { survey: { ref: "grid" } } }), /grid north \(no conversion\)/);
  assert.match(read("../src/lib/store.jsx"), /const setProjectAzimuthNorth = useCallback\(\(target, ref, date\) => setProject\(/);
  assert.match(read("../src/modules/viewer/importPipelineImpl.js"), /importStateRef\.current\.setAzimuthNorth\?\.\(target, azimuthRef, azimuthDate\)/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /azimuthNorthText\(store\.project\)/);
});

test("(1) the Macpass sample turns Zn on once its assays have landed", () => {
  assert.equal(WA_SAMPLES.yk_macpass.showFirst, "Zn");
  assert.match(read("../src/modules/ViewerModule.jsx"), /showOnLoad\.current = WA_SAMPLES\[which\]\.showFirst;/);
  assert.match(read("../src/modules/viewer/useShowOnLoad.js"), /toggle\.current\(sym\)/);
});
