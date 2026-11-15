// TASKS.csv #3357 (#3278) — the Layout drill plan and the Atlas pick holes with the 3D View's Holes list rules: a value some hole holds matches as a whole
// ('Resource' no longer takes 'Resource Confidence'), and terms on one field are joined by OR. SYNTHETIC collars.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { filterHoles } from "../src/lib/drillPlan.js";
const collars = [
  { hole_id: "A1", x: 0, y: 0, attrs: { Purpose: "Resource", Area: "North" } }, { hole_id: "A2", x: 1, y: 1, attrs: { Purpose: "Resource Confidence", Area: "North" } },
  { hole_id: "A3", x: 2, y: 2, attrs: { Purpose: "Exploration", Area: "South" } }, { hole_id: "A4", x: 3, y: 3, attrs: { Purpose: "Resource", Area: "West" } },
];
const ids = (f) => filterHoles(collars, f).map((c) => c.hole_id);
test("a whole value, OR within a field, AND across fields", () => {
  assert.deepEqual(ids("Purpose=Resource"), ["A1", "A4"], "not Resource Confidence");
  assert.deepEqual(ids("Area=North, Area=South"), ["A1", "A2", "A3"]);
  assert.deepEqual(ids("Purpose=Resource Area=West"), ["A4"]);
  assert.deepEqual(ids(""), ["A1", "A2", "A3", "A4"]);
  assert.deepEqual(ids("A3"), ["A3"], "a hole id term as before");
});
test("the Atlas modal uses the same rule", () => {
  assert.ok(fs.readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8").includes("collarsMatchingList(tracedCollars, holeFilter)"));
});
