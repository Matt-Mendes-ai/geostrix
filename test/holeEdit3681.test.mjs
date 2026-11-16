// TASKS.csv #3681 — a hole renamed or deleted from its Holes-list row, in every table that keys rows by it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renameInRows, deleteInRows, mapLayers, mapCustomLayers, renameInInterceptIds, deleteInInterceptIds, renameInInterceptSets, deleteInInterceptSets, renameProblem, holeRowCounts } from "../src/lib/holeEdit.js";

const collars = [{ hole_id: "A1", x: 1 }, { hole_id: "A2", x: 2 }];
const survey = [{ hole_id: "A1", depth: 0 }, { hole_id: "A1", depth: 50 }, { hole_id: "A2", depth: 0 }];
const layers = { litho: [{ hole_id: "A1", from: 0, to: 5, value: "x" }, { hole_id: "A2", from: 0, to: 5, value: "y" }], alt: [{ hole_id: "A2", from: 1, to: 2, value: "z" }], geophys_pts: { points: 3 } };

test("renameInRows / deleteInRows: only that hole's rows; the same object when it has none", () => {
  const r = renameInRows(survey, "A1", "B1");
  assert.deepEqual(r.map((x) => x.hole_id), ["B1", "B1", "A2"]);
  assert.equal(survey[0].hole_id, "A1", "the input is not mutated");
  assert.equal(renameInRows(survey, "ZZ", "B1"), survey);
  assert.deepEqual(deleteInRows(survey, "A1").map((x) => x.hole_id), ["A2"]);
  assert.equal(deleteInRows(survey, "ZZ"), survey);
  assert.equal(renameInRows(undefined, "A1", "B1"), undefined);
});

test("mapLayers: each table of the layers; a point survey and a layer without the hole untouched", () => {
  const out = mapLayers(layers, (v) => renameInRows(v, "A1", "B1"));
  assert.equal(out.litho[0].hole_id, "B1");
  assert.equal(out.alt, layers.alt, "a layer without the hole is the same array");
  assert.equal(out.geophys_pts, layers.geophys_pts);
  assert.equal(mapLayers(layers, (v) => renameInRows(v, "ZZ", "B1")), layers, "nothing changed: the same object");
  assert.equal(mapLayers(layers, (v) => deleteInRows(v, "A2")).alt.length, 0);
});

test("custom layers, intercept ids and sets: the hole is the second part of an id", () => {
  const custom = [{ id: "c1", name: "Mine", rows: [{ hole_id: "A1", from: 0, to: 1 }, { hole_id: "A2", from: 0, to: 1 }] }, { id: "c2", name: "Other", rows: [{ hole_id: "A2", depth: 3 }] }];
  const out = mapCustomLayers(custom, (rows) => renameInRows(rows, "A1", "B1"));
  assert.equal(out[0].rows[0].hole_id, "B1");
  assert.equal(out[1], custom[1]);
  const ids = ["litho:A1:0:x", "litho:A2:0:y"];
  assert.deepEqual(renameInInterceptIds(ids, "A1", "B1"), ["litho:B1:0:x", "litho:A2:0:y"]);
  assert.deepEqual(deleteInInterceptIds(ids, "A1"), ["litho:A2:0:y"]);
  const sets = [{ id: "s", name: "S", ids }];
  assert.deepEqual(renameInInterceptSets(sets, "A1", "B1")[0].ids, ["litho:B1:0:x", "litho:A2:0:y"]);
  assert.deepEqual(deleteInInterceptSets(sets, "A1")[0].ids, ["litho:A2:0:y"]);
  assert.equal(renameInInterceptSets(sets, "ZZ", "B1"), sets);
});

test("renameProblem and holeRowCounts", () => {
  assert.equal(renameProblem(collars, "A1", "  "), "empty");
  assert.equal(renameProblem(collars, "A1", "A1"), "same");
  assert.equal(renameProblem(collars, "A1", "A2"), "exists");
  assert.equal(renameProblem(collars, "A1", " B1 "), "");
  assert.deepEqual(holeRowCounts({ collars, survey, layers, assays: [{ hole_id: "A1" }], customLayers: [{ rows: [{ hole_id: "A1" }] }] }, "A1"), { collars: 1, survey: 2, intervals: 1, assays: 1, custom: 1 });
});

test("wiring: the store actions, the row menu", () => {
  const st = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(st, /const renameHole = useCallback/);
  assert.match(st, /const deleteHole = useCallback/);
  assert.match(st, /replaceLayer, renameHole, deleteHole/);
  const vp = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(vp, /onContextMenu=\{onMenu \? \(e\) => onMenu\(e, hole_id\) : undefined\}/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /onMenu=\{openHoleMenu\}/);
  assert.match(vm, /tr\("Rename hole…"\)/);
  assert.match(vm, /tr\("Delete hole…"\)/);
});
