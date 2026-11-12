// TASKS.csv #2806 — the undo history keeps at most KEEP_REMOVED big map layers no longer in the project; an older one is dropped from
// every step that holds it. Measured live: four 500k-vertex layers added and removed: 111.4 MB and all four alive before this.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { capRemovedMapLayers, vertexCount, KEEP_REMOVED, BIG_VERTICES } from "../src/lib/undoMapLayerCap.js";

const ring = (n) => Array.from({ length: n }, (_, i) => [i, i]);
const layer = (name, verts) => ({ id: name, name, features: [{ parts: [[ring(verts)]] }] });

test("#2806 vertices are counted through parts / rings / points and cached per features array", () => {
  assert.equal(vertexCount([{ parts: [[ring(5)], [ring(3), ring(2)]] }, { coordinates: [1, 2] }]), 11);
  assert.equal(vertexCount(null), 0);
  assert.equal(KEEP_REMOVED, 3);
  assert.equal(BIG_VERTICES, 100000);
});

test("#2806 the newest KEEP_REMOVED big removed layers stay; an older one leaves every step that held it", () => {
  const big = 10, small = layer("s", 3);
  const [A, B, C, D] = ["A", "B", "C", "D"].map((n) => layer(n, 20));
  // add A, remove A, add B, remove B ... : the states before each change, oldest first
  const steps = [{ mapLayers: [small] }, { mapLayers: [small, A] }, { mapLayers: [small] }, { mapLayers: [small, B] }, { mapLayers: [small] },
    { mapLayers: [small, C] }, { mapLayers: [small] }, { mapLayers: [small, D] }];
  const now = [small];
  const r = capRemovedMapLayers(steps, [now], { big });
  assert.equal(r.dropped, 1);
  assert.deepEqual(r.steps[1].mapLayers.map((l) => l.name), ["s"], "A dropped: an Undo there restores the map layers without it");
  assert.equal(r.steps[3].mapLayers[1], B);
  assert.equal(r.steps[7].mapLayers[1], D);
  assert.equal(r.steps[0], steps[0], "steps without a dropped layer keep their identity");
  assert.equal(steps[1].mapLayers.length, 2, "the input is not changed");
  // nothing to drop: the same array
  const again = capRemovedMapLayers(r.steps, [now], { big });
  assert.equal(again.dropped, 0);
  assert.equal(again.steps, r.steps);
});

test("#2806 kept whatever the count: layers in the project (shared features: a restyled copy), redo steps, small layers", () => {
  const big = 10;
  const A = layer("A", 20), A2 = { ...A, style: { fill: "#f00" } }; // a style edit: a new object, the same features
  const smalls = Array.from({ length: 8 }, (_, i) => layer("s" + i, 5));
  const steps = [{ mapLayers: [A] }, ...smalls.map((s) => ({ mapLayers: [s] }))];
  const r = capRemovedMapLayers(steps, [[A2]], { big, keep: 0 });
  assert.equal(r.dropped, 0, "A is still in the project (as A2); the small ones never count");
  const B = layer("B", 20);
  const r2 = capRemovedMapLayers([{ mapLayers: [B] }], [[], [B]], { big, keep: 0 });
  assert.equal(r2.dropped, 0, "held by a redo step");
  const r3 = capRemovedMapLayers([{ mapLayers: [B] }], [[]], { big, keep: 0 });
  assert.equal(r3.dropped, 1);
});

test("#2806 wired where a step is pushed", () => {
  const store = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(store, /const capped = capRemovedMapLayers\(undoPast\.current, \[undoPrevSnapshot\.current\?\.mapLayers\]\);\s+if \(capped\.dropped\) undoPast\.current = capped\.steps;/);
  // and where Undo commits an edit still in flight (the redo steps kept whole)
  assert.match(store, /capRemovedMapLayers\(undoPast\.current, \[undoSnapshotRef\.current\(\)\?\.mapLayers, \.\.\.undoFuture\.current\.map\(\(s\) => s\?\.mapLayers\)\]\); \/\/ #2806/);
});
