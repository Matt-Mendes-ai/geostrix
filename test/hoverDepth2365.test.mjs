// TASKS.csv #2365 (review #2325, WA uranium) — 3D hover tooltips give depths as stored: the 9,700 ppm U sample at 50.5-51.0 m read '51–51 m'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("no 3D tooltip rounds a depth to whole metres", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(v, /\.from\.toFixed\(0\)\}–\$\{[a-z]+\.to\.toFixed\(0\)\} m/);
  assert.equal((v.match(/\$\{\+(a|row)\.from\.toFixed\(2\)\}–\$\{\+(a|row)\.to\.toFixed\(2\)\} m/g) || []).length, 3); // assays, logged layers, custom layers
  // the format itself: 50.5 -> "50.5", 51 -> "51", 12.345 -> "12.35" (two decimals at most, no trailing zeros)
  assert.deepEqual([50.5, 51, 12.345, 0.25].map((x) => `${+x.toFixed(2)}`), ["50.5", "51", "12.35", "0.25"]);
});
