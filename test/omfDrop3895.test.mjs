// TASKS.csv #3895 — an .omf dropped on StrixViewer (or picked with Add data) goes to the same reader as Geophysics > OMF
// (src/modules/viewer/omfImport.js). A small SYNTHETIC OMF only, written by the app's own OMF writer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeOMF } from "../src/lib/omfWriter.js";
import { omfToProjectObjects } from "../src/lib/omfImport.js";
import { importOmfFile, OMF_MAX_MB } from "../src/modules/viewer/omfImport.js";

const E0 = 500000, N0 = 6500000;
async function syntheticOmf() {
  const bytes = await writeOMF({ name: "synthetic", elements: [
    { type: "points", name: "Pts", vertices: [E0, N0, 100, E0 + 10, N0 + 10, 90, E0 + 20, N0, 80], data: [] },
    { type: "surface", name: "Top", vertices: [E0, N0, 100, E0 + 100, N0, 110, E0 + 100, N0 + 100, 120, E0, N0 + 100, 105], triangles: [0, 1, 2, 0, 2, 3] },
    { type: "volume", name: "Solid", origin: [E0, N0, 0], tensor: { u: [10, 10], v: [10, 10], w: [10, 10] }, data: [{ name: "grade", values: [1, 2, 3, 4, 5, 6, 7, 8] }] },
  ] });
  return { name: "synthetic.omf", size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}
function env(project = { crsSet: true, epsg: 32609 }) {
  const added = { omf: [], vox: [] }, notes = [];
  return { added, notes, e: { project, addOmfObject: (o) => added.omf.push(o), addVoxelModel: (m) => added.vox.push(m), setNotices: (f) => notes.splice(0, notes.length, ...f(notes)), confirm: () => true, read: (b, c, o) => omfToProjectObjects(b, c, o) } };
}

test("the dropped OMF's points, surface and volume are added through the existing reader", async () => {
  const { added, notes, e } = env();
  const r = await importOmfFile(await syntheticOmf(), e);
  assert.equal(r.added, 3);
  assert.deepEqual(added.omf.map((o) => o.kind).sort(), ["points", "surface"]);
  assert.equal(added.vox.length, 1);
  assert.match(notes[0].text, /^Reading synthetic\.omf \(/);
  assert.match(notes[1].text, /^Imported "synthetic\.omf" — 1 point set\(s\), 1 surface\(s\), 1 block model\(s\)\./);
});

test("a project with no CRS is asked once (the project CRS dialog); a chosen CRS is not asked again", async () => {
  const asked = [];
  globalThis.window = { dispatchEvent: (ev) => { asked.push(ev.detail.reason); ev.detail.resolve(32609); return true; } };
  globalThis.CustomEvent ??= class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
  try {
    const a = env({ crsSet: false, epsg: 3156 });
    await importOmfFile(await syntheticOmf(), a.e);
    assert.equal(asked.length, 1);
    assert.match(asked[0], /an OMF gives coordinates but not the coordinate system they are in/);
    await importOmfFile(await syntheticOmf(), env({ crsSet: true, epsg: 32609 }).e); // chosen: the project's now
    assert.equal(asked.length, 1);
  } finally { delete globalThis.window; }
});

test("too large: refused with a plain message before it is read; a big block count is asked about", async () => {
  const { added, notes, e } = env();
  let read = false;
  const r = await importOmfFile({ name: "huge.omf", size: (OMF_MAX_MB + 1) * 1048576, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }, e);
  assert.equal(r.added, 0); assert.equal(read, false);
  assert.match(notes[0].text, /^huge\.omf is 1,025 MB, more than the 1,024 MB an OMF can be read here in one go\./);
  const b = env(); b.e.confirm = () => false;
  b.e.read = async () => ({ omfObjects: [], voxelModels: [{ cells: { length: 600000 } }], notes: [], skipped: [] });
  await importOmfFile(await syntheticOmf(), b.e);
  assert.equal(b.added.vox.length, 0);
  assert.match(b.notes[b.notes.length - 1].text, /was not imported/);
  assert.equal(added.omf.length, 0);
});

test("wired: the 3D view's drop reads .omf, counts it as handled, and the drop notice names it", () => {
  const p = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(p, /const omfFiles = grouped\.files\.filter\(\(f\) => \/\\\.omf\$\/i\.test\(f\.name\)\);/);
  assert.match(p, /await import\("\.\/omfImport\.js"\)/); // loaded on the first .omf, not at startup
  assert.match(p, /xyz\|omf\)\$\/i\.test\(f\.name\)/);
  assert.ok(p.includes(".dxf / .obj files and Open Mining Format (.omf);"));
  for (const lang of ["es", "pt", "fr", "ar"]) assert.match(JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"))[
    "Not imported from this drop: {names}. Dropped here, StrixViewer reads .csv, .xlsx, .zip (shapefile), .shp, .gpkg, .kml / .kmz, .las logs, GeoTIFF / .gxf / .grd grids and .dxf / .obj files and Open Mining Format (.omf); point surveys (.xyz) open on the Geophysics tab."], /\.omf/, lang);
});
