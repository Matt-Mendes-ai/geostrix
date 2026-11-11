// TASKS.csv #2663 (follow-up of #2642) — a sheet body checked against the unit's logged intervals: inside or not, true thickness
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intrusionBody } from "../src/lib/intrusionBody.js";
import { sheetLogCheck } from "../src/lib/sheetLogCheck.js";

// a north-striking 20 m dyke dipping 60 east, 200 m deep, on flat ground at 1,000 m (dip 90 = straight down here)
const b = intrusionBody([[0, 0], [20, 0], [20, 600], [0, 600], [0, 0]], () => 1000, { depthM: 200, sheet: { dip: 60, dipDir: 90 } });
const hole = (h, x) => ({ hole_id: h, x, y: 300, z: 1000, azimuth: 0, dip: 90, length: 150 });
const sv = (h) => [{ hole_id: h, depth: 0, azimuth: 0, dip: 90 }, { hole_id: h, depth: 150, azimuth: 0, dip: 90 }];

test("a vertical hole 40 m east crosses the whole sheet: inside, 17.3 m true thickness (20 m x sin 60); a hole far east is outside", () => {
  const ck = sheetLogCheck({ positions: b.positions, indices: b.indices, sheet: { dip: 60, dipDir: 90 }, unit: "Pegmatite", codeUnit: { PEG: "Pegmatite" },
    litho: [{ hole_id: "H1", from: 34.64, to: 69.28, value: "PEG" }, { hole_id: "H2", from: 10, to: 20, value: "PEG" }, { hole_id: "H1", from: 0, to: 34, value: "SST" }, { hole_id: "NOCOLLAR", from: 5, to: 9, value: "PEG" }],
    collars: [hole("H1", 40), hole("H2", 300)], survey: [...sv("H1"), ...sv("H2")], desurveyMethod: "minimumCurvature" });
  assert.equal(ck.intercepts, 3); assert.equal(ck.holes, 2); assert.equal(ck.placed, 2); // the hole with no collar is not counted
  assert.equal(ck.inside, 1); assert.equal(ck.outside, 1);
  assert.ok(Math.abs(ck.thickness.max - 20 * Math.sin(Math.PI / 3)) < 0.05, JSON.stringify(ck.thickness));
  assert.equal(ck.thickness.min, ck.thickness.max, "the outside intercept's thickness is left out");
});

test("no logged interval of the unit: null; logged but no collar: counted, not placed", () => {
  assert.equal(sheetLogCheck({ positions: b.positions, indices: b.indices, sheet: { dip: 60, dipDir: 90 }, unit: "Pegmatite", codeUnit: {}, litho: [{ hole_id: "H1", from: 1, to: 2, value: "PEG" }] }), null);
  const ck = sheetLogCheck({ positions: b.positions, indices: b.indices, sheet: { dip: 60, dipDir: 90 }, unit: "Pegmatite", codeUnit: { PEG: "Pegmatite" }, litho: [{ hole_id: "X", from: 1, to: 2, value: "PEG" }], collars: [], survey: [] });
  assert.equal(ck.intercepts, 1); assert.equal(ck.placed, 0);
});

test("the pane passes the logs with a sheet; the run receives collars and survey and says the result", () => {
  assert.match(readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8"), /logs: bodyShape === "sheet" && lithoRows\?\.length \? \{ codeUnit, litho: lithoRows \} : null/);
  assert.match(readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8"), /setNotices, terrain, collars, survey, desurveyMethod/);
  assert.match(readFileSync(new URL("../src/modules/viewer/intrusionRun.js", import.meta.url), "utf8"), /notice\("Against the logs: \{lines\}/);
});
