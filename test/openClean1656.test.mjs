// TASKS.csv #1656 — a project opened from a file is clean until something is changed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stylingTracker, mirrorCustomLayers } from "../src/lib/viewerDirty.js";

test("the view's own reading of an opened project is the baseline, not a change", () => {
  const t = stylingTracker();
  const file = { holeLabelMode: "hole_id", gridConfig: { size: 1000 } };
  assert.equal(t(file, 1), false); // the store sees the file first
  const read = { holeLabelMode: "hole_id", gridConfig: { size: 1000, axes: false } }; // the view fills its defaults in
  t.rebase(read, 1);
  assert.equal(t(read, 1), false);
  assert.equal(t({ ...read, bgColor: "#000" }, 1), true); // a real edit afterwards still counts
  assert.equal(t({ ...read, bgColor: "#000" }, 1), false);
});

test("the custom-layer mirror keeps the same list when nothing changed", () => {
  const rows = [{ hole_id: "A", depth: 1, value: "x" }];
  const prev = [{ id: "c1", name: "SWIR", rows }];
  assert.equal(mirrorCustomLayers(prev, [{ id: "c1", name: "SWIR", rows, group: {} }]), prev);
  const renamed = mirrorCustomLayers(prev, [{ id: "c1", name: "SWIR 2", rows }]);
  assert.notEqual(renamed, prev);
  assert.deepEqual(renamed, [{ id: "c1", name: "SWIR 2", rows }]);
  assert.deepEqual(mirrorCustomLayers(prev, []), []);
  const empty = [];
  assert.equal(mirrorCustomLayers(empty, []), empty);
});

test("the 3D View waits for its hydration before writing, and marks the baseline", () => {
  const s = fs.readFileSync("src/modules/ViewerModule.jsx", "utf8");
  assert.match(s, /if \(hydratedFor !== viewerUiStateSeq\) return;/);
  assert.match(s, /markViewerUiBaseline\?\.\(ui, hydratedFor\)/);
  assert.match(s, /setStoreCustomLayers\(\(prev\) => mirrorCustomLayers\(prev, customLayers\)\)/);
  assert.match(fs.readFileSync("src/lib/store.jsx", "utf8"), /const markViewerUiBaseline = useCallback\(\(s, seq\) => stylingChanged\.current\.rebase\(s, seq\), \[\]\);/);
});
