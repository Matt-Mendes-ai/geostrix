// TASKS.csv #2646 — Nested pits says which block models the pit tools leave out and why (#2436), as Pit shell and Stope outlines do
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { notOfferedGrades } from "../src/lib/gradeCandidate.js";

test("the pane renders the shared line; the line's list is the one Pit shell uses", () => {
  const p = fs.readFileSync("src/components/NestedPitsPane.jsx", "utf8");
  assert.match(p, /import NotOfferedGrades from "\.\/NotOfferedGrades\.jsx";/);
  assert.match(p, /<NotOfferedGrades voxelModels=\{voxelModels\} \/>/);
  assert.match(p, /const \{ voxelModels = \[\]/);
  for (const f of ["PitShellPane", "StopesPane"]) assert.match(fs.readFileSync(`src/components/${f}.jsx`, "utf8"), /<NotOfferedGrades voxelModels=\{voxelModels\} \/>/, f);
  // a gamma estimate 'as logged' is not offered, with its unit
  const r = notOfferedGrades([{ name: "eU3O8 estimate", cells: [{ value: 1 }], params: { unit: "as logged" } }, { name: "Au estimate", cells: [{ value: 1 }], params: { unit: "g/t" } }], () => false);
  assert.deepEqual(r.units.map((u) => u.name), ["eU3O8 estimate"]);
});
