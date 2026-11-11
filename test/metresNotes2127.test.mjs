// TASKS.csv #2127 — import notices measured in 'world units' on a metric project ('960×960 world units', 'moved 409481 world units')
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sizeText } from "../src/lib/raster.js";

test("metres on a metric projected CRS, world units otherwise", () => {
  assert.equal(sizeText(409481.4, 26910), "409,481 m");
  assert.equal(sizeText(960, 28350), "960 m");
  assert.equal(sizeText(960, 4326), "960 world units"); // degrees: not metres
  assert.equal(sizeText(960, null), "960 world units");
});

test("the raster and both terrain notices branch on the project's CRS", () => {
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /tr\("Imported \\"\{name\}\\" \(\{width\}×\{height\}px, \{v\} × \{v2\} m\)\."/);
  assert.match(r, /the drape's footprint moved \$\{sizeText\(/);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /terrain mesh \(source \{srcWidth\}×\{srcHeight\}px, \{v\} × \{v2\} m\)\{v3\}\./);
  assert.match(g, /terrain mesh covering \{v\} × \{v2\} m for the area you drew\./);
});
