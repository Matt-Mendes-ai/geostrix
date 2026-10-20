// TASKS.csv #726 — auto-fetched terrain sampled at tile pixel centres, in Mercator Y, across tile seams.
import test from "node:test";
import assert from "node:assert/strict";
import { resampleElevationMosaic } from "../src/lib/srtmFetch.js";

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOfMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
// two tiles side by side at z12 near 56 N: 512 x 256 pixels
const tiles = { lonMin: -130.078125, lonMax: -129.990234375, latMin: 55.97379820507658, latMax: 56.02297595451327 };
const mw = 512, mh = 256;
const lonOfCol = (c) => tiles.lonMin + ((c + 0.5) / mw) * (tiles.lonMax - tiles.lonMin); // pixel CENTRE
const latOfRow = (r) => latOfMercY(mercY(tiles.latMax) - ((r + 0.5) / mh) * (mercY(tiles.latMax) - mercY(tiles.latMin)));
const at = (elev, lon, lat) => resampleElevationMosaic(elev, mw, mh, tiles, { lonMin: lon, lonMax: lon + 1e-9, latMin: lat - 1e-9, latMax: lat }, 1, 1)[0];

test("a pixel's value is found at its centre, east-west and north-south", () => {
  const byCol = Float32Array.from({ length: mw * mh }, (_, k) => k % mw);
  const byRow = Float32Array.from({ length: mw * mh }, (_, k) => Math.floor(k / mw));
  for (const c of [0, 10, 200, 511]) assert.ok(Math.abs(at(byCol, lonOfCol(c), latOfRow(100)) - c) < 1e-3, `col ${c}: ${at(byCol, lonOfCol(c), latOfRow(100))}`);
  for (const r of [0, 37, 128, 255]) assert.ok(Math.abs(at(byRow, lonOfCol(50), latOfRow(r)) - r) < 1e-2, `row ${r}: ${at(byRow, lonOfCol(50), latOfRow(r))}`);
  // the edge-registered sampling it replaces was half a pixel off at the tile centre (z12 at 56 N: ~6 m)
  const edgeReg = ((lonOfCol(128) - tiles.lonMin) / (tiles.lonMax - tiles.lonMin)) * (mw - 1);
  assert.ok(Math.abs(edgeReg - 128) > 0.2);
});

test("the seam between two tiles is interpolated, and a failed tile is NaN", () => {
  const byCol = Float32Array.from({ length: mw * mh }, (_, k) => k % mw);
  const seam = tiles.lonMin + 0.5 * (tiles.lonMax - tiles.lonMin);
  assert.ok(Math.abs(at(byCol, seam, latOfRow(50)) - 255.5) < 1e-3);
  const failed = byCol.map((v, k) => (k % mw >= 256 ? NaN : v));
  assert.ok(Number.isNaN(at(failed, lonOfCol(400), latOfRow(50))));
  assert.ok(Math.abs(at(failed, lonOfCol(100), latOfRow(50)) - 100) < 1e-3);
});
