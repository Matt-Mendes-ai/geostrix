// TASKS.csv #3673 phase 2 — updating an imported domain with new drilling (lib/viewer/domainUpdate.js; shellPost's update step; the pane's
// section and run). Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { meshInsideMask, meshInsideTester, squaredDistanceTo, signedDistance, priorField, blendWithPrior, updateReport, holeYear } from "../src/lib/viewer/domainUpdate.js";
import { shellPost } from "../src/lib/viewer/shellPost.js";
import { estimateDenseGrid } from "../src/lib/estimation.js";
import { indicatorPoints } from "../src/lib/viewer/shellEnvelope.js";

// a closed box mesh, x 0..200, y 0..200, z 0..100 (outward triangles)
function box(x0, x1, y0, y1, z0, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { positions: Float64Array.from(v.flat()), indices: Uint32Array.from(f.flat()) };
}
const dom = box(0, 200, 0, 200, 0, 100);
const grid = { nx: 31, ny: 31, nz: 21, origin: { x: -50, y: -50, z: -50 }, cellSize: { dx: 10, dy: 10, dz: 10 } };
const at = (i, j, k) => i + grid.nx * (j + grid.ny * k), nodeAt = (x, y, z) => at((x + 50) / 10, (y + 50) / 10, (z + 50) / 10);

test("the old mesh on the grid: inside by vertical rays, a point tester, an exact distance transform, a signed distance, the prior", () => {
  const m = meshInsideMask(dom.positions, dom.indices, grid);
  assert.equal(m[nodeAt(100, 100, 50)], 1);
  assert.equal(m[nodeAt(250, 100, 50)], 0);
  assert.equal(m[nodeAt(100, 100, 150)], 0);
  const ins = meshInsideTester(dom.positions, dom.indices);
  assert.equal(ins(10, 10, 10), true); assert.equal(ins(-10, 10, 10), false);
  const d2 = squaredDistanceTo(m, grid, 1);
  assert.equal(d2[nodeAt(250, 100, 50)], 50 * 50, "50 m to the nearest inside node (x 200)");
  const sd = signedDistance(m, grid);
  assert.ok(sd[nodeAt(100, 100, 50)] > 40, "deep inside: positive");
  assert.ok(sd[nodeAt(250, 100, 50)] < -40, "outside: negative");
  const p = priorField(sd, 10);
  assert.ok(p[nodeAt(100, 100, 50)] > 0.98 && p[nodeAt(250, 100, 50)] < 0.02);
  // with no new data the blend is the prior
  const b = blendWithPrior(p, new Float64Array(p.length).fill(NaN), [], grid, 40);
  assert.deepEqual([...b.values.slice(0, 50)], [...p.slice(0, 50)]);
});

test("the update: the old domain kept where nothing is new, grown next to a new hole with grade just outside it; the report says which hole", () => {
  const comp = (h, x, y, z, v) => ({ hole_id: h, x, y, z, value: v, length: 2 });
  // older holes: inside at grade (a few below, the dilution), outside barren
  const older = [];
  for (const [hx, hy] of [[40, 40], [160, 40], [40, 160], [160, 160], [100, 100]]) for (let z = -40; z <= 140; z += 2) older.push(comp(`O${hx}${hy}`, hx, hy, z, z >= 0 && z <= 100 ? (z % 10 === 0 ? 0.1 : 1) : 0.05));
  // new: N1 through the middle agrees; N2 just east of the east face with grade from z 20 to 80
  const fresh = [];
  for (let z = -40; z <= 140; z += 2) fresh.push(comp("N1", 120, 80, z, z >= 0 && z <= 100 ? (z % 10 === 0 ? 0.1 : 1) : 0.05));
  for (let z = -40; z <= 140; z += 2) fresh.push(comp("N2", 225, 100, z, z >= 20 && z <= 80 ? 1 : 0.05));
  const S = 40, cutoff = 0.5;
  const g = estimateDenseGrid(indicatorPoints(fresh, cutoff), { bounds: { xmin: -55, xmax: 255, ymin: -55, ymax: 255, zmin: -55, zmax: 155 }, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "idw2", searchRadius: 2 * S, minSamples: 1, maxSamples: 16, minHoles: 1 });
  const atCut = [...fresh, ...older].filter((q) => q.value >= cutoff);
  const post = shellPost(g, { iso: 0.5, closeOutside: true, inShellPoints: [], update: { positions: dom.positions, indices: dom.indices, widthM: S / 2, influenceM: S, newPoints: fresh, reportPoints: fresh, refPoints: older, cutoff, nearM: S },
    envelope: { clean: { keepPoints: atCut, keepHoles: 1 }, targetTriangles: 100000, smooth: { iterations: 10 }, gradePoints: [...fresh, ...older], cutoff } });
  const r = post.update;
  assert.ok(post.faces.length > 0);
  assert.ok(r.addedM3 > 0, "grown next to N2");
  assert.ok(r.removedM3 < 0.1 * r.oldM3, `kept: removed ${r.removedM3} of ${r.oldM3}`);
  assert.ok(Math.abs(r.newM3 - r.oldM3) / r.oldM3 < 0.25);
  const st = Object.fromEntries(r.holes.map((h) => [h.hole_id, h.status]));
  assert.equal(st.N1, "agrees");
  assert.equal(st.N2, "grade outside");
  assert.ok(r.reference.insideShare >= 0.79 && r.reference.outsideShare < 0.1, JSON.stringify(r.reference));
  assert.ok(r.atCutOutside.n > 0 && r.atCutOutside.m > 0);
});

test("the report's arithmetic", () => {
  const g = { nx: 2, ny: 1, nz: 1, origin: { x: 0, y: 0, z: 0 }, cellSize: { dx: 10, dy: 10, dz: 10 }, sd: Float64Array.from([5, -5]) };
  const r = updateReport({ oldMask: Uint8Array.from([1, 0]), newMask: Uint8Array.from([1, 1]), grid: g, points: [], refPoints: [], insideOld: () => false, cutoff: 1, nearM: 10 });
  assert.deepEqual([r.oldM3, r.newM3, r.addedM3, r.removedM3], [1000, 2000, 1000, 0]);
});

test("a hole's year: the collar's year field, else the id's YY", () => {
  assert.equal(holeYear({ hole_id: "X1", attrs: { year: 2019 } }), 2019);
  assert.equal(holeYear({ hole_id: "X1", attrs: { drill_year: "2021" } }), 2021);
  assert.equal(holeYear({ hole_id: "DH-25-012" }), 2025);
  assert.equal(holeYear({ hole_id: "DH25012" }), null);
  assert.equal(holeYear({ hole_id: "X", attrs: { year: "2019?" } }), null);
});

test("the wiring: the worker's update step, the pane's section, the run", () => {
  const s = readFileSync(new URL("../src/lib/viewer/shellPost.js", import.meta.url), "utf8");
  assert.match(s, /const b = blendWithPrior\(priorField\(upSd, up\.widthM\), grid\.values, up\.newPoints, grid, up\.influenceM\);/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /<DomainUpdateSection ctx=\{\{ implicitSurfaces,/);
  const d = readFileSync(new URL("../src/modules/viewer/DomainUpdateSection.jsx", import.meta.url), "utf8");
  assert.match(d, /const \{ runDomainUpdate \} = await import\("\.\/domainUpdateRun\.js"\)/);
  const u = readFileSync(new URL("../src/modules/viewer/domainUpdateRun.js", import.meta.url), "utf8");
  assert.match(u, /update: \{ positions: P, indices: I, widthM: S \/ 2, influenceM: S,/);
  assert.match(u, /tool: "domain update"/);
});
