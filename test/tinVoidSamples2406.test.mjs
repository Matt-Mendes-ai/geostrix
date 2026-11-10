// TASKS.csv #2406 (review #2325, WA uranium) — a sample over a void of a terrain triangulated from points is drawn flat, not hidden
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("the app's own TIN marks itself, and the placement treats its voids like outside the terrain", () => {
  assert.match(g, /source: \{ kind: "tin from points"/);
  assert.match(v, /const tin = terrain\?\.source\?\.kind === "tin from points";/);
  assert.match(v, /: !b \|\| !inside \|\| tin \? \{ \.\.\.r, z: surfaceFlatZ, zFlat: true,/);
  // a real DEM's void keeps #927: unplaced (null) when inside the box and not a TIN
  assert.match(v, /zOutside: true \} : \{\}\) \} : null;/);
});
