// TASKS.csv #3494 — Undo / Redo for the model surfaces: the reconcile logic
import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSurfaces, inOrder, bury, sameIds, GRAVE_MAX } from "../src/modules/viewer/surfaceUndo.js";

test("undo of an add: the new surface goes out; redo: it comes back from the grave in its place", () => {
  const grave = new Map();
  let r = reconcileSurfaces(["a", "b", "z"], ["a", "b"], grave);
  assert.deepEqual([r.remove, r.restore], [["z"], []]);
  bury(grave, "z", { entry: { id: "z" }, mesh: {} });
  r = reconcileSurfaces(["a", "b"], ["a", "b", "z"], grave);
  assert.deepEqual([r.remove, r.restore, r.order], [[], ["z"], ["a", "b", "z"]]);
});
test("a surface the grave no longer holds cannot come back", () => {
  const r = reconcileSurfaces(["a"], ["a", "gone"], new Map());
  assert.deepEqual([r.restore, r.order], [[], ["a"]]);
});
test("undo of a delete restores in the original order", () => {
  const grave = new Map([["b", { entry: { id: "b" } }]]);
  const r = reconcileSurfaces(["a", "c"], ["a", "b", "c"], grave);
  assert.deepEqual(r.restore, ["b"]);
  assert.deepEqual(inOrder([{ id: "a" }, { id: "c" }, { id: "b" }], r.order).map((s) => s.id), ["a", "b", "c"]);
});
test("the grave is capped, the oldest handed back to dispose", () => {
  const grave = new Map(); let dropped = [];
  for (let i = 0; i < GRAVE_MAX + 3; i++) dropped = dropped.concat(bury(grave, `s${i}`, { i }));
  assert.equal(grave.size, GRAVE_MAX);
  assert.deepEqual(dropped.map((d) => d.i), [0, 1, 2]);
  assert.ok(sameIds(["a", "b"], ["a", "b"]) && !sameIds(["a"], ["a", "b"]));
});

import fs from "node:fs";
test("wiring: the ids in the undo snapshot, restored by applySnapshot, a load starts them over; ViewerModule uses the hook and keeps a removed surface", () => {
  const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const st = src("../src/lib/store.jsx");
  assert.match(st, /snap\.surfaceIds = surfaceIds;/);
  assert.match(st, /if \(snap\.surfaceIds\) setSurfaceIds\(snap\.surfaceIds\)/);
  assert.match(st, /setSurfaceIds\(\(vals\.generatedSurfaces \|\| \[\]\)\.map/);
  const v = src("../src/modules/ViewerModule.jsx");
  assert.match(v, /useSurfaceUndo\(\{ implicitSurfaces, setImplicitSurfaces,/);
  assert.match(v, /stashSurface\(\{ grave: surfaceGrave\.current/);
  assert.match(src("../src/components/UndrilledZonesPane.jsx"), /Ctrl\+Z takes it back/);
});
