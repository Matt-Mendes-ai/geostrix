// TASKS.csv #1993 (export step) — a .geoh5 written from GeoStrix: every object round-trips through GeoStrix's own reader (lib/geoh5.js), and the file
// follows the public geoh5 format description (geoh5py docs/content/geoh5_format: workspace, groups, objects, data, types): the type GUIDs, attribute
// names and kinds, the Root link, int32 cells, a compound of doubles for the vertices, 32-bit floats with FLT_MIN as no-data, variable-length text. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import h5wasm from "h5wasm";
import { writeGeoh5, omfVolumeToGeoh5, GEOH5_WRITE_TYPES, ROOT_GROUP_TYPE, FLOAT_NO_DATA } from "../src/lib/geoh5Write.js";
import { parseGeoh5 } from "../src/lib/geoh5.js";
import { projectGeoh5Elements, terrainZ } from "../src/lib/geoh5Export.js";

const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const ELS = [
  { kind: "points", name: "Soils", vertices: [1000, 2000, 300, 1010, 2000, 301, 1020, 2005, 302], data: [{ name: "Cu_ppm", values: [12.5, null, 300], units: "ppm" }, { name: "sample_id", values: ["S1", "S2", "S3"] }] },
  { kind: "curve", name: "Contact", vertices: [0, 0, 0, 10, 0, 1, 20, 5, 2], cells: [0, 1, 1, 2], data: [{ name: "seg", association: "cell", values: [7, 8] }, { name: "elev", values: [0, 1, 2] }] },
  { kind: "surface", name: "Pit", vertices: [0, 0, 0, 10, 0, 0, 10, 10, 1, 0, 10, 1], cells: [0, 1, 2, 0, 2, 3] },
  // 3 x 2 x 2 cells; value 100·i + 10·j + k in geoh5's order k + i·nZ + j·nU·nZ
  { kind: "blockmodel", name: "Rho", origin: [1000, 2000, 250], u: [10, 10, 10], v: [10, 20], z: [5, 5], data: [{ name: "rho", values: (() => { const a = []; for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) a[k + i * 2 + j * 3 * 2] = 100 * i + 10 * j + k; return a; })() }] },
];

test("every object round-trips through GeoStrix's own reader", async () => {
  const { bytes, written, skipped } = await writeGeoh5(ELS);
  assert.deepEqual(skipped, []);
  assert.deepEqual(written.map((w) => [w.kind, w.count, w.data]), [["points", 3, 2], ["curve", 3, 2], ["surface", 4, 0], ["blockmodel", 12, 1]]);
  const p = await parseGeoh5(ab(bytes));
  assert.equal(p.version, 2); assert.equal(p.distanceUnit, "meter");
  const by = Object.fromEntries(p.elements.map((e) => [e.name, e]));
  // points: coordinates, a float column (no-data -> blank) and a text column
  assert.equal(by.Soils.kind, "points");
  assert.deepEqual(by.Soils.vertices, ELS[0].vertices);
  const cu = by.Soils.attributes.find((a) => a.name === "Cu_ppm"), id = by.Soils.attributes.find((a) => a.name === "sample_id");
  assert.equal(cu.values[0], 12.5); assert.ok(Number.isNaN(cu.values[1])); assert.equal(cu.values[2], 300);
  assert.deepEqual(id.values, ["S1", "S2", "S3"]);
  // curve: segments and data on the cells and on the vertices
  assert.equal(by.Contact.kind, "lines");
  assert.deepEqual(by.Contact.segments, [0, 1, 1, 2]);
  assert.deepEqual(by.Contact.attributes.find((a) => a.name === "seg").values, [7, 8]);
  assert.equal(by.Contact.attributes.find((a) => a.name === "seg").location, "segments");
  assert.equal(by.Contact.attributes.find((a) => a.name === "elev").location, "vertices");
  // surface
  assert.deepEqual(by.Pit.triangles, [0, 1, 2, 0, 2, 3]); assert.deepEqual(by.Pit.vertices, ELS[2].vertices);
  // block model: origin, widths, and every cell's value where it belongs
  const b = by.Rho;
  assert.equal(b.kind, "volume"); assert.deepEqual(b.origin, [1000, 2000, 250]);
  assert.deepEqual([b.tensor_u, b.tensor_v, b.tensor_w], [[10, 10, 10], [10, 20], [5, 5]]);
  const vals = b.attributes[0].values; // the reader's order: w fastest, then v, u slowest
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) assert.equal(vals[(i * 2 + j) * 2 + k], 100 * i + 10 * j + k, `cell ${i},${j},${k}`);
});

test("the file follows the geoh5 format description: workspace, Root group, types, attributes, datasets", async () => {
  const { bytes } = await writeGeoh5(ELS);
  const mod = await h5wasm.ready, path = `/spec_${Date.now()}.geoh5`;
  mod.FS.writeFile(path, bytes);
  const f = new h5wasm.File(path, "r");
  try {
    const root = f.get("GEOSCIENCE");
    assert.equal(root.attrs.Version.value, 2); assert.match(root.attrs.Version.dtype, /d$/, "Version is a double (workspace.rst)");
    assert.equal(root.attrs["Distance unit"].value, "meter");
    assert.deepEqual(root.attrs.Contributors.value, ["GeoStrix"]);
    for (const g of ["Data", "Groups", "Objects", "Types/Data types", "Types/Group types", "Types/Object types"]) assert.ok(f.get(`GEOSCIENCE/${g}`), g);
    // Root: a hard link to the top group, whose type is No Type (Root) (groups.rst)
    const top = f.get("GEOSCIENCE/Root");
    assert.equal(top.attrs.Name.value, "Workspace");
    assert.equal(top.get("Type").attrs.ID.value, ROOT_GROUP_TYPE);
    assert.equal(ROOT_GROUP_TYPE, "{dd99b610-be92-48c0-873c-5b5946ea2840}");
    assert.equal(top.get("Objects").keys().length, 4, "the objects are the root group's children");
    // object types with the specification's GUIDs (objects.rst)
    assert.deepEqual(Object.fromEntries(Object.entries(GEOH5_WRITE_TYPES).map(([k, v]) => [k, v.id])), {
      points: "{202C5DB1-A56D-4004-9CAD-BAAFD8899406}", curve: "{6A057FDC-B355-11E3-95BE-FD84A7FFCB88}", surface: "{F26FEBA3-ADED-494B-B9E9-B2BBCBE298E1}", blockmodel: "{B020A277-90E2-4CD7-84D6-612EE3F25051}", drillhole: "{7CAEBF0E-D16E-11E3-BC69-E4632694AA37}" });
    assert.deepEqual(f.get("GEOSCIENCE/Types/Object types").keys().sort(), ["points", "curve", "surface", "blockmodel"].map((k) => GEOH5_WRITE_TYPES[k].id).sort(), "the types of the kinds written (the drillhole type comes with a drillhole)");
    const objs = f.get("GEOSCIENCE/Objects"), byName = {};
    for (const k of objs.keys()) { const o = objs.get(k); byName[o.attrs.Name.value] = o; }
    for (const o of Object.values(byName)) {
      for (const a of ["Visible", "Public", "Allow delete", "Allow move", "Allow rename"]) { assert.equal(o.attrs[a].value, 1, a); assert.match(o.attrs[a].dtype, /i$/, `${a} is an int`); }
      assert.match(o.attrs.ID.value, /^\{[0-9a-f-]{36}\}$/);
      assert.ok(o.get("Type").attrs.ID.value);
    }
    // Vertices: a 1D compound of doubles x, y, z; Cells: int32, (N, 2) for a curve and (N, 3) for a surface
    const v = byName.Soils.get("Vertices");
    assert.deepEqual(v.shape, [3]);
    assert.deepEqual(v.metadata.compound_type.members.map((m) => [m.name, m.size]), [["x", 8], ["y", 8], ["z", 8]]);
    assert.deepEqual(byName.Contact.get("Cells").shape, [2, 2]); assert.equal(byName.Contact.get("Cells").dtype, "<i");
    assert.deepEqual(byName.Pit.get("Cells").shape, [2, 3]); assert.equal(byName.Pit.get("Cells").dtype, "<i");
    // block model: Origin compound X, Y, Z; Rotation double; delimiters from 0, Z upwards
    const bm = byName.Rho;
    assert.deepEqual(bm.attrs.Origin.metadata.compound_type.members.map((m) => m.name), ["X", "Y", "Z"]);
    assert.equal(bm.attrs.Rotation.value, 0);
    assert.deepEqual(Array.from(bm.get("U cell delimiters").value), [0, 10, 20, 30]);
    assert.deepEqual(Array.from(bm.get("V cell delimiters").value), [0, 10, 30]);
    assert.deepEqual(Array.from(bm.get("Z cell delimiters").value), [0, 5, 10]);
    // data: Association, a type with Primitive type; Float 32-bit with FLT_MIN no-data; Text variable-length (data.rst)
    const dataOf = (o, name) => { const d = o.get("Data"); for (const k of d.keys()) { const e = d.get(k); if (e.attrs.Name.value === name) return e; } return null; };
    const cu = dataOf(byName.Soils, "Cu_ppm");
    assert.equal(cu.attrs.Association.value, "Vertex");
    assert.equal(cu.get("Type").attrs["Primitive type"].value, "Float");
    assert.equal(cu.get("Type").attrs.Units.value, "ppm");
    assert.equal(cu.get("Data").dtype, "<f");
    assert.ok(Math.abs(cu.get("Data").value[1] - FLOAT_NO_DATA) < 1e-44, "a blank is the float no-data value");
    const sid = dataOf(byName.Soils, "sample_id");
    assert.equal(sid.get("Type").attrs["Primitive type"].value, "Text");
    assert.equal(sid.get("Data").metadata.vlen, true, "variable-length strings");
    assert.equal(dataOf(byName.Contact, "seg").attrs.Association.value, "Cell");
    assert.equal(dataOf(byName.Rho, "rho").attrs.Association.value, "Cell");
  } finally { f.close(); mod.FS.unlink(path); }
});

test("bad elements are skipped and said, not written broken", async () => {
  const { written, skipped } = await writeGeoh5([
    { kind: "surface", name: "Broken", vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0], cells: [0, 1, 7] },
    { kind: "points", name: "Empty", vertices: [] },
    { kind: "drillhole", name: "DH-1" },
    { kind: "points", name: "Short data", vertices: [0, 0, 0, 1, 1, 1], data: [{ name: "x", values: [1] }] },
  ]);
  assert.deepEqual(written.map((w) => [w.name, w.data]), [["Short data", 0]]);
  assert.deepEqual(skipped.map((s) => s.name), ["Broken", "Empty", "DH-1", "Short data / x"]);
});

test("a GeoStrix block model's OMF-order volume goes to geoh5's order", () => {
  const nu = 2, nv = 3, nw = 2, omf = new Float64Array(nu * nv * nw);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) for (let k = 0; k < nw; k++) omf[(i * nv + j) * nw + k] = 100 * i + 10 * j + k;
  const g = omfVolumeToGeoh5({ name: "m", origin: [0, 0, 0], tensor: { u: [1, 1], v: [1, 1, 1], w: [2, 2] }, data: [{ name: "v", values: omf }] }, [nu, nv, nw]);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) for (let k = 0; k < nw; k++) assert.equal(g.data[0].values[k + i * nw + j * nu * nw], 100 * i + 10 * j + k);
  assert.deepEqual(g.z, [2, 2]);
});

test("the terrain's height: bilinear over its grid, null outside it", () => {
  const t = { bbox: [0, 0, 10, 10], gridW: 2, gridH: 2, elevations: Float32Array.from([10, 20, 0, 10]) }; // row 0 north: NW 10, NE 20, SW 0, SE 10
  assert.equal(terrainZ(t, 0, 10), 10); assert.equal(terrainZ(t, 10, 0), 10); assert.equal(terrainZ(t, 5, 5), 10); assert.equal(terrainZ(t, 10, 10), 20);
  assert.equal(terrainZ(t, 11, 5), null); assert.equal(terrainZ(null, 1, 1), null);
});

test("the project's objects: surveys (a positions-only one without data), samples draped on the terrain, lines, surfaces, block models", () => {
  const terrain = { name: "DEM", bbox: [0, 0, 100, 100], gridW: 3, gridH: 3, elevations: Float32Array.from([5, 5, 5, 5, 5, 5, 5, 5, 5]) };
  const store = {
    layers: { geophys_pts: [{ x: 1, y: 1, z: 300, value: 55000, _src: "mag.csv" }, { x: 2, y: 1, z: 300, value: 55010, _src: "mag.csv" }, { x: 1, y: 2, z: 299, value: 0, _src: "el.csv" }, { x: 3, y: 3, value: 7, _src: "mag.csv" }] },
    geophysSurveys: { "mag.csv": { method: "mag_tmi", units: "nT" }, "el.csv": { positionsOnly: true } },
    surfaceSamples: [{ sample_id: "R1", x: 10, y: 10, z: 120, values: { Cu: 50 } }, { sample_id: "R2", x: 20, y: 20, values: { Cu: 70 } }, { sample_id: "R3", x: 500, y: 500, values: { Cu: 9 } }],
    surfaceElements: [{ symbol: "Cu", unit: "ppm" }],
    omfObjects: [{ name: "Imported pts", kind: "points", origin: [100, 0, 0], vertices: [1, 2, 3], attributes: [{ name: "a", location: "vertices", values: [4] }] }],
    boundaries: [{ name: "Claim", polylines: [[{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }]] }, { name: "Far", polylines: [[{ x: 500, y: 500 }, { x: 600, y: 500 }]] }],
    mapLayers: [{ name: "Faults", geomType: "line", features: [{ parts: [[[10, 10, 50], [20, 20, 60]]] }] }, { name: "Pts", geomType: "point", features: [] }],
    generatedSurfaces: [{ name: "Granite top", vertices: [[0, 0, 0], [10, 0, 0], [0, 10, 1]], indices: [0, 1, 2] }, { name: "No mesh" }],
    voxelModels: [{ name: "Est", cells: [{ x: 5, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 1.5 }, { x: 15, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 2.5 }] }],
    terrain,
  };
  const { elements, left } = projectGeoh5Elements(store);
  const by = Object.fromEntries(elements.map((e) => [e.name, e]));
  assert.deepEqual(by["mag.csv"].vertices, [1, 1, 300, 2, 1, 300]); assert.deepEqual(by["mag.csv"].data[0], { name: "mag_tmi", values: [55000, 55010], units: "nT" });
  assert.deepEqual(by["el.csv"].data, [], "a positions-only survey carries no value (#3447)");
  assert.deepEqual(by["Surface samples"].vertices, [10, 10, 120, 20, 20, 5], "R2 draped on the terrain, R3 off it left out");
  assert.deepEqual(by["Surface samples"].data.map((d) => [d.name, d.values]), [["sample_id", ["R1", "R2"]], ["Cu_ppm", [50, 70]]]);
  assert.deepEqual(by["Imported pts"].vertices, [101, 2, 3], "an imported object at its own origin");
  assert.deepEqual(by.Claim.vertices, [10, 10, 5, 90, 10, 5, 90, 90, 5]); assert.deepEqual(by.Claim.cells, [0, 1, 1, 2]);
  assert.deepEqual(by.Faults.vertices, [10, 10, 50, 20, 20, 60], "a 3D line keeps its own z");
  assert.ok(!by.Far && !by.Pts && !by["No mesh"]);
  assert.deepEqual(by["Granite top"].cells, [0, 1, 2]);
  assert.equal(by["Terrain: DEM"].kind, "surface");
  assert.equal(by.Est.kind, "blockmodel"); assert.deepEqual([by.Est.origin, by.Est.u, by.Est.v, by.Est.z], [[0, 0, 0], [10, 10], [10], [10]]);
  assert.ok(left.some((s) => /1 survey point/.test(s)) && left.some((s) => /1 surface sample/.test(s)) && left.some((s) => /Far/.test(s)) && left.some((s) => /No mesh/.test(s)));
});

test("wired: File > Export Project as Geoscience ANALYST, loaded on use; h5wasm stays out of the startup bundle", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"), main = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.match(app, /await import\("\.\/lib\/geoh5Export\.js"\)\)\.exportProjectGeoh5\(storeRef\.current\)/);
  assert.doesNotMatch(app, /^import .*geoh5/m);
  assert.match(app, /else if \(action === "export-geoh5"\) runGeoh5Export\(\);/);
  assert.match(main, /L\("Export Project as Geoscience ANALYST \(\.geoh5\)…"\), click: \(\) => sendMenuWithGesture\("export-geoh5"\)/);
  assert.doesNotMatch(fs.readFileSync(new URL("../src/lib/geoh5Write.js", import.meta.url), "utf8"), /^import .*h5wasm/m, "h5wasm imported on demand");
});
