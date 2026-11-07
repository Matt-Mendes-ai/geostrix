// TASKS.csv #1596 — an OMF block model cropped to a box before it is coarsened: the right cells, the right origin, the counts said.
import test from "node:test";
import assert from "node:assert/strict";
import { cropOmfTensorGrid, omfVolumeToCells } from "../src/lib/omf.js";

// 4 x 3 x 2 cells of 10 m from (1000, 2000, 0); value = 100 i + 10 j + k (w fastest, then v, then u)
const vol = (axis_u = [1, 0, 0], axis_v = [0, 1, 0]) => {
  const values = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) values.push(100 * i + 10 * j + k + 1);
  return { origin: [1000, 2000, 0], axis_u, axis_v, axis_w: [0, 0, 1], tensor_u: [10, 10, 10, 10], tensor_v: [10, 10, 10], tensor_w: [10, 10], attributes: [{ kind: "numeric", name: "v", values }] };
};

test("the columns whose centres lie in the box, the origin moved to the first kept column", () => {
  const v = vol();
  const c = cropOmfTensorGrid(v, Float64Array.from(v.attributes[0].values), { x0: 1012, x1: 1030, y0: 2000, y1: 2016 });
  assert.deepEqual(c.tensor_u, [10, 10]); // centres 1015, 1025
  assert.deepEqual(c.tensor_v, [10, 10]); // centres 2005, 2015
  assert.deepEqual(c.origin, [1010, 2000, 0]);
  assert.deepEqual([...c.values], [101 + 0, 102, 111, 112, 201, 202, 211, 212]);
  assert.deepEqual([c.kept, c.of], [8, 24]);
});

test("through omfVolumeToCells: cells at the right places, a note; a rotated grid or a box off the model said so", () => {
  const r = omfVolumeToCells(vol(), null, 1e6, { x0: 1012, x1: 1030, y0: 2000, y1: 2016 });
  assert.equal(r.cells.length, 8);
  assert.deepEqual([r.cells[0].x, r.cells[0].y, r.cells[0].z, r.cells[0].value], [1015, 2005, 5, 101]);
  assert.match(r.cropNote, /8 of 24 cells kept/);
  const rot = omfVolumeToCells(vol([0.6, 0.8, 0], [-0.8, 0.6, 0]), null, 1e6, { x0: 0, x1: 1, y0: 0, y1: 1 });
  assert.equal(rot.cells.length, 24);
  assert.match(rot.cropNote, /rotated/);
  const off = omfVolumeToCells(vol(), null, 1e6, { x0: 0, x1: 10, y0: 0, y1: 10 });
  assert.equal(off.cells.length, 0);
  assert.match(off.cropNote, /nothing was kept/);
});
