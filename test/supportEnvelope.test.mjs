// TASKS.csv #641 — DC/IP support cutoff as a depth-of-investigation envelope
import { test } from "node:test";
import assert from "node:assert/strict";
import { supportEnvelope, cellSupportEnvelope } from "../src/lib/supportEnvelope.js";
import { voxelCellSupported } from "../src/lib/viewer/geomath.js";

test("a weak cell above a well-seen one is not hidden; everything below the deepest well-seen cell is", () => {
  // one column, top (z 100) to bottom (z 0): the 0.01 at z 75 is a hole a plain cutoff would punch
  const z = [100, 75, 50, 25, 0], sup = [0.3, 0.01, 0.08, 0.015, 0.001];
  const env = supportEnvelope([1, 1, 1, 1, 1], z, sup);
  assert.deepEqual(Array.from(env).map((v) => v >= 0.02), [true, true, true, false, false]);
});

test("#681 any cell above the deepest well-seen one is shown (no 10x guard any more)", () => {
  const env = supportEnvelope([1, 1, 1], [100, 50, 0], [0.3, 0.0015, 0.08]);
  assert.deepEqual(Array.from(env).map((v) => v >= 0.02), [true, true, true]);
});

test("columns are independent and a cell without support is never hidden", () => {
  const env = supportEnvelope(["a", "a", "b", "b"], [10, 0, 10, 0], [0.005, 0.5, null, 0.001]);
  assert.deepEqual(Array.from(env).map((v) => v >= 0.02), [true, true, true, false]);
});

test("3D: DC/IP line models use the envelope, other inversion models keep the per-cell cutoff", () => {
  const cells = [{ x: 5, y: 7, z: 10, support: 0.005 }, { x: 5, y: 7, z: 0, support: 0.5 }, { x: 6, y: 7, z: 10, support: 0.005 }];
  assert.equal(cellSupportEnvelope(cells).get(cells[0]), 0.5); // the support of the cell beneath it (#681: no 10x cap)
  const ip = { method: "ip", supportCutoff: 0.02, cells };
  assert.deepEqual(cells.map((c) => voxelCellSupported(ip, c)), [true, true, false]);
  const mag = { method: "mag", supportCutoff: 0.02, cells };
  assert.deepEqual(cells.map((c) => voxelCellSupported(mag, c)), [false, true, false]);
  assert.equal(voxelCellSupported({ method: "ip", supportCutoff: 0, cells }, cells[0]), true);
});
