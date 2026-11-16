// TASKS.csv #3829 — the block models and surfaces on the Maps plan: a model's footprint, its level slice in its own colours, a surface's outline and cut.
// SYNTHETIC cells and meshes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelExtent, modelFootprintBoundary, modelLevelSlice, sliceColours, propertyUnit, surfaceOutlineBoundary, surfaceCutBoundary } from "../src/lib/planModels.js";

// 6 x 4 x 3 cells, 50 x 50 x 20 m, centres from (125, 75, 190): the value rises with easting and falls with depth; one column of the middle layer is a void (NaN skipped)
const cells = [];
for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) cells.push({ x: 125 + i * 50, y: 75 + j * 50, z: 190 - k * 20, dx: 50, dy: 50, dz: 20, value: 10 + i * 5 - k * 2 });
const model = { id: "m1", name: "IP chargeability", property: "Chargeability (mV/V)", cells, min: 0, max: 60, stops: [{ value: 0, color: "#0000ff" }, { value: 60, color: "#ff0000" }], colorMode: "continuous" };

test("the footprint is the rectangle round the cells", () => {
  const e = modelExtent(model);
  assert.deepEqual(e.box, [100, 50, 400, 250]); assert.equal(e.zmin, 140); assert.equal(e.zmax, 200); assert.equal(e.n, 72);
  const b = modelFootprintBoundary(model);
  assert.equal(b.polylines[0].length, 5); assert.deepEqual(b.closedFlags, [true]); assert.match(b.name, /IP chargeability footprint/);
  assert.equal(modelFootprintBoundary({ cells: [] }), null);
});

test("a level slice: the cells that hold the level, on the cells' own grid, row 0 north", () => {
  const s = modelLevelSlice(model, 185);
  assert.equal(s.nx, 6); assert.equal(s.ny, 4); assert.equal(s.dx, 50); assert.equal(s.valid, 24); assert.equal(s.cells, 24);
  assert.equal(s.values[0], 10); // the north-west node: i = 0, the northern row j = 3, layer k = 0
  assert.equal(s.values[5], 35); // the north-east node
  assert.deepEqual(s.bbox, [100, 50, 400, 250]);
  assert.equal(s.x0, 125); assert.equal(s.yTop, 225);
  const deeper = modelLevelSlice(model, 165); // the third layer (z 150, spans 140-160)? 165 is the second (160-180)
  assert.equal(deeper.values[0], 8);
  assert.equal(modelLevelSlice(model, 200).valid, 24); // the top face of the model is its top layer
  const out = modelLevelSlice(model, 500);
  assert.equal(out.error, "outside"); assert.equal(out.zmax, 200);
});

test("a level between two layers goes to the layer below (half-open spans) and a finer cell layer is painted by every node it covers", () => {
  const mixed = { cells: [{ x: 50, y: 50, z: 0, dx: 100, dy: 100, dz: 10, value: 7 }, { x: 150, y: 25, z: 0, dx: 50, dy: 50, dz: 10, value: 9 }] };
  const s = modelLevelSlice(mixed, 0);
  assert.equal(s.dx, 75); // the median of 100 and 50 is a node size of 75
  assert.ok(s.valid >= 2);
  assert.equal(Math.max(...s.values.filter(Number.isFinite)), 9);
});

test("a big slice is made coarser to stay light", () => {
  const big = { cells: [{ x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, value: 1 }, { x: 4000, y: 4000, z: 0, dx: 1, dy: 1, dz: 1, value: 2 }] };
  const s = modelLevelSlice(big, 0, { maxCells: 10000 });
  assert.ok(s.nx * s.ny <= 12000 && s.coarsened, `${s.nx} x ${s.ny}`);
});

test("the slice is coloured by the model's own ramp: low blue, high red; log-spaced for a resistivity", () => {
  const s = modelLevelSlice(model, 185), c = sliceColours(model, s.values);
  assert.equal(c.rgba[3], 255);
  const lo = [c.rgba[0], c.rgba[1], c.rgba[2]], hiK = 5 * 4, hi = [c.rgba[hiK], c.rgba[hiK + 1], c.rgba[hiK + 2]];
  assert.ok(lo[2] > lo[0] && hi[0] > hi[2], `${lo} / ${hi}`);
  assert.equal(c.lo, 10); assert.equal(c.hi, 35); assert.equal(c.stops.length, 8);
  const res = { stops: [{ value: 1, color: "#000000" }, { value: 10000, color: "#ffffff" }], colorMode: "continuous" };
  const vals = Float32Array.from([1, 10, 100, 1000, 10000, NaN]), r = sliceColours(res, vals);
  assert.ok(r.rgba[1 * 4] < 10, String(r.rgba[4])); assert.equal(r.rgba[4 * 4], 255); // the stops are linear in value: 10 ohm.m is still almost black, 10,000 white; the lookup keeps the low decades
  assert.equal(r.rgba[5 * 4 + 3], 0); // a void stays transparent
});

test("property unit from the property's name", () => {
  assert.equal(propertyUnit("Chargeability (mV/V)"), "mV/V"); assert.equal(propertyUnit("Resistivity (ohm·m)"), "ohm·m"); assert.equal(propertyUnit("grade"), "");
});

// a plane dipping east, z = 100 - 0.5 (x - 1000), over x 1000-1200, y 0-100: two triangles' worth of grid (3 x 2 vertices)
const sf = { id: "s1", name: "Isosurface 1", vertices: [1000, 0, 100, 1100, 0, 50, 1200, 0, 0, 1000, 100, 100, 1100, 100, 50, 1200, 100, 0], indices: [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4] };

test("a surface's outline is the hull of its vertices; its cut at a level is the line where it crosses", () => {
  const o = surfaceOutlineBoundary(sf);
  assert.equal(o.polylines[0].length, 5); assert.match(o.name, /Isosurface 1 outline/);
  const cut = surfaceCutBoundary(sf, 75);
  assert.equal(cut.polylines.length, 1); assert.equal(cut.segments, 2);
  const xs = cut.polylines[0].map((p) => p.x);
  assert.ok(xs.every((x) => Math.abs(x - 1050) < 1e-6), String(xs)); // z = 75 at x = 1050, a straight line along y
  assert.equal(cut.polylines[0].length, 3); assert.deepEqual(cut.polylines[0].map((p) => p.y).sort((a, b) => a - b), [0, 50, 100]); // the two segments joined at the shared vertex
  assert.equal(surfaceCutBoundary(sf, 500), null);
  assert.equal(surfaceOutlineBoundary({ vertices: [0, 0, 0] }), null);
});

test("a closed isosurface cut: the segments join into one closed line", () => {
  // an octahedron round (0, 0, 0): its cut at z = 0 is a square
  const v = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  const idx = [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5];
  const c = surfaceCutBoundary({ name: "Octa", vertices: v, indices: idx }, 0.25 - 0.25 + 0.0001);
  assert.equal(c.polylines.length, 1); assert.equal(c.closedFlags[0], true);
});

test("wiring: the plan's layer chip lists the models and surfaces, and the component adds the boundary or the raster", () => {
  const m = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(m, /<PlanModelsList \/>/); assert.match(m, /voxelModels\.length > 0 \|\| generatedSurfaces\.length > 0\) && \( \/\* TASKS\.csv #3463/);
  const c = readFileSync(new URL("../src/components/PlanModelsList.jsx", import.meta.url), "utf8");
  assert.match(c, /addBoundary\(b\)/); assert.match(c, /addRaster\(\{/); assert.match(c, /Level slice to Maps/);
});
