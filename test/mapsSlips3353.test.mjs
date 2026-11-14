// TASKS.csv #3353 — small Maps slips
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarCoordinateFields } from "../src/lib/mineGrid.js";
test("(8) date and year columns are not offered as mine-grid easting / northing", () => {
  const collars = [1, 2, 3].map((i) => ({ hole_id: `H${i}`, attrs: { MINE_E: 1000 + i, MINE_N: 5000 + i, STARTDATE: 20190101 + i, ENDDATE: 20190201 + i, DH_YEAR: 2019, PROSPECT_NO: 7 } }));
  assert.deepEqual(collarCoordinateFields(collars), ["MINE_E", "MINE_N", "PROSPECT_NO"]);
});
test("(7) Grid a per-hole value opens on the lead commodity", () => {
  const s = fs.readFileSync(new URL("../src/components/HoleValueGridPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /preferredElement\(assay\.map/);
  assert.match(s, /\|\| leadSource \|\| sources\[0\]/);
});
