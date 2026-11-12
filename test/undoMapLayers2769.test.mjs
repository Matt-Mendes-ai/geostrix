// TASKS.csv #2769 (#2630 (4)) — map-layer edits (an interpretation line added, removed or restored) are in the Ctrl+Z undo stack
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FIELDS, UNDO_KEYS, DIRTY_KEYS } from "../src/lib/projectFields.js";

test("mapLayers is undo-tracked (reference-compared, #432), no longer dirty-only", () => {
  assert.equal(FIELDS.find((f) => f.key === "mapLayers").track, "undo");
  assert.ok(UNDO_KEYS.includes("mapLayers") && !DIRTY_KEYS.includes("mapLayers"));
  // the watcher compares the undo fields by reference, so an imported layer is never serialised per edit
  assert.match(fs.readFileSync("src/lib/store.jsx", "utf8"), /if \(Object\.keys\(current\)\.every\(\(k\) => current\[k\] === prevSnap\[k\]\)\) return;/);
});

test("the Undo tooltip lists map layers and interpretation lines as undoable", () => {
  const a = fs.readFileSync("src/App.jsx", "utf8");
  assert.ok(a.includes("explicit surfaces, map layers and interpretation lines, Layout pages ... Rasters, terrain, block models and generated surfaces are not undoable."));
});
