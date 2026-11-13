// TASKS.csv #1124 — the Harry sample's assays load into Geochem; blanks are below detection (the sample README)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { harryAssays, loadHarryAssays } from "../src/lib/sampleHarry.js";
import { bcSkip, bcText } from "./helpers/bcSample.mjs"; // TASKS.csv #3134 — the BC samples are not in the repository: real-data checks run where one is found

test("#1124 blank cells in a row with results become '<DL' at half the column's limit; an all-blank row stays empty", () => {
  const csv = "hole_id,from,to,Au_ppm,Cu_ppm\nH1,0,1,0.010,5\nH1,1,2,,7\nH1,2,3,0.004,\nH1,3,4,,\n";
  const r = harryAssays(csv);
  assert.deepEqual(r.rows.map((x) => [x.values, x.qualifiers || null]), [
    [{ Au: 0.01, Cu: 5 }, null], [{ Au: 0.002, Cu: 7 }, { Au: "<" }], [{ Au: 0.004, Cu: 2.5 }, { Cu: "<" }], [{}, null]]);
  assert.equal(r.bdlFilled, 2);
});

test("#1124 Harry's file: 6,297 samples, 14 elements, merged through the store setters", { skip: bcSkip("harry_property") }, async () => {
  let assays = [], elements = [];
  const file = { text: async () => bcText("harry_property", "assay_wide.csv") };
  const notes = await loadHarryAssays(async () => file, { setAssays: (f) => { assays = f(assays); }, setAssayElements: (f) => { elements = f(elements); } });
  assert.equal(assays.length, 6297);
  assert.equal(elements.length, 14);
  assert.match(notes[0], /6,297 samples, 14 elements/);
});
