// TASKS.csv #1690 — a closed surface's tonnage box offers the measured SG: the mean of the SG intervals inside the solid, or the layer's mean.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sgInsideSolid } from "../src/lib/sgInSolid.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// A 100 m cube from (0,0,-100) to (100,100,0), 12 outward triangles.
const P = [0,0,-100, 100,0,-100, 100,100,-100, 0,100,-100, 0,0,0, 100,0,0, 100,100,0, 0,100,0];
const I = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
// A vertical hole through the cube's centre, collar at z = +50, 200 m deep.
const traces = [{ hole_id: "H1", pts: [{ md: 0, x: 50, y: 50, z: 50 }, { md: 200, x: 50, y: 50, z: -150 }] }];

test("only the intervals whose midpoints fall inside count, length-weighted", () => {
  const rows = [
    { hole_id: "H1", from: 10, to: 20, value: 2.5 },   // z 40..30: above the cube
    { hole_id: "H1", from: 60, to: 70, value: 3.0 },   // inside
    { hole_id: "H1", from: 100, to: 130, value: 2.8 }, // inside, three times as long
    { hole_id: "H1", from: 170, to: 180, value: 2.2 }, // below the cube
    { hole_id: "H1", from: 80, to: 90, value: 12 },    // inside but outside 1-8: left out and counted
    { hole_id: "H2", from: 60, to: 70, value: 3.5 },   // no trace
  ];
  const s = sgInsideSolid(rows, traces, P, I);
  assert.equal(s.n, 2);
  assert.equal(s.left, 1);
  assert.equal(s.mean, +((3.0 * 10 + 2.8 * 30) / 40).toFixed(3));
  assert.deepEqual([s.min, s.max], [2.8, 3.0]);
});

test("nothing inside, or no mesh -> null", () => {
  assert.equal(sgInsideSolid([{ hole_id: "H1", from: 10, to: 20, value: 2.5 }], traces, P, I), null);
  assert.equal(sgInsideSolid([{ hole_id: "H1", from: 60, to: 70, value: 3 }], traces, P, []), null);
  assert.equal(sgInsideSolid([], traces, P, I), null);
});

test("the tonnage box offers both, stamps the source, and the viewer uses it", () => {
  const c = read("src/modules/viewer/SurfaceTonnage.jsx");
  assert.match(c, /Use the SG inside this solid/);
  assert.match(c, /Use the SG layer's mean/);
  assert.match(c, /kind: "inside"/);
  assert.match(c, /onDensity\(e\.target\.value === "" \? "" : Number\(e\.target\.value\), null\)/); // typing clears the stamp
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /<SurfaceTonnage s=\{s\}/);
  assert.match(v, /\{ \.\.\.s, density, densityFrom \}/);
});

test("the density captions round the layer's raw min / max to two decimals (#2068)", () => {
  const c = read("src/modules/viewer/SurfaceTonnage.jsx");
  assert.match(c, /const r2 = \(v\) => String\(\+Number\(v\)\.toFixed\(2\)\);/);
  assert.match(c, /const range = \(s\) => `\$\{r2\(s\.min\)\}–\$\{r2\(s\.max\)\}`;/);
  assert.match(c, /min: r2\(whole\.min\), max: r2\(whole\.max\)/);
});
