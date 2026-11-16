// TASKS.csv #3685 — a Block calculator model keeps its inputs' basis: per block the weakest support, the fewest holes, beyond / log flags; on the
// record the holes (the union, said when they differ), the beyond flag and a shared domain or volume. Synthetic models only.
import test from "node:test";
import assert from "node:assert/strict";
import { blockCalc, calcModelRecord, inputsBasis } from "../src/lib/blockCalc.js";
import { gradeTonnageTable } from "../src/lib/gradeTonnage.js";

const cell = (i, value, extra = {}) => ({ x: 5 + 10 * i, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value, ...extra });
const zn = { id: "zn", name: "Zn estimate", params: { element: "Zn", unit: "%", holeIds: ["A", "B", "C"], beyondFlagged: true, restrictedToVolumeName: "Zn > 2 shell" },
  cells: [cell(0, 4, { support: "interpolated", nHoles: 3 }), cell(1, 3, { support: "extrapolated", nHoles: 2, beyond: true }), cell(2, 1, { support: "interpolated", nHoles: 1 })] };
const pb = { id: "pb", name: "Pb estimate", params: { element: "Pb", unit: "%", holeIds: ["A", "B", "C"], restrictedToVolumeName: "Zn > 2 shell" },
  cells: [cell(0, 2, { support: "unsupported", nHoles: 2 }), cell(1, 1, { support: "interpolated", nHoles: 3 }), cell(2, 0.5, { support: "interpolated", nHoles: 2, fromLog: 1.5 })] };

test("blockCalc: each block takes the weakest support of its inputs, the fewest holes, beyond and log flags", async () => {
  const r = await blockCalc([{ var: "Zn", model: zn }, { var: "Pb", model: pb }], "Zn + Pb");
  assert.deepEqual(r.cells.map((c) => [c.value, c.support, c.nHoles, !!c.beyond, c.fromLog ?? 0]), [[6, "unsupported", 2, false, 0], [4, "extrapolated", 2, true, 0], [1.5, "interpolated", 1, false, 1.5]]);
  const plain = await blockCalc([{ var: "a", model: { name: "a", params: {}, cells: [cell(0, 1)] } }], "a * 2");
  assert.deepEqual(Object.keys(plain.cells[0]).sort(), ["dx", "dy", "dz", "value", "x", "y", "z"], "no basis invented for a model without one");
  // the table reads it as an estimate: the Interpolated share at a cut-off of 1
  const t = gradeTonnageTable(r.cells, { cutoffs: [1], beyondKnown: true });
  assert.ok(Math.abs(t[0].interpolatedShare - 1 / 3) < 1e-9 && Math.abs(t[0].beyondShare - 4 / 11.5) < 1e-9 && Math.abs(t[0].singleHoleShare - 1 / 3) < 1e-9, JSON.stringify(t[0]));
});

test("calcModelRecord: the inputs' holes, beyond flag and shared volume on the record; differences said", async () => {
  const r = await blockCalc([{ var: "Zn", model: zn }, { var: "Pb", model: pb }], "Zn + Pb");
  const rec = calcModelRecord({ name: "ZnPb", unit: "%", formula: "Zn + Pb", inputs: [{ var: "Zn", model: zn }, { var: "Pb", model: pb }], result: r });
  assert.deepEqual([rec.params.holeIds, rec.params.holesFrom, rec.params.beyondFlagged, rec.params.restrictedToVolumeName], [["A", "B", "C"], "the same 3 holes as its inputs", true, "Zn > 2 shell"]);
  const b = inputsBasis([zn, { ...pb, params: { ...pb.params, holeIds: ["A", "D"], restrictedToVolumeName: null } }]);
  assert.deepEqual(b.holeIds.sort(), ["A", "B", "C", "D"]);
  assert.match(b.holesFrom, /^the union of its inputs' holes \(Zn estimate: 3; Pb estimate: 2\)$/);
  assert.equal(b.restrictedToVolumeName, undefined);
  assert.match(b.restrictedToVolumeNameDiffers, /Zn estimate: Zn > 2 shell; Pb estimate: none/);
  assert.equal(inputsBasis([{ name: "x", params: {} }]).holeIds, undefined, "no hole list when an input has none");
});
