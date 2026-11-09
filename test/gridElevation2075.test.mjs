// TASKS.csv #2075 (review #2013, Geophysics) — a gridded point survey with no z was drawn flat at the collars' median elevation with no
// word, and the 3D legend listed points that are not drawn.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const g = rd("../src/modules/GeophysicsModule.jsx"), v = rd("../src/modules/ViewerModule.jsx");

test("the gridding notice says where the raster is drawn and why", () => {
  // #2239: the stations' own median elevation comes before the collar-median basis when the gridded points have z
  assert.match(g, /const where = terrain \? tr\(" Draped on the terrain\."\) : ptsZ != null \? tr\(" Drawn flat at \{z\} m, the stations' median elevation \(there is no terrain to drape it on\)\.", \{ z: Math\.round\(ptsZ\)\.toLocaleString\(\) \}\) : tr\(" Drawn flat at \{z\} m \(\{basis\}\), not on the ground: there is no terrain\./);
  assert.match(g, /drapeAt\.source === "collars" \? tr\("the collars' median elevation"\)/);
  assert.match(g, /: "" \}\) \+ where \}\); \/\/ where: #2075/);
});
test("the 3D legend ramps only the points that are drawn (with a z)", () => {
  assert.match(v, /const gpts = \(layers\?\.geophys_pts \|\| \[\]\)\.filter\(\(r\) => Number\.isFinite\(r\.z\)\);/);
});
