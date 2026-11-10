// TASKS.csv #2405 (review #2325, WA uranium) — the surface samples' Label survives the style cleaner, so the select keeps it and it is saved
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";
import { sampleLabelItems } from "../src/lib/viewer/holeLabels.js";

test("a chosen label is kept; 'none' is the default and is not stored", () => {
  assert.deepEqual(cleanLayerStyle({ label: "el:U" }, "point"), { label: "el:U" });
  assert.deepEqual(cleanLayerStyle({ label: "id", size: 3, shape: "disc" }, "point").label, "id");
  assert.equal(cleanLayerStyle({ label: "none" }, "point"), null);
  assert.equal(cleanLayerStyle({ label: "" }, "point"), null);
});

test("the label the viewer reads makes a text label per sample", () => {
  const rows = [{ sample_id: "S1", x: 0, y: 0, z: 0, values: { U: 12 } }, { sample_id: "S2", x: 10, y: 0, z: 0, values: { U: 30 } }];
  const items = sampleLabelItems(rows, cleanLayerStyle({ label: "el:U" }, "point").label);
  assert.equal(items.length, 2);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /sampleLabelItems\(placedSurfaceSamples, layerStyles\.surface_samples\?\.label \|\| "none"/);
});
