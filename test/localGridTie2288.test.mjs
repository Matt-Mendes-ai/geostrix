// TASKS.csv #2288 (review #2174, WA gold; Matt's decision 2026-11-09) — a local-grid project tied to a real CRS: the similarity, its inverse,
// files with their own CRS brought into the grid, bearings turned
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tieFromControlPoints, tieFromOrigin, localToWorld, worldToLocal, tieOf, fileToLocal, bearingToLocal } from "../src/lib/localGridTie.js";
import { reprojectXY } from "../src/lib/reproject.js";

// a mine grid rotated 12 degrees anticlockwise from MGA, scale 1, local (32000, 808000) at MGA (412000, 6612000)
const truth = tieFromOrigin({ lx: 32000, ly: 808000, wx: 412000, wy: 6612000, rotationDeg: 12, scale: 1, epsg: 28351 });

test("origin + rotation + scale: the local origin lands on its MGA point; the inverse comes back to the centimetre", () => {
  const w = localToWorld(truth, 32000, 808000);
  assert.ok(Math.abs(w.x - 412000) < 1e-6 && Math.abs(w.y - 6612000) < 1e-6);
  const p = localToWorld(truth, 32500, 808300), back = worldToLocal(truth, p.x, p.y);
  assert.ok(Math.abs(back.x - 32500) < 1e-6 && Math.abs(back.y - 808300) < 1e-6);
  // local +x (east on the grid) points 12 degrees anticlockwise of MGA east
  const e = localToWorld(truth, 32100, 808000);
  assert.ok(Math.abs((Math.atan2(e.y - 6612000, e.x - 412000) * 180) / Math.PI - 12) < 1e-9);
});

test("three control points recover the same tie; the residuals and RMS are near zero, and the fit records them", () => {
  const pts = [[32000, 808000], [32500, 808100], [31900, 808600]].map(([lx, ly]) => { const w = localToWorld(truth, lx, ly); return `${lx} ${ly} ${w.x.toFixed(3)} ${w.y.toFixed(3)}`; }).join("\n");
  const t = tieFromControlPoints(pts, 28351);
  assert.ok(Math.abs(t.rotationDeg - 12) < 1e-3 && Math.abs(t.scale - 1) < 1e-5, /* the points are rounded to the millimetre */ `${t.rotationDeg} ${t.scale}`);
  assert.ok(t.rmsM < 0.002 && t.n === 3 && t.residuals.length === 3);
  assert.equal(t.controlText, pts);
  assert.throws(() => tieFromControlPoints("32000 808000 412000 6612000", 28351)); // one point is not a tie
});

test("a file in the tie's CRS, and one in another CRS, both land on the local grid", () => {
  const w = localToWorld(truth, 32250, 808450);
  const a = fileToLocal(truth, w.x, w.y, 28351);
  assert.ok(Math.abs(a.x - 32250) < 1e-6 && Math.abs(a.y - 808450) < 1e-6);
  const utm = reprojectXY(w.x, w.y, 28351, 32751); // the same point in WGS 84 / UTM 51S
  if (utm) { const b = fileToLocal(truth, utm.x, utm.y, 32751); assert.ok(Math.hypot(b.x - 32250, b.y - 808450) < 0.05, JSON.stringify(b)); }
});

test("a bearing from the CRS's grid north turns by the rotation onto the local grid (the inverse of #490)", () => {
  assert.equal(bearingToLocal(truth, 90), 102);
  assert.equal(bearingToLocal(truth, 355), 7);
});

test("only a local-grid project's own tie counts", () => {
  assert.equal(tieOf({ crsSet: false, localGrid: { name: "W", tie: truth } }), truth);
  assert.equal(tieOf({ crsSet: false, localGrid: { name: "W" } }), null);
  assert.equal(tieOf({ crsSet: true, epsg: 28351, localGrid: { tie: truth } }), null);
});

test("the import, the panel, the store and the status bar use it", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /const gridTie = liveProject\?\.crsSet === false && liveProject\?\.localGrid \? tieOf\(liveProject\) : null;/);
  assert.match(u, /const p = fileToLocal\(gridTie, r\.x, r\.y, fromEpsg\);/);
  assert.match(u, /\} else if \(liveProject\?\.epsg && \(perRowEpsgCol/); // the placeholder is never the target on a local grid
  assert.match(readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8"), /const setLocalGridTie = useCallback/);
  assert.match(readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8"), /\{project\.crsSet === false && <React\.Suspense fallback=\{null\}><LocalGridPanel \/><\/React\.Suspense>\}/);
  assert.match(readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"), /tr\("\(tied to EPSG:\{epsg\}\)"/);
});

test("a local-grid project is never given a file's declared CRS (found live: an MGA file ended the grid)", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  const i = u.indexOf("const adoptCrsIfEmpty = (declared, fileName) => {"), j = u.indexOf("if (live.project?.crsSet === false && live.project?.localGrid) return null;", i), k = u.indexOf("live.setEpsg(d);", i);
  assert.ok(i > 0 && j > i && j < k);
});
