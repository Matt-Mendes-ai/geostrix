// TASKS.csv #3431 (side session 2's note, from #3324) — the 3D slice's slab placed by a hole or a typed coordinate, beside the 0-1 slider.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slabPosThrough, slabAxis } from "../src/lib/viewer/slicePlace.js";

// the slice extent in scene coordinates (x east, y up, z = -north) from the origin (1000 E, 5000 N, 300 RL)
const ext = { x0: -500, x1: 500, y0: -200, y1: 300, z0: -400, z1: 400 };
const origin = { x: 1000, y: 5000, z: 300 };

test("vertical: the slider position at which the slab passes through a world E / N, for the azimuth", () => {
  // azimuth 0: the slab's normal is scene x (east): E 1000 is the extent's middle (0.5), E 1500 its east edge
  assert.deepEqual(slabPosThrough(ext, { mode: "vertical", azimuth: 0 }, origin, 1000, 5000, NaN), { pos: 0.5, outside: false });
  assert.deepEqual(slabPosThrough(ext, { mode: "vertical", azimuth: 0 }, origin, 1250, 5000, NaN), { pos: 0.75, outside: false });
  assert.deepEqual(slabPosThrough(ext, { mode: "vertical", azimuth: 0 }, origin, 1500, 4000, NaN), { pos: 1, outside: false });
  // azimuth 90: the normal is scene z (-north): N 5200 is z -200
  const r = slabPosThrough(ext, { mode: "vertical", azimuth: 90 }, origin, 1000, 5200, NaN);
  const a = slabAxis(ext, 90);
  assert.ok(Math.abs(r.pos - ((-200 * a.nz - a.lo) / (a.hi - a.lo))) < 1e-3, JSON.stringify(r));
  // beyond the range: clamped and said
  assert.deepEqual(slabPosThrough(ext, { mode: "vertical", azimuth: 0 }, origin, 9000, 5000, NaN), { pos: 1, outside: true });
  assert.deepEqual(slabPosThrough(ext, { mode: "vertical", azimuth: 0 }, origin, -9000, 5000, NaN), { pos: 0, outside: true });
});

test("horizontal: an RL; nothing to place by gives null", () => {
  // RL 300 is scene y 0: the extent's y runs -200..300, so (0 + 200) / 500 = 0.4
  assert.deepEqual(slabPosThrough(ext, { mode: "horizontal" }, origin, NaN, NaN, 300), { pos: 0.4, outside: false });
  assert.deepEqual(slabPosThrough(ext, { mode: "horizontal" }, origin, NaN, NaN, 9999), { pos: 1, outside: true });
  assert.equal(slabPosThrough(ext, { mode: "horizontal" }, origin, 1, 2, NaN), null);
  assert.equal(slabPosThrough(ext, { mode: "vertical", azimuth: 0 }, origin, NaN, 5, NaN), null);
  assert.equal(slabPosThrough(null, { mode: "vertical" }, origin, 1, 2, NaN), null);
  assert.equal(slabPosThrough({ ...ext, x0: 0, x1: 0, z0: 0, z1: 0 }, { mode: "vertical", azimuth: 0 }, origin, 1, 2, NaN), null);
});

test("wiring: the row is lazy and sits under the slider; keys", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const SlicePlaceRow = React\.lazy\(\(\) => import\("\.\.\/components\/SlicePlaceRow\.jsx"\)\);/);
  assert.match(v, /aria-label=\{tr\("Slice position"\)\} \/>\n\s*<Suspense fallback=\{null\}><SlicePlaceRow slice3d=\{slice3d\} setSlice3d=\{setSlice3d\} ext=\{sliceExtent\} origin=\{originRef\.current\} collars=\{collars\} \/><\/Suspense>/);
  const c = readFileSync(new URL("../src/components/SlicePlaceRow.jsx", import.meta.url), "utf8");
  const keys = [...c.matchAll(/tr\("([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 10);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
