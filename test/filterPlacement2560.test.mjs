// TASKS.csv #2560 — a grid filter's product is drawn as its parent is (flat at its level, or on the terrain / between the collars), and an
// upward continuation by h is drawn h higher
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filteredPlacement } from "../src/lib/eulerPlace.js";

test("#2560 the product's draw mode and elevation", () => {
  const flat = { drapeMode: "flat", elevation: 332 };
  assert.deepEqual(filteredPlacement(flat, "rtp", {}), { drapeMode: "flat", elevation: 332, raisedM: 0 });
  assert.deepEqual(filteredPlacement(flat, "upward", { height: 100 }), { drapeMode: "flat", elevation: 432, raisedM: 100 });
  assert.deepEqual(filteredPlacement({ drapeMode: "terrain", elevation: 332 }, "upward", { height: 100 }), { drapeMode: "terrain", elevation: 332, raisedM: 0 }); // on the ground stays on the ground
  assert.deepEqual(filteredPlacement({ drapeMode: "collars", elevation: 300 }, "tilt", {}), { drapeMode: "collars", elevation: 300, raisedM: 0 });
  assert.deepEqual(filteredPlacement({ elevation: 50 }, "worms"), { drapeMode: "flat", elevation: 50, raisedM: 0 }); // no mode stated: flat (the store's own default for a raster without a terrain)
});

test("#2560 every filter branch places its raster", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.equal((m.match(/addRaster\(\{ \.\.\.nr, \.\.\.placeOf\(r, /g) || []).length, 3); // worms, tilt-depth, matched filter
  assert.match(m, /addRaster\(\{ \.\.\.nr, drapeMode: place\.drapeMode, elevation: place\.elevation \}\)/);
  assert.doesNotMatch(m, /^\s+addRaster\(nr\);/m);
});
