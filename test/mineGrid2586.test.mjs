// TASKS.csv #2586 (review #2486, WA lithium) — a project on MGA carries its mine grid: a file with no CRS whose coordinates lie on that grid
// is read on it; one that does not is told how far from the collars it landed; the tie can be fitted from collars carrying both pairs
import test from "node:test";
import assert from "node:assert/strict";
import { tieFromOrigin, tieFromControlPoints, localToWorld } from "../src/lib/localGridTie.js";
import { mineGridOf, readsAsMineGrid, kmFromCollars, collarCoordinateFields, collarControlText, mineToProject } from "../src/lib/mineGrid.js";
import { vectorToBoundaryPolylines } from "../src/lib/boundaryImport.js";
import { buildLayer } from "../src/lib/mapLayerBuild.js";

// a mine grid rotated 15.65° and shifted to MGA zone 50 near the review's collars (the reviewer's SYNTHETIC truth: 9,500 E / 10,700 N of
// the grid is near 413,601.6 / 6,251,524.7)
const tie = tieFromOrigin({ lx: 9500, ly: 10700, wx: 413601.6, wy: 6251524.7, rotationDeg: 15.65, scale: 1, epsg: 28350 });
const project = { epsg: 28350, crsSet: true, mineGrid: { name: "GBMG", tie } };
const mg = mineGridOf(project);
const collars = [[9600, 10800], [10400, 10900], [9900, 11600], [10200, 11300]].map(([e, n], i) => { const w = localToWorld(tie, e, n); return { hole_id: `H${i}`, x: w.x, y: w.y, z: 300, attrs: { GBMG_East: e, GBMG_North: n } }; });
const square = [[[9500, 10700], [10500, 10700], [10500, 11700], [9500, 11700], [9500, 10700]]]; // the reviewer's 1 km pit limit, mine grid

test("only a CRS project with a valid tie has a mine grid", () => {
  assert.equal(mg.name, "GBMG");
  assert.equal(mineGridOf({ ...project, crsSet: false }), null); // a no-CRS project keeps project.localGrid (#2180)
  assert.equal(mineGridOf({ epsg: 28350, crsSet: true }), null);
});

test("a no-CRS file is read on the mine grid where the collars are on it, not where they are in MGA", () => {
  assert.equal(readsAsMineGrid([9500, 10700, 10500, 11700], mg, collars, 28350), true);
  const b = collars.map((c) => [c.x, c.y]);
  const mgaBox = [Math.min(...b.map((q) => q[0])), Math.min(...b.map((q) => q[1])), Math.max(...b.map((q) => q[0])), Math.max(...b.map((q) => q[1]))];
  assert.equal(readsAsMineGrid(mgaBox, mg, collars, 28350), false); // already in MGA beside the collars
  assert.equal(readsAsMineGrid([500000, 7000000, 501000, 7001000], mg, collars, 28350), false); // somewhere else
  assert.equal(readsAsMineGrid([9500, 10700, 10500, 11700], null, collars, 28350), false);
  const [x, y] = mineToProject(mg, 28350)(9500, 10700);
  assert.ok(Math.abs(x - 413601.6) < 1e-6 && Math.abs(y - 6251524.7) < 1e-6);
});

test("a boundary with no .prj lands on the collars through the mine grid; without one it says how far off it is", async () => {
  const parsed = { features: [{ geometry: square[0] }], geomType: "polygon", epsg: null, prjWkt: null };
  const r = await vectorToBoundaryPolylines(parsed, 28350, { mineGrid: mg, collars });
  assert.equal(r.mineGrid, true);
  assert.match(r.note, /lie on the project's mine grid \(GBMG\) where the collars are/);
  assert.ok(Math.abs(r.polylines[0][0].x - 413601.6) < 1e-6);
  const r2 = await vectorToBoundaryPolylines(parsed, 28350, { collars });
  assert.match(r2.note, /it states no CRS: .* \(it landed [\d,]+ km from the collars\)/);
  assert.ok(kmFromCollars([9500, 10700, 10500, 11700], collars) > 6000);
});

test("a map layer with no CRS is read on the mine grid too", () => {
  const layer = buildLayer({ features: [{ geometry: square[0], parts: square, attributes: {} }], geomType: "polygon", epsg: null, prjWkt: null, fields: [] }, { sourceName: "pit", projectEpsg: 28350, mineGrid: mg, collars });
  assert.match(layer.crsNote || JSON.stringify(layer), /mine grid/);
});

test("the tie from collars that carry both pairs", () => {
  assert.deepEqual(collarCoordinateFields(collars).sort(), ["GBMG_East", "GBMG_North"]);
  const t = tieFromControlPoints(collarControlText(collars, "GBMG_East", "GBMG_North"), 28350);
  assert.ok(t.rmsM < 1e-6 && Math.abs(t.rotationDeg - 15.65) < 1e-9 && Math.abs(t.scale - 1) < 1e-12);
});
