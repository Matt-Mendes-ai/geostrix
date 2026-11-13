// TASKS.csv #1508 — the import notice names values outside a layer's plausible range (an SG of -7.27), as Data QC does (#1531).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { importCheckSummary, PLAUSIBLE_RANGE } from "../src/lib/dataQC.js";

const collars = [{ hole_id: "H1", length: 100 }];
const sg = [2.8, -7.27, -0.00016, 1.0, 3.68].map((value, i) => ({ hole_id: "H1", from: i, to: i + 1, value }));

test("SG rows with impossible values: counted, with the values seen, in the import notice", () => {
  const msg = importCheckSummary(sg, collars, [], "Specific gravity rows from sg.csv", PLAUSIBLE_RANGE.sg);
  assert.match(msg, /2 with a value outside the plausible 1–6 \(-7\.27 … -0\.00016: a keying or unit error\?\)/);
  assert.match(msg, /^Check these Specific gravity rows from sg\.csv:/);
});

test("in range, no range, or a layer without one: nothing said about values", () => {
  assert.equal(importCheckSummary(sg.filter((r) => r.value >= 1), collars, [], "x", PLAUSIBLE_RANGE.sg), "");
  assert.equal(importCheckSummary(sg, collars, [], "x"), "");
  assert.equal(PLAUSIBLE_RANGE.litho, undefined);
  const rqd = [{ hole_id: "H1", from: 0, to: 1, value: 295 }];
  assert.match(importCheckSummary(rqd, collars, [], "x", PLAUSIBLE_RANGE.geotech), /1 with a value outside the plausible 0–110 \(295:/);
});

test("the importer passes the layer's range; Data QC uses the same table", () => {
  assert.match(fs.readFileSync("src/modules/viewer/useImportPipeline.js", "utf8"), /PLAUSIBLE_RANGE\[target\] \|\| null\)/);
  const q = fs.readFileSync("src/lib/dataQC.js", "utf8");
  assert.match(q, /\["sg", "Specific gravity", \{ gaps: false, range: PLAUSIBLE_RANGE\.sg \}\]/); // #3136: the interval checks are a list now
});
