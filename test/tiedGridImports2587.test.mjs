// TASKS.csv #2587 / #2322 — on a local mine grid tied to a real CRS, Boundaries (shapefile / GeoPackage, GeoJSON / GPX, KML) and the
// GeoTIFF / GXF import bring a file with a CRS INTO the grid through the tie (rasters resampled onto the grid's own north), instead of
// keeping its MGA numbers 6,240 km from the collars
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tieFromOrigin, localToWorld, worldToLocal } from "../src/lib/localGridTie.js";
import { tieImageToLocal, tieGridToLocal, localBoxOf, tieReaches } from "../src/lib/rasterTie.js";
import { vectorToBoundaryPolylines } from "../src/lib/boundaryImport.js";
import { layersToBoundaryPolylines } from "../src/lib/gpxGeojson.js";
import { kmlToProjectPolylines } from "../src/lib/kml.js";
import { fileToLocal } from "../src/lib/localGridTie.js";
import { reprojectXY } from "../src/lib/reproject.js";

// the review's numbers: rotation 15.6487 deg, scale 0.999602, a mine grid around 7,000-12,000 tied to MGA zone 50
const w0 = { x: 411899.64, y: 6249475.921 };
const tie = tieFromOrigin({ lx: 7307.62, ly: 9185.655, wx: w0.x, wy: w0.y, rotationDeg: 15.6487, scale: 0.999602, epsg: 28350 });

test("a square boundary written in MGA comes back as the mine-grid square, with a note naming the tie", async () => {
  const sq = [[9500, 10700], [9500, 11700], [10500, 11700], [10500, 10700], [9500, 10700]].map(([x, y]) => { const w = localToWorld(tie, x, y); return [w.x, w.y]; });
  const r = await vectorToBoundaryPolylines({ epsg: 28350, geomType: "polygon", features: [{ parts: [sq], attributes: {} }] }, null, { tie });
  const got = r.polylines[0];
  [[9500, 10700], [9500, 11700], [10500, 11700], [10500, 10700]].forEach(([x, y], k) => assert.ok(Math.hypot(got[k].x - x, got[k].y - y) < 1e-3, `${got[k].x} ${got[k].y}`));
  assert.match(r.note, /brought into the local grid through its tie to EPSG:28350 \(from EPSG:28350\)/);
  // another CRS (WGS 84 / UTM 50S) reaches the tie through a reprojection
  const u = sq.map(([x, y]) => { const p = reprojectXY(x, y, 28350, 32750); return [p.x, p.y]; });
  const r2 = await vectorToBoundaryPolylines({ epsg: 32750, geomType: "polygon", features: [{ parts: [u], attributes: {} }] }, null, { tie });
  assert.ok(Math.hypot(r2.polylines[0][0].x - 9500, r2.polylines[0][0].y - 10700) < 2, JSON.stringify(r2.polylines[0][0])); // the datum shift only
  assert.match(r2.note, /from EPSG:32750/);
  // no tie: as before (kept, 'no coordinate system yet')
  const r3 = await vectorToBoundaryPolylines({ epsg: 28350, geomType: "polygon", features: [{ parts: [sq], attributes: {} }] }, null, {});
  assert.equal(r3.polylines[0][0].x, sq[0][0]);
  assert.match(r3.note, /no coordinate system yet/);
});

test("GeoJSON / GPX and KML boundaries go through the tie when one is given", () => {
  const ll = reprojectXY(localToWorld(tie, 10000, 11000).x, localToWorld(tie, 10000, 11000).y, 28350, 4326);
  const toLocal = (x, y, from) => fileToLocal(tie, x, y, from);
  const g = layersToBoundaryPolylines([{ geomType: "line", features: [{ parts: [[[ll.x, ll.y], [ll.x + 0.001, ll.y]]] }] }], 28350, reprojectXY, toLocal);
  assert.ok(Math.hypot(g.polylines[0][0].x - 10000, g.polylines[0][0].y - 11000) < 0.01, JSON.stringify(g.polylines[0][0]));
  const k = kmlToProjectPolylines([{ geomType: "line", coords: [[ll.x, ll.y], [ll.x + 0.001, ll.y]] }], 28350, { toLocal });
  assert.ok(Math.hypot(k.polylines[0][0].x - 10000, k.polylines[0][0].y - 11000) < 0.01);
  // a 'not degrees' GeoJSON is already in the grid's numbers
  const nd = layersToBoundaryPolylines([{ geomType: "line", notDegrees: true, features: [{ parts: [[[10000, 11000], [10010, 11000]]] }] }], 28350, reprojectXY, toLocal);
  assert.deepEqual(nd.polylines[0][0], { x: 10000, y: 11000 });
});

// a 40 x 40 px picture over 4 x 4 km of MGA: the left half red, the right half blue
function picture() {
  const W = 40, H = 40, data = new Uint8ClampedArray(W * H * 4);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const i = (r * W + c) * 4; data[i] = c < 20 ? 255 : 0; data[i + 2] = c < 20 ? 0 : 255; data[i + 3] = 255; }
  return { xmin: 410000, ymin: 6248000, xmax: 414000, ymax: 6252000, width: W, height: H, data };
}
const colourAt = (img, x, y) => {
  const c = Math.floor(((x - img.bbox[0]) / (img.bbox[2] - img.bbox[0])) * img.width), r = Math.floor(((img.bbox[3] - y) / (img.bbox[3] - img.bbox[1])) * img.height);
  const i = (r * img.width + c) * 4; return [img.data[i], img.data[i + 2], img.data[i + 3]];
};

test("a GeoTIFF picture in the tie's CRS is resampled onto the mine grid: each place keeps its colour, outside is transparent", () => {
  const src = picture();
  const img = tieImageToLocal(src, tie, 28350);
  const p = worldToLocal(tie, 411000, 6250000), q = worldToLocal(tie, 413000, 6250000); // west half / east half
  assert.deepEqual(colourAt(img, p.x, p.y), [255, 0, 255]);
  assert.deepEqual(colourAt(img, q.x, q.y), [0, 255, 255]);
  // the box covers the rotated footprint: a corner of the box is outside the picture
  assert.equal(colourAt(img, img.bbox[0] + 1, img.bbox[3] - 1)[2], 0);
  // the box is in the grid's numbers (thousands), not MGA's (hundreds of thousands)
  assert.ok(img.bbox[0] > 5000 && img.bbox[2] < 14000, img.bbox.join(","));
  const lb = localBoxOf(tie, 28350, [410000, 6248000, 414000, 6252000]);
  assert.deepEqual(img.bbox, lb);
  // a rotated 4 km square needs a ~5.2 km box (cos 15.6 + sin 15.6): the pixel size is kept, so ~52 px
  assert.ok(img.width >= 50 && img.width <= 54, String(img.width));
});

test("a value grid is resampled to the nearest reading, NaN outside; a CRS GeoStrix cannot build is refused", () => {
  const nx = 21, ny = 21, values = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = i * 100 + j; // easting index * 100 + row
  const g = { nx, ny, x0: 410000, yTop: 6252000, dx: 200, dy: 200, values };
  const out = tieGridToLocal(g, tie, 28350);
  assert.ok(out.valid > 0 && out.valid < out.nx * out.ny); // the corners of the rotated box hold no reading
  // the node nearest MGA (412000, 6250000) = node (10, 10) -> 1010
  const p = worldToLocal(tie, 412000, 6250000);
  const i = Math.round((p.x - out.x0) / out.dx), j = Math.round((out.yTop - p.y) / out.dy);
  const back = localToWorld(tie, out.x0 + i * out.dx, out.yTop - j * out.dy);
  const want = Math.round((back.x - 410000) / 200) * 100 + Math.round((6252000 - back.y) / 200);
  assert.equal(out.values[j * out.nx + i], want);
  assert.ok(Math.abs(out.dx - 200 / 0.999602) < 5, String(out.dx));
  for (const v of out.values) if (Number.isFinite(v)) assert.ok(Number.isInteger(v)); // readings, not blends
  assert.equal(tieReaches(tie, 999999), false);
  assert.equal(tieImageToLocal(picture(), tie, 999999), null);
});

test("the importers pass the project's tie, and the Project CRS page names the tied grid", () => {
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /const tied = tie && srcEpsg && !projEpsg && parsed\.pixels && tieReaches\(tie, srcEpsg\)/);
  assert.match(readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8"), /worldFile, tie: tieOf\(project\) \}\);/);
  const gm = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.equal((gm.match(/collars, tie: tieOf\(project\) \}\);/g) || []).length, 2);
  assert.match(gm, /kmlToProjectPolylines\(features, project\?\.epsg, \{ toLocal: tie \?/);
  assert.match(gm, /layersToBoundaryPolylines\(layers, project\?\.epsg, reprojectXY, tie \?/);
  assert.match(gm, /tie: tieOf\(project\) \}\); \/\/ #607; tie: #2587/);
  assert.match(readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8"), /project\.crsSet === false && tieOf\(project\) \?/);
});
