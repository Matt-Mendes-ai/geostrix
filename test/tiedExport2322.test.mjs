// TASKS.csv #2322 (split from #2320) — on a local-grid project tied to a real CRS, the exports that carry a coordinate system are written in
// the tie's CRS through the tie (points through it, bearings turned by its rotation, grids and pictures resampled onto that CRS's north)
// instead of being refused. A synthetic tie: local 10000 / 5000 = MGA 51 400000 / 6800000, rotated 12 degrees.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tieFromOrigin, worldToLocal, bearingToLocal } from "../src/lib/localGridTie.js";
import { tieImageToLocal } from "../src/lib/rasterTie.js";
import { exportCrs, exportXY, bearingToWorld, gridMapToWorld, applyGridMap, gridBandsToWorld, terrainToWorld, imageToWorld, structureSetToWorld, atLocal, tiedExportNote } from "../src/lib/tiedExport.js";

const tie = tieFromOrigin({ lx: 10000, ly: 5000, wx: 400000, wy: 6800000, rotationDeg: 12, scale: 1, epsg: 28351 });
const tiedProject = { crsSet: false, epsg: 3156, localGrid: { name: "Wallaby mine grid", tie } };

test("exportCrs: a tied local grid answers with the tie's CRS and the tie, without asking; a CRS project answers with its own", async () => {
  assert.deepEqual(await exportCrs(tiedProject), { epsg: 28351, tie });
  assert.deepEqual(await exportCrs({ crsSet: true, epsg: 32609 }), { epsg: 32609, tie: null });
  // a local grid with no tie still goes to ensureExportCrs (its 'not available on a local grid' question): not answered here
});

test("points and bearings: the inverse of the import direction, exactly", () => {
  for (let i = 0; i < 50; i++) {
    const wx = 400000 + 37.3 * i, wy = 6800000 - 21.9 * i, l = worldToLocal(tie, wx, wy), [x, y] = exportXY(tie)(l.x, l.y);
    assert.ok(Math.hypot(x - wx, y - wy) < 1e-6);
  }
  assert.deepEqual(exportXY(null)(5, 6), [5, 6]);
  for (const d of [0, 12, 45, 90, 179.5, 359]) assert.ok(Math.abs(bearingToWorld(tie, bearingToLocal(tie, d)) - d) < 1e-9);
  assert.equal(bearingToWorld(tie, 102), 90);
  assert.equal(bearingToWorld(null, 102), 102);
});

test("a grid: every exported node holds the source node nearest to it, NaN outside the turned grid; several bands share the map", () => {
  const g = { nx: 80, ny: 60, x0: 9000, yTop: 6000, dx: 20, dy: 20 };
  const idx = Float32Array.from({ length: g.nx * g.ny }, (_, k) => k);
  const m = gridMapToWorld(g, tie), out = applyGridMap(m, idx);
  let inside = 0;
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
    const s = worldToLocal(tie, m.x0 + i * m.dx, m.yTop - j * m.dy), fi = (s.x - g.x0) / g.dx, fj = (g.yTop - s.y) / g.dy, v = out[j * m.nx + i];
    const isIn = fi >= -0.5 && fj >= -0.5 && fi <= g.nx - 0.5 && fj <= g.ny - 0.5;
    if (isIn) { inside++; assert.equal(v, Math.round(fj) * g.nx + Math.round(fi)); } else assert.ok(Number.isNaN(v));
  }
  assert.ok(inside === g.nx * g.ny || inside > 0.95 * g.nx * g.ny);
  assert.ok(Math.abs(m.dx - 20) < 0.5 && Math.abs(m.dy - 20) < 0.5, "the node spacing is kept");
  const b = gridBandsToWorld({ ...g, bands: [{ values: idx }, { values: idx.map((v) => v * 2) }] }, tie);
  assert.equal(b.bands.length, 2);
  b.bands[0].values.forEach((v, k) => { if (Number.isFinite(v)) assert.equal(b.bands[1].values[k], v * 2); });
  assert.equal(gridBandsToWorld(g, null), g);
});

test("a terrain and a picture through the tie; a picture brought in through the tie comes back to its own pixels", () => {
  const t = terrainToWorld({ name: "DEM", bbox: [9000, 4800, 10580, 6000], gridW: 80, gridH: 61, elevations: Array.from({ length: 80 * 61 }, (_, k) => 400 + (k % 80)) }, tie);
  assert.equal(t.elevations.length, t.gridW * t.gridH);
  assert.ok(t.bbox[2] > t.bbox[0] && t.bbox[3] > t.bbox[1] && t.bbox[0] > 398000 && t.bbox[3] < 6802000);
  assert.ok(t.elevations.some(Number.isNaN) && t.elevations.some(Number.isFinite), "the turned corners are no-data");
  const W = 200, H = 150, data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) { data[p * 4] = p % W; data[p * 4 + 1] = Math.floor(p / W); data[p * 4 + 3] = 255; }
  const img = { xmin: 400000, ymin: 6798000, xmax: 405000, ymax: 6801750, width: W, height: H, data };
  const li = tieImageToLocal(img, tie, 28351, 4096), wi = imageToWorld({ width: li.width, height: li.height, data: li.data, bbox: li.bbox }, tie);
  let checked = 0;
  for (let row = 10; row < wi.height - 10; row += 3) for (let col = 10; col < wi.width - 10; col += 3) {
    const k = (row * wi.width + col) * 4; if (wi.data[k + 3] === 0) continue;
    const wx = wi.bbox[0] + ((col + 0.5) * (wi.bbox[2] - wi.bbox[0])) / wi.width, wy = wi.bbox[3] - ((row + 0.5) * (wi.bbox[3] - wi.bbox[1])) / wi.height;
    const sx = Math.floor((wx - img.xmin) / 25), sy = Math.floor((img.ymax - wy) / 25);
    if (sx < 2 || sy < 2 || sx > W - 3 || sy > H - 3) continue;
    assert.ok(Math.abs(wi.data[k] - sx) <= 1 && Math.abs(wi.data[k + 1] - sy) <= 1, `pixel ${col},${row}`); checked++;
  }
  assert.ok(checked > 1000);
});

test("outcrop structures in the tie's CRS (dip directions turned), the terrain read at the grid point; the note", () => {
  const out = structureSetToWorld({ name: "Outcrop", rows: [{ x: 10000, y: 5000, dipDir: 102, dip: 40, cls: "bedding" }, { x: NaN, y: 1, dipDir: 5 }] }, tie);
  assert.deepEqual(out.rows[0], { x: 400000, y: 6800000, dipDir: 90, dip: 40, cls: "bedding" });
  assert.ok(Number.isNaN(out.rows[1].x));
  const z = atLocal(tie, (x, y) => x + y);
  assert.ok(Math.abs(z(400000, 6800000) - 15000) < 1e-6);
  assert.match(tiedExportNote(tie), /Written in EPSG:28351 through the local grid's tie \(rotation 12°\)/);
  assert.equal(tiedExportNote(null), "");
});

test("the exports that write through the tie: catchments GPX / GeoTIFF, the survey plan, a raster's picture and values, the terrain, outcrop structures", () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
  const c = read("components/CatchmentsPanel.jsx");
  assert.match(c, /followUpGpx\(a, \(x, y\) => T\(\.\.\.P\(x, y\)\)/);
  assert.match(c, /gridToGeoTIFF\(\{ \.\.\.gridBandsToWorld\(\{ \.\.\.g, bands: \[/);
  const s = read("components/SurveyPlannerPanel.jsx");
  assert.match(s, /build\(\(x, y\) => T\(\.\.\.P\(x, y\)\), epsg, titleFor\(b, tie\), b\)/);
  assert.match(s, /gridBearingAsTrueMagnetic\(bearingToWorld\(tie, grid\.azimuth\), c\[0\], c\[1\], epsg, surveyDate\)/);
  const r = read("modules/RasterModule.jsx");
  assert.match(r, /imageToGeoTIFF\(\{ \.\.\.out, epsg: epsgX \}\)/);
  assert.match(r, /gridToGeoTIFF\(\{ \.\.\.gridBandsToWorld\(\{ nx: g\.nx/);
  assert.match(read("modules/GeophysicsModule.jsx"), /terrainToGeoTIFFArrayBuffer\(terrainToWorld\(terrain, ex\.tie\), epsg\)/);
  const m = read("components/SurfaceMappingPanel.jsx");
  assert.match(m, /s = structureSetToWorld\(s, tie\);/);
  assert.match(m, /const zAt = atLocal\(tie, terrain \?/);
  // the helper is not in the startup bundle (#3159): only these lazy modules import it
  assert.doesNotMatch(read("App.jsx"), /tiedExport/);
});
