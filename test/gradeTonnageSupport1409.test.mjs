// TASKS.csv #1409 — grade-tonnage says how much of each row is interpolated or rests on one hole, and can count interpolated blocks only
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeTonnageTable, gradeTonnageRows } from "../src/lib/gradeTonnage.js";

const cell = (value, support, nHoles) => ({ x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, value, support, nHoles });

test("volume shares by support per row; interpolatedOnly drops the rest; no support -> null shares and no CSV column", () => {
  const cells = [cell(2, "interpolated", 3), cell(1, "extrapolated", 1), cell(1, "extrapolated", 1), cell(0.2, "unsupported", 0)];
  const [r0, r1] = gradeTonnageTable(cells, { cutoffs: [0, 1], density: 2.7, unit: "%" });
  assert.equal(r0.interpolatedShare, 0.25); assert.equal(r0.singleHoleShare, 0.5);
  assert.ok(Math.abs(r1.interpolatedShare - 1 / 3) < 1e-12);
  const only = gradeTonnageTable(cells, { cutoffs: [0], interpolatedOnly: true });
  assert.equal(only[0].blocks, 1); assert.equal(only[0].interpolatedShare, 1);
  const csv = gradeTonnageRows([r0], { vname: "Zn", density: 2.7, metal: { unit: "t" } })[0];
  assert.equal(csv.interpolated_pct, 25); assert.equal(csv.one_hole_pct, 50);
  const plain = gradeTonnageTable([cell(1), cell(2)], { cutoffs: [0] })[0];
  assert.equal(plain.interpolatedShare, null); assert.equal(plain.singleHoleShare, null);
  assert.ok(!("interpolated_pct" in gradeTonnageRows([plain], { vname: "Zn" })[0]));
});
