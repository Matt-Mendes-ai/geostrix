// TASKS.csv #2406 (review #2325, WA uranium) — a sample over a void of a terrain triangulated from points is drawn flat, not hidden
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v = readFileSync(new URL("../src/lib/viewer/surfacePlacement.js", import.meta.url), "utf8"); // moved out of ViewerModule: #2485
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("the app's own TIN marks itself, and the placement treats its voids like outside the terrain", () => {
  assert.match(g, /source: \{ kind: "tin from points"/);
  assert.match(v, /const isTin = \(terrain\) => terrain\?\.source\?\.kind === "tin from points";/);
  assert.match(v, /else if \(tin\) out = \{ \.\.\.r, z: flatZ, zFlat: true, zTinGap: true \};/);
  // a real DEM's void keeps #927: unplaced (null) when inside the box and not a TIN (behaviour: test/surfacePlacement2485)
  assert.match(v, /let out = null;/);
});
