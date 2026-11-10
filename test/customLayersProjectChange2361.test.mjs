// TASKS.csv #2361 (review #2325, WA uranium) — on a project change the 3D View's local custom layers are rebuilt from the new store only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customLayerSync, detachCustomGroups } from "../src/modules/viewer/customLayerSync.js";

const local = [{ id: "a", name: "Strat unit" }, { id: "b", name: "Drilling method" }];

test("a project change keeps nothing of the old list", () => {
  const closed = customLayerSync(local, [], true); // closed: the new project has no custom layers
  assert.deepEqual(closed.keep, []); assert.deepEqual(closed.drop.map((l) => l.id), ["a", "b"]); assert.deepEqual(closed.missing, []);
  // reopening the same file: the same ids come back as new layers, built from the store
  const reopened = customLayerSync(local, [{ id: "a", name: "Strat unit" }], true);
  assert.deepEqual(reopened.drop.map((l) => l.id), ["a", "b"]); assert.deepEqual(reopened.missing.map((l) => l.id), ["a"]);
});

test("within one project only the missing layers are added (a just-imported local layer is never dropped)", () => {
  const r = customLayerSync([...local, { id: "new" }], [{ id: "a" }, { id: "b" }, { id: "c" }], false);
  assert.deepEqual(r.drop, []); assert.deepEqual(r.keep.map((l) => l.id), ["a", "b", "new"]); assert.deepEqual(r.missing.map((l) => l.id), ["c"]);
});

test("dropped groups leave the scene and the group map", () => {
  const removed = [];
  const parent = { remove: (g) => removed.push(g.name) };
  const groups = { a: { name: "a", parent }, b: { name: "b", parent }, keep: { name: "keep", parent } };
  detachCustomGroups(local, groups);
  assert.deepEqual(removed, ["a", "b"]); assert.deepEqual(Object.keys(groups), ["keep"]);
});

test("the restore effect rebuilds on the store's project counter", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const fresh = customSeqRef\.current !== viewerUiStateSeq; customSeqRef\.current = viewerUiStateSeq;/);
  assert.match(v, /setCustomLayers\(\(p\) => \(fresh \? rebuilt : \[\.\.\.p, \.\.\.rebuilt\]\)\);/);
  assert.match(v, /\}, \[storeCustomLayers, sceneReady, viewerUiStateSeq\]\);/);
  // the store bumps the counter on New, Open, a tab switch and a tab close (all through newProject / loadProjectPayload)
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.ok((s.match(/setViewerUiStateSeq\(\(s\) => s \+ 1\)/g) || []).length >= 2);
});
