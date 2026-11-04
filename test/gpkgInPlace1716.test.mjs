// TASKS.csv #1716 — a big GeoPackage read in place: the main-process reader (electron/gpkgReader.js, Node's SQLite) lists the feature
// tables and reads only the rows inside an area, through the table's R-tree (or a scan of blob envelopes when there is none); the
// renderer side (lib/gpkgInPlace.js) turns them into layers with the shared row parser. Built here from a GeoPackage written by
// buildGeoPackage, with an R-tree added as GDAL / QGIS write one.
import test from "node:test";
import assert from "node:assert/strict";
import { register, createRequire } from "node:module";
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
register("./helpers/viteUrlLoader.mjs", import.meta.url);
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const reader = require("../electron/gpkgReader.js");
const { buildGeoPackage } = await import("../src/lib/gpkg.js");
const { readGeoPackageNear, boxInTableCrs } = await import("../src/lib/gpkgInPlace.js");

const dir = mkdtempSync(join(tmpdir(), "gpkg1716-"));
const file = join(dir, "big.gpkg");
// 30 x 30 points 100 m apart from (500000, 6000000), one attribute; a second table of 3 lines far away
const pts = [];
for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) pts.push({ geometry: [[500000 + 100 * i, 6000000 + 100 * j, 0]], attributes: { k: i * 30 + j } });
const lines = [0, 1, 2].map((n) => ({ geometry: [[900000 + n, 7000000, 0], [900100 + n, 7000100, 0]], attributes: { n } }));
writeFileSync(file, await buildGeoPackage([{ name: "pts", features: pts, geomType: "point", epsg: 26910 }, { name: "far", features: lines, geomType: "polyline", epsg: 26910 }]));
{
  const db = new DatabaseSync(file);
  db.exec('CREATE VIRTUAL TABLE "rtree_pts_geom" USING rtree(id, minx, maxx, miny, maxy)');
  const ins = db.prepare('INSERT INTO "rtree_pts_geom" VALUES (?, ?, ?, ?, ?)');
  pts.forEach((p, i) => { const [x, y] = p.geometry[0]; ins.run(i + 1, x, x, y, y); });
  db.close();
}
const asFile = { name: "big.gpkg", size: 500 * 1048576 };
const index = async () => ({ ok: true, ...reader.indexGpkg(file) });
const read = async (_f, opts) => ({ ok: true, ...(await reader.readGpkgTable(file, opts)) });

test("#1716 the index lists each feature table with its extent, count, EPSG row and whether it has an R-tree", () => {
  const ix = reader.indexGpkg(file);
  const byName = Object.fromEntries(ix.tables.map((t) => [t.name, t]));
  assert.deepEqual([byName.pts.count, byName.pts.indexed, byName.pts.geomCol], [900, true, "geom"]);
  assert.deepEqual(byName.pts.extent, [500000, 6000000, 502900, 6002900]);
  assert.deepEqual([byName.far.count, byName.far.indexed], [3, false]);
  assert.ok(ix.srs.some((s) => s.srs_id === 26910 && s.organization === "EPSG"));
});

test("#1716 only the rows inside the box come back through the R-tree; the cap says when more matched", async () => {
  const r = await reader.readGpkgTable(file, { table: "pts", bbox: [500050, 6000050, 500350, 6000250] });
  assert.ok(r.indexed);
  assert.equal(r.rows.length, 3 * 2, "x 500100..500300, y 6000100..6000200");
  const capped = await reader.readGpkgTable(file, { table: "pts", bbox: [0, 0, 1e7, 1e7], max: 50 });
  assert.deepEqual([capped.rows.length, capped.truncated], [50, true]);
  await assert.rejects(reader.readGpkgTable(file, { table: 'pts"; DROP TABLE pts; --', bbox: [0, 0, 1, 1] }), /No feature table named/);
  await assert.rejects(reader.readGpkgTable(file, { table: "pts", bbox: null }), /No area/);
});

test("#1716 a table with no R-tree is scanned; a blob envelope outside the box drops its row, a blob without one is kept", async () => {
  const r = await reader.readGpkgTable(file, { table: "far", bbox: [0, 0, 1, 1] });
  assert.deepEqual([r.indexed, r.rows.length], [false, 3], "buildGeoPackage writes no envelope, so the renderer's clip decides");
  const b = new Uint8Array(8 + 32); b[0] = 0x47; b[1] = 0x50; b[3] = 0x03; // little-endian, xy envelope
  const dv = new DataView(b.buffer); [10, 20, 30, 40].forEach((v, i) => dv.setFloat64(8 + 8 * i, v, true)); // minx maxx miny maxy
  assert.deepEqual(reader.blobEnvelope(b), [10, 30, 20, 40]);
  assert.equal(reader.blobEnvelope(new Uint8Array([0x47, 0x50, 0, 1, 0, 0, 0, 0])), null);
});

test("#1716 readGeoPackageNear: layers from the rows near the project, tables outside skipped by their extent, no path -> null", async () => {
  const near = await readGeoPackageNear(asFile, { clipBox: [500050, 6000050, 500350, 6000250], projectEpsg: 26910, index, read });
  assert.deepEqual(near.layers.map((l) => [l.name, l.features.length, l.geomType, l.epsg]), [["pts", 6, "point", 26910]]);
  assert.deepEqual(near.layers[0].inPlace, { kept: 6, total: 900, truncated: false });
  assert.deepEqual(near.outside, ["far"]);
  assert.equal(near.layers[0].features[0].attributes.k, 31, "attributes kept, fid and geometry columns left out");
  assert.equal(await readGeoPackageNear(asFile, { clipBox: [0, 0, 1, 1], index: async () => ({ ok: false, error: "no path" }), read }), null);
  await assert.rejects(readGeoPackageNear(asFile, { clipBox: null, projectEpsg: 26910, index, read }), /this project has none yet/);
});

test("#1716 the project box is moved into the table's CRS (UTM 10N -> BC Albers), unchanged when the CRS matches", async () => {
  const same = [1, 2, 3, 4];
  assert.equal(await boxInTableCrs(same, 26910, 26910), same);
  const b = await boxInTableCrs([500000, 5500000, 510000, 5510000], 26910, 3005);
  assert.ok(b[0] > 1000000 && b[0] < 1300000 && b[2] - b[0] > 9900 && b[2] - b[0] < 10600, JSON.stringify(b));
});

test("#1716 the bridge takes the File the user chose, never a path; main checks the extension and location; Surface Geology uses it", () => {
  const pre = readFileSync(new URL("../electron/preload.js", import.meta.url), "utf8");
  assert.match(pre, /gpkgIndex: \(file\) => \{ const filePath = webUtils\.getPathForFile\(file\)/);
  assert.match(pre, /gpkgRead: \(file, opts\) => \{ const filePath = webUtils\.getPathForFile\(file\)/);
  const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.ok(main.includes('path.extname(String(filePath)).toLowerCase() !== ".gpkg"'));
  assert.ok(main.includes("isNamespacedPath(filePath) || (await inProtectedFolder(filePath))"));
  const src = readFileSync(new URL("../electron/gpkgReader.js", import.meta.url), "utf8");
  assert.ok(src.includes("{ readOnly: true }"));
  const panel = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.ok(panel.includes("await readGeoPackageNear(f, {"));
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
