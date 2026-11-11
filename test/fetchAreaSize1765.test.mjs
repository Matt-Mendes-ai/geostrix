// TASKS.csv #1765 / #2469 — the terrain / imagery fetch-area picker gave its area in degrees ('~0.171 deg x 0.139 deg') where Macrostrat's
// dialog gave the same project area as '~16 km x 15 km'; the collars were already drawn on it offline (#1629)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areaSizeText } from "../src/lib/areaSize.js";

test("the review's area at 30 S in kilometres", () => {
  assert.equal(areaSizeText([123.65, -30.0, 123.821, -29.861]), "~16 km × 15 km");
  assert.equal(areaSizeText([-129.1, 56.0, -129.0, 56.05]), "~6.2 km × 5.5 km"); // the #2314 case, unchanged
});

test("the picker shows the ground size, the degrees as its tooltip, and still draws the collars", () => {
  const src = readFileSync(new URL("../src/components/BasemapView.jsx", import.meta.url), "utf8");
  assert.match(src, /\{areaSizeText\(bbox\)/);
  assert.match(src, /title=\{`~\$\{\(bbox\[2\] - bbox\[0\]\)\.toFixed\(3\)\}°/);
  assert.match(src, /collarLonLat\.map\(/); // #1629
});
