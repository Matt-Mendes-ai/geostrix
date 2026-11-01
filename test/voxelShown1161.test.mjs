// TASKS.csv #1161 — one filter for the block-model cells the user sees, shared by the 3D view, the sections and the level plan
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { voxelCellShown, voxelCellSupported } from "../src/lib/viewer/geomath.js";

test("#1161 voxelCellShown applies the cutoff band and the support", () => {
  const m = { threshold: 0.01, rangeMax: 0.1, supportCutoff: 0.2 };
  assert.equal(voxelCellShown(m, { value: 0.05, support: 0.5 }), true);
  assert.equal(voxelCellShown(m, { value: 0.005, support: 0.5 }), false, "below the band");
  assert.equal(voxelCellShown(m, { value: 0.5, support: 0.5 }), false, "above the band");
  assert.equal(voxelCellShown(m, { value: 0.05, support: 0.1 }), false, "unsupported");
  assert.equal(voxelCellShown({}, { value: -3 }), true, "no band, no support: every cell");
  assert.equal(voxelCellSupported({}, { value: 1 }), true);
});

test("#1161 the sections and the level plan filter with the same function as the 3D view", () => {
  const src = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal((src.match(/voxelCellShown\(model, c\)/g) || []).length, 3, "3D view, section, level plan");
  assert.ok(!/cells\.forEach\(\(c\) => \{\s*if \(!voxelCellSupported\(model, c\)\) return;/.test(src), "no bare support-only filter is left in a drawing path");
});

// TASKS.csv #1283 — the Targeting pane's sliders follow the store's band (a source pin: the component is not importable alone)
test("#1283 VoxelRangeRow re-reads threshold / rangeMax from the model", () => {
  const src = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("function VoxelRangeRow("), src.indexOf("function VoxelRangeRow(") + 2500);
  assert.match(body, /useEffect\(\(\) => \{\s*if \(debounceRef\.current\) return;[\s\S]*\}, \[model\.threshold, model\.rangeMax, model\.min, model\.max\]\);/);
  assert.match(body, /debounceRef\.current = null; onUpdate\(model\.id, patch\);/, "the pending push clears itself so the next store change is taken");
});
