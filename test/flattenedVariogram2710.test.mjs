// TASKS.csv #2710 (split from #2424) — in-plane variogram pairs could follow a flat plane or the trend's, not a modelled contact: on a folded or
// tilted layer, level pairs cut across the layering. The Variogram's Plane can now be a generated surface: each composite's elevation becomes
// its depth below it (a stratigraphic, 'flattened' variogram).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfaceElevation, flattenOnSurface } from "../src/lib/flattenOnSurface.js";
import { experimentalVariogram } from "../src/lib/variogram.js";

// a surface z = top(x, y) as a triangulated grid, world coordinates
function gridSurface(top, x0, x1, y0, y1, step) {
  const V = [], I = [], nx = Math.round((x1 - x0) / step) + 1, ny = Math.round((y1 - y0) / step) + 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * step, y = y0 + j * step; V.push(x, y, top(x, y)); }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; I.push(a, b, d, a, d, c); }
  return { vertices: V, indices: I };
}
const top = (x) => 100 - 0.5 * x; // dips about 27° to the east

test("the surface's elevation: exact on a plane, null outside, the sheet nearest the sample where two overlap", () => {
  const s = gridSurface(top, 0, 200, 0, 200, 20);
  const z = surfaceElevation(s.vertices, s.indices);
  for (const [x, y] of [[0, 0], [37.5, 81.2], [199.9, 3], [120, 200]]) assert.ok(Math.abs(z(x, y) - top(x)) < 1e-9, `${x},${y}`);
  assert.equal(z(-5, 50), null);
  assert.equal(z(50, 260), null);
  const two = { vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 100, 10, 0, 100, 0, 10, 100], indices: [0, 1, 2, 3, 4, 5] };
  const z2 = surfaceElevation(two.vertices, two.indices);
  assert.equal(z2(2, 2, 90), 100);
  assert.equal(z2(2, 2, 12), 0);
  assert.equal(z2(2, 2), 100, "no hint: the highest");
  const f = flattenOnSurface([{ x: 10, y: 10, z: 50 }, { x: 500, y: 0, z: 0 }], z);
  assert.equal(f.outside, 1);
  assert.ok(Math.abs(f.points[0].z - (50 - top(10))) < 1e-9);
});

test("on a dipping layered body, pairs below the contact vary far less than level pairs, which cut across the layers", () => {
  const s = gridSurface(top, -10, 210, -10, 210, 10);
  let seed = 2710; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const x = i * 20, y = j * 20;
    for (let d = 1; d < 60; d += 2) { const z = top(x) - d; pts.push({ hole_id: `H${i}_${j}`, x, y, z, value: Math.sin(d / 3) + 0.05 * (rnd() - 0.5) }); } // the value follows the depth below the contact
  }
  const flat = flattenOnSurface(pts, surfaceElevation(s.vertices, s.indices));
  assert.equal(flat.outside, 0);
  const opts = { lagDistance: 20, nLags: 6, lagTolerance: 0.5, holeMode: "between", direction: { plane: { normal: { x: 0, y: 0, z: 1 }, halfWidth: 1 } } };
  const below = experimentalVariogram(flat.points, opts), level = experimentalVariogram(pts, opts);
  const gamma = (vg) => vg.bins.filter((b) => b.nPairs > 30).slice(0, 3).map((b) => b.gamma);
  const gb = gamma(below), gl = gamma(level);
  assert.ok(gb.length === 3 && gl.length === 3, JSON.stringify({ gb, gl }));
  if (process.env.SHOW) console.log("below", gb.map((v) => v.toFixed(4)), "level", gl.map((v) => v.toFixed(4)));
  for (let k = 0; k < 3; k++) assert.ok(gb[k] < gl[k] / 5, `lag ${k + 1}: below ${gb[k].toFixed(4)} vs level ${gl[k].toFixed(4)}`);
});

test("the Variogram offers the generated surfaces as the plane and pairs the flattened composites", () => {
  const m = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /<optgroup label=\{tr\("Below a generated surface \(flattened\)"\)\}>/);
  assert.match(m, /const fl = flattenOnSurface\(tPoints, surfaceElevation\(usePlane\.surface\.vertices, usePlane\.surface\.indices\)\);/);
  assert.match(m, /experimentalVariogram\(vgPoints, /);
  assert.match(m, /lastRun\.current = \{ points: vgPoints, /, "the direction table pairs the same points");
  assert.match(m, /tr\("\{n\} composites lie outside the surface's footprint and are left out\."/);
});
