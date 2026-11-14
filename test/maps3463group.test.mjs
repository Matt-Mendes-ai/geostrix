// TASKS.csv #3461 / #3462 / #3463 / #3465 — small Maps rows
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planDataExtent } from "../src/lib/mapsPlan.js";
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the plan switches its terrain and rasters off from the plan itself, and honours the terrain's eye", () => {
  const p = read("components/MapsPlanView.jsx");
  assert.match(p, /if \(hill && terrain\.visible !== false\) drawAt\(hill, terrain\.bbox, 0\.9\);/);
  assert.match(p, /updateTerrain\(\{ visible: e\.target\.checked \}\)/);
  assert.match(p, /updateRaster\(r\.id, \{ visible: e\.target\.checked \}\)/);
  assert.match(p, /tr\("Layers on the plan"\)/);
});
test("the fetch-area dialog's header agrees with its banner when the online map is off", () => {
  const b = read("components/BasemapView.jsx");
  assert.match(b, /\{!online \/\* TASKS\.csv #3461/);
  assert.match(b, /tr\("The online basemap \(\{layer\}\) is off: no tiles are loaded\./);
});
test("the terrain misfit names both counts when some points lie off its ground", () => {
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /if \(m\.n && m\.noGround\) msg \+= " " \+ tr\("Against the \{n\} of the \{total\} points it was built from that lie on its ground:/);
});
test("#3465: Fit leaves out a raster far from the collars (#2125), so the scale bar does not read 2,000 km", () => {
  const collars = [{ x: 350000, y: 6333000 }, { x: 351000, y: 6334000 }];
  const near = { visible: true, bbox: [349000, 6332000, 352000, 6335000] }, far = { visible: true, bbox: [-9000000, 1000000, -8000000, 2000000] };
  const e = planDataExtent({ rasters: [near, far], collars });
  assert.ok(e[2] - e[0] < 10000, `${e[2] - e[0]}`);
});
