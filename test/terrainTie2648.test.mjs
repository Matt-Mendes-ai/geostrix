// TASKS.csv #2648 — a tied local grid: a DEM file with a CRS tag, terrain fetched online and Satellite / Spectral imagery come into the
// grid through the tie (to the tie's CRS, then resampled onto the grid's own north), and their fetch areas go to lon / lat through it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeArrayBuffer } from "geotiff";
import { parseDEMFiles } from "../src/lib/raster.js";
import { tieDemGridToLocal, tieTerrainToLocal, tieWorldBox } from "../src/lib/terrainTie.js";
import { tieFromOrigin, localToWorld } from "../src/lib/localGridTie.js";
import { fillNoData, decodeNoDataMask, isNoData } from "../src/lib/demFill.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

// SYNTHETIC: a plane in MGA zone 50 metres, and a grid tied to it at 30 degrees
const plane = (X, Y) => 300 + 0.01 * (X - 400000) + 0.005 * (Y - 6500000);
const tie = tieFromOrigin({ lx: 1000, ly: 2000, wx: 400000, wy: 6500000, rotationDeg: 30, scale: 1, epsg: 28350 });
const nodeAt = (t, x, y) => { const [x0, y0, x1, y1] = t.bbox, i = Math.round(((x - x0) / (x1 - x0)) * (t.gridW - 1)), j = Math.round(((y1 - y) / (y1 - y0)) * (t.gridH - 1)); return j * t.gridW + i; };

test("#2648 a DEM file tagged in the tie's CRS comes into the grid through the tie", async () => {
  const N = 601, d = 10, X0 = 397000, Y1 = 6503000; // 6 x 6 km
  const v = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) v[j * N + i] = plane(X0 + i * d, Y1 - j * d);
  const buf = writeArrayBuffer(v, { width: N, height: N, ModelPixelScale: [d, d, 0], ModelTiepoint: [0, 0, 0, X0 - d / 2, Y1 + d / 2, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 28350 });
  const file = { name: "syn.tif", arrayBuffer: async () => buf };
  const t = await parseDEMFiles([file], null, null, { tie, cropTo: [500, 1500, 2500, 3500], gridMax: 200 });
  assert.equal(t.reprojectedTo, null);
  assert.ok(Math.abs(t.srcCellM - 10) < 0.5, String(t.srcCellM)); // the file's 10 m cell, measured before the tie
  assert.match(t.tiedNote, /EPSG:28350 \(this file's own CRS tag\) was brought into the local grid through the grid's tie/);
  // the box is in the grid's numbers, around the crop
  assert.deepEqual(t.bbox.map((v) => Math.round(v)), [460, 1460, 2540, 3540]); // the crop box (+2 %), not the turned read window
  for (const [x, y] of [[1000, 2000], [1500, 2500], [700, 3300]]) {
    const w = localToWorld(tie, x, y), z = t.elevations[nodeAt(t, x, y)];
    assert.ok(Math.abs(z - plane(w.x, w.y)) < 0.5, `${x},${y}: ${z} vs ${plane(w.x, w.y)}`);
  }
  // the same file without a tie keeps the MGA numbers
  const plain = await parseDEMFiles([file], 28350, null, { gridMax: 100 });
  assert.ok(plain.bbox[0] > 390000 && !plain.tiedNote);
});

test("#2648 a filled terrain is resampled into the grid with its no-data kept", () => {
  const gridW = 101, gridH = 101, bbox = [399000, 6499000, 401000, 6501000], dx = 20;
  const raw = new Float32Array(gridW * gridH);
  for (let j = 0; j < gridH; j++) for (let i = 0; i < gridW; i++) raw[j * gridW + i] = i < 10 ? NaN : plane(bbox[0] + i * dx, bbox[3] - j * dx); // a no-data strip on the west
  const fill = fillNoData(raw);
  const local = tieTerrainToLocal({ name: "fetched", bbox, gridW, gridH, elevations: fill.elevations, noDataMask: fill.noDataMask, reprojectedTo: 28350 }, tie, 28350, 120);
  assert.equal(local.name, "fetched");
  assert.equal(local.reprojectedTo, null);
  assert.ok(Array.isArray(local.elevations) && local.noDataMask);
  const mask = decodeNoDataMask(local.noDataMask);
  const at = (x, y) => nodeAt(local, x, y);
  assert.ok(!isNoData(mask, at(1000, 2000)));
  const w = localToWorld(tie, 1000, 2000);
  assert.ok(Math.abs(local.elevations[at(1000, 2000)] - plane(w.x, w.y)) < 0.5);
  // a grid point over the west strip (world x < 399,200) is no-data
  const west = { x: 399100, y: 6500000 }, dxw = west.x - tie.tx, dyw = west.y - tie.ty, dd = tie.a * tie.a + tie.b * tie.b;
  const lw = { x: (tie.a * dxw + tie.b * dyw) / dd, y: (-tie.b * dxw + tie.a * dyw) / dd };
  assert.ok(isNoData(mask, at(lw.x, lw.y)));
  // nothing over the grid -> null
  assert.equal(tieDemGridToLocal({ bbox, gridW: 2, gridH: 2, values: new Float32Array(4).fill(NaN) }, tie, 28350), null);
});

test("#2648 a local box in the tie's CRS", () => {
  const b = tieWorldBox(tieFromOrigin({ lx: 0, ly: 0, wx: 500000, wy: 7000000, rotationDeg: 90, scale: 1, epsg: 28350 }), [0, 0, 100, 50]);
  assert.deepEqual(b.map((v) => Math.round(v)), [499950, 7000000, 500000, 7000100]);
});

test("#2648 the terrain, satellite and spectral flows go through the tie", () => {
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /parseDEMFiles\(files, tie \? null : project\?\.epsg, [^;]*tie, chooseProjectEpsg/);
  assert.match(g, /if \(project\?\.crsSet === false && !tieOf\(project\)\) \{ \/\/ #2648/);
  assert.match(g, /tieTerrainToLocal\(parsed, tie, targetEpsg, terrainDetail\)/);
  assert.match(g, /if \(parsed\.tiedNote\) msg \+= " " \+ parsed\.tiedNote;/);
  assert.match(g, /const srcCell = parsed\.srcCellM \?\? /);
  assert.match(g, /const lonLatOf = \(x, y\) => \{ const tie = tieOf\(project\)/);
  assert.doesNotMatch(g, /toLonLat\(x, y, project\.epsg\)\)\)/);
  const r = read("modules/RasterModule.jsx");
  assert.match(r, /tieFetchedImage\(r, tie, opts\.targetEpsg/);
  assert.match(r, /targetEpsg: tie \? Number\(tie\.epsg\) : project\.epsg/);
  assert.match(r, /<SpectralIndexModal epsg=\{tieOf\(project\) \? null : project\?\.epsg\} tie=\{tieOf\(project\)/);
  assert.equal((r.match(/project\?\.crsSet === false && !tieOf\(project\)/g) || []).length, 3); // Satellite, Spectral; the RTP IGRF fill since #2561
  const s = read("components/SpectralIndexModal.jsx");
  assert.match(s, /targetEpsg: tie \? Number\(tie\.epsg\) : epsg/);
  assert.match(s, /epsg, tie, defaultElevation/);
  assert.match(read("components/HyperspectralTab.jsx"), /epsg, tie, defaultElevation, sourceEpsg, samples: win/);
  assert.match(read("components/BasemapView.jsx"), /localToWorld\(tie, pts\[i\]\.x, pts\[i\]\.y\)/);
});
