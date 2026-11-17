// TASKS.csv #2824 — a removed big map layer is let go once nothing in the project can bring it back (not the project, no undo / redo step, no other tab):
// its features are emptied in place, so an older render's closure that still holds the list holds an empty array. SYNTHETIC layers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noteRemovedLayers, releaseUnheld, trackedLayers } from "../src/lib/mapLayerRelease.js";

const layer = (name, n) => ({ id: name, name, features: Array.from({ length: n }, (_, i) => ({ parts: [[[i, 0], [i, 1], [i + 1, 1], [i, 0]]] })) }); // 4 vertices each
const big = (name) => layer(name, 30000); // 120,000 vertices: over the cap's 100,000
const small = (name) => layer(name, 100);

test("a removed big layer held by nothing is emptied; one still held (a step, a tab) is kept and released later", () => {
  const A = big("A"), B = big("B"), S = small("S");
  const before = [A, B, S], after = [B];
  assert.equal(noteRemovedLayers(before, after), 1, "only the big layer that left (A); a small one is never touched");
  const step = { mapLayers: [A, B] };
  assert.deepEqual(releaseUnheld([after, step.mapLayers]), { released: 0, names: [] }, "an undo step still holds A");
  assert.equal(A.features.length, 30000);
  assert.deepEqual(releaseUnheld([after]), { released: 1, names: ["A"] }, "the step is gone: A is let go");
  assert.equal(A.features.length, 0); assert.equal(B.features.length, 30000); assert.equal(S.features.length, 100);
  assert.equal(trackedLayers().length, 0);
});

test("a layer that shares its features with one in the project (a restyled copy) is not released", () => {
  const A = big("A"), A2 = { ...A, name: "A restyled" };
  noteRemovedLayers([A], [A2]);
  assert.equal(trackedLayers().length, 0, "its features are still in the project");
  const C = big("C");
  noteRemovedLayers([C], []);
  releaseUnheld([[], [{ ...C, name: "C in another tab" }]]);
  assert.equal(C.features.length, 30000, "another tab holds the same features");
  releaseUnheld([[]]);
  assert.equal(C.features.length, 0);
});

test("wiring: noted on every change of the map layers, released after an undo step is pushed, after the in-flight one, and when the history is cleared", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(s, /if \(noteRemovedLayers\(prev, mapLayers\)\) setTimeout\(\(\) => releaseRemovedLayers\(\), 0\);/);
  assert.match(s, /return releaseUnheld\(\[mapLayers, \.\.\.steps\.map\(\(st\) => st\?\.mapLayers\), \.\.\.tabs\]\);/);
  assert.equal((s.match(/releaseRemovedLayers\(\); \/\/ #2824/g) || []).length, 2, "after the burst's step and after undo's in-flight step");
  assert.match(s, /setTimeout\(\(\) => releaseRemovedLayers\(\), 0\); \/\/ #2824 — a layer only the history held/);
});
