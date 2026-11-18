// TASKS.csv #3885 (the rest of #3881) — an item REPLACED by an updated copy with the same id (a reprojected picture, new cells) and a tab payload that a
// tab still in the list no longer holds (switchToTab sets it to null) are let go the same way: the old object's own big fields emptied (a field the copy
// shares stays whole in the copy), the old payload detached, only once nothing in the project, its history or another tab holds them. SYNTHETIC data.
import test from "node:test";
import assert from "node:assert/strict";
import { noteRemovedItems, releaseUnheldItems, noteClosedTabs, releaseClosedTabs, trackedItemCount } from "../src/lib/mapLayerRelease.js";

const cells = (n, v) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, z: 0, value: v }));

test("#3885 a block model replaced by a copy with new cells: the old copy's cells are let go once no undo step holds it", () => {
  const A = { id: "b1", name: "Block b1", cells: cells(30000, 1) }, A2 = { ...A, cells: cells(30000, 2) };
  assert.equal(noteRemovedItems("voxelModels", [A], [A2]), 1);
  assert.deepEqual(releaseUnheldItems("voxelModels", [[A2], [A]]), { released: 0, names: [] }, "an undo step still holds the old copy");
  assert.equal(A.cells.length, 30000);
  assert.deepEqual(releaseUnheldItems("voxelModels", [[A2]]), { released: 1, names: ["Block b1"] });
  assert.deepEqual(A.cells, []);
  assert.equal(A2.cells.length, 30000, "the live copy untouched");
  assert.equal(trackedItemCount("voxelModels"), 0);
});

test("#3885 a copy that shares the old picture (a recolour): the copy keeps it; the same object kept or reordered is never noted", () => {
  const R = { id: "r1", name: "Raster r1", dataUrl: "A".repeat(2e6) }, R2 = { ...R, opacity: 0.4 };
  assert.equal(noteRemovedItems("rasters", [R], [R2]), 1);
  releaseUnheldItems("rasters", [[R2]]);
  assert.equal(R.dataUrl, "");
  assert.equal(R2.dataUrl.length, 2e6);
  const S = { id: "s1", name: "S", dataUrl: "B".repeat(2e6) }, T = { id: "t1", name: "T", dataUrl: "C".repeat(2e6) };
  assert.equal(noteRemovedItems("rasters", [S, T], [T, S]), 0);
  assert.equal(noteRemovedItems("rasters", [S], [S]), 0);
  const small = { id: "u1", name: "small", dataUrl: "D".repeat(1000) };
  assert.equal(noteRemovedItems("rasters", [small], [{ ...small }]), 0, "under 1 MB: not worth tracking");
});

test("#3885 a tab brought forward (payload set to null): its old payload is detached once no tab holds it; an unchanged tab is not noted", () => {
  const p = { assays: [1, 2, 3], layers: { litho: [1] } }, q = { assays: [4] };
  const before = [{ id: "a", name: "A", payload: p }, { id: "b", name: "B", payload: q }];
  const after = [{ id: "a", name: "A", payload: null }, before[1]];
  assert.equal(noteClosedTabs(before, after), 1);
  assert.deepEqual(releaseClosedTabs(before), { released: 0, names: [] }, "a tab still holds it");
  assert.deepEqual(releaseClosedTabs(after), { released: 1, names: ["A"] });
  assert.deepEqual(Object.keys(p), []);
  assert.deepEqual(q.assays, [4], "the other tab's payload untouched");
  assert.equal(noteClosedTabs(after, [...after]), 0);
});
