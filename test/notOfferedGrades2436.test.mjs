// TASKS.csv #2436 — a model a grade pane leaves out is named with its reason, and a logged eU3O8 grade is priced as the oxide
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { notOfferedGrades, gradeCandidate } from "../src/lib/gradeCandidate.js";
import { elementOfModel, pitMetalOf, priceUnitsFor } from "../src/lib/pitShell.js";

const c = [{ x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, value: 1 }];

test("left-out models: a unit that is not a grade's, apart from physical / quality models; offered ones and 'index' are not listed", () => {
  const r = notOfferedGrades([
    { name: "Gamma: eU3O8_cased_ppm estimate", cells: c, params: { unit: "as logged" } },
    { name: "U estimate", cells: c, params: { unit: "ppm" } },
    { name: "ZTEM inversion", cells: c },
    { name: "CuEq estimate", cells: c, params: { unit: "index" } },
    { name: "Support index", cells: c, source: "support-index-1" },
    { name: "Empty", cells: [] },
  ]);
  assert.deepEqual(r.units, [{ name: "Gamma: eU3O8_cased_ppm estimate", unit: "as logged" }]);
  assert.deepEqual(r.other, ["ZTEM inversion", "Support index"]);
  assert.deepEqual(notOfferedGrades([{ name: "Au", cells: c, params: { unit: "g/t" } }]), { units: [], other: [] });
});

test("a gamma eU3O8 estimate in ppm is a grade, read as the oxide and priced per lb U3O8", () => {
  const m = { name: "Gamma: eU3O8_cased_ppm estimate (idw2, 6m, r100m)", cells: c, params: { unit: "ppm", element: "Gamma: eU3O8_cased_ppm" } };
  assert.equal(gradeCandidate(m), true);
  assert.equal(elementOfModel(m), "eU3O8");
  assert.deepEqual(pitMetalOf("ppm", elementOfModel(m)), { factor: 1e-6, unit: "t" });
  assert.equal(priceUnitsFor(pitMetalOf("ppm", "eU3O8"), "eU3O8")[0][1], "$/lb U3O8");
  // no change for the others
  assert.equal(elementOfModel({ params: { element: "U" } }), "U");
  assert.equal(elementOfModel({ name: "Cu estimate (idw2)" }), "Cu");
  assert.equal(elementOfModel({ params: { element: "XU3O8Y" } }), "XU3O8Y");
  assert.equal(elementOfModel({ name: "U3O8 estimate" }), "U3O8");
});

test("Pit shell and Stope outlines show the note whatever else is offered", () => {
  for (const f of ["src/components/PitShellPane.jsx", "src/components/StopesPane.jsx"]) assert.match(fs.readFileSync(f, "utf8"), /<NotOfferedGrades voxelModels=\{voxelModels\} \/>/, f);
});
