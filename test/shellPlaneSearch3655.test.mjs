// TASKS.csv #3655 (Review's re-test of #3580, Macpass) — the grade shell's default search along the plane of the composites at the cut-off
// (an ellipsoid of the search sphere's volume), and the shell kept within REACH_SHARE of it from them. Measured on Macpass with these functions
// (scratchpad harness, the app's estimateDenseGrid): Tom West Zn >= 2 % inside 82 -> 88 %, 17.6 -> 5.25 Mm³, far (> 25 m) 66 -> 19.5 %, reach 60 ->
// 45 m; the property Ag >= 29.8: 74.6 -> 72.6 %, 27.8 -> 6.55 Mm³, 76.5 -> 28.8 %, 80 -> 61 m.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellPlaneSearch, reachCutField, PLANE_MIN_COMPOSITES, REACH_SHARE } from "../src/lib/viewer/shellPlane.js";
import { estimateDenseGrid } from "../src/lib/estimation.js";

// a tabular body dipping 60° towards 090: composites in 8 holes, spread 200 m along strike and down dip, 4 m across
const rad = Math.PI / 180, dip = 60 * rad;
const along = { x: 0, y: 1, z: 0 }, down = { x: Math.cos(dip), y: 0, z: -Math.sin(dip) }, normal = { x: Math.sin(dip), y: 0, z: Math.cos(dip) };
const body = [];
for (let h = 0; h < 8; h++) for (let k = 0; k < 8; k++) {
  const s = (h % 4) * 60 - 90 + k, d = Math.floor(h / 4) * 90 - 45 + k * 2, t = (k % 3) - 1;
  body.push({ hole_id: `H${h}`, x: s * along.x + d * down.x + t * normal.x, y: s * along.y + d * down.y + t * normal.y, z: 500 + s * along.z + d * down.z + t * normal.z, value: 5 });
}

test("the plane of the composites at the cut-off: its attitude, an ellipsoid of the sphere's volume, the reach", () => {
  const pl = shellPlaneSearch(body, 60);
  assert.ok(pl);
  assert.ok(Math.abs(pl.trend.dip - 60) < 2, `dip ${pl.trend.dip}`);
  assert.ok(Math.abs(pl.trend.dipAzimuth - 90) < 2, `dir ${pl.trend.dipAzimuth}`);
  const [a, b, c] = pl.axesM;
  assert.ok(Math.abs(a * b * c - 60 ** 3) / 60 ** 3 < 0.02, "the sphere's volume");
  assert.ok(a >= b && b >= c && a / c <= 6 + 1e-9, "the ratios capped at 6");
  assert.deepEqual(pl.reachM, pl.axesM.map((x) => Math.round(x * REACH_SHARE * 10) / 10));
  assert.equal(pl.majorM, a);
  assert.equal(pl.holes, 8);
});

test("too few composites, too few holes, or a line: the sphere (null)", () => {
  assert.equal(shellPlaneSearch(body.slice(0, PLANE_MIN_COMPOSITES - 1), 60), null);
  assert.equal(shellPlaneSearch(body.map((p) => ({ ...p, hole_id: p.hole_id < "H3" ? p.hole_id : "H0" })), 60), null);
  assert.equal(shellPlaneSearch(Array.from({ length: 40 }, (_, i) => ({ hole_id: `L${i % 5}`, x: i, y: 2 * i, z: 3 * i })), 60), null);
  assert.equal(shellPlaneSearch(body, 0), null);
});

test("the reach: nodes at the cut-off beyond it lowered under the cut-off, near ones kept, those below the cut-off untouched", () => {
  const grid = { nx: 3, ny: 1, nz: 1, origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 10, dy: 10, dz: 10 } };
  const basis = { major: { x: 0, y: 1, z: 0 }, semiMajor: { x: 0, y: 0, z: -1 }, minor: { x: 1, y: 0, z: 0 } }, scales = { major: 1, semiMajor: 2, minor: 6 };
  // one composite at x 0; the reach 12 m along y, 2 m across (x, the minor axis): the node at x 10 and x 20 are across the plane
  const r = reachCutField(Float64Array.from([5, 5, 1]), grid, 2, { points: [{ x: 0, y: 0, z: 0 }], basis, scales, limM: 12 });
  assert.equal(r.cut, 1);
  assert.equal(r.values[0], 5);
  assert.ok(r.values[1] < 2, `${r.values[1]}`);
  assert.equal(r.values[2], 1);
  // along the plane (y) the same 10 m is within the reach
  const g2 = { ...grid, nx: 1, ny: 3 };
  assert.equal(reachCutField(Float64Array.from([5, 5, 5]), g2, 2, { points: [{ x: 0, y: 0, z: 0 }], basis, scales, limM: 12 }).cut, 1, "y 20 m is beyond 12 m, y 10 m is not");
  assert.equal(reachCutField(Float64Array.from([5]), { ...grid, nx: 1 }, 2, null).cut, 0);
});

test("on the body: the ellipsoid along the plane and the reach make a thinner shell that still holds the composites", () => {
  const halo = body.concat(body.map((p, i) => ({ ...p, hole_id: p.hole_id, x: p.x + 30 * normal.x * (i % 2 ? 1 : -1), z: p.z + 30 * normal.z * (i % 2 ? 1 : -1), value: 0.1 })));
  const bounds = { xmin: -120, xmax: 120, ymin: -130, ymax: 130, zmin: 380, zmax: 620 }, cellSize = { dx: 10, dy: 10, dz: 10 };
  const base = { bounds, cellSize, method: "idw2", minSamples: 1, maxSamples: 16, minHoles: 2 };
  const count = (v) => v.reduce((n, x) => n + (x >= 2 ? 1 : 0), 0);
  const sphere = estimateDenseGrid(halo, { ...base, searchRadius: 60 });
  const pl = shellPlaneSearch(body, 60);
  const ell = estimateDenseGrid(halo, { ...base, searchRadius: pl.majorM, trend: { basis: pl.basis, scales: pl.scales } });
  const cut = reachCutField(ell.values, ell, 2, { points: body, basis: pl.basis, scales: pl.scales, limM: pl.majorM * pl.reachShare });
  assert.ok(count(cut.values) < count(sphere.values), `${count(cut.values)} < ${count(sphere.values)}`);
  assert.ok(count(cut.values) > 0);
});

test("the wiring: each drilled area's plane in the estimate and the worker's reach cut, off with the pane's tick", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const planeLib = workerPost && numericSearchRadius > 0 && shellPlaneSearchOn\(\) \?/);
  assert.match(r, /searchRadius: planes\[bi\] \? planes\[bi\]\.majorM : searchInGrid/);
  assert.match(r, /\.\.\.\(planes\[bi\] \? \{ trend: \{ basis: planes\[bi\]\.basis, scales: planes\[bi\]\.scales \} \} : \{\}\)/);
  assert.match(r, /reach: planes\[bi\] \? \{ points: /);
  assert.match(r, /searchPlanes: planes\.map/);
  assert.match(r, /localStorage\.getItem\("geostrix\.shellPlaneSearch"\) !== "0"/);
  const p = readFileSync(new URL("../src/lib/viewer/shellPost.js", import.meta.url), "utf8");
  assert.match(p, /const reached = post\.reach \? reachCutField\(grid\.values, grid, iso, post\.reach\)/);
  assert.match(p, /capFieldAtColumns\(reached\.values,/);
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /tr\("Search along the composites' plane"\)/);
});
