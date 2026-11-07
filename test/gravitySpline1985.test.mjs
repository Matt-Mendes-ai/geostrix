// TASKS.csv #1985 — gravity reductions (Boule normal gravity, Harmonica Bouguer plate / terrain prisms) and the Verde spline in the
// Python engine. The maths is checked in python-sidecar/tests/test_pfields.py (check_gravred: Somigliana, the free-air gradient, the
// plate, a flat terrain against the slab; check_spline: a smooth surface from 600 noisy samples); this pins the app's half.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridSamples, splineRequest, splineFinish, gridMethodParts, SPLINE_MAX_CELLS } from "../src/lib/sampleGrid.js";
import { terrainGrid, looksAbsoluteGravity } from "../src/lib/gravityReduction.js";
import { b64ToF32 } from "../src/lib/inversion.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const samples = [];
for (let i = 0; i < 12; i++) for (let j = 0; j < 10; j++) samples.push({ x: 500000 + i * 50, y: 6000000 + j * 50, medium: "soil", values: { Cu: 10 + i + 2 * j } });

test("spline: the request is the same grid IDW lays out, and the result is blanked and un-logged like it", () => {
  const opts = { log: true, cellM: 25, blankM: 60 };
  const sp = splineRequest(samples, "Cu", opts);
  assert.equal(sp.request.op, "spline");
  assert.equal(sp.request.x.length, 120);
  assert.ok(Math.abs(sp.request.value[0] - Math.log10(10)) < 1e-12, "log10 values go to the engine");
  const idw = gridSamples(samples, "Cu", opts);
  assert.equal(sp.request.nx, idw.grid.nx); assert.equal(sp.request.ny, idw.grid.ny);
  assert.equal(sp.request.x0, idw.grid.x0); assert.equal(sp.request.yTop, idw.grid.yTop); assert.equal(sp.request.cell, 25);
  // the engine's values: log10(20) everywhere -> 20 in the unit, NaN where IDW has none
  const vals = new Float32Array(sp.request.nx * sp.request.ny).fill(Math.log10(20));
  const r = splineFinish(sp.plan, vals, { damping: 1e-4, score: 0.93, points: 120, blockM: 25, cvBlockM: 62.5 });
  assert.equal(r.cvBlockM, 62.5);
  let same = true;
  for (let i = 0; i < vals.length; i++) if (Number.isFinite(r.grid.values[i]) !== Number.isFinite(idw.grid.values[i])) same = false;
  assert.ok(same, "the blanking matches IDW's");
  const v = [...r.grid.values].find(Number.isFinite);
  assert.ok(Math.abs(v - 20) < 1e-3, `back in ppm: ${v}`);
  assert.equal(r.valid, idw.valid);
  assert.deepEqual([r.method, r.damping, r.cvScore, r.splinePoints, r.blockM], ["spline", 1e-4, 0.93, 120, 25]);
  assert.deepEqual(r.bbox, idw.bbox);
  // the plan view's legend names the method (it read "IDW power 2" for a spline raster at first)
  assert.equal(gridMethodParts({ method: "spline", cellM: 25 }).method, "spline");
  assert.ok(read("src/components/MapsPlanView.jsx").includes('g.method === "spline" ? tr("spline")'));
});

test("spline: too few samples, and a grid over the engine's cap", () => {
  assert.equal(splineRequest(samples.slice(0, 2), "Cu", {}).error, "few");
  const big = splineRequest(samples, "Cu", { cellM: 0.4, maxCells: 1e9 });
  assert.equal(big.error, "splineCells");
  assert.ok(big.nx * big.ny > SPLINE_MAX_CELLS);
});

test("gravity: absolute or anomaly, and the terrain as the engine's grid", () => {
  assert.equal(looksAbsoluteGravity(979812.4), true);
  assert.equal(looksAbsoluteGravity(-93.7), false);
  assert.equal(looksAbsoluteGravity(NaN), false);
  const t = { bbox: [1000, 2000, 1300, 2200], gridW: 4, gridH: 3, elevations: new Float64Array([1, 2, 3, 4, 5, NaN, 7, 8, 9, 10, 11, 12]) };
  const g = terrainGrid(t);
  assert.deepEqual([g.nx, g.ny, g.dx, g.dy, g.x0, g.yTop], [4, 3, 100, 100, 1000, 2200]);
  const v = b64ToF32(g.values);
  assert.equal(v.length, 12); assert.equal(v[0], 1); assert.ok(Number.isNaN(v[5])); assert.equal(v[11], 12);
});

test("wiring: the engine's ops, the Geophysics button and the gridding method", () => {
  const pf = read("python-sidecar/app/geophys/pfields.py"), main = read("python-sidecar/app/main.py");
  assert.ok(pf.includes('if op == "gravred":') && pf.includes('if op == "spline":'));
  assert.ok(pf.includes("bl.WGS84.normal_gravity((lon, lat, h))") && pf.includes("hm.bouguer_correction(h, density_crust=density)") && pf.includes("hm.prism_layer((easting, northing), surface=topo, reference=0"));
  assert.ok(pf.includes("vd.SplineCV(dampings=SPLINE_DAMPINGS, cv=cv)") && pf.includes("vd.BlockKFold("));
  assert.ok(main.includes("op must be 'euler', 'eqs', 'gravred' or 'spline'."));
  const gm = read("src/modules/GeophysicsModule.jsx");
  assert.ok(gm.includes("React.lazy(() => import(\"../components/GravityReductionBox.jsx\"))"));
  assert.ok(gm.includes("[\"grav\", \"grav_fa\"].includes(meta.method)"));
  const box = read("src/components/GravityReductionBox.jsx");
  assert.ok(box.includes('op: "gravred"') && box.includes('method: "grav_fa"') && box.includes("reprojectXY(r.x, r.y, epsg, 4326)"));
  const panel = read("src/components/SampleGridPanel.jsx");
  assert.ok(panel.includes('<option value="spline">') && panel.includes("runPfieldsJob(sp.request"));
  assert.ok(read("python-sidecar/tests/test_pfields.py").includes("check_spline"));
});
