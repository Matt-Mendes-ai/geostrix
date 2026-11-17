// TASKS.csv #3881 (follow-up of #2824) — a removed raster, block model or point cloud, and a closed project tab's payload, are let go the way a removed big map layer is:
// once the item has left its list for good (its id is gone) and no list of the project, an undo / redo step or another tab holds it, its own big fields are emptied (a
// stale render's closure then holds a shell); a tab payload's fields are detached. SYNTHETIC items.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noteRemovedItems, releaseUnheldItems, trackedItemCount, itemBytes, emptyBigFields, noteClosedTabs, releaseClosedTabs, BIG_BYTES } from "../src/lib/mapLayerRelease.js";

const raster = (id) => ({ id, name: `Raster ${id}`, bbox: [0, 0, 10, 10], dataUrl: "A".repeat(2e6), elevation: 300, grid: { nx: 2, ny: 2, values: "B".repeat(2e5) } });
const block = (id) => ({ id, name: `Block ${id}`, cells: Array.from({ length: 30000 }, (_, i) => ({ x: i, y: 0, z: 0, dx: 1, dy: 1, dz: 1, value: i })), min: 0, max: 1 });
const cloud = (id) => ({ id, name: `Cloud ${id}`, kind: "points", vertices: new Float32Array(300000), count: 100000, attributes: [{ name: "v", values: new Float32Array(100000) }] });

test("#3881 sizes: a big picture, block model and point cloud count; a small one never does", () => {
  assert.ok(itemBytes(raster("r")) >= BIG_BYTES);
  assert.ok(itemBytes(block("b")) >= BIG_BYTES);
  assert.ok(itemBytes(cloud("c")) >= BIG_BYTES);
  assert.ok(itemBytes({ id: "s", dataUrl: "A".repeat(5000), cells: [{ x: 1 }] }) < BIG_BYTES);
});

test("#3881 a removed item held by nothing is emptied in its own fields; one still in a step or a tab is kept and released later", () => {
  const R = raster("r1"), B = block("b1"), C = cloud("c1");
  assert.equal(noteRemovedItems("rasters", [R], []), 1);
  assert.equal(noteRemovedItems("voxelModels", [B], []), 1);
  assert.equal(noteRemovedItems("omfObjects", [C], []), 1);
  assert.deepEqual(releaseUnheldItems("rasters", [[], [R]]), { released: 0, names: [] }, "a step still holds it");
  assert.equal(R.dataUrl.length, 2e6);
  assert.deepEqual(releaseUnheldItems("rasters", [[]]), { released: 1, names: ["Raster r1"] });
  assert.equal(R.dataUrl, ""); assert.equal(R.grid.values, ""); assert.deepEqual(R.bbox, [0, 0, 10, 10]); assert.equal(R.elevation, 300);
  assert.equal(B.cells.length, 30000, "another kind is not touched by the rasters' release");
  releaseUnheldItems("voxelModels", [[]]); releaseUnheldItems("omfObjects", [[]]);
  assert.deepEqual(B.cells, []); assert.equal(B.min, 0);
  assert.equal(C.vertices.length, 0); assert.ok(C.vertices instanceof Float32Array); assert.equal(C.attributes[0].values.length, 0); assert.equal(C.count, 100000);
  assert.equal(trackedItemCount(), 0);
});

test("#3881 an item whose id is still in the list (updated, reordered) is not noted; the shared array of a restyled copy is never emptied", () => {
  const R = raster("r2"), R2 = { ...R, opacity: 0.5 };
  assert.equal(noteRemovedItems("rasters", [R], [R2]), 0);
  const B = block("b2"), B2 = { ...B, name: "restyled", id: "b2x" };
  noteRemovedItems("voxelModels", [B], [B2]); // B left (its id is not in the new list) but B2 shares its cells array
  releaseUnheldItems("voxelModels", [[B2]]);
  assert.deepEqual(B.cells, [], "the removed object lets go of its field");
  assert.equal(B2.cells.length, 30000, "the copy's own field still holds the array: never emptied in place");
});

test("#3881 a closed tab's payload is detached once, and only once the tab is gone from the list", () => {
  const p1 = { assays: [1, 2, 3], layers: { litho: [1] } }, p2 = { assays: [4] };
  const before = [{ id: "a", name: "A", payload: p1 }, { id: "b", name: "B", payload: p2 }];
  assert.equal(noteClosedTabs(before, [before[1]]), 1);
  assert.deepEqual(releaseClosedTabs(before), { released: 0, names: [] }, "still in the list");
  assert.deepEqual(releaseClosedTabs([before[1]]), { released: 1, names: ["A"] });
  assert.deepEqual(Object.keys(p1), []);
  assert.deepEqual(p2.assays, [4]);
  const live = p2.assays; // an array a project loaded from a payload is using is never emptied: only the payload's property goes
  assert.equal(noteClosedTabs([before[1]], []), 1); releaseClosedTabs([]);
  assert.deepEqual(live, [4]);
});

test("#3881 emptyBigFields: a string, typed array or array over the cap, one level down in a nested object or array of objects; small fields stay", () => {
  const x = { s: "A".repeat(1e5), small: "abc", t: new Float64Array(2000), arr: Array(1500).fill(1), few: [1, 2], nested: { big: "B".repeat(2e5), keep: 5 }, list: [{ v: new Uint8Array(5000), n: 1 }] };
  emptyBigFields(x);
  assert.equal(x.s, ""); assert.equal(x.small, "abc"); assert.equal(x.t.length, 0); assert.deepEqual(x.arr, []); assert.deepEqual(x.few, [1, 2]);
  assert.equal(x.nested.big, ""); assert.equal(x.nested.keep, 5); assert.equal(x.list[0].v.length, 0); assert.equal(x.list[0].n, 1);
});

test("#3881 wiring: noted on every change of the three lists and the tabs; released with the map layers (after an undo step, undo's in-flight step, a cleared history)", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /RELEASE_ITEM_KEYS = \["rasters", "voxelModels", "omfObjects"\]/);
  assert.match(s, /releaseUnheldItems\(key, \[live\[key\], \.\.\.steps\.map\(\(st\) => st\?\.\[key\]\), \.\.\.\(autosaveTabsRef\.current\?\.workspaceTabs \|\| \[\]\)\.map\(\(t\) => t\?\.payload\?\.\[key\]\)\]\)/);
  assert.match(s, /releaseClosedTabs\(autosaveTabsRef\.current\?\.workspaceTabs\)/);
  assert.match(s, /n \+= noteRemovedItems\(key, prev\[key\], now\[key\]\)/);
  assert.match(s, /let n = noteClosedTabs\(prev\.tabs, now\.tabs\)/);
});
